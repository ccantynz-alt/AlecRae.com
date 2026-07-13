# DNS Zone Configuration — alecrae.com

**Audience:** Craig (owner). Paste these records into Cloudflare DNS.
**Goal:** Web traffic to the production box. Mail traffic direct and unproxied.
**Rule of thumb:** Web = Cloudflare proxied (orange cloud) is the current working state. Mail = DNS only (grey cloud), always. Web/API compute is **Jarvis at `66.42.121.161`**; the dedicated **mail box is `149.28.119.158`** ("158", the old Vapron box) — Option A, decided 2026-07-13.

> **Current deployment (verified 2026-07-13):** Production compute is the Jarvis box at `66.42.121.161` (NOT Fly.io or Cloudflare Pages). Coolify/Traefik owns 80/443 on Jarvis (route file `/data/coolify/proxy/dynamic/alecrae.yaml`). `alecrae.com`, `mail.alecrae.com`, and `api.alecrae.com` resolve via Cloudflare **proxied** and serve 200 OK.
>
> ✅ **DECIDED 2026-07-13 (Craig, Option A):** the `149.28.119.158` box stays as the **dedicated mail box** — see `docs/infra/multi-platform-mail-plan.md` §4. This keeps the existing deliverability groundwork: the live SPF (`spf.alecrae.com` TXT) already authorizes 149, the PTR on 149 → `mail.alecrae.com` is **already set**, and outbound port 25 on 149 is already unblocked by Vultr (inbound 25 is currently closed — opened via ufw + the inbound service in mail plan Phase 2).
>
> ⚠ **Still pending (awaiting Craig's Cloudflare execution):** `mx1`/`mx2`/`smtp.alecrae.com` A records and the `_spf.alecrae.com` TXT do **not exist** in DNS yet (target: `149.28.119.158`), `mail.alecrae.com` must be flipped to grey cloud, and the MTA/inbound services are not running yet. The tables below show the **TARGET** state.

---

## 1. Summary Table — TARGET State (web = Jarvis 66.42.121.161, mail = 149.28.119.158)

> ⚠ **Mail rows are a pending DNS change** — Option A is decided (mail records target `149.28.119.158`); the records below await Craig's Cloudflare execution — see `docs/infra/multi-platform-mail-plan.md`. Web rows (`@`, `www`, `mail`, `api`) are live today, Cloudflare-proxied.

| Name | Type | Value | TTL | Proxied? | Purpose |
|---|---|---|---|---|---|
| `@` | A | `66.42.121.161` | Auto | Yes (live) | Landing page (alecrae.com) |
| `www` | A | `66.42.121.161` | Auto | Yes (live) | www redirect to apex |
| `mail` | A | `66.42.121.161` | Auto | Yes (live) | Web app (mail.alecrae.com) — must flip to grey cloud, ⚠ pending |
| `api` | A | `66.42.121.161` | Auto | Yes (live) | API (api.alecrae.com) |
| `mx1` | A | `149.28.119.158` | Auto | **No** | Primary MX host — ⚠ pending |
| `mx2` | A | `149.28.119.158` | Auto | **No** | Backup MX host — ⚠ pending |
| `smtp` | A | `149.28.119.158` | Auto | **No** | Outbound SMTP — ⚠ pending |
| `@` | MX | `mx1.alecrae.com` (priority 10) | Auto | N/A | Primary mail — ⚠ pending |
| `@` | MX | `mx2.alecrae.com` (priority 20) | Auto | N/A | Backup mail — ⚠ pending |
| `@` | TXT (SPF) | `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all` | Auto | N/A | SPF for alecrae.com — live SPF already authorizes 149 (Option A: no IP churn) |
| `_spf` | TXT | `v=spf1 ip4:149.28.119.158 ~all` | Auto | N/A | SPF for customer domains — ⚠ pending (does not exist yet) |
| `resend._domainkey` | TXT | *(from Resend dashboard)* | Auto | N/A | DKIM via Resend |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s` | Auto | N/A | DMARC (soft start) |

> **Note:** Mail-related records must be DNS-only (grey cloud) — SMTP cannot go through Cloudflare's HTTP proxy. Web records are currently Cloudflare-proxied (orange), with Coolify/Traefik terminating on the box behind Cloudflare.

---

## 2. Proxy status: web orange, mail grey

- Web traffic goes to the Jarvis box at `66.42.121.161`, via Cloudflare's proxy (orange cloud) — this is the current, verified-working state (all three web hostnames serve 200)
- On the Jarvis box, Coolify/Traefik owns 80/443 and routes by hostname to the correct service (route file `/data/coolify/proxy/dynamic/alecrae.yaml`)
- Mail records (mx1/mx2/smtp, and `mail.alecrae.com` as the SMTP/HELO identity) point at the **mail box `149.28.119.158`** and **must** be grey cloud (SMTP can't go through Cloudflare's HTTP proxy) — the grey-cloud flip for `mail.alecrae.com` is part of the pending changes in `docs/infra/multi-platform-mail-plan.md` (Option A decided; awaiting Craig's Cloudflare execution)

---

## 3. SPF for alecrae.com and customer domains

> ✅ **Option A decided (2026-07-13):** the mail box is `149.28.119.158`, and the SPF currently published (`spf.alecrae.com` TXT) **already authorizes 149** — no IP churn needed. Still pending: `_spf.alecrae.com` does not exist yet (target value below, per `docs/infra/multi-platform-mail-plan.md`; awaiting Craig's Cloudflare execution).

Two SPF records are required:

1. **`@` (alecrae.com itself):** `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all`
   - Authorises the mail box IP (outbound port 25 on 149 is already unblocked by Vultr) and Resend's relay IPs (current relay)

2. **`_spf` (_spf.alecrae.com):** `v=spf1 ip4:149.28.119.158 ~all`
   - When a customer adds their domain through AlecRae Workspace, the DNS auto-config service tells them to add `include:_spf.alecrae.com` to their SPF. This record is what that include resolves to.
   - Without this record, customer domain SPF validation fails for all their mail.

---

## 4. DKIM

Currently using Resend as the relay. Resend provides DKIM signing for `alecrae.com`:
1. Go to **resend.com/domains** → `alecrae.com`
2. Copy the TXT value for `resend._domainkey.alecrae.com`
3. Add it to Cloudflare DNS (Type: TXT, Name: `resend._domainkey`, Value: the TXT from Resend)

When the mail box MTA (`149.28.119.158`) is sending directly (outbound port 25 on 149 is already unblocked; Resend no longer needed), add the MTA's DKIM public key as `default._domainkey.alecrae.com`.

---

## 5. DMARC

Start soft. Tighten gradually as you get clean reports.

**Day 1 (now):**
```
v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s
```
- Only 10% of failing mail gets quarantined — safe for launch
- Reports go to `dmarc@alecrae.com` (set this up via email routing or a mail alias)

**Day 30 (if reports are clean):**
- Bump `pct=10` to `pct=100`. Keep `p=quarantine`.

**Day 60 (if still clean):**
- Move to `p=reject; pct=100`. You're now fully protected.

---

## 6. Verification Commands

Run from any terminal after DNS propagates (usually 1-5 minutes on Cloudflare):

```bash
# MX records (target — pending, see multi-platform-mail-plan.md)
dig MX alecrae.com +short
# Expected (target): 10 mx1.alecrae.com. and 20 mx2.alecrae.com.

# SPF for alecrae.com (live SPF already authorizes 149)
dig TXT alecrae.com +short | grep spf
# Expected (target): v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all

# SPF for customer domains (target — does not exist yet)
dig TXT _spf.alecrae.com +short
# Expected (target): v=spf1 ip4:149.28.119.158 ~all

# DKIM (Resend)
dig TXT resend._domainkey.alecrae.com +short
# Expected: v=DKIM1; k=rsa; p=... (long base64 string)

# DMARC
dig TXT _dmarc.alecrae.com +short
# Expected: v=DMARC1; p=quarantine; ...

# MX host resolves to the mail box IP (target — record does not exist yet)
dig A mx1.alecrae.com +short
# Expected (target): 149.28.119.158

# PTR / rDNS on the mail box (ALREADY SET)
dig -x 149.28.119.158 +short
# Expected: mail.alecrae.com.
```

---

## 7. Common Failures

**Multiple SPF records:** Only one `v=spf1` TXT record is allowed on `@`. If you have one from Cloudflare Email Routing, delete it and replace with the single SPF shown above.

**MX records from Cloudflare Email Routing:** Cloudflare auto-adds `route1/2/3.mx.cloudflare.net` MX records when email routing is enabled. Delete these and replace with `mx1.alecrae.com` (priority 10) and `mx2.alecrae.com` (priority 20).

**DMARC on wrong name:** Must be at `_dmarc` (underscore prefix), not `dmarc` or `@`.

**SPF lookup limit:** Each `include:` counts as a DNS lookup. The limit is 10. `include:spf.resend.com` typically expands to 2-3 lookups — well within the limit.

---

_Last updated: 2026-07-13 12:05 UTC_
