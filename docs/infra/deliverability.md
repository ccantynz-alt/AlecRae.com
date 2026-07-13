# AlecRae Deliverability Runbook

> Self-hosted MTA on the **dedicated mail box — the "158" box (149.28.119.158**, `ssh root@vapron-158` via Tailscale, peer 100.89.227.39). Jarvis (66.42.121.161) keeps web/api compute only. New domain. Partially-warmed IP.
> This document is the playbook. Follow it exactly.
>
> **State as of 2026-07-13:** Craig decided (Option A, `docs/infra/multi-platform-mail-plan.md` §4) that 158 stays as the mail box. ✅ Mail DNS executed 2026-07-13 (verified resolving live): mx1/mx2/smtp A records → 149.28.119.158 (grey), MX 10/20, `_spf.alecrae.com` TXT, `bounce.alecrae.com` CNAME → smtp.alecrae.com. **The MTA's HELO/PTR sending identity is `smtp.alecrae.com`** (`MTA_HOSTNAME=smtp.alecrae.com`); `mail.alecrae.com` stays Cloudflare-proxied (webmail on Jarvis, not a mail record). ⚠ One item pending: the Vultr PTR for 149.28.119.158 still reads `mail.alecrae.com` and must be **changed to `smtp.alecrae.com`**. The MTA is NOT yet running on any box.

---

## Why this matters

A brand-new sending IP has zero reputation with Gmail, Outlook, Yahoo, and Apple. Open the firehose on day one and every message AlecRae sends will land permanently in spam — and once a domain/IP is tagged as a spammer by the major ISPs, digging out takes weeks or months, not days. We earn reputation gram by gram through authenticated sending, slow volume ramps, high engagement, and obsessive monitoring. There is no shortcut. The cost of going slow is a few weeks; the cost of going fast is the business.

---

## Prerequisites checklist (must be done before any production send)

- [ ] **SPF** published + passing — target: `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all` (✅ the live `spf.alecrae.com` already authorizes the 158 mail-box IP; ✅ the `_spf.alecrae.com` TXT — `v=spf1 ip4:149.28.119.158 ~all`, used by customer-domain includes — is **LIVE**, applied 2026-07-13)
- [ ] **DKIM** keypair generated on MTA, public key published in DNS, all outbound signed
- [ ] **DMARC** published — start at `p=quarantine; pct=10;`
- [ ] **PTR / rDNS** matches HELO hostname — ⚠ **pending change**: the HELO identity is **`smtp.alecrae.com`** (`MTA_HOSTNAME=smtp.alecrae.com`), but the PTR on `149.28.119.158` currently reads `mail.alecrae.com` — Craig must change it to `smtp.alecrae.com` in the Vultr panel. Verify AFTER the change: `nslookup 149.28.119.158` / `dig -x 149.28.119.158 +short` should return `smtp.alecrae.com.`
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
2. Verify via TXT record at the root — value comes from `buildVerificationTxtRecord()` in
   `services/reputation/src/postmaster/index.ts` once `GOOGLE_POSTMASTER_VERIFICATION_TOKEN` is set.
3. Create a service account (Postmaster Tools uses OAuth2, not the verification token, for API
   reads), grant it read access to the domain in the Postmaster Tools UI, and put the full key
   JSON in `GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON`.
4. Watch: spam rate, IP reputation, domain reputation, authentication, encryption, delivery errors.
5. **Automated as of 2026-07-01** — see "Automated monitoring" below. Still worth an eyeball
   check on the dashboard **daily for the first 30 days**, then weekly.

### Microsoft SNDS (Smart Network Data Services) — `sendersupport.olc.protection.outlook.com/snds/`
1. Request access for your IP range.
2. IP-based only (not domain-based).
3. Watch: RCPT commands, DATA commands, spam trap hits, complaint rate.
4. Provision an "Automated Data Access" token in the SNDS portal, set it as `SNDS_ACCESS_TOKEN`.
   **Caveat:** SNDS has no publicly documented API schema — `services/reputation/src/snds/index.ts`
   is a best-effort parser. Treat the first live poll as a test, not a production signal, and
   re-verify the parser against the real response before trusting it in an incident.
5. **Automated as of 2026-07-01** — see "Automated monitoring" below.

---

## Automated monitoring — systemd timers

Three periodic jobs, added 2026-07-01, wire external reputation/compliance signals into the
warm-up orchestrator's hard-pause path automatically — no one has to be watching a dashboard for
sending to stop when Google or Microsoft says stop. All three post to Slack via `SLACK_WEBHOOK_URL`,
tagged `[REPUTATION]` or `[COMPLIANCE]` so they can share one channel unambiguously.

| Job | Source | Cadence | On failure |
|---|---|---|---|
| `alecrae-postmaster` | Google Postmaster Tools v1 (`domainReputation`: HIGH/MEDIUM/LOW/BAD) | 6h | LOW → pause this domain. BAD → pause everything. |
| `alecrae-postmaster-compliance` | Google Postmaster Tools v2 (`getComplianceStatus` — SPF/DKIM/DMARC/unsubscribe pass-fail) | 24h (changes slowly) | Any failing row → Slack warning with remediation. Does not pause sending on its own — compliance failures degrade deliverability gradually, they don't need the same hair-trigger as a live reputation crash. |
| `alecrae-snds` | Microsoft SNDS (GREEN/YELLOW/RED per IP) | 24h | RED → pause everything (shared IP — see caveat below). |

**Why BAD/RED pauses *everything*, not just one domain:** AlecRae does not yet provision dedicated
IPs per domain (Layer 5 gap, tracked separately). Every domain shares the box's outbound IP, so a
reputation crash on that IP threatens every domain sending from it, not just the one that
happened to trigger the alert.

Install on the 158 mail box (`ssh root@vapron-158`; adjust `User=` to match `alecrae-mta`'s convention):

```bash
sudo tee /etc/systemd/system/alecrae-postmaster.service > /dev/null <<'EOF'
[Unit]
Description=AlecRae Postmaster Tools v1 reputation check
After=network.target

[Service]
Type=oneshot
User=deploy
WorkingDirectory=/opt/alecrae
EnvironmentFile=/opt/alecrae/.env
ExecStart=/root/.bun/bin/bun run /opt/alecrae/services/reputation/src/postmaster/index.ts
StandardOutput=journal
StandardError=journal
EOF

sudo tee /etc/systemd/system/alecrae-postmaster.timer > /dev/null <<'EOF'
[Unit]
Description=Run alecrae-postmaster every 6 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=6h
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/alecrae-postmaster-compliance.service > /dev/null <<'EOF'
[Unit]
Description=AlecRae Postmaster Tools v2 bulk-sender compliance check
After=network.target

[Service]
Type=oneshot
User=deploy
WorkingDirectory=/opt/alecrae
EnvironmentFile=/opt/alecrae/.env
ExecStart=/root/.bun/bin/bun run /opt/alecrae/services/reputation/src/postmaster/compliance.ts
StandardOutput=journal
StandardError=journal
EOF

sudo tee /etc/systemd/system/alecrae-postmaster-compliance.timer > /dev/null <<'EOF'
[Unit]
Description=Run alecrae-postmaster-compliance every 24 hours

[Timer]
OnBootSec=10min
OnUnitActiveSec=24h
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/alecrae-snds.service > /dev/null <<'EOF'
[Unit]
Description=AlecRae Microsoft SNDS reputation check
After=network.target

[Service]
Type=oneshot
User=deploy
WorkingDirectory=/opt/alecrae
EnvironmentFile=/opt/alecrae/.env
ExecStart=/root/.bun/bin/bun run /opt/alecrae/services/reputation/src/snds/index.ts
StandardOutput=journal
StandardError=journal
EOF

sudo tee /etc/systemd/system/alecrae-snds.timer > /dev/null <<'EOF'
[Unit]
Description=Run alecrae-snds every 24 hours

[Timer]
OnBootSec=15min
OnUnitActiveSec=24h
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now alecrae-postmaster.timer alecrae-postmaster-compliance.timer alecrae-snds.timer
systemctl list-timers | grep alecrae
```

Run a check manually at any time (useful right after setting the env vars, before waiting for the
timer): `bun run /opt/alecrae/services/reputation/src/postmaster/index.ts` (or `compliance.ts` /
`services/reputation/src/snds/index.ts`).

**Not yet done:** none of this has been exercised against live Google/Microsoft credentials — no
service account or SNDS token existed at write time. Treat the first real poll of each job as a
test. If Postmaster Tools v2 returns 403, check the OAuth scope first (`postmaster` vs
`postmaster.readonly` — see `services/reputation/src/postmaster/auth.ts`).

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
| PTR doesn't match HELO | rDNS is managed in the Vultr control panel: 158 instance → Settings → IPv4 → rDNS. ⚠ Currently `149.28.119.158` → `mail.alecrae.com` (wrong hostname) — must be changed to `smtp.alecrae.com` to match the HELO identity (`MTA_HOSTNAME=smtp.alecrae.com`). |
| Shared IP neighbor blacklisted | N/A — the 158 mail box has a dedicated static IP (`149.28.119.158`) used only for mail. No noisy neighbours. |

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

1. **PAUSE all outbound immediately** — on the 158 mail box: `sudo systemctl stop alecrae-mta`.
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

---

_Last updated: 2026-07-13 10:15 UTC_
