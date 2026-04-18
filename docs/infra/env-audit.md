# AlecRae — Environment Variable Audit

> Source of truth for production env vars across web, api, mta, admin, and mobile.
> Pairs with `.env.production.template` in this same directory.
> Last updated: 2026-04-18.

---

## Summary

| Metric | Count |
|---|---|
| Total vars tracked | ~54 |
| Required for API boot (hard-fail) | 6 (DATABASE_URL, DIRECT_URL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, JWT_SECRET, SESSION_SECRET) |
| Required per-feature (soft-fail / feature disabled) | ~32 |
| Public (`NEXT_PUBLIC_*`) | 5 |
| Optional (graceful degrade) | ~11 |

**Boot contract:** API will refuse to start without the 6 hard-fail vars. Every other var disables its feature when absent, logs a warning, and keeps the rest of the app alive (see Forbidden List #17, #18 in CLAUDE.md).

---

## Core Runtime

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `NODE_ENV` | Runtime mode; toggles cookie `Secure`, logging, CSP | Literal | `production` | web, api, mta, admin |
| `LOG_LEVEL` | pino log verbosity | Literal | `info` | web, api, mta |
| `PORT` | HTTP listener port | Literal / platform-assigned | `3000` (web), `3001` (api) | web, api |

## Database — Neon

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `DATABASE_URL` | Pooled connection (pgbouncer) for serverless workloads | Neon console → Connection Details → Pooled | `postgres://user:pwd@ep-xyz-pooler.neon.tech/alecrae?sslmode=require` | api, mta, admin |
| `DIRECT_URL` | Direct connection for migrations + long-lived TX | Neon console → Connection Details → Direct | `postgres://user:pwd@ep-xyz.neon.tech/alecrae?sslmode=require` | api (migrations only) |

## Cache / Queue — Upstash Redis

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | REST endpoint (CF Workers compatible) | Upstash console → REST API | `https://us1-amazing-cat-12345.upstash.io` | api, mta |
| `UPSTASH_REDIS_REST_TOKEN` | Bearer token for REST calls | Upstash console → REST API | `AX...` | api, mta |

## Auth — JWT + Sessions + Passkeys

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `JWT_SECRET` | HMAC signing secret for session JWTs | `openssl rand -base64 64` | `<64-char-base64>` | api, admin |
| `JWT_PUBLIC_KEY` | RSA public for asymmetric JWT verify | `openssl genrsa`/`openssl rsa -pubout` | PEM block | api, admin |
| `JWT_PRIVATE_KEY` | RSA private for asymmetric JWT sign | Same as above | PEM block (multi-line) | api |
| `SESSION_SECRET` | Cookie signing secret | `openssl rand -base64 64` | `<64-char-base64>` | web, api, admin |
| `WEBAUTHN_RP_ID` | Relying Party ID for passkeys | Literal | `alecrae.com` | web, api |
| `WEBAUTHN_RP_NAME` | Relying Party display name | Literal | `AlecRae` | web, api |
| `WEBAUTHN_ORIGIN` | Allowed origin for WebAuthn ceremonies | Literal | `https://mail.alecrae.com` | web, api |

## AI

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Claude (Haiku/Sonnet/Opus) | console.anthropic.com → API Keys | `sk-ant-api03-...` | api |
| `OPENAI_API_KEY` | Whisper transcription only | platform.openai.com → API Keys | `sk-proj-...` | api |
| `VOYAGE_API_KEY` | Embeddings for semantic search (S5) — OPTIONAL | dash.voyageai.com → API Keys | `pa-...` | api |

## Payments — Stripe

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Server-side Stripe calls | dashboard.stripe.com → Developers → API keys | `sk_live_...` | api |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures | dashboard.stripe.com → Developers → Webhooks → signing secret | `whsec_...` | api |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js client-side | dashboard.stripe.com → Developers → API keys | `pk_live_...` | web |

## OAuth Providers

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Gmail OAuth + SSO | console.cloud.google.com → Credentials | `...apps.googleusercontent.com` | api |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth secret | Same | `GOCSPX-...` | api |
| `MICROSOFT_CLIENT_ID` | Outlook/Graph OAuth | portal.azure.com → App registrations | UUID | api |
| `MICROSOFT_CLIENT_SECRET` | Outlook OAuth secret | Azure → Certificates & secrets | `<secret>` | api |
| `MICROSOFT_TENANT_ID` | Azure AD tenant ID (use `common` for multi-tenant) | Azure → App registration overview | `common` or UUID | api |

## App URLs (Public — safe to ship)

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Web app origin | Literal | `https://mail.alecrae.com` | web, api |
| `NEXT_PUBLIC_API_URL` | API server origin | Literal | `https://api.alecrae.com` | web, admin, mobile |
| `NEXT_PUBLIC_WS_URL` | WebSocket origin (collab, realtime) | Literal | `wss://api.alecrae.com` | web |
| `NEXT_PUBLIC_MARKETING_URL` | Marketing site origin | Literal | `https://alecrae.com` | web, admin |

## MTA — Outbound + DKIM

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `MTA_HOSTNAME` | EHLO hostname, reverse DNS must match | DNS | `mx1.alecrae.com` | mta |
| `DKIM_PRIVATE_KEY` | DKIM signing key (PEM, multi-line) | `openssl genrsa 2048` | PEM block | mta |
| `DKIM_SELECTOR` | DKIM selector (matches DNS TXT record) | Literal | `default` | mta |
| `POSTMASTER_EMAIL` | RFC 5321 required postmaster contact | Literal | `postmaster@alecrae.com` | mta |
| `ABUSE_EMAIL` | Abuse contact (RFC 2142) | Literal | `abuse@alecrae.com` | mta |
| `DMARC_EMAIL` | DMARC aggregate report receiver | Literal | `dmarc@alecrae.com` | mta |

## Storage — Cloudflare R2

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `R2_ACCESS_KEY_ID` | R2 S3-compatible access key | dash.cloudflare.com → R2 → Manage API Tokens | `<key>` | api |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compatible secret | Same | `<secret>` | api |
| `R2_BUCKET` | Bucket name | CF R2 → bucket overview | `alecrae-attachments` | api |
| `R2_ENDPOINT` | Account-specific S3 endpoint | CF R2 → bucket → S3 API | `https://<account-id>.r2.cloudflarestorage.com` | api |

## Search — Meilisearch

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `MEILI_HOST` | Meilisearch URL | Self-hosted (Fly.io) or Meili Cloud | `https://search.alecrae.com` | api |
| `MEILI_MASTER_KEY` | Admin key for indexing | Meili deploy config | `<key>` | api |

## Observability

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint (Grafana Cloud / self-hosted) | Grafana Cloud → Send data → OTLP | `https://otlp-gateway.grafana.net/otlp` | web, api, mta |
| `OTEL_SERVICE_NAME` | Service identity in traces | Literal | `alecrae-api` | web, api, mta |
| `SENTRY_DSN` | Error reporting — OPTIONAL | sentry.io → Project settings → Client Keys | `https://<key>@sentry.io/<project>` | web, api |

## Enterprise — SAML SSO (optional, Team/Enterprise plans only)

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `SAML_ENTITY_ID` | SP entity identifier | Literal | `https://admin.alecrae.com/saml/metadata` | admin |
| `SAML_ACS_URL` | Assertion Consumer Service URL | Literal | `https://admin.alecrae.com/saml/acs` | admin |
| `SAML_CERT` | SP x509 cert (PEM) | `openssl req -x509` | PEM block | admin |
| `SAML_PRIVATE_KEY` | SP private key (PEM, multi-line) | Same | PEM block | admin |

## Collab (S2 — realtime drafting)

| Var | Purpose | Where to get | Example | Services |
|---|---|---|---|---|
| `COLLAB_WS_URL` | Yjs collab WebSocket URL — OPTIONAL (defaults to `wss://collab.alecrae.com`) | Fly.io app URL | `wss://collab.alecrae.com` | api |
| `COLLAB_HTTP_URL` | Yjs collab HTTP URL — OPTIONAL | Same | `https://collab.alecrae.com` | api |
| `COLLAB_JWT_SECRET` | Collab-scoped JWT secret — OPTIONAL (falls back to `JWT_SECRET`) | `openssl rand -base64 64` | `<secret>` | api |
| `JWT_ISSUER` | JWT `iss` claim — OPTIONAL (defaults `alecrae`) | Literal | `alecrae` | api |
| `JWT_AUDIENCE` | JWT `aud` claim — OPTIONAL (defaults `alecrae-collab`) | Literal | `alecrae-collab` | api |

---

## Red Flags

### MUST be present in production (API refuses to boot without these)

1. `DATABASE_URL` — no DB, no app
2. `DIRECT_URL` — migrations cannot run
3. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — rate limiting + queues depend on this
4. `JWT_SECRET` — sessions cannot sign
5. `SESSION_SECRET` — cookies cannot sign
6. `ANTHROPIC_API_KEY` — AI features are core to the product; log LOUD warning if missing but allow boot in degraded mode

### Public vars — safe to ship to browser, NEVER put secrets here

Only vars prefixed `NEXT_PUBLIC_*` are inlined into the client bundle:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_MARKETING_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (publishable key is designed to be public — confirm it starts with `pk_`, never `sk_`)

**If you see a `NEXT_PUBLIC_*SECRET*` or `NEXT_PUBLIC_*_KEY` that isn't Stripe's publishable, STOP. That's a leak.**

### Multi-line values — use literal file piping, not copy-paste

The following are PEM blocks with embedded newlines. Shell escaping will silently corrupt them if you paste directly into a web UI field without preserving `\n`:

- `DKIM_PRIVATE_KEY`
- `JWT_PRIVATE_KEY`
- `JWT_PUBLIC_KEY`
- `SAML_CERT`
- `SAML_PRIVATE_KEY`

**Fly.io:**
```
fly secrets set DKIM_PRIVATE_KEY="$(cat dkim.private)" -a alecrae-mta
fly secrets set JWT_PRIVATE_KEY="$(cat jwt.private)" -a alecrae-api
```

**Vercel:** paste into the "Secret" input as a whole (preserves newlines). Do NOT use `vercel env add` with piped input unless you verify the newlines survived with `vercel env pull`.

**Cloudflare Pages/Workers:**
```
wrangler secret put DKIM_PRIVATE_KEY < dkim.private
```

### Domain-coupled vars — change in lockstep

If the primary domain ever changes from `alecrae.com`, these 8 vars move together — orphan updates will break auth and email:

- `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_MARKETING_URL`
- `MTA_HOSTNAME`
- `SAML_ENTITY_ID`, `SAML_ACS_URL`
- All `*_EMAIL` addresses (postmaster/abuse/dmarc)

Domain changes require Craig's authorization (Boss Rule #4).

---

## Migration Notes

- **Legacy `.env.example` files in sub-apps may be stale** (Vienna/48co era). This doc supersedes them. Any discrepancy: this doc wins; open a fix PR to update the stale `.env.example`.
- **Wave 2 task:** run `rg "process\\.env\\." apps/ packages/ --type ts` and reconcile every reference against this audit. Any var referenced in code but not listed here is a documentation bug.
- **Wave 3 task:** add a boot-time env validator (`packages/env`) using Zod so missing required vars fail fast with a clear message instead of NullPointer at first request.
- **Rotation cadence:** all secrets rotate quarterly; `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_*` rotate on any suspected leak immediately (Emergency Protocols → Security Incident).
