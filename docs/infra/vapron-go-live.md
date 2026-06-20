# Vapron Go-Live Runbook — migrating off the interim stack

> Vapron is the **permanent platform** (CLAUDE.md): AI gateway, transactional
> email, object storage, hosting/deploy. Vercel/Neon/Upstash were interim
> scaffolding. This runbook is the exact path from "key in hand" to "AlecRae
> served by Vapron".

## 0. The one blocker only Craig can clear

Everything below is ready and waiting on a single input:

- **`VAPRON_API_KEY`** (`vpk_*`) from the Vapron dashboard.

Where to put it:
- For a one-off deploy from any machine/session: pass it inline (step 2).
- For continuous deploys from CI: add it as a GitHub Actions **secret**
  `VAPRON_API_KEY`, and set repo **variable** `ENABLE_VAPRON_DEPLOY=true`
  (the deploy job in `standalone-deploy.yml` is gated on both).

## 1. What's already in place (no action needed)

- Typed Vapron tRPC client: `apps/api/src/lib/vapron.ts`
  (`customerEmail.send`, `aiGateway.complete`, `objectStorage.*`,
  `aiDeploy.quickDeploy`). Known issue #19: response schemas are tolerant
  pending confirmation against the live API — first real calls will confirm.
- One-app-from-root layout for Vapron hosting: root `package.json` `start`
  (runs the API via Bun) and `build:api` (no-op; Bun runs TS directly),
  honoring `process.env.PORT`.
- Fail-fast env validation at boot: `apps/api/src/lib/env.ts`
  (`assertProductionEnv()`).
- Deploy command: `bun run deploy:vapron` (`scripts/deploy-vapron.ts`).

## 2. Deploy the API

```bash
VAPRON_API_KEY=vpk_... bun run deploy:vapron
# optional: --repo <url> or VAPRON_DEPLOY_REPO_URL to override the repo
```

This calls `aiDeploy.quickDeploy({ repoUrl })`. Vapron clones the repo and
runs the root `start` script on its assigned `PORT`.

## 3. Set production env vars on the Vapron app

Hard-fail at boot (`assertProductionEnv`, NODE_ENV=production):

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres. Until Vapron-native Postgres is confirmed, keep Neon — see `docs/infra/neon-setup.md` |
| `JWT_SECRET` | ≥32 chars, stable (issue #25 root cause) |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | e.g. `alecrae.com` / `https://mail.alecrae.com` |

Warn-only but needed for full features: `REDIS_URL` (Upstash —
`docs/infra/upstash-setup.md`), `WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` (or rely
on the Vapron AI gateway), `STRIPE_SECRET_KEY`, plus `VAPRON_API_KEY` itself so
the API can use Vapron email/AI/storage at runtime. Full inventory:
`docs/infra/env-audit.md`.

## 4. Database migration

Against the production `DATABASE_URL`:

```bash
bun run db:migrate   # baseline 0000 (136 tables) + 0002 (persistent stores)
```

`0002_goofy_scarecrow.sql` is required by the 2026-06-11 in-memory→DB
migration (email_rules, programs, import_jobs, phishing_reports,
voice_messages, shared inboxes/comments/assignments, voice_profiles,
dlq_records, scheduling_links + calendar_events columns).

## 5. Domain cutover (Craig — Boss Rule #4)

- All traffic is currently served by the Vapron box at `149.28.119.158` via
  `vapron-bun-gateway`. `api.alecrae.com` and `mail.alecrae.com` A records
  already point to the box.
- The web client already targets `https://api.alecrae.com` in production
  (`apps/web/lib/api-base.ts`).
- **Note:** This runbook was written before the box deployment was finalised.
  The current production deployment is the dedicated box (systemd services
  `alecrae-api` + `alecrae-web`), not a Vapron `quickDeploy` app. The
  `deploy:vapron` command and `aiDeploy.quickDeploy` path remain available
  if a future Vapron-native hosting migration is needed — Craig must
  authorise that move.

## 6. Verify

```bash
curl https://api.alecrae.com/health          # liveness
curl https://api.alecrae.com/v1/health       # deep check (DB/Redis)
```

Then real login (passkey + Google) and `GET /v1/messages` from the web app.

## 7. Decommission interim pieces (after a clean week)

- Remove any lingering Vercel-related env vars and the `ENABLE_VERCEL_DEPLOY`
  path from `standalone-deploy.yml` (Boss Rule: Craig signs off).
- Vercel is fully removed as a deployment target. The Vercel GitHub App
  should be uninstalled from repo settings to prevent failed deployments on
  every push (see `docs/infra/morning-setup.md` Section 4).

---

_Last updated: 2026-06-20 14:00 UTC_
