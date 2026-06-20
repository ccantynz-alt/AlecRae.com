# DNS Zone Configuration — alecrae.com

**Audience:** Craig (owner). Paste these records into Cloudflare DNS.
**Goal:** Web traffic to the production box. Mail traffic direct and unproxied.
**Rule of thumb:** Web = DNS only (grey cloud). Mail = DNS only (grey cloud). Both go directly to the box at `149.28.119.158`.

> **Current deployment:** Production box at `149.28.119.158` (NOT Fly.io or Cloudflare Pages). Caddy on the box handles TLS. The box serves all subdomains.

---

## 1. Summary Table — Current State

| Name | Type | Value | TTL | Proxied? | Purpose |
|---|---|---|---|---|---|
| `@` | A | `149.28.119.158` | Auto | **No** | Landing page (alecrae.com) |
| `www` | A | `149.28.119.158` | Auto | **No** | www redirect to apex |
| `mail` | A | `149.28.119.158` | Auto | **No** | Web app (mail.alecrae.com) |
| `api` | A | `149.28.119.158` | Auto | **No** | API (api.alecrae.com) |
| `mx1` | A | `149.28.119.158` | Auto | **No** | Primary MX host |
| `mx2` | A | `149.28.119.158` | Auto | **No** | Backup MX host |
| `smtp` | A | `149.28.119.158` | Auto | **No** | Outbound SMTP |
| `@` | MX | `mx1.alecrae.com` (priority 10) | Auto | N/A | Primary mail |
| `@` | MX | `mx2.alecrae.com` (priority 20) | Auto | N/A | Backup mail |
| `@` | TXT (SPF) | `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all` | Auto | N/A | SPF for alecrae.com |
| `_spf` | TXT | `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all` | Auto | N/A | SPF for customer domains |
| `resend._domainkey` | TXT | *(from Resend dashboard)* | Auto | N/A | DKIM via Resend |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s` | Auto | N/A | DMARC (soft start) |

> **Note:** All records are DNS-only (grey cloud). Caddy on the box handles TLS via on-demand cert issuance. Cloudflare's proxy is NOT used — it would intercept HTTPS before the box can terminate it.

---

## 2. Why everything is grey cloud now

In the original architecture, web records (mail, admin, api) were planned for Cloudflare Pages/Workers (orange cloud = proxied). That architecture was superseded by the dedicated Vapron box deployment. Now:

- All traffic goes to `149.28.119.158`
- Caddy handles TLS at the box level (Let's Encrypt via on-demand cert API)
- The vapron-bun-gateway on the box routes by hostname to the correct service
- Mail records **must** be grey cloud (SMTP can't go through Cloudflare's HTTP proxy)
- Web records **should** also be grey cloud (Caddy handles TLS, and orange cloud would cause double-TLS issues)

---

## 3. SPF for alecrae.com and customer domains

Two SPF records are required:

1. **`@` (alecrae.com itself):** `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all`
   - Authorises the box IP (for direct MX when port 25 is unblocked) and Resend's relay IPs (current relay)

2. **`_spf` (_spf.alecrae.com):** `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all`
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
# MX records
dig MX alecrae.com +short
# Expected: 10 mx1.alecrae.com. and 20 mx2.alecrae.com.

# SPF for alecrae.com
dig TXT alecrae.com +short | grep spf
# Expected: v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all

# SPF for customer domains
dig TXT _spf.alecrae.com +short
# Expected: same as above

# DKIM (Resend)
dig TXT resend._domainkey.alecrae.com +short
# Expected: v=DKIM1; k=rsa; p=... (long base64 string)

# DMARC
dig TXT _dmarc.alecrae.com +short
# Expected: v=DMARC1; p=quarantine; ...

# MX host resolves to box IP
dig A mx1.alecrae.com +short
# Expected: 149.28.119.158
```

---

## 7. Common Failures

**Multiple SPF records:** Only one `v=spf1` TXT record is allowed on `@`. If you have one from Cloudflare Email Routing, delete it and replace with the single SPF shown above.

**MX records from Cloudflare Email Routing:** Cloudflare auto-adds `route1/2/3.mx.cloudflare.net` MX records when email routing is enabled. Delete these and replace with `mx1.alecrae.com` (priority 10) and `mx2.alecrae.com` (priority 20).

**DMARC on wrong name:** Must be at `_dmarc` (underscore prefix), not `dmarc` or `@`.

**SPF lookup limit:** Each `include:` counts as a DNS lookup. The limit is 10. `include:spf.resend.com` typically expands to 2-3 lookups — well within the limit.

---

_Last updated: 2026-06-20 14:00 UTC_
