# DNS Zone Configuration — alecrae.com

**Audience:** Craig (owner). Paste these records into Cloudflare DNS.
**Goal:** Web traffic fast and proxied. Mail traffic direct and unproxied.
**Rule of thumb:** Web = orange cloud ON. Mail = orange cloud OFF. Don't mix these up or mail breaks.

Fill in these placeholders before publishing:
- `<FLY_IPv4>` — the public IPv4 of our primary Fly.io MTA machine
- `<FLY_IPv4_BACKUP>` — the public IPv4 of our backup MTA machine
- `<DKIM_PUBKEY>` — the DKIM public key string printed by the MTA on first boot
- `<unix_timestamp>` — current Unix time (e.g. `1744934400`) when you publish MTA-STS

---

## 1. Summary Table

| Name | Type | Value | TTL | Proxied? | Purpose |
|---|---|---|---|---|---|
| `alecrae.com` | A/CNAME | Cloudflare Pages | Auto | **Yes** | Landing page |
| `mail.alecrae.com` | CNAME | pages | Auto | **Yes** | Web app |
| `admin.alecrae.com` | CNAME | pages | Auto | **Yes** | Admin console |
| `api.alecrae.com` | CNAME | workers | Auto | **Yes** | API |
| `status.alecrae.com` | CNAME | betteruptime (or similar) | Auto | **Yes** | Status page |
| `docs.alecrae.com` | CNAME | pages | Auto | **Yes** | Docs |
| `mx1.alecrae.com` | A | `<FLY_IPv4>` | Auto | **No** | Primary MX host |
| `mx2.alecrae.com` | A | `<FLY_IPv4_BACKUP>` | Auto | **No** | Backup MX host |
| `smtp.alecrae.com` | A | `<FLY_IPv4>` | Auto | **No** | Outbound SMTP |
| `@` | MX | `mx1.alecrae.com` (priority 10) | Auto | N/A | Primary mail |
| `@` | MX | `mx2.alecrae.com` (priority 20) | Auto | N/A | Backup mail |
| `@` | TXT (SPF) | `v=spf1 ip4:<FLY_IPv4> include:_spf.alecrae.com -all` | Auto | N/A | SPF |
| `default._domainkey` | TXT (DKIM) | `v=DKIM1; k=rsa; p=<DKIM_PUBKEY>` | Auto | N/A | DKIM |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s` | Auto | N/A | DMARC (soft start) |
| `_mta-sts` | TXT | `v=STSv1; id=<unix_timestamp>` | Auto | N/A | MTA-STS policy ID |
| `mta-sts` | CNAME | pages | Auto | **Yes** | Serves `/.well-known/mta-sts.txt` |
| `_smtp._tls` | TXT | `v=TLSRPTv1; rua=mailto:tls-reports@alecrae.com` | Auto | N/A | TLS-RPT |

---

## 2. Plain-English Per-Record Explanation

### Root + subdomain web records (`alecrae.com`, `mail`, `admin`, `api`, `status`, `docs`)
These are the user-facing web endpoints. The root is the marketing landing page. `mail` is the actual email client. `admin` is the operator console. `api` is the backend API. `status` is the uptime page. `docs` is the developer documentation. All of these go through Cloudflare's proxy (orange cloud ON) so they get DDoS protection, caching, and TLS termination. If any of these are broken, people can't use the product — but email still works.

### MX records (`mx1`, `mx2`, and the two `@` MX rows)
MX records tell the rest of the internet where to send mail for `@alecrae.com`. The MX rows point to hostnames (`mx1.alecrae.com` and `mx2.alecrae.com`), and those hostnames have their own A records pointing to Fly.io IPs. Priority 10 is tried first; priority 20 is the backup if 10 is down. Without these, nobody can send us email.

### SPF (the `@` TXT starting `v=spf1`)
SPF tells receiving mail servers which IPs are allowed to send mail claiming to be from `@alecrae.com`. `ip4:<FLY_IPv4>` whitelists our primary outbound IP. `include:_spf.alecrae.com` lets us add more senders later without changing this record. `-all` means "reject anything not listed" — this is what you want for inbox placement, but start with `~all` (soft fail) on Day 1 and tighten to `-all` after 30 days of clean reports.

### DKIM (`default._domainkey` TXT)
DKIM is a cryptographic signature the MTA attaches to every outbound email. The public key lives in DNS so receivers can verify the signature. Without DKIM, mail goes to spam at Gmail/Outlook/Yahoo. The selector is `default` — the MTA prints the matching public key on first boot; paste it in as `<DKIM_PUBKEY>`.

### DMARC (`_dmarc` TXT)
DMARC ties SPF and DKIM together and tells receivers what to do when mail fails both. It also gives us reports (to `dmarc@alecrae.com`) so we can see who's spoofing our domain. We start soft (`p=quarantine pct=10` = "only quarantine 10% of failing mail") to avoid breaking legitimate mail we forgot about, then tighten over 60 days.

### MTA-STS (`_mta-sts` TXT + `mta-sts` CNAME)
MTA-STS forces other mail servers to use TLS when sending us mail. The TXT record announces the policy exists and gives it a version ID (change the ID whenever you update the policy file). The CNAME serves the actual policy file at `https://mta-sts.alecrae.com/.well-known/mta-sts.txt`. This prevents downgrade attacks — without it, an attacker on the network can force mail to be delivered unencrypted.

### TLS-RPT (`_smtp._tls` TXT)
Complements MTA-STS. Tells other servers where to send reports when TLS negotiation fails. We get daily JSON reports at `tls-reports@alecrae.com` so we can spot problems before users notice.

---

## 3. Cloudflare Gotcha — Orange Cloud OFF for Mail

**Cloudflare cannot proxy SMTP traffic. Period.**

If the orange cloud is ON (proxied) for any of these records, mail delivery will fail silently:
- `mx1.alecrae.com`
- `mx2.alecrae.com`
- `smtp.alecrae.com`
- Both `@` MX rows (MX records can't be proxied anyway, but double-check)

**How to turn proxy OFF in Cloudflare:**
1. Go to the DNS tab for `alecrae.com`
2. Find the record (e.g. `mx1`)
3. Click the **orange cloud icon** next to the record
4. It turns **grey** ("DNS only")
5. Save

If the cloud is orange on an A record that receives mail, inbound SMTP connections hit Cloudflare's HTTP proxy, which doesn't speak SMTP, and the connection dies. No error in our logs — just no mail.

**Rule:**
- Web records (web app, api, docs, status, landing, admin, mta-sts policy host) = **orange cloud ON**
- Mail records (mx1, mx2, smtp) = **grey cloud OFF**

---

## 4. Verification Commands

Run these from any terminal after DNS propagates (usually 1-5 minutes on Cloudflare).

### MX records
```
dig MX alecrae.com +short
```
**Expected:**
```
10 mx1.alecrae.com.
20 mx2.alecrae.com.
```
**Bad:** empty output, or only one line, or wrong hostnames. Fix: re-check the two `@` MX rows exist with priorities 10 and 20.

### SPF
```
dig TXT alecrae.com +short
```
**Expected (among other TXT records):**
```
"v=spf1 ip4:<FLY_IPv4> include:_spf.alecrae.com -all"
```
**Bad:** multiple `v=spf1` records (you can only have ONE SPF record per domain — merge them), or missing entirely. Fix: delete duplicates, keep one authoritative SPF record.

### DKIM
```
dig TXT default._domainkey.alecrae.com +short
```
**Expected:**
```
"v=DKIM1; k=rsa; p=MIIBIjANBgkqh..." (long base64 string)
```
**Bad:** empty, or "record not found". Fix: the record name must be exactly `default._domainkey` (selector matches the one the MTA uses when signing). If the public key is very long, Cloudflare splits it into quoted chunks — that's fine, concatenate them when reading.

### DMARC
```
dig TXT _dmarc.alecrae.com +short
```
**Expected:**
```
"v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s"
```
**Bad:** missing, or on the wrong name. Fix: must be at `_dmarc` (underscore), not `dmarc`.

### MTA-STS
```
dig TXT _mta-sts.alecrae.com +short
```
**Expected:**
```
"v=STSv1; id=1744934400"
```
**Bad:** missing, or ID hasn't been updated after a policy change. Fix: bump the `id=` to a new Unix timestamp whenever you change the policy file.

### MX host A record
```
dig A mx1.alecrae.com +short
```
**Expected:**
```
<FLY_IPv4>
```
**Bad:** returns a Cloudflare proxy IP (usually `104.x.x.x` or `172.x.x.x`) instead of the Fly IP. That means the orange cloud is ON. Fix: turn it OFF (section 3 above).

---

## 5. Common Failures

### SPF too long (>10 DNS lookups)
Every `include:` counts as a lookup, and each included record can chain more. If the total exceeds 10, receivers reject the SPF as "permerror" and mail goes to spam.
**Fix:** consolidate includes. Use `ip4:` directly for our Fly IPs instead of chaining through `_spf.alecrae.com` if we only have 1-2 senders. Audit with `dig TXT _spf.alecrae.com` to see what it expands to.

### DKIM not found
Receivers look up the signature's selector (e.g. `default`) at `<selector>._domainkey.<domain>`. If the record name is wrong, verification fails and mail goes to spam.
**Fix:** record name must be exactly `default._domainkey` (the MTA signs with selector `default`). If you changed the selector on the MTA side, the DNS name must match.

### DMARC too strict at launch
If you publish `p=reject pct=100` on Day 1 and any legitimate source is missing from SPF/DKIM (newsletter service, CRM, Stripe receipts), those mails bounce. Hard to diagnose under pressure.
**Fix:** start `p=quarantine pct=10`. Watch the daily DMARC reports at `dmarc@alecrae.com` for 30 days. When reports are clean, move to `pct=100`. When that's clean for another 30 days, move to `p=reject`.

### MX proxied (orange cloud ON)
Outbound SMTP fails silently. Inbound delivery fails silently. No error in our logs.
**Fix:** section 3. Every mail-related record gets the grey cloud.

---

## 6. Day 1 vs Day 30 vs Day 60 Progression

DMARC and SPF are tightened in stages. Never publish the strict version on Day 1.

### Day 1 (launch)
- **DMARC:** `v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s`
- **SPF:** `v=spf1 ip4:<FLY_IPv4> include:_spf.alecrae.com ~all` (soft fail — `~all`)
- Watch DMARC reports daily for 2 weeks. Look for legitimate senders failing (forgotten newsletters, transactional mail, etc.). Add them to SPF or set up DKIM for them.

### Day 30 (if reports are clean)
- **DMARC:** bump `pct=10` to `pct=100`. Keep `p=quarantine`.
  `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s`
- **SPF:** still `~all`.
- Continue watching reports for another 30 days.

### Day 60 (if still clean)
- **DMARC:** move to `p=reject`.
  `v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@alecrae.com; ruf=mailto:dmarc@alecrae.com; adkim=s; aspf=s`
- **SPF:** flip `~all` to `-all` (hard fail).
  `v=spf1 ip4:<FLY_IPv4> include:_spf.alecrae.com -all`
- You are now fully protected. Spoofers get rejected outright. Legitimate mail has been verified for 60 days.

**If at any stage reports show a problem, pause the progression and fix the sender before tightening further.**
