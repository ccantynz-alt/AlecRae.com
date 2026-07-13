# Business-Email Domain Onboarding — Customer Domain Runbook

> How to bring a **customer's** domain onto AlecRae's own mail stack so it can
> **send** (via `services/mta`) and **receive** (via `services/inbound`).
>
> Worked example throughout: **`bookaride.co.nz`** with the mailbox
> **`info@bookaride.co.nz`**.
>
> This is the per-customer companion to the AlecRae-owned-domain docs
> ([`dns-zone-alecrae.md`](./dns-zone-alecrae.md), [`craig-send-today.md`](./craig-send-today.md),
> [`deliverability.md`](./deliverability.md)). The deliverability rules
> (warmup, FBL, blocklist monitoring) in `deliverability.md` apply to **every**
> domain we send from — read it alongside this.

---

## 0. How the stack actually works (read first)

This runbook is grounded in the code, not generic advice. The load-bearing facts:

- **DKIM is signed in-house, per domain.** `services/mta/src/worker.ts` (the
  BullMQ outbound worker) looks up the sender domain row in the `domains` table,
  reads `domains.dkim_selector` + `domains.dkim_private_key`, and signs every
  outbound message with `signMessage()` from
  `services/mta/src/dkim/signer.ts` — **RSA-SHA256, `relaxed/relaxed`
  canonicalization**, signing headers `from, to, cc, subject, date, message-id,
  mime-version, content-type`. If no key is found for the domain it logs
  `No DKIM keys for domain … sending unsigned` and sends anyway — so a missing
  key row = unsigned mail = spam. The private key **must** live on the domain row.
- **Selector + key generation already exists.** `services/dns/src/auto-config.ts`
  `generateDomainConfig()` generates a **2048-bit RSA** keypair, derives the
  selector as `alecrae` + `YYYYMM` (e.g. `alecrae202606` for June 2026),
  publishes `v=DKIM1; k=rsa; p=<spki-base64>`, and writes `dkim_private_key` /
  `dkim_public_key` / `dkim_selector` onto the `domains` row plus the records
  into `dns_records`. This runbook produces the same shape by hand for
  `bookaride.co.nz`.
- **Send transport is relay-or-direct.** `worker.ts` reads
  `RELAY_PROVIDER`; if set, it sends the already-DKIM-signed message through
  `RelayClient` (`services/mta/src/relay/relay.ts` — `ses` | `mailchannels` |
  `smtp`). If unset, it falls back to **direct MX delivery** via
  `DeliveryOptimizer` + `SmtpClient`. **DKIM signing happens upstream of the
  relay** — the relay just carries the bytes (see the file header comment in
  `relay.ts`).
- **Inbound receives on port 25 (SMTP) and 8025 (HTTP webhook).**
  `services/inbound/src/index.ts` starts `SmtpReceiver` on `SMTP_PORT` (default
  `25`) and an HTTP webhook on `HTTP_PORT` (default `8025`,
  `/inbound/webhook`). The EHLO/PTR hostname comes from `SMTP_HOSTNAME`. It
  persists to Postgres when `DATABASE_URL` is set (else in-memory). So a
  customer's MX must point at a host whose A record is our inbound IP, with
  matching PTR.

> ⚠️ **Naming drift to be aware of.** `services/dns/src/auto-config.ts` and
> `services/dns/src/records/manager.ts` still hard-code **`.dev`** placeholder
> hostnames (`mx1.alecrae.dev`, `mx2.alecrae.dev`, `include:spf.alecrae.dev`,
> `bounce.alecrae.dev`, `dmarc-reports@alecrae.dev`). The **production**
> convention — used by `.env.production.template` (`MTA_HOSTNAME=mx1.alecrae.com`),
> `dns-zone-alecrae.md`, and `deliverability.md` — is **`.com`**
> (`mx1.alecrae.com` / `mx2.alecrae.com` / `_spf.alecrae.com` /
> `bounce.alecrae.com`). **This runbook uses the production `.com` values.**
> Before onboarding the first real customer, the `.dev` constants in
> `auto-config.ts` must be updated to `.com` (tracked as a follow-up) or the
> auto-generated records will tell customers to point at the wrong hosts.

---

## 1. DNS records the customer must publish for `bookaride.co.nz`

These go in **`bookaride.co.nz`'s own DNS** (their registrar / DNS host — not ours).
TTL `3600` matches what `auto-config.ts` emits; drop to `300` while iterating,
raise back to `3600` once verified. "Host" is shown both as the label the
customer types and the fully-qualified name.

| Host (label) | FQDN | Type | Value | Priority | TTL |
|---|---|---|---|---|---|
| `@` | `bookaride.co.nz` | MX | `mx1.alecrae.com.` | `10` | 3600 |
| `@` | `bookaride.co.nz` | MX | `mx2.alecrae.com.` | `20` | 3600 |
| `@` | `bookaride.co.nz` | TXT (SPF) | `v=spf1 include:amazonses.com include:_spf.alecrae.com ~all` | — | 3600 |
| `alecrae202606._domainkey` | `alecrae202606._domainkey.bookaride.co.nz` | TXT (DKIM) | `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3OZU+96EvHMVMlMq0V/KT/4OffpBxaX6SrMu34POjR74nbqaZJq1iiLBpMoG7RpqEH6o8MHPlXqB1g6JlxKY9NmWRgTMdPULwGcACLnZT0gMLDaMeNjlkqeBz+Jy7gNjd4YKq/jKBWDRVVVYr5bsZ4gysfoxHKnx7BcOHqdFrpjOCbRvYhVXayQm/MGlMTXaLPixFHWHx97vvrHXvbwwfUgneIgrmc/hAqmIRhqmkONpoGJ9wsN7R5V9M4Wh3UNHoNFkFyCXzBW0k0niNB+BBFhSAVnqJMoSxn98jv+APOnVvYaUPe4sq8IQUt+p8b3+aHTUEgucNvpUKk9Xo+kxVwIDAQAB` | — | 3600 |
| `_dmarc` | `_dmarc.bookaride.co.nz` | TXT (DMARC) | `v=DMARC1; p=none; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; fo=1; adkim=s; aspf=s; pct=100` | — | 3600 |
| `bounce` | `bounce.bookaride.co.nz` | CNAME | `bounce.alecrae.com.` | — | 3600 |

### Notes on each record

**MX → AlecRae inbound.** `mx1`/`mx2.alecrae.com` are A-records pointing at our
**dedicated mail box — the "158" box at `149.28.119.158`** (Craig's 2026-07-13
decision, Option A in `docs/infra/multi-platform-mail-plan.md` §4; Jarvis
`66.42.121.161` keeps web/api compute only) — and the PTR/rDNS must match the
HELO hostname (see §3). The PTR on `149.28.119.158` → `mail.alecrae.com` is
**already set**, and the live SPF already authorizes the 158 IP. ⚠ **Still
pending:** as of 2026-07-13 the mx1/mx2 A records do **not exist** in
AlecRae's own DNS yet — they target `149.28.119.158` and await Craig's
Cloudflare execution. Priority 10 is tried first, 20 is the backup. Without
these, nobody can deliver to `info@bookaride.co.nz`. (Source: `auto-config.ts`
`MX_SERVERS`; production hostnames per `dns-zone-alecrae.md`.)

**SPF.** Authorises our sending infra to send *as* `bookaride.co.nz`.
`include:amazonses.com` covers the **SES relay** path (recommended for a cold
domain, §2); `include:_spf.alecrae.com` covers our own mail-box IP (the
direct-MX path and any future senders, so we never have to touch the
customer's record again). ⚠ Note: the `_spf.alecrae.com` TXT itself doesn't
exist yet — target value `v=spf1 ip4:149.28.119.158 ~all` (the 158 mail box),
awaiting Craig's Cloudflare execution. Start with **`~all`** (soft-fail) for the first ~30 days, then tighten
to **`-all`** once reports are clean — same ramp as `dns-zone-alecrae.md`.
**Keep total SPF DNS lookups ≤ 10** (`auto-config.ts` `SPF_MAX_LOOKUPS`); two
includes is fine.

**DKIM.** Selector **`alecrae202606`** (the `alecrae`+`YYYYMM` scheme from
`generateDkimSelector()`). The `p=` value is the SPKI public key (base64,
headers stripped) for the keypair generated below. The matching **private key
goes on the domain row** `domains.dkim_private_key` so `worker.ts` can sign with
it. The DKIM `d=` will be `bookaride.co.nz`, which is what gives **DKIM
alignment** with the From: header (the thing DMARC checks).

**DMARC.** We start at **`p=none`** (monitor only) — this is a *new* domain on
our stack, so we watch `rua` aggregate reports first to confirm SPF+DKIM align
before we let receivers quarantine/reject anything. **Ramp:**

1. **`p=none`** (week 0–2): collect reports at `dmarc@alecrae.com`, confirm
   every legitimate source passes SPF **or** DKIM with alignment.
2. **`p=quarantine; pct=10`** → raise `pct` to `50` then `100` over ~2–4 weeks
   if reports stay clean. (`p=quarantine` is what `auto-config.ts` /
   `dns-zone-alecrae.md` settle on.)
3. **`p=reject`** once 30+ days of 100%-quarantine are clean.

`adkim=s; aspf=s` = strict alignment (the From: domain must match the DKIM `d=`
and the SPF MAIL FROM domain exactly). `fo=1` = send a forensic report if either
SPF or DKIM fails.

**Return-Path / bounce CNAME.** `worker.ts` auto-suppresses hard bounces into
`suppression_lists`, and `auto-config.ts` provisions a `bounce.<domain>` CNAME →
`bounce.alecrae.com` so bounces/complaints VERP back to our infrastructure
instead of the customer's. If you run the **SES relay** path, this also lines up
with SES's custom MAIL FROM (`feedback-smtp.<region>.amazonses.com`) — see §2;
in that case point the bounce CNAME at the SES feedback host **or** keep it on
`bounce.alecrae.com` and let our bounce processor relay. Pick one and be
consistent per domain.

---

## 2. Send path: SES relay vs direct MX

`worker.ts` picks the path from `RELAY_PROVIDER`:

### Option A — SES SMTP relay (RECOMMENDED for a brand-new domain)

Set `RELAY_PROVIDER=ses` + the `SES_*` vars (§3). The worker DKIM-signs with the
`bookaride.co.nz` key first, then hands the bytes to SES over STARTTLS:587 with
AUTH LOGIN (`sendViaSes` in `relay.ts`).

**What it requires:**
- An **SES account out of sandbox** (sandbox only sends to verified addresses,
  200/day). Request production access — see `craig-send-today.md` step 2.
- **SES domain identity for `bookaride.co.nz`** (or at least a verified identity
  SES will let us send "from"). For best alignment, verify the customer domain
  in SES and enable **Easy DKIM** there too — then the mail carries **two**
  aligned DKIM signatures (ours `d=bookaride.co.nz` selector `alecrae202606`,
  plus SES's). Either one passing DMARC alignment is sufficient; both is belt +
  braces.
- SES SMTP credentials (`SES_SMTP_USERNAME` / `SES_SMTP_PASSWORD`).

**Why recommend it for a cold domain:** SES brings **warmed, reputable IPs** out
of the box, so a zero-reputation domain isn't *also* sending from a
zero-reputation IP. You still warm the *domain* (volume ramp in
`deliverability.md`), but you skip the much harder IP-warmup-from-scratch.

### Option B — Direct MX (our own mail-box IP: 149.28.119.158)

Leave `RELAY_PROVIDER` unset. The worker resolves each recipient's MX and
delivers via `DeliveryOptimizer` + `SmtpClient` from `MTA_HOSTNAME`.

**What it requires:**
- **Warmed mail-box IP** (`149.28.119.158`, the 158 box) with matching
  **PTR/rDNS** — ✅ already in place: the PTR on `149.28.119.158` reads
  `mail.alecrae.com` (a key reason Option A kept 158 as the mail box; see
  `docs/infra/mta-box-setup.md` and `multi-platform-mail-plan.md`).
- **Port 25 outbound open** from the Vultr instance — ✅ already
  Vultr-unblocked on 158. (Inbound 25 on 158 is still closed; it's opened via
  ufw + the inbound service in mail-plan Phase 2, and isn't needed for
  outbound sending.)
- Strict adherence to the **week-by-week warmup schedule** in
  `deliverability.md` — going fast on a cold IP gets you blocklisted.

### Recommendation

> **Brand-new domain, zero reputation → use SES relay (Option A).** Lean on SES's
> warmed IPs while the *domain* earns reputation, keep the in-house
> `d=bookaride.co.nz` DKIM for alignment, and only consider direct-MX (Option B)
> once there's a real volume reason to leave SES (the 158 mail box's PTR is
> already confirmed).

---

## 3. AlecRae-side prerequisites (must be running + reachable)

### Services
- **`services/inbound`** running with the **SMTP receiver on :25** reachable from
  the public internet, behind A records `mx1.alecrae.com` / `mx2.alecrae.com`
  (both pointing to the **158 mail box, `149.28.119.158`** — ⚠ these A records
  don't exist in DNS yet; they target 149.28.119.158 per the 2026-07-13 Option A
  decision and await Craig's Cloudflare execution, see
  `multi-platform-mail-plan.md`), with **PTR/rDNS** on the box IP matching the
  HELO hostname (✅ the 158 PTR → `mail.alecrae.com` is already set).
  (`index.ts`: `SMTP_PORT`, `SMTP_HOSTNAME`.) The HTTP webhook on :8025 is the
  alternative ingress if direct :25 isn't viable.
  **As of 2026-07-13 inbound is NOT running on any box**, and inbound port 25
  on 158 is closed until it's opened via ufw alongside the service
  (mail-plan Phase 2).
- **`alecrae-mta` systemd service** running on the **158 mail box** and draining
  the outbound BullMQ queue (`worker.ts`, queue `alecrae-outbound`). Requires
  **Redis** reachable from both the API (Jarvis) and the MTA (`REDIS_URL` must
  be the same queue on both). See `docs/infra/mta-box-setup.md`.
  **As of 2026-07-13 the MTA is NOT running on any box.**
- **Postgres** reachable (`DATABASE_URL`) — both services persist there, and the
  `domains` row (with the DKIM key) is read by the MTA worker on every send.
- If using SES relay: **`RELAY_PROVIDER=ses`** + SES reachable.

### Env vars
| Var | Used by | Value for this runbook |
|---|---|---|
| `DATABASE_URL` | inbound + mta | Neon connection string |
| `REDIS_URL` | mta worker | Upstash/Redis URL (queue `alecrae-outbound`) |
| `MTA_HOSTNAME` | mta worker (EHLO, direct-MX) | `mx1.alecrae.com` |
| `SMTP_HOSTNAME` | inbound receiver (HELO/PTR) | `mx1.alecrae.com` |
| `SMTP_PORT` | inbound receiver | `25` |
| `HTTP_PORT` | inbound webhook | `8025` |
| `INBOUND_WEBHOOK_SECRET` | inbound webhook | set if using HTTP ingress |
| `RELAY_PROVIDER` | mta worker | `ses` (recommended) — or unset for direct MX |
| `SES_SMTP_HOST` | relay (ses) | `email-smtp.us-east-1.amazonses.com` |
| `SES_SMTP_PORT` | relay (ses) | `587` |
| `SES_SMTP_USERNAME` / `SES_SMTP_PASSWORD` | relay (ses) | SES SMTP creds |
| `SES_REGION` | relay (ses) | `us-east-1` |
| `DKIM_SELECTOR` | mta (`.env` default) | `alecrae202606` (per-domain value lives on the `domains` row) |
| `BOUNCE_DOMAIN` / return-path | bounce processing | `bounce.alecrae.com` |

> The **per-domain** DKIM selector + private key are read from the `domains`
> table by `worker.ts`, **not** from `DKIM_SELECTOR`/`DKIM_PRIVATE_KEY` env. The
> env values are only the AlecRae-default fallback. For `bookaride.co.nz`, what
> matters is the `domains` row (§ "Store the private key").

### Store the private key (the load-bearing step)

Create / update the `domains` row for `bookaride.co.nz` with:
- `dkim_selector` = `alecrae202606`
- `dkim_public_key` = the PEM public key below
- `dkim_private_key` = the **PEM private key below** (🔒 secret)
- `spf_record`, `dmarc_record`, `return_path_domain` = the §1 values
- `is_active` flips to `true` once `verifyDomainConfig()` passes.

Easiest path: call `generateDomainConfig("bookaride.co.nz", <accountId>)` from
`services/dns/src/auto-config.ts` — it generates a fresh keypair **and** writes
the row + `dns_records` for you (just publish the records it returns instead of
the pre-generated key in this doc). The pre-generated keypair here exists so the
DNS can be staged before the row is written; if you use `generateDomainConfig`,
**use the key it returns, not this one**, and the two must match.

---

## 4. "Verify it works" checklist

Run top-to-bottom. Do not send production volume until every box is ticked.

### A. DNS is live
```bash
dig MX  bookaride.co.nz +short                       # → 10 mx1.alecrae.com.  /  20 mx2.alecrae.com.
dig TXT bookaride.co.nz +short                       # → v=spf1 include:amazonses.com include:_spf.alecrae.com ~all
dig TXT alecrae202606._domainkey.bookaride.co.nz +short   # → v=DKIM1; k=rsa; p=MIIBIjAN...
dig TXT _dmarc.bookaride.co.nz +short                # → v=DMARC1; p=none; rua=mailto:dmarc@alecrae.com; ...
dig CNAME bounce.bookaride.co.nz +short              # → bounce.alecrae.com.
```

### B. PTR / rDNS (the silent killer)
```bash
dig A mx1.alecrae.com +short                         # → 149.28.119.158  (target — record ⚠ pending)
dig -x 149.28.119.158 +short                         # → mail.alecrae.com.  (✅ already set)
```
**Current reality (2026-07-13):** the PTR check passes — `149.28.119.158`
already reverse-resolves to `mail.alecrae.com` (set on the 158 mail box; kept
by the Option A decision). The A-record check does ⚠ not pass yet —
`mx1.alecrae.com` has no A record; it targets `149.28.119.158` and awaits
Craig's Cloudflare execution. See `docs/infra/multi-platform-mail-plan.md`.
If the PTR ever stops matching the HELO hostname, Gmail/Outlook will spam-bin
or reject — it's managed in the Vultr control panel: 158 instance → Settings →
IPv4 → rDNS. See `docs/infra/mta-box-setup.md`.

### C. Receiving — send TO `info@bookaride.co.nz`
1. From an external account (e.g. a personal Gmail) send a plain test to
   `info@bookaride.co.nz`.
2. From the inbound host, confirm the banner is reachable:
   `telnet mx1.alecrae.com 25` → `220 mx1.alecrae.com ESMTP …`.
3. Watch `services/inbound` logs for
   `[Inbound] Parsed message …`, `Filter verdict … accept`, and
   `Stored … in mailbox … for info@bookaride.co.nz`.
4. Confirm the message lands in the `info@bookaride.co.nz` mailbox in the app.
   (No mailbox row resolved → log `No mailbox found for recipient` — create the
   mailbox first.)

### D. Sending — send FROM `info@bookaride.co.nz`
1. Send a test from `info@bookaride.co.nz` to a Gmail address **and** to
   `check-auth@verifier.port25.com` / [mail-tester.com](https://www.mail-tester.com)
   (target **10/10**).
2. In Gmail: open the message → **⋮ → Show original**. Confirm:
   ```
   SPF:   PASS   with domain bookaride.co.nz
   DKIM:  PASS   with domain bookaride.co.nz   (selector alecrae202606)
   DMARC: PASS   (alignment: pass)
   ```
3. In the MTA worker logs, confirm
   `DKIM signed for bookaride.co.nz (selector=alecrae202606)` — **not** the
   `No DKIM keys for domain … sending unsigned` warning.
4. If anything is FAIL/NEUTRAL, stop and fix before any further sends.

### E. Mark active
Run `verifyDomainConfig(<domainId>)` (auto-config.ts) → expect `overall:
"verified"`; it sets `is_active=true`. Then proceed to the warmup ramp in
`deliverability.md`.

---

## 5. Gotchas — it WILL land in spam if…

- **No PTR / rDNS, or PTR ≠ HELO hostname.** Single most common cause of
  hard spam-binning on the direct-MX path. `dig -x <ip>` must return
  `mx1.alecrae.com`.
- **No DMARC alignment.** SPF or DKIM can "pass" on a *different* domain and
  DMARC still fails because it's not *aligned* to the From: domain. Our in-house
  DKIM signs `d=bookaride.co.nz`, which aligns — but only if the `domains` row
  actually has the key (else `worker.ts` sends **unsigned**). Verify the
  `DKIM signed for bookaride.co.nz` log line.
- **Missing DKIM key row.** No `dkim_private_key` on the domain → unsigned mail →
  DMARC fail under `p=quarantine`/`p=reject`. The pre-flight is step §3 "Store
  the private key."
- **Cold IP on direct MX.** Sending real volume from the box IP with no warmup
  = blocklisted in hours. Use SES relay for a new domain, or follow the
  `deliverability.md` warmup schedule to the letter.
- **Port 25 blocked by Vultr.** Vultr blocks outbound :25 by default — direct
  MX delivery silently fails/defers. ✅ Already unblocked on the 158 mail box
  (`149.28.119.158`); only relevant if mail ever moves to a different instance.
- **SES still in sandbox.** Sends only to verified recipients, 200/day. Request
  production access first.
- **SPF `-all` too early, or > 10 lookups.** Going strict on day 1 before every
  sender is listed bounces legit mail; >10 DNS lookups makes SPF `permerror`
  (treated as fail). Start `~all`, keep includes ≤ 2, tighten later.
- **Public key mismatch.** The `p=` in DNS must be the SPKI base64 of the key on
  the domain row. If you regenerate via `generateDomainConfig`, republish the
  key it returns — the one in this doc will then be stale.
- **Selector drift.** DNS host is `alecrae202606._domainkey.bookaride.co.nz`; the
  `domains.dkim_selector` must be exactly `alecrae202606`. Any mismatch → DKIM
  `temperror`/fail.
- **`.dev` vs `.com` drift in code.** If `auto-config.ts` still emits `.dev`
  hosts, the customer will publish MX/SPF/CNAME pointing at hosts that don't
  exist. Confirm the records you hand over use `.com` (this runbook's values).
- **No `postmaster@` / `abuse@` on the domain.** Receivers penalise domains with
  no reachable role accounts. Ensure they resolve (forward to a monitored box).

---

## 🔒 SECRET — DKIM private key for `bookaride.co.nz` (selector `alecrae202606`)

> **DO NOT publish this in DNS. DO NOT commit beyond this provisioning doc.**
> Store on the `domains` row: `domains.dkim_private_key`. Rotate every ~90 days
> (`auto-config.ts` `DKIM_ROTATION_DAYS`) via `rotateDkimKey()`. PKCS#8 PEM,
> RSA-2048 — the exact format `generateDomainConfig()` produces and
> `signMessage()` expects.

> ⚠️ **The private key is intentionally NOT stored in this repo.** Committing a
> private key trips secret scanning (Gitleaks) and is a security risk even for a
> demo key. Generate it at provisioning time and write it straight to the DB —
> never to git.

Generate the DKIM keypair and capture both halves:

```bash
# Private key (PKCS#8, RSA-2048) — store on domains.dkim_private_key, never commit
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out dkim_private.pem
# Public key for the DNS TXT record (selector alecrae202606)
openssl rsa -in dkim_private.pem -pubout -out dkim_public.pem
# Single-line base64 for the DNS p= value:
grep -v '^-----' dkim_public.pem | tr -d '\n'
```

Then store it (out of band — e.g. psql), and publish the matching public key in
the `alecrae202606._domainkey.bookaride.co.nz` TXT record:

```sql
UPDATE domains
SET dkim_selector = 'alecrae202606',
    dkim_private_key = '<contents of dkim_private.pem>',
    dkim_public_key  = '<contents of dkim_public.pem>'
WHERE domain = 'bookaride.co.nz';
```

Alternatively, let `generateDomainConfig()` mint the keypair — then use the
public key it returns for the DNS `p=` value (it must match the stored private
key). Rotate every ~90 days (`DKIM_ROTATION_DAYS`) via `rotateDkimKey()`.

### Matching public key (PEM — store on `domains.dkim_public_key`)

```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3OZU+96EvHMVMlMq0V/K
T/4OffpBxaX6SrMu34POjR74nbqaZJq1iiLBpMoG7RpqEH6o8MHPlXqB1g6JlxKY
9NmWRgTMdPULwGcACLnZT0gMLDaMeNjlkqeBz+Jy7gNjd4YKq/jKBWDRVVVYr5bs
Z4gysfoxHKnx7BcOHqdFrpjOCbRvYhVXayQm/MGlMTXaLPixFHWHx97vvrHXvbww
fUgneIgrmc/hAqmIRhqmkONpoGJ9wsN7R5V9M4Wh3UNHoNFkFyCXzBW0k0niNB+B
BFhSAVnqJMoSxn98jv+APOnVvYaUPe4sq8IQUt+p8b3+aHTUEgucNvpUKk9Xo+kx
VwIDAQAB
-----END PUBLIC KEY-----
```

---

_Last updated: 2026-07-13 03:05 UTC_
