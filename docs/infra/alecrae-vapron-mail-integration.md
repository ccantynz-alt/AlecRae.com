# AlecRae ⇄ Vapron mail integration — the authoritative architecture

> **This supersedes the "dedicated AlecRae mail box" model in `multi-platform-mail-plan.md`,
> `mta-box-setup.md`, `inbound-box-setup.md`, and the old mail phases of `craig-go-live.md`.**
> Those assumed AlecRae would run its own MTA/inbound on a dedicated box with an unblocked port 25.
> That assumption is dead (see "Why" below). Read this before touching anything mail-related.

**Last updated:** 2026-08-08 08:30 UTC

---

## The one-paragraph truth

**AlecRae is the email *product* (mailboxes, the AI inbox, sending/receiving *as* a business
address). Vapron is the email *transport* — your own Resend.** AlecRae does **not** run its own
MTA to the internet; it **relays outbound through Vapron's send API** and **receives inbound via
Vapron's receiver**, which forwards mail to AlecRae. This is your stated vision ("AlecRae is the
flagship app on the Vapron platform"), now the concrete mail architecture.

## Why — the constraints that forced this (so nobody re-litigates it)

1. **No unblocked port 25 is available.** Vultr blocks outbound port 25 and won't unblock it without
   a business-email/business setup. The one box that *is* unblocked (`149.28.119.158`) was a
   one-off fluke; Craig tried and failed to get `66.42.121.161` (Jarvis) unblocked. So AlecRae
   **cannot** do direct-MX sending from its own box. A relay is the only way to send — this is
   exactly what relays exist for.
2. **Cloudflare and Resend are competitors.** Vapron competes with both (it *is* a Render/Vercel/
   Resend-class platform). So the relay is not a third party — it's **Vapron**, Craig's own infra.
3. **`149.28.119.158` is NOT a spare AlecRae mail box.** It is the **live Vapron production box**
   (`vapron-158`, tailnet `100.89.227.39`) running ~30 services, including a complete email stack
   that already owns port 25. AlecRae cannot bind port 25 there and will not be deployed there.
   (It carries some orphaned, inactive `alecrae-*` systemd units from an old experiment — harmless,
   cleanup-later, Vapron's own mail untouched.)

**Decision (Craig, 2026-08-08):** AlecRae rides on Vapron's mail; keep Vapron otherwise as-is.

---

## The Vapron mail platform (verified read-only on the box, 2026-08-08)

Three services under `/opt/vapron/services/`, all Bun:

### `vapron-email-send` — outbound (AlecRae's send path)
- **REST API `POST /v1/messages` on `:8787`**, auth `Authorization: Bearer $EMAIL_SEND_TOKEN`.
  Body: `{ from, to[], cc[], bcc[], subject, html, text, attachments[{filename,contentBase64,contentType}], headers{}, tags[], scheduledAt, priority, tenantId }`.
  `202` queued · `403` FROM domain not verified in email-domain · `422` validation · `401` bad token.
  `GET /v1/messages/:id` and `/:id/events` for status.
- Also SMTP relay on **:587 (STARTTLS)** / **:465 (SMTPS)**, AUTH PLAIN/LOGIN.
- Delivers via its own port-25 MTA as `mail.vapron.ai`; DKIM-signs via `email-domain`.
- **AlecRae's outbound must send FROM a domain verified in `email-domain` or it gets 403.**

### `vapron-email-receive` — inbound (AlecRae's receive path)
- SMTP receiver on **:25**; HTTP route-registry on `127.0.0.1:8097`.
- Has a **dormant "sink bridge"** (`src/sink-routes.ts`) built specifically to forward inbound mail,
  HMAC-signed, to **"apps/api's inbound endpoint"** — i.e. AlecRae's `http-inbound` webhook.
  Configured by env: `INBOUND_SINK_URL`, `INBOUND_SINK_SECRET` (≥16 chars), `INBOUND_SINK_DOMAINS`
  (comma-separated). For each domain it creates a catch-all `*@domain` → `INBOUND_SINK_URL`.
- **⚠️ It is OFF.** The env was never set, so per Vapron's own code comment (verified vs prod
  2026-08-05) the MX has been accepting mail on :25 and then **rejecting all of it as
  "no route matched"** into an in-memory store. Turning AlecRae receiving on = setting these 3 env
  vars + restarting `vapron-email-receive`.

### `vapron-email-domain` — DKIM registry + signing (`:8788`)
- Per-domain DKIM key management (`EMAIL_DOMAIN_MASTER_KEK`). AlecRae's domains must be registered
  here for `email-send` to sign and to clear the `403 FROM not verified` check.

---

## The integration contract — what connects to what

```
OUTBOUND (AlecRae sends as info@davenroe.com):
  AlecRae API/MTA  ──POST /v1/messages (Bearer EMAIL_SEND_TOKEN)──►  vapron-email-send :8787
                     (or SMTP relay to :587)                          └─ DKIM via email-domain ─► internet :25

INBOUND (someone emails info@davenroe.com):
  internet ──MX mx1/mx2.alecrae.com──►  vapron-email-receive :25
                                          └─ sink bridge (HMAC) ──►  AlecRae apps/api http-inbound
                                                                       └─ DB-routed to the mailbox, into the inbox
```

**DNS is already pointed correctly for this:** `mx1/mx2.alecrae.com → 149.28.119.158` (the Vapron
box), and alecrae.com SPF authorises it. Do **not** move the MX to a separate box — inbound is
*supposed* to land at Vapron and be bridged to AlecRae.

---

## Work to make it real (bounded)

**AlecRae side (code — this repo):**
1. **Outbound adapter:** relay AlecRae's outbound to `vapron-email-send`. Cleanest is a small REST
   adapter posting to `/v1/messages` with the bearer token (maps 1:1 — AlecRae's send shape already
   matches). Alternatively point AlecRae's existing SMTP relay (`MTA_RELAY_MODE`/`SMTP_RELAY_*`) at
   Vapron `:587`. The pre-send gate (compliance/spam/suppression) still runs on AlecRae's side first.
2. **Inbound adapter:** make AlecRae's `http-inbound` accept Vapron's `InboundWebhookPayload` shape
   and verify Vapron's HMAC (`INBOUND_SINK_SECRET` ↔ AlecRae's `INBOUND_WEBHOOK_SECRET`), then run
   its existing DB-routed delivery (the #164-hardened path).

**Vapron side (config on the box — needs Craig's OK, the one relaxation of "keep Vapron as-is"):**
3. Set `INBOUND_SINK_URL` (AlecRae inbound webhook), `INBOUND_SINK_SECRET`, `INBOUND_SINK_DOMAINS`
   on `vapron-email-receive` + restart it. This *activates the dormant bridge Vapron already has* —
   it does not change Vapron's behaviour.
4. Register AlecRae's domains (davenroe.com, gatetest.io, …) in `vapron-email-domain` for DKIM +
   FROM verification, and issue/point an `EMAIL_SEND_TOKEN` for AlecRae's tenant.

**Proof-of-loop first:** wire **davenroe.com** end-to-end (send + receive through Vapron) as a
single working test before generalising to the other platforms.

---

## What this changes about earlier plans

- **Shared Redis (Phase 1, #149) is DONE** (Jarvis Redis bound to the tailnet, password, both boxes
  point at it) — but the "MTA-on-158-consumes-the-queue" model it was for is **superseded**:
  AlecRae relays via Vapron's API instead of running its own delivery worker to the internet.
  AlecRae's API on Jarvis still uses that Redis for its own queues, so the work isn't wasted.
- `mta-box-setup.md` / `inbound-box-setup.md` (deploy AlecRae's own MTA/inbound on a dedicated box)
  are **not the path** — kept only for the "if we ever get a real port-25 box" contingency.
- No new Vultr box, no port-25 ticket, no IP warm-up (Vapron's IPs carry the reputation).

---

## Still Craig's, before the loop can close

- OK to activate Vapron's sink bridge (3 env vars + restart `vapron-email-receive`) and register
  domains in `email-domain` — the only Vapron-side change.
- Confirm the `EMAIL_SEND_TOKEN` AlecRae should use (found one in the unit env; confirm it's the
  right tenant/scope, or mint a dedicated one).
