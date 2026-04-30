# AlecRae Go-Live — Craig's Master Checklist

> **This is the index. Every detail is in a sibling file under `docs/infra/`. Follow this in order. Do not skip.**

---

## Summary

"Go live" means: real email arrives at `@alecrae.com`, users can sign up at `mail.alecrae.com`, connect their Gmail/Outlook, pay via Stripe, and send mail that lands in inboxes (not spam). **Budget ~3 hours of active work today**, then **2–4 weeks of background IP warmup** before you push volume. Phase 3 (MTA rDNS request to Fly) and Phase 7 (warmup) are clock-time gated — everything else is keyboard time.

---

## IMPORTANT: Google Cloud clarification (read before Phase 1)

Two different Google products. Do not confuse them.

- **Google Workspace** (workspace.google.com) = Gmail-as-a-service. This is a **competitor**. **SKIP.** We are not hosting our mail with Google.
- **Google Cloud OAuth Project** (console.cloud.google.com) = a **required developer tool, NOT a competitor**. This is the control panel that lets AlecRae users click "Connect Gmail" and authorize us to read their Gmail via API. Without it, ~2 billion Gmail users cannot connect to AlecRae on day one.
- **Microsoft Azure App Registration** (portal.azure.com) = same story for Outlook/Microsoft 365 users via Graph API. Required. Not a competitor in this context.

If you only remember one thing: **sign up for Google Cloud and Azure. Do NOT sign up for Google Workspace.**

---

## Phase 1 — Account signups (~30 min)

Open a password manager (1Password or Bitwarden) now. You will paste every key below into multiple places — save them once, reuse everywhere.

### 1. Cloudflare — DNS

- URL: `https://dash.cloudflare.com`
- **Action: Confirm `alecrae.com` is on Cloudflare and DNS is "Active".** You already own the domain — verify the nameservers point to Cloudflare.
- Nothing to copy yet. DNS records go in Phase 4.

### 2. Fly.io — MTA host

- URL: `https://fly.io/app/sign-up`
- **Action: Sign up and add a credit card.** A card on file is required to allocate a dedicated static IPv4, which is required for email.
- Copy: nothing yet. Install `flyctl` locally (`brew install flyctl` / `curl -L https://fly.io/install.sh | sh`).

### 3. Neon — Postgres

- URL: `https://console.neon.tech`
- **Action: Sign up.** Do not create the project yet — that happens in Phase 2.
- Full details: [`neon-setup.md`](./neon-setup.md).

### 4. Upstash — Redis

- URL: `https://console.upstash.com`
- **Action: Sign up.** Database creation is Phase 2.
- Full details: [`upstash-setup.md`](./upstash-setup.md).

### 5. Stripe — Billing

- URL: `https://dashboard.stripe.com/register`
- **Action: Sign up and complete business activation** (legal name, address, bank account). Activation unlocks live keys; you can build with test keys meanwhile.
- Copy: `Publishable key` → `STRIPE_PUBLISHABLE_KEY`. `Secret key` → `STRIPE_SECRET_KEY`.
- Webhook secret comes in Phase 5. See [`env-audit.md`](./env-audit.md).

### 6. Anthropic — Claude API

- URL: `https://console.anthropic.com`
- **Action: Sign up, add billing, create an API key** named "alecrae-prod".
- Copy: key → `ANTHROPIC_API_KEY`.

### 7. OpenAI — Whisper only

- URL: `https://platform.openai.com`
- **Action: Sign up, add billing, create an API key** named "alecrae-whisper". We only use OpenAI for Whisper transcription.
- Copy: key → `OPENAI_API_KEY`.

### 8. Google Cloud OAuth — Gmail connector (NOT Workspace)

- URL: `https://console.cloud.google.com`
- **Action (four sub-steps):**
  1. Create a new project named `alecrae-prod`.
  2. APIs & Services → Library → enable **Gmail API**.
  3. OAuth consent screen → External → fill app name `AlecRae`, support email, scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`. Submit for verification (takes days, do this EARLY).
  4. Credentials → Create OAuth client ID → type **Web application** → authorized redirect URI placeholder (real URI set in Phase 5).
- Copy: `Client ID` → `GOOGLE_CLIENT_ID`. `Client secret` → `GOOGLE_CLIENT_SECRET`.

### 9. Microsoft Azure — Outlook connector

- URL: `https://portal.azure.com`
- **Action: Azure Active Directory → App registrations → New registration.** Name `AlecRae`, supported accounts: "Accounts in any organizational directory and personal Microsoft accounts". Redirect URI placeholder (real URI set in Phase 5). Then API permissions → add Graph API: `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `User.Read`.
- Copy: `Application (client) ID` → `MICROSOFT_CLIENT_ID`. Certificates & secrets → New client secret → `MICROSOFT_CLIENT_SECRET`.

### 10. (Optional) Voyage AI — Embeddings

- URL: `https://www.voyageai.com`
- **Action: Skip for launch.** Add only when semantic search volume justifies it.
- Copy (if added): key → `VOYAGE_API_KEY`.

**Phase 1 done when:** every key above is in your password manager. Do not proceed without this.

---

## Phase 2 — Data stores (~20 min)

### 11. Create Neon project and run setup SQL

- URL: `https://console.neon.tech`
- **Action: Create project `alecrae-prod`, region closest to Fly primary (e.g. `us-east-2` / Ohio). Run the setup SQL from [`neon-setup.md`](./neon-setup.md).**
- Copy: pooled connection string → `DATABASE_URL`. Direct connection string → `DIRECT_DATABASE_URL`.

### 12. Create Upstash Redis

- URL: `https://console.upstash.com`
- **Action: Create a Global database named `alecrae-prod`.** See [`upstash-setup.md`](./upstash-setup.md) for region selection.
- Copy: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 13. Record connection strings

- **Action: Paste both connection strings into your password manager** next to the Phase 1 keys. You will use them in Phase 3 (Fly secrets) and Phase 5 (Vercel env).

**Phase 2 done when:** Neon shows tables exist, Upstash shows a ready database, both connection strings saved.

---

## Phase 3 — MTA deploy (~40 min active + 1–3 business day wait on Fly support)

> The MTA (Mail Transfer Agent) is the machine that actually sends and receives email. This phase has a clock-time wait, so **start it early in the day.**

### 14. Deploy MTA to Fly.io

- **Action: Follow [`fly-mta-deploy.md`](./fly-mta-deploy.md)** end-to-end — `fly launch`, `fly deploy`.

### 15. Allocate static IPv4

- **Action: Run `fly ips allocate-v4` and write the IP down.** This IP will be the source of all outbound mail and the target of `mx1.alecrae.com` / `mx2.alecrae.com`.

### 16. Email Fly support for rDNS/PTR — DO THIS NOW, NOT LATER

- **Action: Email `support@fly.io`** using the template in [`fly-mta-deploy.md`](./fly-mta-deploy.md#rdns-request-template). Request a PTR record mapping your static IPv4 to `mx1.alecrae.com`. **Takes 1–3 business days.** Without it, Gmail and Outlook will reject or spam-bin every message we send.

### 17. Set Fly secrets

- **Action: `fly secrets set KEY=value ...` for every variable** listed in the MTA section of [`env-audit.md`](./env-audit.md). Includes `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ANTHROPIC_API_KEY`, DKIM private key, etc.

### 18. Verify the deploy

- **Action: Run `fly logs` and confirm no errors. From another machine: `telnet <static-ip> 25` — you should see the SMTP banner** (`220 mx1.alecrae.com ESMTP ready`). If the banner does not appear, port 25 may be blocked — contact Fly support.

**Phase 3 done when:** Fly logs are clean, SMTP banner is visible, Fly support has acknowledged the rDNS ticket.

---

## Phase 4 — DNS (~20 min) — MX records LAST

> **Order matters.** Paste every non-MX record first, verify, then paste MX. MX activates mail delivery — once it flips, a broken MTA means bounced mail.

### 19. Paste non-MX records

- **Action: In Cloudflare DNS, paste every record from [`dns-zone-alecrae.md`](./dns-zone-alecrae.md) EXCEPT the `MX` rows.** This includes:
  - `A` and `CNAME` for `mail`, `api`, `admin`, `status`, `docs`
  - `A` for `smtp`, `mx1`, `mx2` → Fly static IPv4 (proxy **disabled** — grey cloud)
  - `TXT` SPF on apex
  - `TXT` DKIM on `default._domainkey`
  - `TXT` DMARC on `_dmarc`
  - `TXT` + `CNAME` for MTA-STS on `_mta-sts` and `mta-sts`
  - `TXT` TLS-RPT on `_smtp._tls`

### 20. Verify each record with dig

- **Action: For every record, run the corresponding `dig` command from [`dns-zone-alecrae.md`](./dns-zone-alecrae.md)** and confirm the answer matches. Do not proceed until all pass.

### 21. Paste MX records — the point of no return

- **Action: Only after MTA verified (Phase 3 step 18) AND all non-MX records verified (step 20), paste the two MX rows** from [`dns-zone-alecrae.md`](./dns-zone-alecrae.md). `mx1.alecrae.com` priority 10, `mx2.alecrae.com` priority 20.
- Propagation: 5–60 minutes. Use `dig MX alecrae.com` until it returns the new values.

**Phase 4 done when:** `dig MX alecrae.com` shows `mx1` and `mx2`, and a test message bounces cleanly OFF Fly's SMTP banner (real delivery is Phase 6).

---

## Phase 5 — App env + Stripe (~20 min)

### 22. Set all env vars on Vercel (web app)

- URL: `https://vercel.com/dashboard` → project `alecrae` → Settings → Environment Variables
- **Action: Paste every variable listed in the Web section of [`env-audit.md`](./env-audit.md)** into the Production environment. Redeploy after saving (Deployments → latest → Redeploy).

### 23. Configure Stripe webhook

- URL: `https://dashboard.stripe.com/webhooks`
- **Action: Add endpoint `https://api.alecrae.com/webhooks/stripe`.** Select events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`. Copy signing secret → `STRIPE_WEBHOOK_SECRET` → paste into Vercel env → redeploy.

### 24. Configure Google OAuth redirect URI

- URL: `https://console.cloud.google.com` → APIs & Services → Credentials → your OAuth client
- **Action: Add authorized redirect URI `https://mail.alecrae.com/auth/google/callback`.** Save.

### 25. Configure Microsoft OAuth redirect URI

- URL: `https://portal.azure.com` → App registrations → AlecRae → Authentication
- **Action: Add redirect URI `https://mail.alecrae.com/auth/microsoft/callback`** (type: Web). Save.

**Phase 5 done when:** Vercel deploys green with all env vars, Stripe webhook shows "Enabled" with a signing secret, both OAuth redirect URIs saved.

---

## Phase 6 — Smoke test (~15 min)

### 26. Register your own account

- **Action: Go to `https://mail.alecrae.com`, register** with your personal email, create passkey, land in the inbox.

### 27. Receive test mail

- **Action: From your phone's Gmail app, send a message to `craig@alecrae.com`.** It should appear in the AlecRae inbox within 30 seconds. If it does not, check `fly logs` and `dig MX alecrae.com`.

### 28. Send test mail

- **Action: Reply from `craig@alecrae.com` back to your personal Gmail.** Check it arrives in the Gmail inbox (not spam). If it lands in spam, SPF/DKIM/DMARC or rDNS is wrong — do not push volume until fixed.

### 29. Register for Postmaster Tools

- URL: `https://postmaster.google.com`
- **Action: Add and verify `alecrae.com`.** First data shows up in ~24 hours. This is your deliverability dashboard.

**Phase 6 done when:** send works both directions, message lands in Gmail primary inbox, Postmaster Tools verified.

---

## Phase 7 — IP warmup starts (2–4 weeks)

### 30. Follow the warmup schedule

- **Action: Open [`deliverability.md`](./deliverability.md) and follow the week-by-week send limits.** Week 1 caps at ~50 messages/day to Gmail, ~50 to Outlook, ramping over 14–28 days. Exceeding these destroys sender reputation on a fresh IP and takes months to recover.

---

## Stuck? Contact channels

| Problem | Contact |
|---|---|
| rDNS, port 25, IP reputation | `support@fly.io` |
| DNS, Cloudflare Pages builds | Cloudflare dashboard → Help |
| Database connections, slow queries | `support@neon.tech` |
| Redis errors | `support@upstash.com` |
| Payments, webhooks, tax | Stripe dashboard → Help |
| OAuth verification, Gmail API quota | Google Cloud Console → Support |
| Graph API, tenant issues | Azure Portal → Help + Support |

---

## First 72 hours — monitor these daily

- **Google Postmaster Tools** — spam placement %, domain reputation, authentication pass rate
- **`fly logs -a alecrae-mta`** — delivery failures, bounces, 4xx/5xx from receivers
- **Neon console** — connection count, slow query log
- **Stripe dashboard → Developers → Webhooks** — delivery success rate (should be 100%)
- **Vercel → Deployments → Logs** — runtime errors on the web app

---

## Rollback plan

Do this **before** launch, not after a fire:

- **Lower all DNS TTLs to 300 seconds** (5 min) in Cloudflare now. High TTLs trap you — 5 min TTLs mean you can reroute in minutes.
- **Keep a backup MX provider warm** — Fastmail or Migadu (paid, not Google/Microsoft). If our MTA catches fire, flip MX to the backup, mail keeps flowing, we fix in peace.
- **Document the rollback command** in `fly-mta-deploy.md`: `fly deploy --image registry.fly.io/alecrae-mta:<last-good-sha>`.

---

**When all seven phases are green: AlecRae is live.** Tell the beta list. Start the build-in-public cadence.

Referenced files:
- [`dns-zone-alecrae.md`](./dns-zone-alecrae.md)
- [`fly-mta-deploy.md`](./fly-mta-deploy.md)
- [`neon-setup.md`](./neon-setup.md)
- [`upstash-setup.md`](./upstash-setup.md)
- [`env-audit.md`](./env-audit.md)
- [`.env.production.template`](./.env.production.template)
- [`deliverability.md`](./deliverability.md)
