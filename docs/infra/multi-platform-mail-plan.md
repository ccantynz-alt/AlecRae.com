# Multi-Platform Mail Architecture — The Plan

Last updated: 2026-07-13 05:45 UTC

> **Purpose:** One document that answers "how do all of Craig's platforms send and
> receive mail through alecrae.com, and how does that fit with Vapron owning its
> own DNS?" Written 2026-07-13 from a live audit of code, docs, and DNS.

---

## 1. The mental model (read this first)

**AlecRae is the mail engine. Every other platform is a client of it.**

Think of AlecRae's mail stack as your own private Postmark + Google Workspace:

```
                        ┌──────────────────────────────────────┐
   Vapron (vapron.ai) ──┤                                      │
   GateTest (…)       ──┤   ALECRAE MAIL ENGINE                ├──► recipient MX
   Future platform    ──┤   • POST /v1/messages/send (API key) │    (direct port 25
   AlecRae app itself ──┤   • MTA worker (DKIM sign, queue)    │     or Resend relay)
                        │   • Inbound SMTP (mx1/mx2) ► inbox   │
   inbound mail ───────►│   • Domain onboarding + DNS records  │
                        └──────────────────────────────────────┘
```

- **Platforms do NOT need their DNS hosted anywhere special.** Vapron's DNS on
  Porkbun, a customer's DNS on Cloudflare, GoDaddy — all fine. Plugging a domain
  into the mail engine means adding ~5 records *at whatever DNS host that domain
  already uses*, all pointing back at AlecRae. This is exactly how Google
  Workspace works: Google doesn't host your DNS; you add MX/SPF/DKIM records
  wherever your DNS lives.
- **"Vapron has its own DNS setup" is not a conflict.** It just means the records
  for `vapron.ai` live at Porkbun. `mail.vapron.ai` is *already onboarded this
  way* and verified (SPF ✅ DKIM ✅ DMARC ✅ MX ✅ Return-Path ✅ — see
  `vapron-migration-type2.md`). Every future platform follows the same recipe.
- **The relationship is circular but clean:** Vapron sends its transactional mail
  *via* AlecRae's API; AlecRae uses Vapron for AI gateway / object storage /
  deploys. Two services consuming each other's APIs — no layering problem.

## 2. What already works (verified in code, 2026-07-13)

| Capability | Status |
|---|---|
| API-key sending: `POST /v1/messages/send` accepts API keys (Bearer or `X-API-Key`) with `messages:send` scope — **any platform can send today** once the MTA runs | ✅ Code ready |
| Per-domain DKIM: every onboarded domain gets its own RSA-2048 key; MTA signs per-domain | ✅ Code ready |
| Domain onboarding API: `POST /v1/domains` generates all records (MX, SPF, DKIM, DMARC, bounce CNAME) + `POST /v1/domains/:id/verify` checks live DNS | ✅ Code ready |
| Mailbox provisioning: `POST /v1/mailboxes` creates a real address on a verified domain; inbound routes to that account's inbox | ✅ Code ready |
| Inbound SMTP service (`services/inbound`): port-25 listener, MIME parse, DKIM/DMARC checks, routing, Postgres storage, AI triage | ✅ Code ready, ❌ not deployed |
| Outbound MTA (`services/mta`): BullMQ consumer, direct-MX or relay (Resend/SES/MailChannels), warmup schedules | ✅ Code ready, ❌ not running |
| Multi-workspace: one login, many workspaces, each with own domains/mailboxes/billing | ✅ Shipped (issue #63) |
| Relay sending via Resend (training wheels) | ✅ Configured per morning-setup |

## 3. What is broken / missing (live DNS + box audit, 2026-07-13)

| # | Blocker | Detail |
|---|---|---|
| B1 | **`mx1.alecrae.com` / `mx2.alecrae.com` have no A records** | The MX record for alecrae.com points at mx1, which doesn't resolve → **all inbound mail to alecrae.com fails** |
| B2 | **`_spf.alecrae.com` TXT doesn't exist** | Every onboarded platform/customer domain is told to `include:_spf.alecrae.com` → SPF fails for all of them |
| B3 | **Mail hostnames are Cloudflare-proxied (orange cloud)** | `mail.alecrae.com` etc. must be DNS-only (grey) for SMTP; Cloudflare only proxies HTTP |
| B4 | **MTA worker not running anywhere** | Sends queue in Redis and never deliver (Known Issue #42/#55) |
| B5 | **Inbound service not deployed anywhere** | No process listens on port 25 |
| B6 | **SPF/PTR authorize the deprecated box** | `spf.alecrae.com` = `ip4:149.28.119.158`; PTR on 149 → mail.alecrae.com; PTR on Jarvis (161) is still generic choopa.net. Compute moved to 161 but mail identity didn't |
| B7 | `smtp.alecrae.com` A record missing | Listed in docs, never created (needed only for authenticated submission later) |

## 4. DECISION 1 (Craig): where does the mail engine run?

### Option A — keep 149.28.119.158 (the "158" box, old Vapron box) as a dedicated mail box (**recommended**)

Web/api stay on Jarvis (161); the MTA + inbound services run on 149, which becomes
"the mail box" instead of being decommissioned.

- **For:** 149 already has port 25 open (Vultr approved), PTR already set to
  `mail.alecrae.com`, SPF already authorizes it — that's weeks of deliverability
  groundwork you keep. Dedicated mail IP is industry practice: web deploys and
  other products on Jarvis can never hurt the sending IP's reputation.
- **Against:** two boxes to pay for and maintain.
- **DNS work:** only B1/B2/B3/B7 (add mx1/mx2/_spf records → 149, grey-cloud the
  mail records). No SPF/PTR churn.

### Option B — consolidate everything on Jarvis (161)

- **For:** one box, one bill, one deploy ritual.
- **Against:** must request port-25 unblock from Vultr for 161, set PTR
  161 → mail.alecrae.com, rewrite `spf.alecrae.com`/`_spf.alecrae.com` to
  `ip4:66.42.121.161`, and restart IP warmup from zero. Mail reputation then
  shares an IP with every product on Jarvis.

**Recommendation: Option A.** Mail reputation is the single hardest thing to
rebuild; 149 already has it started. Revisit consolidation after launch.

## 5. Execution plan (phased, in order)

### Phase 0 — DNS fixes (Craig authorizes; ~15 min in Cloudflare)
Assuming Option A (swap IP to 66.42.121.161 everywhere below if Option B).
> NB: the infra runbooks (dns-zone-alecrae.md, morning-setup.md, etc.) were
> refreshed 2026-07-13 showing **161** as the record target — that matches
> Option B. If Craig picks Option A (recommended), mail records use
> **149.28.119.158** and the runbooks get one more find/replace pass.

1. `mx1.alecrae.com  A  149.28.119.158` — **grey cloud**
2. `mx2.alecrae.com  A  149.28.119.158` — **grey cloud**
3. `_spf.alecrae.com TXT "v=spf1 ip4:149.28.119.158 ~all"`
4. Flip `mail.alecrae.com` to **grey cloud** (`alecrae.com`/`api.alecrae.com` can
   stay proxied — they're HTTP-only; only hostnames used in SMTP/HELO/MX must be
   DNS-only)
5. (Optional now) `smtp.alecrae.com A 149.28.119.158` — grey

### Phase 1 — outbound live
1. On the mail box: follow `docs/infra/mta-box-setup.md` — install/verify Redis,
   create `alecrae-mta` systemd unit, start it (HEALTH_PORT=8082).
2. Keep `RELAY_PROVIDER=smtp` (Resend) as training wheels for the first 30–60
   days; the MTA still DKIM-signs before relaying.
3. Test: send from mail.alecrae.com UI → confirm arrival in a Gmail inbox, check
   `Authentication-Results` shows SPF/DKIM/DMARC pass.
4. Run the MTA idempotency check (same message_id → no duplicate).

### Phase 2 — inbound live (this is what makes "receive through alecrae.com" real)
1. Create an `alecrae-inbound` systemd unit on the mail box (`services/inbound`,
   `SMTP_PORT=25`, `SMTP_HOSTNAME=mx1.alecrae.com`, `HTTP_PORT=8025`,
   `DATABASE_URL` pointing at production Postgres).
2. Open port 25 inbound in ufw on the mail box.
3. Test: send TO a provisioned `@alecrae.com` mailbox from Gmail → appears in
   AlecRae inbox with triage metadata.

### Phase 3 — onboard each platform (repeat per domain; self-serve via API/UI)
For each platform domain (e.g. `vapron.ai` — mail.vapron.ai is already done):
1. `POST /v1/domains` (or Workspace → Domains UI) → get the 5 generated records.
2. Add them at that domain's DNS host (Porkbun for vapron.ai, etc.):
   MX → mx1/mx2.alecrae.com, SPF `include:_spf.alecrae.com`, DKIM TXT, DMARC,
   `bounce.<domain>` CNAME → bounce.alecrae.com.
3. `POST /v1/domains/:id/verify` (or the auto-polling UI wizard).
4. Mint an API key for the platform with `messages:send` scope → the platform
   sends via `POST /v1/messages/send`.
5. Provision mailboxes (`support@`, `hello@`) via `POST /v1/mailboxes` — read
   them in the AlecRae web app (each platform can be its own **workspace**, so
   teams and billing stay separate; that's exactly what multi-workspace was for).

### Phase 4 — hardening (post-launch)
- Wean off Resend → direct port-25 per the warmup schedule in `deliverability.md`.
- Inbound → platform webhooks (event push for received mail) so platforms can
  *programmatically react* to inbound, not just read it in the UI. **Gap:** the
  webhooks system covers outbound events today; an `email.received` event needs
  wiring (small, backend-only).
- MTA `/metrics` OTel export (Known Issue #62) + fleet-check alerting (postmortem
  action #1).
- Optional: a `vapron` DNS provider in `apps/api/src/lib/dns-providers/` so
  domains whose DNS is managed by the Vapron platform get records created
  automatically instead of via copy-paste.

## 6. What needs Craig's explicit authorization (Boss Rule)

- All Phase 0 DNS changes (Cloudflare) and any Vultr panel actions (PTR, port 25).
- Decision 1 (mail box choice) — this doc recommends Option A.
- Keeping/canceling the 149 box (billing).

Everything else (systemd units, code for `email.received` webhooks, docs) is
within the pre-authorized build plan.
