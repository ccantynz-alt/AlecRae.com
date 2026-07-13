# MTA Setup on the Mail Box (149.28.119.158)

> **Last updated: 2026-07-13 03:05 UTC**

AlecRae's outbound email path: web UI → API (`POST /v1/messages/send`) → BullMQ (Redis) → **MTA worker** → delivery.

The MTA worker (`services/mta`) must be running on the **dedicated mail box — the "158" box, `149.28.119.158`** (old Vapron box; Craig's 2026-07-13 decision, Option A in `docs/infra/multi-platform-mail-plan.md` §4) — as a systemd service. SSH via Tailscale peer `vapron-158` (100.89.227.39): `ssh root@vapron-158`. The Jarvis box (`66.42.121.161`) keeps web/api compute only. Without the MTA worker, emails get queued in Redis but never consumed. **As of 2026-07-13 the MTA is NOT running on any box.**

> **158 box specifics:** `vapron-bun-gateway` owns ports 80/443 on this box, so the MTA's health server must not collide — the default `HEALTH_PORT` is `8082` (do not set it to 80/443/8080). (The Coolify/Traefik port-collision warning applies to Jarvis, not 158.)
>
> **Shared queue note:** the API (on Jarvis) enqueues sends and the MTA (on 158) consumes them, so **both must point `REDIS_URL` at the same Redis** — either a shared/hosted Redis (Upstash) or one box's Redis reachable over the tailnet. A Redis local-only to 158 that the API doesn't use means jobs are never seen.

**Two delivery modes — pick one:**

| Mode | When to use | Env to set |
|---|---|---|
| **Direct port-25** | Outbound port 25 on the 158 mail box is already Vultr-unblocked. Fastest path — no relay account needed. Requires PTR record (already set on 158). | _nothing_ (no `RELAY_PROVIDER`) |
| **Resend relay** | More reliable for cold IPs; needs Resend account + domain verified | `RELAY_PROVIDER=smtp`, `SMTP_RELAY_HOST=smtp.resend.com`, `SMTP_RELAY_PORT=465`, `SMTP_RELAY_TLS=true`, `SMTP_RELAY_USERNAME=resend`, `SMTP_RELAY_PASSWORD=<api_key>` |

For the quickest first send, use **direct port-25**: the PTR on `149.28.119.158` → `mail.alecrae.com` is **already set** (kept by Option A — no PTR churn), and the live SPF already authorizes the 158 IP, so just start the MTA with no relay env set. Inbound port 25 on 158 is currently closed — expected; it gets opened via ufw + the inbound service in mail-plan Phase 2 (outbound sending doesn't need it). ⚠ **Still pending** (records target `149.28.119.158`, awaiting Craig's Cloudflare execution — see `docs/infra/multi-platform-mail-plan.md`): mx1/mx2 A records, `_spf.alecrae.com` TXT, grey-clouding `mail.alecrae.com`. DKIM keys for `alecrae.com` must be in the `domains` table (they're set during domain onboarding in the Workspace page).

---

## Prerequisites

- Mail box is live at `149.28.119.158` (`ssh root@vapron-158` via Tailscale, peer 100.89.227.39)
- API (`alecrae-api`) is running on Jarvis (`66.42.121.161`) and shares the same `REDIS_URL` as the MTA (see the shared-queue note above)
- Resend SMTP relay is configured in `/opt/alecrae/.env` on the mail box (if using relay mode)

---

## Step 1 — Install Redis (if not already installed)

The MTA worker uses BullMQ, which requires Redis. Install it:

```bash
apt-get update && apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server
redis-cli ping  # should return PONG
```

No configuration needed — BullMQ uses `redis://localhost:6379` by default. **But** in the split-box layout (API on Jarvis, MTA on 158) a localhost Redis on 158 only works if the API's `REDIS_URL` points at it too (over the tailnet) — otherwise use a shared Redis (Upstash) and set the same `REDIS_URL` on both boxes.

---

## Step 2 — Create the MTA systemd service

```bash
cat > /etc/systemd/system/alecrae-mta.service << 'EOF'
[Unit]
Description=AlecRae MTA Worker
After=network.target redis.service alecrae-api.service
Requires=redis.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/alecrae
EnvironmentFile=/opt/alecrae/.env
ExecStart=/root/.bun/bin/bun run /opt/alecrae/services/mta/src/index.ts
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

> If you're running as `root` instead of `deploy`, change `User=deploy` to `User=root`.

---

## Step 3 — Enable and start

```bash
systemctl daemon-reload
systemctl enable alecrae-mta
systemctl start alecrae-mta
systemctl status alecrae-mta
```

Should show `active (running)`.

---

## Step 4 — Test outbound email

Send a test email via the API:

```bash
TOKEN="paste_your_bearer_token_here"

curl -X POST https://api.alecrae.com/v1/messages/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from": {"email": "craig@alecrae.com", "name": "Craig"},
    "to": [{"email": "ccantynz@gmail.com"}],
    "subject": "AlecRae send test",
    "html": "<p>If you see this, outbound email works.</p>"
  }'
```

Then check the logs:

```bash
journalctl -u alecrae-mta -f --since "2 minutes ago"
```

You should see the job being picked up and sent via Resend.

---

## Step 5 — Deploys / restarts

`scripts/box-deploy.sh` (the web/api deploy ritual) runs on **Jarvis** and restarts `alecrae-api` + `alecrae-web` there — it does **not** reach the MTA on the 158 mail box. After pulling new MTA code on 158, restart it there:

```bash
# On the 158 mail box (ssh root@vapron-158):
sudo systemctl restart alecrae-mta
```

---

## Checking the MTA queue

If you want to see jobs waiting in the queue:

```bash
redis-cli LLEN "bull:alecrae-outbound:wait"
redis-cli LLEN "bull:alecrae-outbound:active"
redis-cli ZCARD "bull:alecrae-outbound:failed"
```

A job stuck in `failed` means the Resend relay rejected it — check the MTA logs.

---

## Resend domain verification (required before sending)

The MTA relay uses `smtp.resend.com:465` with your Resend API key. For emails from `@alecrae.com` to work, the domain must be verified in Resend:

1. Go to `https://resend.com/domains`
2. Find `alecrae.com`
3. Status must show ✅ **Verified** — not pending
4. If still pending: check Cloudflare DNS has the `resend._domainkey` TXT records and `send.alecrae.com` MX/TXT records

Until the domain is verified, Resend will reject every outbound message with "Domain is not verified".
