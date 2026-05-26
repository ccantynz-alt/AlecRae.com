# AlecRae Deliverability Runbook

> Self-hosted MTA. New domain. New IP. Zero reputation.
> This document is the playbook. Follow it exactly.

---

## Why this matters

A brand-new sending IP has zero reputation with Gmail, Outlook, Yahoo, and Apple. Open the firehose on day one and every message AlecRae sends will land permanently in spam — and once a domain/IP is tagged as a spammer by the major ISPs, digging out takes weeks or months, not days. We earn reputation gram by gram through authenticated sending, slow volume ramps, high engagement, and obsessive monitoring. There is no shortcut. The cost of going slow is a few weeks; the cost of going fast is the business.

---

## Prerequisites checklist (must be done before any production send)

- [ ] **SPF** published + passing — `v=spf1 ip4:<FLY_IP> -all`
- [ ] **DKIM** keypair generated on MTA, public key published in DNS, all outbound signed
- [ ] **DMARC** published — start at `p=quarantine; pct=10;`
- [ ] **PTR / rDNS** matches HELO hostname (`mx1.alecrae.com`)
- [ ] **MTA-STS** live + policy served at `https://mta-sts.alecrae.com/.well-known/mta-sts.txt`
- [ ] **TLS-RPT** published (`_smtp._tls.alecrae.com` TXT record)
- [ ] **TLS 1.2+** only — no SSL v3, no TLS 1.0, no TLS 1.1
- [ ] **Not an open relay** — verified with mail-tester.com (target 10/10)
- [ ] **`postmaster@alecrae.com`** mailbox exists and is monitored daily
- [ ] **`abuse@alecrae.com`** mailbox exists and is monitored daily

If any box is unchecked, do not send production mail. No exceptions.

---

## IP warmup schedule — week by week

| Week | Gmail/day | Outlook/day | Yahoo/day | Apple/day | Other/day | Total/day |
|------|-----------|-------------|-----------|-----------|-----------|-----------|
| 1    | 50        | 50          | 25        | 25        | 25        | 175       |
| 2    | 100       | 100         | 50        | 50        | 50        | 350       |
| 3    | 250       | 250         | 100       | 100       | 100       | 800       |
| 4    | 500       | 500         | 250       | 250       | 250       | 1,750     |
| 5    | 1,000     | 1,000       | 500       | 500       | 500       | 3,500     |
| 6    | 2,000     | 2,000       | 1,000     | 1,000     | 1,000     | 7,000     |
| 7+   | 2x previous day, capped at real volume | | | | | |

### Warmup rules
- **Never exceed 2x previous day** to any single ISP.
- If bounce rate **> 2%** to any ISP → pause that ISP, hold at previous day's volume for 3 days.
- If bounce rate **> 5%** to any ISP → stop, investigate root cause, resume at 50% of previous.
- **Prioritize engaged recipients** (opens, clicks, replies) in warmup batches.
- **Mix in transactional mail early** — password resets, email verification, security alerts. These have the highest engagement and build reputation the fastest.

---

## Monitoring setup — enrollment URLs + steps

### Google Postmaster Tools — `postmaster.google.com`
1. Add domain `alecrae.com`.
2. Verify via TXT record at the root.
3. Watch: spam rate, IP reputation, domain reputation, authentication, encryption, delivery errors.
4. Check **daily for the first 30 days**, then weekly.

### Microsoft SNDS (Smart Network Data Services) — `sendersupport.olc.protection.outlook.com/snds/`
1. Request access for your IP range.
2. IP-based only (not domain-based).
3. Watch: RCPT commands, DATA commands, spam trap hits, complaint rate.

### Microsoft JMRP (Junk Mail Reporting Program) — `olcsupport.office.com`
1. Enroll for JMRP.
2. Complaints route to your FBL address (`fbl@alecrae.com`).

### Yahoo CFL (Complaint Feedback Loop) — `senders.yahooinc.com`
1. Enroll in Yahoo's Complaint Feedback Loop.
2. Receive Yahoo complaints at `fbl@alecrae.com`.

### AOL FBL — `postmaster.aol.com`
1. Enroll in AOL's Complaint Feedback Loop.

### Apple iCloud
iCloud uses private relay and offers no FBL. For delivery issues, contact `support@icloud.com`.

All FBL reports route to `fbl@alecrae.com` and are parsed via ARF (Abuse Reporting Format) — see Wave 2 tasks.

---

## Alert thresholds

| Signal | Threshold | Action |
|---|---|---|
| Bounce rate | > 2% | Slow to previous day's volume |
| Bounce rate | > 5% | **STOP**, investigate |
| Complaint rate | > 0.1% | Slow down |
| Complaint rate | > 0.3% | **STOP**, investigate |
| Postmaster Tools spam rate | > 0.1% | Investigate same day |
| Domain reputation | drops below "medium" | Pause all campaigns |
| Any blocklist listing | present | Emergency protocol (see below) |

---

## Blocklist monitoring — weekly checks

- **Spamhaus** — `spamhaus.org/lookup`
- **Barracuda** — `barracudacentral.org/rbl/lookup`
- **SORBS** — `sorbs.net`
- **SURBL** — `surbl.org`
- **URIBL** — `uribl.com`
- **Unified check** — `mxtoolbox.com/blacklists.aspx`

If listed: each provider has its own delisting URL. Typical turnaround 24-72 hours. **Delisting without fixing the root cause will result in immediate re-listing** and a harder path back.

---

## Common failure modes + fixes

| Failure | Fix |
|---|---|
| DKIM fails on forwarded mail | Implement ARC (Authenticated Received Chain). **Wave 2 task.** |
| From-domain mismatch with `DKIM d=` | Align the DKIM signing domain with the From: header domain. |
| SPF > 10 DNS lookups | Flatten SPF includes into direct `ip4:` / `ip6:` mechanisms. |
| PTR doesn't match HELO | Email Fly.io support to set the reverse DNS record. |
| Shared IP neighbor blacklisted | Upgrade to Fly.io dedicated IP (paid tier). Prevents noisy neighbors entirely. |

---

## Engagement signals to cultivate

**Positive signals** (in order of weight):
- Marked as "not spam" — very positive
- Replies — highest organic positive signal
- Forwards — positive
- Opens — real opens from real users, not pixel spam
- Clicks — positive when links are relevant

**Negative signals:**
- Marked as spam — very negative, target **< 0.1%**
- Hard bounces — negative
- Unsubscribes — expected, not harmful if **< 0.5%**

### List hygiene
- **Hard bounce** → auto-suppress immediately.
- **Soft bounce x 5** consecutive → auto-suppress.
- **No engagement x 90 days** → re-engagement campaign; suppress if still silent.

---

## Steady-state operations

- **Daily** — check Google Postmaster Tools, bounce rate, complaint rate.
- **Weekly** — run blocklist check across all six services, review FBL reports.
- **Monthly** — review domain + IP reputation trend; consider DKIM key rotation.
- **Quarterly** — review DMARC policy; tighten `p=quarantine` → `p=reject` when data supports it.

---

## Emergency protocol — first 30 minutes if blacklisted

1. **PAUSE all outbound immediately** — `fly deploy` with kill switch enabled.
2. **Identify the listing source** — mxtoolbox unified check.
3. **Check recent sends for root cause:**
   - Compromised sending account?
   - Spam trap hit?
   - Sudden volume spike beyond warmup schedule?
   - Content trigger (phrases, link shorteners, attachment types)?
4. **Fix the root cause.** Delisting without a fix results in immediate re-listing.
5. **Submit the delisting request** with evidence of the fix attached.
6. **Resume sending at 25% of previous day's volume** once delisted.
7. **Post-mortem + prevention plan** — required, committed to `docs/postmortems/`.

---

*This runbook is the source of truth for AlecRae deliverability operations. Updates require review against live Postmaster Tools and FBL data.*
