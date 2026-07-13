# DNS Zone Configuration — alecrae.com

**Audience:** Craig (owner). Paste these records into Cloudflare DNS.
**Goal:** Web traffic to the production box. Mail traffic direct and unproxied.
**Rule of thumb:** Web = Cloudflare proxied (orange cloud) is the current working state. Mail = DNS only (grey cloud), always. The production box is **Jarvis at `66.42.121.161`**.

> **Current deployment (verified 2026-07-13):** Production compute is the Jarvis box at `66.42.121.161` (NOT the deprecated `149.28.119.158` Vapron box, Fly.io, or Cloudflare Pages). Coolify/Traefik owns 80/443 on the box (route file `/data/coolify/proxy/dynamic/alecrae.yaml`). `alecrae.com`, `mail.alecrae.com`, and `api.alecrae.com` resolve via Cloudflare **proxied** and serve 200 OK.
>
> ⚠ **Mail DNS is NOT yet consolidated onto Jarvis.** As of today: the live SPF (`spf.alecrae.com` TXT) still authorizes the deprecated 149 box; the `mail.alecrae.com` PTR is still on 149 (Jarvis's PTR is the generic choopa.net one); `mx1`/`mx2`/`smtp.alecrae.com` A records and the `_spf.alecrae.com` TXT do **not exist** in DNS; and the MTA/inbound services are not running on either box. The tables below show the **TARGET** state (Jarvis). The consolidation — new PTR, SPF update, mx1/mx2 A records, flipping mail records to DNS-only — is specified in `docs/infra/multi-platform-mail-plan.md` and requires Craig's DNS authorization.

---

## 1. Summary Table — TARGET State (Jarvis, 66.42.121.161)

> ⚠ **Mail rows are a pending DNS change** — see `docs/infra/multi-platform-mail-plan.md` (Craig authorization required). Web rows (`@`, `www`, `mail`, `api`) are live today, Cloudflare-proxied.

| Name | Type | Value | TTL | Proxied? | Purpose |
|---|---|---|---|---|---|
| `@` | A | `66.42.121.161` | Auto | Yes (live) | Landing page (alecrae.com) |
| `www` | A | `66.42.121.161` | Auto | Yes (live) | www redirect to apex |
| `mail` | A | `66.42.121.161` | Auto | Yes (live) | Web app (mail.alecrae.com) |
| `api` | A | `66.42.121.161` | Auto | Yes (live) | API (api.alecrae.com) |
| `mx1` | A | `66.42.121.161` | Auto | **No** | Primary MX host — ⚠ pending |
| `mx2` | A | `66.42.121.161` | Auto | **No** | Backup MX host — ⚠ pending |
| `smtp` | A | `66.42.121.161` | Auto | **No** | Outbound SMTP — ⚠ pending |
| `@` | MX | `mx1.alecrae.com` (priority 10) | Auto | N/A | Primary mail — ⚠ pending |
| `@` | MX | `mx2.alecrae.com` (priority 20) | Auto | N/A | Backup mail — ⚠ pending |
| `@` | TXT (SPF) | `v=spf1 ip4:66.42.121.161 include:spf.resend.com ~all` | Auto | N/A | SPF for alecrae.com — ⚠ pending (live SPF still authorizes deprecated 149) |
| `_spf` | TXT | `v=spf1 ip4:66.42.121.161 include:spf.resend.com ~all` | Auto | N/A | SPF for customer domains — ⚠ pending (does not exist yet) |
| `resend._domainkey` | TXT | *(from Resend dashboard)* | Auto | N/A | DKIM via Resend |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s` | Auto | N/A | DMARC (soft start) |

> **Note:** Mail-related records must be DNS-only (grey cloud) — SMTP cannot go through Cloudflare's HTTP proxy. Web records are currently Cloudflare-proxied (orange), with Coolify/Traefik terminating on the box behind Cloudflare.

---

## 2. Proxy status: web orange, mail grey

- Web traffic goes to the Jarvis box at `66.42.121.161`, via Cloudflare's proxy (orange cloud) — this is the current, verified-working state (all three web hostnames serve 200)
- On the box, Coolify/Traefik owns 80/443 and routes by hostname to the correct service (route file `/data/coolify/proxy/dynamic/alecrae.yaml`)
- Mail records **must** be grey cloud (SMTP can't go through Cloudflare's HTTP proxy) — this flip is part of the pending consolidation in `docs/infra/multi-platform-mail-plan.md`

---

## 3. SPF for alecrae.com and customer domains

> ⚠ **Pending DNS change.** The SPF currently published (`spf.alecrae.com` TXT) still authorizes the deprecated 149 box, and `_spf.alecrae.com` does not exist yet. The values below are the target state per `docs/infra/multi-platform-mail-plan.md` (Craig's DNS authorization required).

Two SPF records are required:

1. **`@` (alecrae.com itself):** `v=spf1 ip4:66.42.121.161 include:spf.resend.com ~all`
   - Authorises the Jarvis box IP (for direct MX when port 25 is unblocked) and Resend's relay IPs (current relay)

2. **`_spf` (_spf.alecrae.com):** `v=spf1 ip4:66.42.121.161 include:spf.resend.com ~all`
   - When a customer adds their domain through AlecRae Workspace, the DNS auto-config service tells them to add `include:_spf.alecrae.com` to their SPF. This record is what that include resolves to.
   - Without this record, customer domain SPF validation fails for all their mail.

---

## 4. DKIM

Currently using Resend as the relay. Resend provides DKIM signing for `alecrae.com`:
1. Go to **resend.com/domains** → `alecrae.com`
2. Copy the TXT value for `resend._domainkey.alecrae.com`
3. Add it to Cloudflare DNS (Type: TXT, Name: `resend._domainkey`, Value: the TXT from Resend)

When the box MTA is sending directly (after port 25 is unblocked and Resend is no longer needed), add the MTA's DKIM public key as `default._domainkey.alecrae.com`.

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

# SPF for alecrae.com (target — today this still shows the deprecated 149 IP)
dig TXT alecrae.com +short | grep spf
# Expected (target): v=spf1 ip4:66.42.121.161 include:spf.resend.com ~all

# SPF for customer domains (target — does not exist yet)
dig TXT _spf.alecrae.com +short
# Expected (target): same as above

# DKIM (Resend)
dig TXT resend._domainkey.alecrae.com +short
# Expected: v=DKIM1; k=rsa; p=... (long base64 string)

# DMARC
dig TXT _dmarc.alecrae.com +short
# Expected: v=DMARC1; p=quarantine; ...

# MX host resolves to box IP (target — record does not exist yet)
dig A mx1.alecrae.com +short
# Expected (target): 66.42.121.161
```

---

## 7. Common Failures

**Multiple SPF records:** Only one `v=spf1` TXT record is allowed on `@`. If you have one from Cloudflare Email Routing, delete it and replace with the single SPF shown above.

**MX records from Cloudflare Email Routing:** Cloudflare auto-adds `route1/2/3.mx.cloudflare.net` MX records when email routing is enabled. Delete these and replace with `mx1.alecrae.com` (priority 10) and `mx2.alecrae.com` (priority 20).

**DMARC on wrong name:** Must be at `_dmarc` (underscore prefix), not `dmarc` or `@`.

**SPF lookup limit:** Each `include:` counts as a DNS lookup. The limit is 10. `include:spf.resend.com` typically expands to 2-3 lookups — well within the limit.

---

_Last updated: 2026-07-13 02:40 UTC_
