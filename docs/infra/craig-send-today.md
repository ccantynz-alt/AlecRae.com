# Craig — Start Sending This Week (Training Wheels Path)

> **Goal:** Have you sending real support email **from `support@alecrae.com`** within ~24 hours of starting, with full DKIM/SPF/DMARC, near-zero spam-folder risk, and reputation building from day one.
>
> **What this skips:** Sending directly from the mail box IP — the **"158" box, `149.28.119.158`** (dedicated mail box per Craig's 2026-07-13 decision, Option A in `docs/infra/multi-platform-mail-plan.md` §4; Jarvis `66.42.121.161` keeps web/api compute only) — on port 25. That's the right destination — but for the first 60–90 days you should relay through Amazon SES so you inherit pre-warmed IP reputation while `alecrae.com` builds its own domain reputation in parallel. When the domain is trusted and the MTA is hardened, you flip `RELAY_PROVIDER=` to direct (unset) and you're independent. Note: the live SPF and the PTR (`149.28.119.158` → `mail.alecrae.com`, already set) already authorize the 158 box; the remaining mail records (mx1/mx2 A → 149.28.119.158, `_spf.alecrae.com` TXT) are ⚠ pending, awaiting Craig's Cloudflare execution.
>
> **What this is NOT:** A bypass of the rules. Every message still gets DKIM-signed by AlecRae, every recipient still goes through suppression-list checks, DMARC still aligns. The only difference is the IPs that hit Gmail's edge are AWS's — which is exactly how Hey, Front, and Superhuman launched.

---

## ⏱️ Timeline at a glance

| Step | Time | Blocking? |
|---|---|---|
| 1. DNS records on Cloudflare | 15 min | No — propagation can run while you do step 2 |
| 2. AWS SES domain verify + sandbox | 15 min | Wait for AWS production access (~24h, run in background) |
| 3. Generate DKIM key, paste public side into DNS | 5 min | No |
| 4. Postmaster Tools (Google + Microsoft) | 10 min | No |
| 5. Send first test from your platform | 5 min | After AWS prod access |
| 6. Set warmup rules (what to send, what not to) | read once | Permanent rule of the road |

**Total active time: ~50 min spread over 24 hours.**

---

## Step 1 — DNS records on Cloudflare (15 min)

Open `dash.cloudflare.com → alecrae.com → DNS → Records`. Add or confirm these. **Proxy status must be "DNS only" (grey cloud) for everything email-related — Cloudflare's HTTP proxy does not handle SMTP.**

| Type | Name | Content | Proxy | Purpose |
|---|---|---|---|---|
| `TXT` | `@` | `v=spf1 include:amazonses.com -all` | DNS only | SPF — authorises SES to send for alecrae.com |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc-reports@alecrae.com; ruf=mailto:dmarc-reports@alecrae.com; fo=1; adkim=s; aspf=s` | DNS only | DMARC at 10% quarantine — strict alignment, full reports |
| `MX` | `@` | `10 feedback-smtp.us-east-1.amazonses.com` | DNS only | Inbound for bounces/complaints (only if you want SES to handle bounces — optional Day 1) |
| `CNAME` | `bounce` | `feedback-smtp.us-east-1.amazonses.com` | DNS only | Custom return-path / VERP |

**Important:**
- Replace `us-east-1` if you pick a different SES region.
- DKIM records come in step 3 — SES will tell you the exact CNAME values to paste.
- The `-all` in SPF is strict and correct. Do not soften to `~all` "just in case."
- The DMARC `pct=10` means "apply quarantine to 10% of failing mail." Start there. After 30 days clean, raise to 50%, then 100%.

---

## Step 2 — Amazon SES setup (15 min + 24h wait)

1. **Sign in to AWS Console → SES.** Pick a region close to your users — `us-east-1` is the default and the cheapest.
2. **Verified Identities → Create Identity → Domain → `alecrae.com`.** Tick "Use a custom MAIL FROM domain" and set it to `bounce.alecrae.com`. Tick "Use Easy DKIM" — SES will generate three CNAME records.
3. **Copy the three SES-supplied CNAME values into Cloudflare DNS** (DNS only, grey cloud). They look like `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx._domainkey.alecrae.com → xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.dkim.amazonses.com`. Three of them. All grey cloud.
4. **Wait for SES to flip "Verified" green** — usually 5–30 minutes after DNS propagation.
5. **Request production access.** SES starts in sandbox mode (200 sends/day, only to verified emails). Click "Request production access" — describe AlecRae briefly: *"Transactional and 1:1 support email for alecrae.com. Recipients are users who have signed up or contacted us. List acquisition: organic signups + direct contact only. Bounce/complaint handling: automated suppression via SES feedback notifications."* AWS approves within 24 hours; usually faster.
6. **Create SMTP credentials** — SES → SMTP Settings → Create SMTP Credentials. Save the username and password. These are what your other platforms will use to send.

---

## Step 3 — DKIM verification (5 min)

SES generated three DKIM CNAMEs in step 2. After they propagate (5–30 min) SES will show **DKIM: Verified ✅** on the identity page. That's it. Every message you send via SES is now DKIM-signed by `alecrae.com`. Gmail will see your domain as authenticated.

**Verify it actually works:** send a test to a Gmail address (yourself), open the email, click the three dots → "Show original". You should see:

```
SPF:  PASS  with IP <SES IP>
DKIM: PASS  with domain alecrae.com
DMARC: PASS
```

If any of those say FAIL or NEUTRAL, **stop and fix before sending anything else.**

---

## Step 4 — Postmaster Tools (10 min)

Free monitoring from Gmail and Microsoft. Register both day one — without them you are flying blind on deliverability.

### Google Postmaster Tools

1. `https://postmaster.google.com` → Add Domain → `alecrae.com`
2. Google gives you a TXT verification record. Paste it into Cloudflare DNS (TXT, name `@`, DNS only).
3. Wait ~24h for data to populate. From then on you'll see: spam rate, IP reputation, domain reputation, authentication pass rate, encryption rate, delivery errors.
4. **The metric to watch:** spam rate must stay under 0.10%. At 0.30% Gmail starts dropping you to spam. At 1.00% you're a spammer. Above 0.10% you slow down immediately.

### Microsoft SNDS + JMRP

1. `https://sendersupport.olc.protection.outlook.com/snds/` → request access.
2. Also subscribe to JMRP (Junk Mail Reporting Program) at the same URL — feedback loop for Outlook/Hotmail complaints.
3. Microsoft is slower to approve than Google. Apply now so it's ready when you need it.

### Yahoo / Apple

Yahoo participates in the Microsoft SNDS-equivalent passively — no portal. Apple doesn't expose a portal at all. You monitor those via your bounce + complaint metrics inside AlecRae's `/v1/domains/:id/warmup/report` endpoint.

---

## Step 5 — Wire SES into your platforms (5 min per platform)

You don't need to deploy AlecRae's MTA for this. Every platform you have — Stripe-style transactional, support helpdesk, signup flows — can SMTP directly to SES with the AlecRae From address. Use these connection details:

```
SMTP host:     email-smtp.us-east-1.amazonaws.com
SMTP port:     587
TLS:           STARTTLS (required)
Username:      <SES SMTP user from step 2.6>
Password:      <SES SMTP password from step 2.6>
From address:  support@alecrae.com   (or any address @alecrae.com)
Return-Path:   bounce@alecrae.com
```

**Required headers on every message** (most platforms set these automatically):

- `From: AlecRae Support <support@alecrae.com>`
- `Reply-To: support@alecrae.com`
- `List-Unsubscribe: <mailto:unsubscribe@alecrae.com>, <https://alecrae.com/unsubscribe?id={message_id}>`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058 — Gmail/Yahoo bulk-sender requirement)
- `Message-ID: <{uuid}@alecrae.com>`

When AlecRae's API is live (Neon up), you'll route through `/v1/email/send` instead of direct SES — same end result, but it'll go through AlecRae's filter chain (header validator, suppression list, scoring). Until then, direct SES SMTP is fine because SES enforces its own (slightly weaker) version of the same checks.

---

## Step 6 — Warmup rules of the road (read once, follow forever)

These rules are non-negotiable for the first 90 days. Every successful email startup follows them. Every failed one tried to skip them.

### What to send (✅ green-light all of this)

- **Reactive support replies** — someone emailed you, you reply. Highest engagement, near-zero complaints. **Send unlimited.**
- **Transactional** — signup confirmation, password reset, receipt, booking confirmation, "your file is ready". User just took an action; mail is expected. **Send unlimited.**
- **1:1 personal mail from you** — Craig writing one human a real message. Indistinguishable from regular mail. **Send unlimited.**

### What NOT to send (🚫 hard stop for 90 days)

- **Newsletters** — even if all subscribers are opt-in. Wait until domain reputation > 0.7 in Postmaster Tools.
- **Re-engagement campaigns** — "we miss you!" mail to dormant users. Worst possible warmup signal — lots of opens, lots of complaints, lots of "this is spam" clicks. Defer to month 6+.
- **Cold outreach** — don't, ever, on the alecrae.com domain. Use a separate domain (`outreach.alecrae.com` or a different domain entirely) if you must, never the production one.
- **Bulk announcements** — "AlecRae just launched feature X" to all users. Acceptable AFTER 90 days of clean reputation, never before.
- **Anything to a list you bought, scraped, or imported from another platform** — instant blocklist.

### Volume ramp (SES auto-handles, but know the shape)

| Week | Max sends/day | Rule |
|---|---|---|
| 1 | 50 | Only reactive support + transactional |
| 2 | 200 | Same |
| 3 | 500 | Add 1:1 mail from you |
| 4 | 1,000 | Same — verify spam rate < 0.05% in Postmaster Tools |
| 5–8 | ramp by 2x weekly | Stop ramping immediately if spam rate climbs above 0.10% |
| 9+ | open the throttle | Newsletters now possible if engagement is strong |

### Daily monitoring (5 min, do it)

Check `https://postmaster.google.com` → spam rate panel. If it's:
- **Under 0.10%:** all good, continue.
- **0.10–0.30%:** stop sending non-essential mail. Investigate which campaigns or recipients are complaining. Do not raise volume until it drops.
- **Over 0.30%:** stop all non-transactional mail immediately. You have ~48 hours before Gmail starts hard-blocking. Find the cause (likely a bad list or a content trigger) and fix it before resuming.

### One-strike rules (immediate suppression of the cause)

- Hard bounce → recipient permanently suppressed (AlecRae's bounce classifier handles this automatically).
- Spam complaint → recipient permanently suppressed (FBL processor handles this).
- "Mailbox full" 5-day soft bounce → recipient temporarily suppressed for 30 days.

You do not need to do anything for these — `services/reputation` is already wired. They are listed so you understand why a recipient suddenly stops getting your mail: AlecRae is protecting the domain.

---

## Step 7 — Graduating to self-hosted MTA on the 158 mail box (Day ~90)

Once Postmaster Tools shows:
- Domain reputation: **High** for 30+ consecutive days
- Spam rate: under **0.05%** sustained
- Authentication: 100% pass rate

…you're ready to shift outbound from SES relay to AlecRae's own MTA running
on the dedicated mail box (`149.28.119.158`, `ssh root@vapron-158` via
Tailscale). The process is documented in
[`mta-box-setup.md`](./mta-box-setup.md). The shift is graceful: in the box
`.env`, set `RELAY_PROVIDER=` to empty/unset to enable direct MX delivery,
while keeping `RELAY_PROVIDER=smtp` (Resend/SES) as the fallback in the
relay client — half the volume goes direct, half stays on SES, for two weeks
while the box IP earns its own reputation. After 30 days at 100% direct, SES
is fallback only. The PTR prerequisite is **already met**: the Vultr PTR for
`149.28.119.158` → `mail.alecrae.com` is set (a key reason Option A kept the
158 box for mail), and outbound port 25 on 158 is already Vultr-unblocked.
Still ⚠ pending: mx1/mx2 A records + `_spf.alecrae.com` TXT targeting
`149.28.119.158`, awaiting Craig's Cloudflare execution (see
`docs/infra/multi-platform-mail-plan.md`).

That's the architecture: training wheels for 90 days, independence after.

---

## TL;DR — Today

1. Add SPF + DMARC TXT records to Cloudflare (10 min).
2. Verify `alecrae.com` in AWS SES + paste the three DKIM CNAMEs into Cloudflare (15 min).
3. Request SES production access (1 min, ~24h wait).
4. Register Google Postmaster Tools + Microsoft SNDS (10 min).
5. Wait for SES production approval.
6. Configure your other platforms with SES SMTP creds + AlecRae From address (5 min per platform).
7. Send your first support email.
8. Read the warmup rules once. Follow them. Don't send a newsletter for 90 days.

After 90 days: graduate to the self-hosted MTA on the 158 mail box (direct MX delivery). Until then: trust the training wheels. SES is doing exactly what we'd build ourselves, with reputation we'd otherwise have to spend a year earning.

---

*Pinned 2026-05-08. Update this file after Day 90 graduation to direct MX on the 158 mail box, or if SES region/identity changes.*

---

_Last updated: 2026-07-13 03:05 UTC_
