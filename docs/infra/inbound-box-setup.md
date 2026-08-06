# Inbound mail service bring-up (`alecrae-inbound`, mail-plan Phase 2)

> **Last updated: 2026-08-04 02:20 UTC**

How to run `services/inbound` on the **mail box (`149.28.119.158`)** so customer
domains can **receive** mail. Companion to [`mta-box-setup.md`](./mta-box-setup.md)
(which covers **sending**) and [`business-email-domain-onboarding.md`](./business-email-domain-onboarding.md)
(the per-customer DNS recipe).

This service has never run anywhere. Receiving is most of what "business email"
means, so nothing in the product's business-email story works until it does.

---

## 0. Read this first — what this service is, and what it is not

`services/inbound` is the **real** receive pipeline: SMTP receive → MIME parse →
SPF/DKIM filter → recipient routing (mailboxes, aliases, plus-addressing,
catch-all) → Postgres storage, plus DSN/bounce ingestion.

It is **not** the thing the open-relay warnings are about. `services/mta` once
shipped its own incomplete port-25 receiver whose handler logged a message and
discarded it; that duplicate is what was abused for nine days (issue #105) and
it is now off unless `MTA_ENABLE_SMTP_RECEIVER=true`. **Do not set that
variable.** Running two receivers on one box is how the confusion started.

> ⚠️ **Order matters more than usual here.** Do not open port 25 to the internet
> until Step 4's relay-control check passes. An open relay is discovered by
> automated scanners in hours, and the reputation damage outlives the fix.

---

## 1. Prerequisites

| Requirement | Why | Check |
|---|---|---|
| `DATABASE_URL` set | The relay control reads the `domains` table to decide who we host. **Without it the service refuses every recipient** — deliberately, see Step 4 | `grep DATABASE_URL /opt/alecrae/.env` |
| Shared Redis done | Not needed to *receive*, but the box is about to run the MTA too — see [`redis-tailnet-setup.md`](./redis-tailnet-setup.md), issue #149 | `redis-cli -u "$REDIS_URL" ping` |
| `mx1`/`mx2.alecrae.com` → `149.28.119.158` | Where senders will connect | `dig +short mx1.alecrae.com` |
| Code current on the box | `git pull --ff-only origin <branch>` in `/opt/alecrae` | `git -C /opt/alecrae rev-parse --short HEAD` |

At least one **verified, active** domain must exist in the `domains` table or
every recipient is correctly refused and it will look broken. Verify a domain in
the app first (`/domains`), then provision a mailbox at `/mailboxes`.

---

## 2. Environment

Add to `/opt/alecrae/.env` on the **mail box**:

```bash
SMTP_HOSTNAME=mx1.alecrae.com   # HELO identity; must match the box's PTR
SMTP_PORT=25
HTTP_PORT=8025                  # webhook ingress; keep OFF the public internet
```

`SMTP_HOSTNAME` must agree with the box's reverse DNS. The `.158` PTR currently
reads `mail.alecrae.com` and is pending a change to `smtp.alecrae.com` in the
Vultr panel — receivers check forward-confirmed rDNS, and a mismatch costs
deliverability on the *outbound* side. Set `SMTP_HOSTNAME` to whatever the PTR
actually resolves to at the time you start the service.

---

## 3. systemd unit

```bash
cat > /etc/systemd/system/alecrae-inbound.service << 'EOF'
[Unit]
Description=AlecRae Inbound Mail (SMTP receiver + processing pipeline)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/alecrae
EnvironmentFile=/opt/alecrae/.env
ExecStart=/root/.bun/bin/bun run /opt/alecrae/services/inbound/src/index.ts
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable alecrae-inbound
systemctl start alecrae-inbound
systemctl status alecrae-inbound
```

> `User=root` is required for a privileged port (25). If you prefer an
> unprivileged user, grant the capability instead:
> `setcap 'cap_net_bind_service=+ep' /root/.bun/bin/bun` and set `User=deploy`.

> **Why `src/index.ts` and not `dist/`:** the service runs from source under
> Bun. Its `start` script used to point at `dist/index.js` while `build` was an
> `echo` that produced no dist — corrected 2026-08-04, but any older copy of
> this instruction is wrong.

---

## 4. Prove the relay control works — BEFORE opening the firewall

**Do this while port 25 is still closed to the internet.** Test from the box
itself against loopback.

```bash
# A domain we do NOT host must be refused
printf 'EHLO test\r\nMAIL FROM:<a@b.com>\r\nRCPT TO:<x@not-ours.example>\r\nQUIT\r\n' \
  | nc 127.0.0.1 25
```

Expect **`550 Relay not permitted for domain not-ours.example`**.

```bash
# A verified domain you host must be accepted
printf 'EHLO test\r\nMAIL FROM:<a@b.com>\r\nRCPT TO:<info@YOURDOMAIN>\r\nQUIT\r\n' \
  | nc 127.0.0.1 25
```

Expect **`250 OK`**.

**If the first test returns 250, stop and do not open the firewall.** That is an
open relay. Check `journalctl -u alecrae-inbound | grep domainVerifier` — the
service logs loudly when the relay control is unconfigured, and refuses
everything in that state, so a 250 for a domain you do not host means something
has been changed from what ships.

Other expected codes: **450** means the domain is registered but not yet
DNS-verified, or the database was unreachable — both are retryable and neither
relays. A subdomain of a hosted domain is **not** inherited: hosting
`example.com` does not accept `mail.example.com`.

---

## 5. Open port 25

Only now:

```bash
ufw allow in 25/tcp
ufw status verbose | grep 25
```

Keep **8025 closed to the internet** — the HTTP webhook is an alternative
ingress for forwarders, not a public endpoint. If you use it, put it behind the
tailnet or a reverse proxy and set `INBOUND_WEBHOOK_SECRET`.

Verify from **outside** the box:

```bash
nc -vz 149.28.119.158 25          # from your laptop
```

Then re-run the **unhosted-domain** probe from outside and confirm it is still
`550`. A relay control that holds on loopback but not from the internet would
mean something upstream is rewriting the connection.

---

## 6. Send a real message

From any external mailbox, send to an address on a verified domain with a
provisioned mailbox (e.g. `info@yourdomain`). Then:

```bash
journalctl -u alecrae-inbound -f
```

You should see `[Inbound] Parsed message …`, a filter verdict, and
`[Inbound] Stored … in mailbox …`. The message then appears in the AlecRae
inbox for the owning account.

**Where it lands:** a clean message goes to `folder=inbox`; a `quarantine`
verdict goes to `folder=spam` and is visible via `GET /v1/messages?folder=spam`.
Before 2026-08-04 the folder was never set and quarantined mail landed in the
inbox alongside clean mail (issue #153) — if you see that, the box is running
older code.

---

## 7. What breaks if this is wrong

| Symptom | Cause |
|---|---|
| Every recipient refused `550 Relay not permitted` | No verified+active domain in `domains`, or `DATABASE_URL` unset — the verifier fails closed by design |
| All recipients `450` | Database unreachable, or the domain is registered but not DNS-verified |
| Senders time out | Port 25 blocked (ufw, or Vultr inbound filtering), or the service is not listening — `ss -tlnp \| grep :25` |
| Mail accepted but never appears in the inbox | The recipient resolved to a domain the account does not own, or the account has no mailbox and no catch-all. Check the `[Inbound] No mailbox found` warning |
| A domain we do not host is accepted | **Stop.** Open relay. Do not leave port 25 open |

Related: [`mta-box-setup.md`](./mta-box-setup.md),
[`redis-tailnet-setup.md`](./redis-tailnet-setup.md),
[`business-email-domain-onboarding.md`](./business-email-domain-onboarding.md),
[`multi-platform-mail-plan.md`](./multi-platform-mail-plan.md).
