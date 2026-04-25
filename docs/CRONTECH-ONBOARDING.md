# AlecRae → Crontech Onboarding Runbook

> Operator runbook for deploying AlecRae onto the Crontech platform.
> Crontech is the *runtime*. AlecRae remains its own product, its own brand,
> its own customers, its own revenue. Hosting choice ≠ product identity.

---

## Prerequisites

Before starting:

- [ ] Crontech admin account (access to `https://crontech.ai/admin/onboard`)
- [ ] Neon Postgres project provisioned, connection strings on hand
- [ ] Upstash Redis instance provisioned
- [ ] Stripe account in live mode, plan price IDs created
- [ ] Anthropic API key (production tier)
- [ ] OpenAI API key (Whisper)
- [ ] Google Cloud OAuth client (Gmail sync)
- [ ] Microsoft Azure app (Outlook / Graph)
- [ ] Cloudflare R2 bucket + access keys
- [ ] DNS access to `alecrae.com` (Cloudflare)
- [ ] DKIM keypair generated for `mail.alecrae.com`

If any of the above are missing, stop and provision them first. The wizard is
purely an env-mapping tool — it cannot create accounts upstream.

---

## Step 1 — Prepare the input env file

A pre-populated template lives at:

```
infrastructure/crontech/.env.alecrae.tenant.template
```

1. Copy the template to a working file outside the repo (do **not** commit
   real secrets):
   ```
   cp infrastructure/crontech/.env.alecrae.tenant.template ~/alecrae.env.tmp
   ```
2. Replace every `<angle_bracket>` placeholder with the real value.
3. Generate the random secrets:
   ```
   openssl rand -base64 64   # JWT_SECRET, SESSION_SECRET, COLLAB_JWT_SECRET, DEPLOY_AGENT_SECRET
   openssl rand -hex 32      # WEBHOOK_SECRET, INBOUND_WEBHOOK_SECRET
   ```
4. Verify the file with a quick scan — no `<…>` placeholders left.

---

## Step 2 — Run the wizard

1. Sign in to `https://crontech.ai/admin/onboard` with an admin account.
2. **Paste config** — paste the full contents of `~/alecrae.env.tmp` plus the
   project name (`alecrae`).
3. **Analyse** — wait for the client-side mapping to complete. The wizard
   never sends values off your machine.
4. **Review** — expect the following:
   - **Auto-mapped (accept):** `AUTH_SECRET → SESSION_SECRET`,
     `NEXT_PUBLIC_STRIPE_KEY → STRIPE_PUBLISHABLE_KEY`,
     `OPENAI_KEY → OPENAI_API_KEY`, `ANTHROPIC_KEY → ANTHROPIC_API_KEY`.
   - **Auto-mapped (REJECT for AlecRae):** `DATABASE_URL → TURSO_DATABASE_URL`.
     AlecRae uses Postgres on Neon (Drizzle Postgres schema); Turso is
     SQLite-flavored and incompatible with our schema. Keep `DATABASE_URL`
     as-is. Crontech runtime supports Postgres via Neon directly.
   - **Legacy-vendor email mappings — N/A:** the wizard offers mappings from
     legacy transactional-email vendors into `ALECRAE_API_KEY`. Those don't
     apply to us — AlecRae **is** the email service in Crontech's stack.
     Skip; do not let the wizard flag those keys as missing.
   - **Crontech required vars to confirm:** `JWT_SECRET`, `SESSION_SECRET`,
     `ANTHROPIC_API_KEY`, `DEPLOY_AGENT_SECRET` — all present in our template.
   - **Crontech required vars NOT applicable:** `TURSO_DATABASE_URL`,
     `TURSO_AUTH_TOKEN` — leave blank or fill with placeholders; AlecRae
     does not use Turso. If the wizard refuses to proceed without them,
     create an empty Turso instance and paste its credentials — AlecRae's
     code will never connect to it.
5. **Export** — download:
   - `.env.crontech` — pre-filled production env, paste into Crontech's
     env management surface (or `/opt/crontech/.env` per Crontech's
     deploy-agent convention).
   - `crontech-migration-checklist.md` — keep alongside this runbook.

---

## Step 3 — Register the AlecRae tenant

The wizard does **not** write to the DB. Tenant registration is a separate
admin step (per Crontech's spec).

1. From `https://crontech.ai/admin`, create a new tenant project named
   `alecrae`.
2. Connect the source repo: `https://github.com/ccantynz-alt/AlecRae.com`
   (or `https://gluecron.com/ccantynz-alt/AlecRae.com` if `GLUECRON_GIT_BASE_URL`
   is set on the Crontech instance).
3. Configure deploy targets — AlecRae has multiple processes:
   | Process | Path | Build | Start | Port |
   |---|---|---|---|---|
   | web (marketing) | `apps/web` | `bun install && bun run build` | `bun run start` | 3000 |
   | api | `apps/api` | `bun install && bun run build` | `bun run start` | 3001 |
   | admin | `apps/admin` | `bun install && bun run build` | `bun run start` | 3002 |
   | collab | `services/collab` | `bun install` | `bun run start` | 4001 |
   | mta | `services/mta` | `bun install` | `bun run start` | 25 (raw TCP) |

   ⚠️  **MTA caveat:** the MTA needs raw TCP port 25 + persistent disk for
   the queue + DKIM keys mounted. If Crontech's deploy-agent is HTTP-only,
   keep `services/mta` on Fly.io and only deploy web/api/admin/collab to
   Crontech. The MTA's only contract with the rest of the system is via
   Postgres + Redis, so split deployment is safe.

4. Paste the wizard's `.env.crontech` output into Crontech's env management.
5. Register webhooks:
   - Stripe webhook URL: `https://api.alecrae.com/billing/webhook` (set in
     Stripe dashboard, paste the resulting `whsec_…` into `STRIPE_WEBHOOK_SECRET`).
   - Google OAuth redirect: `https://api.alecrae.com/auth/google/callback`
     (Google Cloud console, OAuth client → Authorized redirect URIs).
   - Microsoft OAuth redirect: `https://api.alecrae.com/auth/microsoft/callback`
     (Azure portal, App registrations → Redirect URIs).

---

## Step 4 — DNS cutover

Point AlecRae domains at Crontech. From Cloudflare DNS for `alecrae.com`:

| Subdomain | Type | Target | Proxy |
|---|---|---|---|
| `alecrae.com` (apex) | A/AAAA | Crontech edge IPs | proxied |
| `mail.alecrae.com` | CNAME | Crontech tenant URL | proxied |
| `api.alecrae.com` | CNAME | Crontech tenant URL | proxied |
| `admin.alecrae.com` | CNAME | Crontech tenant URL | proxied |
| `collab.alecrae.com` | CNAME | Crontech tenant URL | proxied |
| `mx1.alecrae.com` | A | MTA host (Fly.io if split) | **NOT proxied** |
| `mx2.alecrae.com` | A | MTA host secondary | **NOT proxied** |
| `smtp.alecrae.com` | A | MTA host | **NOT proxied** |

Email auth records (already specced in `infrastructure/cloudflare/`):

- SPF: `v=spf1 mx ~all`
- DKIM: `default._domainkey` TXT with public key from `DKIM_PRIVATE_KEY`
- DMARC: `_dmarc` TXT, `v=DMARC1; p=quarantine; rua=mailto:dmarc@alecrae.com`

---

## Step 5 — Run database migrations

Crontech doesn't run migrations on deploy. From a workstation with
`DATABASE_URL` pointing at production Neon:

```
bun run db:migrate
```

Verify with `bun run db:studio` against the production URL.

---

## Step 6 — Smoke tests

After Crontech reports healthy:

- [ ] `https://alecrae.com` — landing page renders (ivory + Italianno)
- [ ] `https://alecrae.com/login` — auth page renders, passkey button visible
- [ ] `https://api.alecrae.com/health` — returns `{ ok: true }`
- [ ] `https://api.alecrae.com/v1/send` — Crontech-compatible send endpoint
      reachable (auth-protected, expect 401 without bearer)
- [ ] `https://admin.alecrae.com` — admin login renders
- [ ] Stripe webhook test event — confirm event lands in `billing_events` table
- [ ] Send a test email through MTA — DKIM passes at mail-tester.com
- [ ] Receive an inbound test email — appears in test inbox
- [ ] Google OAuth flow — Gmail account links cleanly
- [ ] Microsoft OAuth flow — Outlook account links cleanly

If any step fails, **do not** flip DNS for `alecrae.com` apex yet. Keep the
Vercel preview URL as the public face until smoke is fully green.

---

## Rollback

If anything is broken post-cutover:

1. Re-point DNS back to Vercel (TTL is 5 min on Cloudflare proxied records).
2. Pause the Crontech tenant deployment.
3. Open a postmortem in `docs/postmortems/`.

The Neon DB and Redis instance are independent of where compute runs —
rolling back compute does not lose data.

---

## What stays standalone

Crontech is hosting infrastructure — not a product merger. The following
remain 100% AlecRae:

- Brand: `alecrae.com`, AlecRae wordmark, Italianno script, ivory palette
- Product: 84 features across 8 tiers, all owned by AlecRae
- Pricing: Free / $9 / $19 / $12pp / Enterprise — set by AlecRae
- Billing: Stripe account in AlecRae's name, revenue flows to AlecRae
- Users: AlecRae's user table, AlecRae's auth, AlecRae's data
- Marketing: `alecrae.com` is the public face, not `crontech.ai`
- Source code: this repo, `ccantynz-alt/AlecRae.com`

If a customer asks "what is this email service?", the answer is "AlecRae."
The fact that it runs on Crontech is an implementation detail — the same
way Gmail running on Google Cloud doesn't make Gmail "Google Cloud."

---

## References

- Crontech onboarding spec: pasted in session 019uxxTpXVK4rw9XzatpX2hs
- Production env audit: `docs/infra/.env.production.template`
- AlecRae architecture: `CLAUDE.md` (the Bible)
