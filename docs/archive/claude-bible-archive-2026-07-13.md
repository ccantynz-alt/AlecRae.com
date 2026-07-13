# CLAUDE.md Bible — History Archive (frozen 2026-07-13)

Last updated: 2026-07-13 05:50 UTC

Verbatim sections moved out of the live CLAUDE.md on 2026-07-13 to keep the
Bible lean. This is a frozen historical record — do not update it; new issues
and status live in CLAUDE.md. Full provenance is in git history.

---

## 📦 BUILD STATUS — WHAT'S DONE

### TIER 1 (Launch Blockers) — 10/10 ✅ COMPLETE
- [x] IMAP/JMAP sync engine
- [x] Gmail OAuth + API sync
- [x] Outlook OAuth + Graph API sync
- [x] Inbox UI + thread view
- [x] Compose with rich text editor
- [x] AI Compose (Claude)
- [x] AI Triage + priority inbox
- [x] Local IndexedDB cache
- [x] Keyboard shortcuts + Cmd+K command palette
- [x] Search (Meilisearch + local)

### TIER 2 (Competitive Parity) — 10/10 ✅ COMPLETE
- [x] AI Reply suggestions
- [x] AI Thread summary
- [x] Snooze + schedule send
- [x] Undo send (10-30s window)
- [x] Multi-account
- [x] Dark mode + themes (7 accent colors, 3 densities)
- [x] Stripe billing
- [x] Auth system
- [x] Settings pages
- [x] Import/migration (Gmail, Outlook, MBOX, EML)

### TIER 3 (Market Leadership) — 10/10 ✅ COMPLETE
- [x] AI natural language search
- [x] Calendar integration
- [x] Contact management
- [x] E2E encryption (RSA-OAEP-4096 + AES-256-GCM)
- [x] Email analytics
- [x] AI-powered rules/filters
- [x] AI follow-up reminders
- [x] Voice Profile (learns writing style)
- [x] AI Unsubscribe (backend ready)
- [x] Grammar Agent (replaces Grammarly)

### TIER 4 (Infrastructure Moat) — 7/7 ✅ COMPLETE
- [x] Own email hosting (full MTA built)
- [x] Electron desktop app (polished — native menus, tray, window management, IPC, builds clean)
- [x] React Native mobile app (polished — all screens, tabs, auth, API client, accessibility)
- [x] On-device AI models (Transformers.js wired in grammar agent)
- [x] Public API + webhooks
- [x] Team shared inboxes
- [x] White-label SDK
- [x] Admin SSO (SAML 2.0 SP with jose JWT — SP metadata, ACS, SLO endpoints + admin login page)

### Bonus Features Built (not in original plan)
- Advanced Dictation Engine (replaces Dragon)
- Smart Inbox with Screener (Hey.com style)
- Email Recall (link-based with revoke)
- Bidirectional Translation (35+ languages)
- Collaboration (shared inboxes, comments, assignments)
- Cloudflare deployment config (DNS setup script, wrangler.toml)
- Neon PostgreSQL setup SQL
- Production .env template

### TIER 5 (Table Stakes Expansion) — 20/20 ✅ COMPLETE (2026-04-18)
- [x] Read receipts / tracking pixel (open + click tracking)
- [x] Email templates library (CRUD + variable rendering)
- [x] Signature manager (multiple per account, auto-switch by context)
- [x] Contact groups / distribution lists (CRUD + member management)
- [x] Smart folders / saved searches (dynamic filters, auto-populate)
- [x] Email scheduling queue dashboard (list/cancel scheduled sends)
- [x] Thread muting (silence threads without unsubscribing)
- [x] Bulk actions (archive/delete/read/star/label/move — up to 500 at once)
- [x] Labels / tags (shared, nested hierarchy, apply/remove from emails)
- [x] Push notifications (Web Push subscriptions + preferences + quiet hours)
- [x] Link previews / URL unfurling (OG meta parsing, 7-day cache)
- [x] Email scheduling analytics (opens/clicks by hour+day, best send times)
- [x] Email A/B testing (multi-variant, auto-winner by metric)
- [x] Auto-responder / vacation mode (AI-powered OOO with smart replies)
- [x] Contact enrichment (company info, social profiles, AI-powered)
- [x] Mail merge (personalized mass emails from CSV/contacts)
- [x] Zapier/Make/n8n integration (outbound webhooks, HMAC-signed, 11 event types)
- [x] AlecRae Notes (email-linked notes, pin, thread/contact scoping)
- [x] AlecRae Files (attachment management, storage stats, presigned uploads)
- [x] AlecRae Chat (secure team messaging, channels, DMs, thread-linked)

### TIER 6 (AI-Powered Platform) — 9/9 ✅ COMPLETE (2026-04-18)
- [x] Onboarding wizard (Gmail + Microsoft 365 guided setup)
- [x] AlecRae Docs (documents, folders, versioning, AI assist, export)
- [x] AlecRae Meet (video meeting rooms, recordings, transcription, summaries)
- [x] AI Writing Intelligence (profiles, compose, rewrite, expand, stats)
- [x] Calendar Events (smart calendar, availability, find-time, AI scheduling)
- [x] Contacts Extended (CRM-lite — interactions, reminders, AI insights)
- [x] Notification Intelligence (AI rules, batching, digest, evaluate)
- [x] Focus Sessions (start/end, deferred emails, current session)
- [x] Email Hygiene (habits analytics, subscription tracker, inbox cleanup, goals)

### TIER 7 (Advanced Intelligence) — 6/6 ✅ COMPLETE (2026-04-18)
- [x] Analytics Dashboard (periodic snapshots, goals tracking)
- [x] Email Delegation (delegate handling to team, shared drafts, review workflow)
- [x] Workflow Automation (triggers, actions, runs, templates)
- [x] AI Categorization (email categories, smart labels, feedback loop)
- [x] Search Intelligence (history, bookmarks, AI suggestions)
- [x] Security Intelligence (threat detection, policies, audit log, phishing reports)

### TIER 8 (Deep AI Intelligence) — 6/6 ✅ COMPLETE (2026-04-18)
- [x] Sentiment Timeline (per-contact sentiment tracking, relationship health, risk alerts)
- [x] Attachment Intelligence (AI file analysis, virus scanning, PII detection, smart organization)
- [x] Scheduling Intelligence (AI meeting proposals, availability patterns, conflict detection)
- [x] Context Intelligence (action item extraction, deadline tracking, promise monitoring)
- [x] Productivity Analytics (time tracking, behavioral insights, team leaderboards)
- [x] Knowledge Graph (entity extraction, relationship mapping, graph visualization)

### Total: 36/36 original + 7 bonus + 20 expansion + 9 platform + 6 intelligence + 6 deep AI = 84 features ✅ ALL COMPLETE
### API Routes: 91 route files, 310+ endpoints
### DB Schemas: 62 schema files
### Code: ~64K lines of TypeScript

---

## 🔧 KNOWN ISSUES — QUEUED FOR FIX

| # | Issue | Severity | Found | Status |
|---|-------|----------|-------|--------|
| 1 | Monorepo `bun run build` not verified end-to-end | HIGH | 2026-04-05 | FIXED 2026-04-09 — 26/26 tasks pass |
| 2 | Web app passkey login button has no onClick handler | MEDIUM | 2026-04-05 | FIXED 2026-04-09 — full WebAuthn flow |
| 3 | Some in-memory stores need DB migration (screener, recall, contacts) | MEDIUM | 2026-04-05 | FIXED 2026-04-09 — Drizzle schemas + routes wired |
| 4 | Landing page (alecrae.com) doesn't exist yet — needs Coming Soon | HIGH | 2026-04-05 | DONE — built previously |
| 5 | No actual deployment to Cloudflare yet | HIGH | 2026-04-05 | RESOLVED — moved to dedicated box (149.28.119.158) + Vapron platform. Vercel fully removed. Craig uninstalling Vercel GitHub App 2026-06-15. |
| 6 | Admin route imported but was never mounted in server.ts | HIGH | 2026-04-09 | FIXED 2026-04-09 |
| 7 | 5x `as any` casts in snooze.ts and voice.ts | MEDIUM | 2026-04-09 | FIXED 2026-04-09 |
| 8 | `emailStatusEnum` missing "draft" value — using "queued" as workaround | LOW | 2026-04-09 | NOTED |
| 9 | Pre-existing Drizzle ORM type errors on `.set()` and `.values()` calls | MEDIUM | 2026-04-09 | NOTED |
| 10 | 16x `as any` casts in IMAP storage.ts | MEDIUM | 2026-04-09 | FIXED 2026-04-09 |
| 11 | Vercel build fails — Root Directory must be apps/web | HIGH | 2026-04-09 | FIXED 2026-04-09 — vercel.json updated + merged to main |
| 12 | Full rebrand from Vienna/48co/@emailed to AlecRae/alecrae.com/@alecrae | HIGH | 2026-04-12 | DONE 2026-04-12 — all files updated |
| 13 | No error boundaries in web app (error.tsx / not-found.tsx) | MEDIUM | 2026-04-12 | FIXED 2026-04-12 — root + dashboard error boundaries + 404 page |
| 14 | No sitemap.xml or robots.txt for SEO | LOW | 2026-04-12 | FIXED 2026-04-12 — Next.js route-based sitemap.ts + robots.ts |
| 15 | SSO config stored in-memory Map (lost on restart) | HIGH | 2026-05-26 | FIXED 2026-05-26 — DB-backed via ssoConfigs table |
| 16 | No org/team management (invites, roles, audit log) | HIGH | 2026-05-26 | FIXED 2026-05-26 — organizations route, 18 endpoints |
| 17 | Admin pages call stub endpoints | MEDIUM | 2026-05-26 | FIXED 2026-05-26 — admin.ts fully wired to DB |
| 18 | AWS EKS/ECR `deploy.yml` failing on every push to main (no AWS creds; off-stack) | MEDIUM | 2026-06-08 | FIXED 2026-06-08 — removed; deployment moving to Vapron |
| 19 | Vapron platform client unverified against live API (no public docs; built to spec) | MEDIUM | 2026-06-08 | FIXED 2026-06-10 — rebuilt to the published tRPC API (base `/api/trpc`, `{json}` envelope, real procedure names: `customerEmail.send`, `aiGateway.complete`, `objectStorage.*`, `aiDeploy.quickDeploy`); removed fictional `secrets.get`. AI-gateway response extraction is tolerant pending live-call confirmation. |
| 20 | Web client defaulted API base to `localhost:3001` → deployed login (passkey + Google) couldn't reach the server | HIGH | 2026-06-10 | FIXED 2026-06-10 — `apps/web/lib/api-base.ts` `getApiBase()`: env override → `https://api.alecrae.com` in browser → localhost for dev; all web `API_BASE` routed through it |
| 21 | API crashed on boot — BullMQ rejects `:` in queue names (`alecrae:webhooks`/`:outbound`/`:dns-liveness`); webhook worker started unconditionally | HIGH | 2026-06-10 | FIXED 2026-06-10 — renamed queues to hyphens repo-wide; Redis-gated + fault-isolated worker/DLQ startup; API now boots & serves `/health` with no Redis/Meilisearch. Root `start`/`build:api` scripts added for Vapron (one-app-from-root, `process.env.PORT`) |
| 22 | Schema drift broke `db:seed` on a fresh DB — `accounts` was missing `storage_used_bytes`/`status`/`scheduled_deletion_at`, `attachments` missing `virus_scan_status`/`virus_scan_result`; migration journal also dropped `0010`/`0011` (so `draft_snapshots` + `email_status='draft'` never applied) | HIGH | 2026-06-11 | FIXED 2026-06-11 — added `0012_fix_schema_drift.sql` (idempotent), registered `0010`–`0012` in `meta/_journal.json`. Verified end-to-end against a fresh local Postgres 16: migrate `0001→0012` + seed both pass, API key prints |
| 23 | **Migrations covered only 16 of 136 schema tables** — a `db:migrate`-only fresh DB lacked 120 tables incl. login-critical `passkeys`/`refresh_tokens`/`connected_accounts`; `db:push` was also broken (`drizzle-kit` couldn't resolve `./*.js` schema imports) | HIGH | 2026-06-11 | FIXED 2026-06-11 — pointed drizzle-kit at compiled `dist/schema/*.js` (resolves `.js` imports); replaced the partial hand-written migrations with **one generated baseline `0000_complete_baseline.sql` covering all 136 tables** (schema is now the single source of truth; supersedes 0012/#22). Added pgvector `CREATE EXTENSION` + HNSW/unique embedding indexes (now in schema). Verified on fresh Postgres 16: migrate → 136 tables, `db:seed` ok, API boots, **real login + `GET /v1/messages` inbox return 200**. Added `db:check-drift` + a CI `Schema/Migration Drift` job so this can never silently regress. NB: production also requires `WEBAUTHN_RP_ID` + `WEBAUTHN_ORIGIN` env (API throws on boot without them). |
| 24 | Rate-limiter (and idempotency + quota) Redis clients failed their first command with "Stream isn't writeable and enableOfflineQueue options is false" and fell back to in-memory — a lazy-connect race: `getRedis()` returned the client before the socket was ready. idempotency/quota also never recovered (set `redisAvailable=false` permanently on first error) | LOW | 2026-06-11 | FIXED 2026-06-11 — gate command issuance on the ioredis `ready` event (use fallback until ready), drop `lazyConnect` + the manual retry loop and let ioredis auto-reconnect. Verified with local Redis: rate-limit keys land in Redis, zero "Stream isn't writeable" errors. |
| 25 | Deployed Google sign-in returned a raw 500 (`internal_error`) — `GET /v1/auth/google` called `signAuthState()` (unguarded), which throws in production when `JWT_SECRET` is unset/<32 chars (oauth-state.ts). Password login still worked (jwt.ts ephemeral RS256 fallback), masking the missing env | HIGH | 2026-06-11 | FIXED 2026-06-11 — wrapped the Google start + callback so a signing failure degrades to a clean `/login?error=google_unavailable` redirect (logged server-side) instead of a 500. **Real fix is env:** set a stable `JWT_SECRET` (≥32 chars) in production. Reproduced + confirmed against a local prod-mode boot. |
| 26 | `services/dns/src/auto-config.ts` + `records/manager.ts` hard-code `.dev` placeholder hosts (`mx1.alecrae.dev`, `include:spf.alecrae.dev`, `bounce.alecrae.dev`) while production uses `.com` — customer domains would get wrong MX/SPF/return-path records | MEDIUM | 2026-06-11 | OPEN — found during business-email onboarding audit; must switch to `.com` (or env-driven `DNS_*`) before onboarding a real customer domain. Runbook `docs/infra/business-email-domain-onboarding.md` uses the correct `.com` values. Audit also found `.dev` defaults in `TRACKING_BASE_URL` (`t.alecrae.dev`) and MTA `SMTP_HOSTNAME` (`mail.alecrae.dev`). FIXED 2026-06-11 — env-driven config with `.com` defaults across dns (`services/dns/src/config.ts`: `DNS_MX_HOSTS`/`DNS_SPF_INCLUDE`/`DNS_DMARC_RUA`/`DNS_RETURN_PATH_HOST`/`DNS_NS_HOSTS`), mta (`MTA_HOSTNAME`), analytics tracking base, inbound, imap, support KB copy; `.env.example` flipped. dns 20/20 + mta 245/245 tests green. |
| 27 | **Web UI exposes ~20% of the backend** — sidebar has 10 items while the API has 96 mounted route groups; 15+ feature domains (rules/automations, workflows, calendar page, tasks, voice, collaboration/chat/delegation, knowledge graph, integrations/Zapier, webhooks/API keys, email-query console, A/B tests, mail merge, smart folders, screener, focus, security intelligence, translation, docs/files/notes) have ZERO web UI. 14 finished components are orphaned (never imported by any page), incl. SpatialInboxView, CollaborativeDraftView, EmailQueryConsole, VoiceCloneManager, VoiceReplyComposer, RecipientAutocomplete, InboxHeatmapView. Inbox has 4 `/* no-op */` handlers (AI reply, AI summarize, command palette, focus mode). 7 API clients in `apps/web/lib/api.ts` are defined but never called. | HIGH | 2026-06-11 | LARGELY FIXED 2026-06-11 — (a) root-cause bug: sidebar clicks were dead (layout never passed `onNavigate`; component preventDefault'd into a no-op) — fixed + typed-routes fix; (b) all 4 inbox no-ops wired (AI reply + AI summarize via new `aiWritingApi`, Cmd+K palette via shared store, focus mode); (c) 7 new pages: /automations, /calendar, /tasks, /search (AI + query console), /voice, /scripts, /settings/developer (API keys, webhooks, integrations); sidebar reorganized Mail/Tools/Automation/Manage; RecipientAutocomplete in compose; heatmap on analytics. STILL UNWIRED: CollaborativeDraftView, MeetingTranscriptPanel, SpatialInboxView (blocked: packages/ui export map + optionalDeps three/@react-three not installed), SwipeableEmailRow, DragToSnooze, LocalAIStatusIndicator; no UI yet for knowledge graph, chat/delegation, docs/files/notes, A/B tests, mail merge, smart folders, screener. |
| 28 | **In-memory store regression** — issue #3 was marked FIXED, but 10 route-level Maps remain; 7 lose user data on restart: snooze (undo-send), voice-message, import jobs, ai-rules, programs, calendar (events + scheduling links), security (phishing reports). `collaborate.ts` has DB tables but still uses Maps. | HIGH | 2026-06-11 | FIXED 2026-06-11 — all 10 stores DB-backed: 12 new tables in migration `0002_goofy_scarecrow.sql` (email_rules, programs, program_runs, import_jobs, phishing_reports, voice_messages, shared_inboxes, email_comments, email_assignments, voice_profiles, dlq_records, scheduling_links). Snooze undo is a documented hybrid (timer in-memory, undo window persisted in `emails.metadata`, DB reconciliation on restart). Bonus: fixed two cross-tenant leaks found en route (import `GET /status/:id` and collaborate comments weren't account-scoped). Drift check green, apps/api 136/136 tests. NB: run `bun run db:migrate` before prod. |
| 29 | 13 backend endpoints are stubs/placeholders: files presigned-upload (mock R2 URL), voice-message storage, documents ai-assist/export, search-intelligence suggestions/trending/related, video-meetings summarize, ai-categorization test/retrain, attachment-intelligence OCR, contact-enrichment (domain-only), contacts-extended insights, delegation inbox. Also: `warmup.ts` was the only unmounted route (blocked on reputation/dns type errors); `meeting-link.ts:299` stores tokens unencrypted (TODO). | MEDIUM | 2026-06-11 | PARTIALLY FIXED 2026-06-15 (PR #72) — warmup route fully mounted in `server.ts` (6 endpoints live: POST start, GET status, POST pause, POST resume, POST cancel, GET report). Smart startup health check added (`GET /v1/health/detailed` + `printStartupConfigReport()` at boot). Remaining stubs (R2 presigned, voice-message, etc.) still OPEN. **Token encryption sub-item FIXED 2026-07-01** — `meeting-link.ts` now encrypts/decrypts provider tokens with AES-256-GCM (`@alecrae/crypto`), keyed off `JWT_SECRET`. |
| 30 | API integration tests cover ~7 e2e files for 310+ endpoints; 11 workspaces have zero tests (collab, jmap, support, analytics, db, ui, admin, status, mobile, desktop); no middleware tests. Standards drift: 28 production `as unknown as` casts, 135 production `console.log`s (should be structured logger). | MEDIUM | 2026-06-11 | OPEN — see audit §6–7 for worst-file lists. Partial progress 2026-06-11: +39 new tests (dns config 13, mta config 5, api env 9, persistent stores 12). NB: repo lint is actually ESLint, not Biome (every workspace's `lint` script) — Bible's stack table is aspirational here. |
| 31 | **`/v1/admin/*` had no admin check** — mounted with only `authMiddleware`, so ANY authenticated user could read cross-account stats/users/messages/events | HIGH | 2026-06-11 | FIXED 2026-06-11 — new `requireAdmin()` middleware (accepts `admin:read`/`admin:write` scope, or DB user role owner/admin for sessions; dev-mode passthrough without DATABASE_URL outside production) mounted on `/v1/admin/*`. |
| 32 | Next.js production env: API boot didn't fail fast on missing critical env (root cause class of #25) | MEDIUM | 2026-06-11 | FIXED 2026-06-11 — `apps/api/src/lib/env.ts` `assertProductionEnv()`: aggregated throw in production for DATABASE_URL / JWT_SECRET(≥32) / WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN; warn-only for REDIS_URL / WEBHOOK_SECRET / ANTHROPIC_API_KEY / STRIPE_SECRET_KEY; no-op in dev/CI. 9 tests. |
| 33 | **First-run dead end** — fresh Google sign-in landed on an empty `/inbox` with no route to the (fully built) onboarding wizard; "No emails yet" empty state offered no connect CTA; no role indicator anywhere, so the owner couldn't tell whether he was seeing the admin or customer view (answer: always customer — admin is the separate `apps/admin` app on admin.alecrae.com, which doesn't resolve in DNS yet) | HIGH | 2026-06-12 | FIXED 2026-06-12 — Google callback checks `/v1/connect/accounts` and routes zero-account users to `/onboarding`; inbox empty state now shows a "Connect an account" CTA (fail-open when the check errors); owner/admin role badge added to the sidebar footer (`/v1/auth/me` role) |
| 34 | Landing page still rendered the old dark/neon ("cyberpunk") component suite while the brand had already moved to the ivory "Email, considered" identity in `app/layout.tsx` (Italianno script wordmark, `#f5f4ef`) — `page.tsx` overrode it all with `bg-slate-950` | HIGH | 2026-06-12 | FIXED 2026-06-12 — full landing redesign in the refined identity: ivory/warm-ink palette, Playfair Display serif display type (`--font-display`, `font-serif`), Italianno wordmark in nav/footer, racing-green `#1f3d2e` + brass `#9a7b4f` accents, hairline borders, one dark "evening" band (AI section + CTA in `#15281e`); all 12 landing components rewritten, copy aligned to "Email, considered." / "The inbox you'd sign your name to." Build 49/49 static pages, lint + 11 tests green |
| 35 | Dashboard looked generic-indigo "default Tailwind admin" — no AlecRae identity, AI features invisible (Cmd+K/AI reply/summarize all hidden behind undiscoverable shortcuts), dead "Select an email to read" pane. Also confirmed via owner screenshot (2026-06-12) that the production box is serving a **pre-2026-06-11 build** (sidebar missing Calendar/Tasks/Search/Voice/Scripts/Automations) — the box pull ritual hasn't run | HIGH | 2026-06-12 | FIXED (repo-side) 2026-06-12 — design tokens re-skinned to the brand (`apps/web/tailwind.config.ts`: brand→racing green scale, surfaces→warm ivory, borders/content→warm ink) which restyles every dashboard page at once; Italianno script wordmark in the dashboard sidebar; visible "Ask AlecRae ⌘K" button in the top bar wired to the command palette; EmailViewer resting state now branded with a ⌘K hint. **Box-side still required:** run the pull ritual to actually serve current main |
| 36 | **Sidebar collapse was a dead end** — clicking the `‹` toggle collapsed the nav to 64px (`overflow-hidden`), but the full-size "AlecRae" wordmark still rendered and pushed the `›` expand button off the visible edge, so there was no way to re-expand (owner-reported "press left arrow to minimize, can't bring it back") | MEDIUM | 2026-06-13 | FIXED 2026-06-13 — `layout.tsx` hides the wordmark when collapsed so the toggle stays visible/centered; added `⌘\`/`Ctrl\` keyboard toggle as a guaranteed path back |
| 37 | **"Invalid or expired bearer token" mid-session** — access tokens live 15 min and the API issues a 7-day refresh token, but the web client discarded the refresh token and never refreshed; after 15 min idle every call 401'd and the user was silently logged out with no recovery | HIGH | 2026-06-13 | FIXED 2026-06-13 — new `apps/web/lib/auth-token.ts` stores the refresh token and silently renews on a 401 (single-flight) then retries once; wired into `api.ts` + `api-features.ts` fetch wrappers, login/register/passkey/Google flows, and the Google callback now forwards the refresh token. **Infra caveat:** a stable `JWT_SECRET` (≥32 chars) must be set on the box or every restart still invalidates all tokens at once. |
| 38 | **Connect Gmail/Outlook completely broken** (the path to importing inboxes) — onboarding used a relative `/v1/connect/gmail` (hit the web host), via a top-level redirect (no Bearer header → 401), to a route requiring the unsatisfiable `accounts:write` scope (→ 403) | HIGH | 2026-06-13 | FIXED 2026-06-13 — `GET /v1/connect/gmail\|outlook` now returns the OAuth consent URL as JSON via authenticated fetch (signed `state` carries identity to the public callback; no token in any URL) and uses the satisfiable `account:manage` scope; onboarding fetches the URL then navigates (`connect.ts`, web `connectApi`, `onboarding/page.tsx`) |
| 39 | **Docs vs. reality drift** — CLAUDE.md claims "~99% launch-ready / all features complete," true for *backend code* but false for *reachable product*: ~96 API route groups exist, the web app exposes a fraction. No admin console (the one `/admin` page is unlinked/ungated/wired to nothing), and mailbox provisioning, Google-Workspace bulk import, org/team/invite/SSO, and import jobs are all **backend-only with no UI** (import workers are also stubs). See `PRODUCT_GAP_AUDIT.md` (2026-06-13). | HIGH | 2026-06-13 | IN PROGRESS — closing frontend-first in 3 steps (admin console → workspace setup → real import). **(1/3) DONE 2026-06-13:** real role-gated admin console at `(dashboard)/admin` wired to all 8 `/v1/admin/*` endpoints (overview stats, users, domains, messages, events, DLQ with clear actions); old unlinked static `/admin` stub removed; sidebar shows "Admin" for owner/admin. **(2/3) DONE 2026-06-13:** Workspace setup page at `(dashboard)/workspace` (Mailboxes: provision/list/remove native addresses on a verified domain; Team: create org, invite users, roles, pending invitations), sidebar shows "Workspace" for owner/admin. **This required fixing a systemic scope/auth trap (#40 below) that had silently 403/401'd the entire management surface — domains, mailboxes, org/team — out of the web app.** Deferred: bulk Google-Workspace directory import (its admin-OAuth start/callback need backend wiring — same redirect trap as #38). **(3/3) DONE 2026-06-13:** real MBOX/EML import — Craig-authorized data-model change (`0003_lucky_squirrel_girl.sql`: `emails.domain_id` nullable + `source` column) lets connected/imported mail live in the unified `emails` table; new `received-email-store.ts` (parse via `@alecrae/email-parser`, dedup by Message-ID, `domainId` null, `source` tag) + MBOX/EML workers now actually parse + store; Import tab in `(dashboard)/workspace` (upload `.mbox`/`.eml`, job list). Gmail/Outlook history backfill fails honestly (no longer fake-completes) pending the sync-engine persistence fix (#41). **Run `bun run db:migrate` on the box before this works in prod.** |
| 41 | **Connected-account mail is never persisted (empty inbox after connect)** — the Gmail/Outlook sync engine fetches + parses but its store is a stub: `fetchAndStoreGmailMessage` (apps/api/src/sync/engine.ts) and the Outlook loop only `console.log` instead of writing to `emails`. So connecting Gmail/Outlook syncs nothing, and direct history import for those providers can't work either. | HIGH | 2026-06-13 | FIXED 2026-06-15 — `apps/api/src/sync/engine.ts`: added `decodeBase64Url()` helper + recursive `extractGmailBodies()` MIME walker; `fetchAndStoreGmailMessage()` now calls `storeReceivedEmail({ accountId, source: "gmail", ... })` with base64url-decoded bodies. Outlook loop similarly wired. Both use conditional spread for optional `receivedAt` to satisfy `exactOptionalPropertyTypes`. AI auto-triage (Claude Haiku, fire-and-forget) added to `received-email-store.ts` — classifies priority/category/actionRequired/summary into `emails.metadata` on every insert. Merged in PR #72. |
| 42 | **MTA worker not running on box** — emails queue via BullMQ but the `alecrae-mta` systemd service doesn't exist yet on 149.28.119.158; emails are stored in DB + queued in Redis but never consumed → never sent. Also: `POST /v1/messages/send` returned a raw 500 if Redis was unavailable (no error handling around `queue.add()`). | HIGH | 2026-06-15 | PARTIALLY FIXED 2026-06-15 — `queue.add()` now wrapped in try/catch → returns HTTP 503 with actionable message instead of raw 500. Runbook `docs/infra/mta-box-setup.md` created (Redis install, systemd service file, test send, queue inspection). `box-deploy.sh` updated to restart `alecrae-mta` if it exists. **Craig still needs to run the runbook on the box.** |
| 40 | **Systemic scope/auth trap blocked the whole management surface from the web** — (a) session JWTs only ever carried `messages:* + account:manage`, but `domains`/`mailboxes`/`workspace-import`/`organizations`/`import` routes require `domains:manage`/`account:read`/`team:manage`/`import:*` — scopes no session token (and for `account:read`/`import:*`, no API key either) ever had → blanket 403; (b) `/v1/mailboxes` had NO `authMiddleware` mount at all and `/v1/domains` (bare list/create) was only covered by `/v1/domains/*` (which doesn't match the bare path) → 401 with no auth context. So even the "working" Domains page actually 401'd. | HIGH | 2026-06-13 | FIXED 2026-06-13 — session tokens now carry role-derived scopes (`createAccessToken` → `scopesForRole`: owner/admin get domains:manage, account:read, team:manage, analytics:read, webhooks:manage, api_keys:manage, import:read/write; member keeps the prior baseline + account:read; viewer read-only). All handlers stay account-scoped so an owner only reaches their OWN account; cross-account `/v1/admin/*` stays role-gated via `requireAdmin` (NOT widened). Added the missing `authMiddleware` mounts for bare `/v1/domains` and `/v1/mailboxes`(+`/*`). 143/143 api tests green. |
| 43 | **React hydration error #418** — `navigator.onLine` initialized as `true` in `OfflineComposeBanner` + `OfflineBadge` (SyncStatusBar) caused server/client HTML mismatch; browser console showed "Error: Minified React error #418" + infinite GET /v1/connect/accounts 403 render loop | MEDIUM | 2026-06-15 | FIXED 2026-06-16 — `isOnline` initialized as `null` (not `true`) so both server and client render `null` initially; `useEffect` sets the real value after hydration. Loop was a side-effect of the stale-token 403 on every render — fixed by sign-out/sign-in to get a fresh JWT. |
| 44 | **MTA health server crashed on port 8080** — `vapron-bun-gateway` also uses port 8080; MTA service crashed on startup with "Failed to start server. Is port 8080 in use?" and exited, so the outbound queue was never consumed | HIGH | 2026-06-15 | FIXED 2026-06-16 — default `HEALTH_PORT` changed from 8080 to 8082; health server startup made non-fatal (catch + warn, continue without health endpoint) so MTA keeps running even if the health port is taken. |
| 45 | **AI Grammar checking never triggered** — `_checkGrammar` callback (1.5s debounce → grammarApi) was defined in compose/page.tsx but `ComposeEditor` had no `onBodyChange` prop, so typing in the compose body never called the grammar API; the AI Suggestions panel never appeared | MEDIUM | 2026-06-16 | FIXED 2026-06-16 — added `onBodyChange?: (text: string) => void` prop to `ComposeEditor` (packages/ui), called on every textarea keystroke; compose page passes `onBodyChange={_checkGrammar}`. Fixed `onApplySuggestion` no-op too (dismisses applied suggestion from list). |
| 46 | **Domains page "View Records" button did nothing** — `onViewRecords={() => { /* no-op */ }}` was a placeholder; users couldn't see what DNS records to add to their provider after adding a domain | MEDIUM | 2026-06-16 | FIXED 2026-06-16 — implemented `DnsRecordsModal` in domains/page.tsx: shows all 4 DNS records (type/name/value), one-click copy per value, verified/pending badges, propagation note. |
| 47 | **~45% of backend had zero UI** — 96 API route groups, only ~20 web pages; Smart Folders, Mail Merge, Shared Inboxes, Delegation, Team Chat all built on backend but missing from the web app entirely | HIGH | 2026-06-16 | FIXED 2026-06-16 — 5 new pages built and committed: Smart Folders (full filter CRUD, open in inbox), Mail Merge (campaigns + CSV import + per-recipient status), Shared Inboxes (team inboxes + member management), Delegation (delegate to/from with permissions), Team Chat (channel list + message thread + send). All sidebar entries added. |
| 48 | **`<Box as="option">` crashed Shared Inboxes + Workspace pages** — React enforces that `<option>` must be a native HTML element as direct child of `<select>`; wrapping in Box caused a runtime crash on both pages | HIGH | 2026-06-16 | FIXED 2026-06-16 — replaced all `<Box as="option">` with native `<option>` in shared-inboxes/page.tsx (delegation scope selector) and workspace/page.tsx (domain picker + invite role selector) |
| 49 | **Automations page: "Missing required scope(s): rules:read"** — session JWTs for owner/admin only carried 8 scopes; 20 feature route groups (rules, workflows, auto-responder, contacts, calendar, tasks, smart-folders, mail-merge, chat, documents, delegation, ab-tests, scripts, voice) required scopes that no session token ever carried → blanket 403 on every feature tab | HIGH | 2026-06-16 | FIXED 2026-06-16 — added 20 missing scopes to `scopesForRole()` owner/admin branch in `apps/api/src/lib/jwt.ts`. Takes effect on next login (existing tokens not retroactively updated). |
| 50 | **contacts, billing, voice pages bypassed silent token refresh** — each had its own `apiFetch` reading `localStorage` directly without the 401→refreshSession→retry logic from auth-token.ts, causing all three pages to stop working 15 min after login | MEDIUM | 2026-06-16 | FIXED 2026-06-16 — contacts/page + billing/page now import `getAccessToken()`/`refreshSession()`/`redirectToLogin()` from auth-token.ts and retry on 401; voice/page uses `getAccessToken()` instead of direct `localStorage.getItem` |
| 51 | **~50% of backend still had no web UI** — 8 feature areas (AI Agent, Files, Security Center, Integrations, Email Hygiene, Gamification/Achievements, Push Notifications, Translation) had fully built backends but zero dashboard presence; sidebar had no tier badges; `featureFetch` calls in api-features.ts lacked explicit generic type params (TypeScript inferred `Promise<unknown>`) | HIGH | 2026-06-17 | FIXED 2026-06-17 (PR #83) — 8 new pages built with plan-gate enforcement; `PlanGate` component + `plan.ts` tier system added; sidebar reorganised into 9 named sections (Mail/AI Features/Tools/Automation/Team/Insights/Settings/Admin) with PRO/PERSONAL badges; all new `featureFetch` calls carry explicit `<T>` generics. Build: 70/70 static pages, 0 errors. |
| 52 | **Gmail/Outlook history backfill stubs** — `startGmailImport` and `startOutlookImport` in `routes/import.ts` immediately set job status to `failed` with a "not available" message; the stale comment said the sync engine didn't persist (fixed in PR #72) but the stub was never updated. Also: scope mismatch (`accounts:write/read` with 's') in connect.ts routes that JWT never issued → 403 on IMAP connect/disconnect/list/sync | HIGH | 2026-06-19 | FIXED 2026-06-19 — `startGmailImport` + `startOutlookImport` now load the connected account from DB, call `syncGmailMessages` / `syncOutlookMessages` (up to 2000 messages), and update job progress. Scope corrected to `account:manage` / `account:read`. Gmail/Outlook import card added to Workspace → Import tab. |
| 53 | **Sidebar 404s** — `/delegation` (no page; is a tab inside `/shared-inboxes`) and `/developer` (page at `/settings/developer`) both 404'd when clicked | MEDIUM | 2026-06-19 | FIXED 2026-06-19 — layout.tsx hrefs corrected. |
| 54 | **notifications/page and agent/page used local apiFetch with no 401 retry** — same class as #50; sessions broke silently after 15 min on these two pages | MEDIUM | 2026-06-19 | FIXED 2026-06-19 — both pages now use `refreshSession()` → retry pattern from auth-token.ts. |
| 55 | **alecrae-mta systemd service not running on box** — port 25 is now open; MTA can deliver directly (no relay) OR via Resend. Service must be created via `docs/infra/mta-box-setup.md`. Also: PTR record for 149.28.119.158 not yet set → cold-start deliverability risk | HIGH | 2026-06-19 | OPEN — Craig must run runbook + set PTR in Vultr control panel. Runbook updated to document both direct + relay modes. |
| 56 | **Domains "Verify Now" button had zero visual feedback** — button fired silently with no spinner, no loading state, no result; users couldn't tell if anything happened | MEDIUM | 2026-06-20 | FIXED 2026-06-20 (PR #87) — button shows spinner + "Checking..." label while running; domain card badge changes to "Checking..."; inline green/amber result message appears for 6s after completion. `DomainCard` gains `verifying` prop. |
| 57 | **Domain DNS setup was developer-only** — after adding a domain users saw a raw records list with no guidance; non-technical users had no idea what to do or where in their DNS panel to go | HIGH | 2026-06-20 | FIXED 2026-06-20 (PR #87) — replaced with a guided DNS setup wizard: provider picker (Cloudflare/GoDaddy/Namecheap/Porkbun/Google Domains/Other) with numbered step-by-step instructions per provider; auto-polls pending domains every 30s so no manual "Verify Now" needed; wizard opens automatically after adding a domain; next step is Cloudflare API integration for fully automatic record creation. |
| 58 | **`services/imap` is not bootable** — `messages.ts` (FETCH/STORE/COPY/MOVE/SEARCH/APPEND/IDLE) and `imap-server.ts` (the TCP listener) are excluded from `tsc --noEmit` and not exported from `src/index.ts`; they reference an old `ImapFetchItem`/`ImapMessage` shape that was refactored out from under them (see `services/imap/TODO.md`). Auth + mailbox handlers compile and are production-ready, but no process starts an IMAP TCP listener. CLAUDE.md's Tier 1 "IMAP/JMAP sync engine — DONE" claim was wrong for the native-IMAP path. | HIGH | 2026-07-01 | **DECIDED 2026-07-01 (Craig): OAuth-only for launch.** Gmail/Outlook OAuth sync covers real users; native IMAP stays broken and undocumented-as-done. Not blocking. Revisit only if a future user segment specifically needs raw IMAP (e.g. non-Gmail/Outlook providers). |
| 59 | **`.env.production` + `.env.test` were tracked in git** in the public `AlecRae.com` repo, with production-shaped secret var names (`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `JWT_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, etc.). `.gitignore` only excluded `.env`/`.env.local`/`.env.*.local`. | HIGH | 2026-07-01 | FIXED 2026-07-01 — both files untracked (`git rm --cached`, kept locally), `.gitignore` extended to cover `.env.production`/`.env.test`. Pushed to `origin/main`. **Not done:** git history still contains the old committed content (not scrubbed) — if any of those values were ever real (unconfirmed either way), rotate them. |
| 60 | **`console.log` count grew 135 → 205** since issue #30 was logged (2026-06-11) — wrong direction | LOW | 2026-07-01 | OPEN — needs a sweep to a structured logger before paying customers; full occurrence list saved to `/opt/jarvis/reports/alecrae-audit-2026-07-01.txt`. |
| 61 | **Inline markdown parsing unimplemented** in `packages/email-parser/src/document-model.ts:575` — bold/italic/link/code not handled, affects how some emails render in the UI | LOW | 2026-07-01 | OPEN |
| 62 | **MTA OTel metrics not wired** — `services/mta/src/health.ts:207` `/metrics` returns a placeholder 404 ("not_implemented") instead of real OpenTelemetry export | LOW | 2026-07-01 | OPEN — blocks real MTA health metrics in monitoring. |
| 63 | **Only one workspace account could ever be created** — reported as "admin section only lets me create one workspace account." Root cause was two-layered: (a) frontend bug, `apps/web/app/(dashboard)/workspace/page.tsx` Team tab only kept `res.data[0]` from `GET /v1/organizations` and hid the create form once any org existed; (b) deeper architectural gap — `users.accountId` was a hard 1:1 (one login = exactly one tenant), so even fixing the UI wouldn't have let one login manage more than one business. | HIGH | 2026-07-03 | FIXED 2026-07-03 (Craig-authorized architecture change) — new `workspace_members` table (`packages/db/src/schema/workspace-members.ts`, migration `0004_legal_lady_bullseye.sql` with backfill) decouples identity (`users`) from per-workspace role; `refresh_tokens.accountId` added so token rotation stays in the active workspace instead of reverting to the home account. New `POST/GET /v1/workspaces` + `POST /v1/auth/switch-workspace` (mints a fresh token pair after verifying membership). `organizations.ts` members/invitations rewritten against `workspace_members` (invitation-accept no longer re-parents an existing identity into a new account — it grants membership without touching their other workspaces). `/v1/auth/me`, login, register, Google OAuth, passkey, and SSO all resolve role from `workspace_members` (self-healing fallback to legacy `users.role` for pre-migration rows). Frontend: new `WorkspaceSwitcher` in the sidebar (list/switch/create), Team tab bug fixed. **Run `bun run db:migrate` on the box before this works in prod.** |
| 64 | **Pro/Enterprise features stayed gated for paying accounts, including the owner's own top-tier account** — `apps/web/components/plan-gate.tsx` fetched `GET /v1/auth/me` and read `data.planTier` directly off the response root, but (a) the endpoint wraps its payload in `{ data: {...} }` (should have been `data.data.planTier`), and (b) `/v1/auth/me` never selected/returned a `planTier` field at all — so `PlanGate` always fell back to `"free"` regardless of the account's real plan. DB (`accounts.planTier`) and the JWT `tier` claim were correct the whole time; only this one read path was broken. | HIGH | 2026-07-03 | FIXED 2026-07-03 — `GET /v1/auth/me` (`apps/api/src/routes/auth.ts`) now selects `accounts.planTier` for the active workspace and returns it as `data.planTier`; `plan-gate.tsx` fixed to read `body.data.planTier`. Bundled into PR #90 (same endpoint already touched for the multi-workspace fix, and plan tier is naturally per-workspace under that model). |
| 65 | **Second full codebase audit (2026-07-04) — ~30 more bugs fixed across 16 files** — security (path traversal in porkbun.ts apexDomain, cross-tenant leaks), billing (`isPlanAtLeast(undefined)` always returning true granting free users paid features, `business`/`business_plus` tiers missing from TIER_ORDER), correctness (Inbox Agent page completely non-functional — all 4 API calls had wrong response shape, wrong HTTP method/URL for approve/reject, briefing display crash, approve-batch never sending emails, drafts pagination broken, DKIM verification joining split chunks wrong, DKIM age using domain.createdAt instead of selector date), DNS (2-label apex inference broken for .co.nz/.com.au/.co.uk, GoDaddy missing GET-merge-PUT losing non-AlecRae TXT records, missing content-type guards before .json() calls, user-supplied apexDomain used in path without sanitization), CSP/HSTS security headers missing from Next.js config, OAuth avatar images not in remotePatterns, cache-control header bug (must-revalidate void with no-store), `formatTimestamp` midnight boundary bug, fetchEmails stale closure discarding user email selection on refetch, handleSearch missing unmount cleanup, ai-triage batch endpoint calling wrong URL + wrong body shape ({limit:100} instead of {emailIds:string[]}), domains auto-poll never stopping for failed/expired domains, handleDomainAdded finding wrong domain on .find(), workspace page domain guard admitting re-verified-failed domains | HIGH | 2026-07-04 | FIXED 2026-07-04 — fixes across apps/web/lib/plan.ts, apps/api/src/lib/dns-providers/types.ts, cloudflare.ts, porkbun.ts, godaddy.ts, apps/web/next.config.ts, apps/api/src/routes/domains.ts, apps/web/app/(dashboard)/agent/page.tsx, apps/web/lib/api-features.ts, apps/api/src/routes/agent.ts, services/dns/src/auto-config.ts, apps/web/app/(dashboard)/inbox/page.tsx, apps/web/app/(dashboard)/ai-triage/page.tsx, apps/web/app/(dashboard)/domains/page.tsx, apps/web/app/(dashboard)/workspace/page.tsx |

---

## 🚀 ADVANCED FEATURE BACKLOG — THE LEAD-EXTENDING ROADMAP

> **These are the features that keep AlecRae 80-90% ahead of the field forever.**
> **Locked in to prevent loss between sessions. Build in priority order.**

### TIER S — INDUSTRY FIRSTS (Build these to make jaws drop)

| # | Feature | Why It Wins | Status |
|---|---|---|---|
| S1 | **WebGPU client-side AI inference** | Llama 3.1 8B at 41 tok/sec in browser. $0/token. No competitor has this. Full WebLLM engine, Zod-validated API, IndexedDB cache tracking, progress events, `localInfer()` API, React status indicator. | DONE |
| S2 | **CRDT real-time collaborative drafting** | Two people editing the same email with live cursors (Yjs). Full Yjs + Awareness client, WebSocket collab service, DB persistence, UI (editor + panel + avatars), typed API client. INDUSTRY FIRST in email. | DONE |
| S3 | **AI inbox agent (works while you sleep)** | Wakes up overnight, triages, drafts replies, schedules sends. You approve in the morning with one tap. INDUSTRY FIRST. Full InboxAgent engine (Haiku triage + Sonnet drafting + briefing), 12 API endpoints, DB-persisted runs/drafts/config, per-draft approve/reject/edit, morning briefing, confidence scoring, human-in-the-loop. | DONE |
| S4 | **Voice cloning for AI replies** | Drafts sound exactly like you (style transfer beyond voice profile). Multi-profile support (professional/casual/etc), DB-persisted style fingerprints (rhythm, vocabulary, punctuation, formality, emoji), confidence scoring, per-email feature extraction, Claude-powered compose in user's voice. 6 API endpoints, Drizzle schema, UI selector + manager page. | DONE |
| S5 | **Semantic vector search** | "Find the email where someone said something like 'we should consider the budget'" via embeddings. Beyond keyword. | DONE |
| S6 | **Auto-summary of every newsletter** | AI reduces newsletters to 3 bullets in inbox preview. Full text on demand. | DONE |
| S7 | **AI "Why is this in my inbox?" explainer** | Click any email → AI explains who this is, history, why it landed here, suggested action. | DONE |
| S8 | **One-click thread → action items in todo apps** | Native Things, Todoist, Linear, Notion integration. AI thread extraction, batch create, built-in task list, DB-backed provider configs. | DONE |
| S9 | **Email thread → meeting transcript link** | If a thread leads to a call, auto-link the recording + transcript. DB-backed meeting_links table, 5 API endpoints, Whisper transcription, Claude Haiku summary, MeetingLinkCard UI, MeetingTranscriptPanel web component. | DONE |
| S10 | **Predictive send-time optimization** | AI predicts best send time based on recipient open patterns. | DONE |

### TIER A — CUTTING-EDGE UX

| # | Feature | Why It Wins | Status |
|---|---|---|---|
| A1 | **Magic UI animations (Linear-style)** | Framer Motion + spring physics. Full animation library + 8 reusable components. Wired into sidebar, inbox, compose, analytics, settings. | DONE |
| A2 | **Spatial inbox (3D thread visualization)** | R3F-powered 3D view for power users. Optional. InstancedMesh for 1000+ threads, configurable axes (time/priority/category/sender), color schemes, orbit controls, hover tooltips, keyboard navigation, connection lines, cluster labels. Lazy-loaded with ErrorBoundary for WebGL failures. | DONE |
| A3 | **Inbox heatmap** | Visual email habits (when you're most productive). GitHub-style contribution heatmap, 24h hourly activity chart, stats dashboard with period selector and comparison. 3 UI components, 3 API endpoints, web view. | DONE |
| A4 | **Focus mode** | Hides everything except important emails. Full screen. Timer, progress tracking, Cmd+Shift+F shortcut. | DONE |
| A5 | **Quick-reply gestures (mobile)** | Brilliant swipe interactions. Mobile already has the pattern, needs polish. Five-action swipe (reply/snooze/archive/flag/delete), AI quick-reply bottom sheet, web touch+hover version. | DONE |
| A6 | **Drag-to-snooze on mini-calendar** | Drag email to a time slot to snooze. HTML5 DnD + touch long-press, mini-calendar drop zones, time slot picker, quick presets, keyboard S shortcut, undo support. | DONE |
| A7 | **Inbox zero rituals (gamification)** | Streaks, achievements (optional). DB schema (user_streaks, user_achievements, daily_stats), 6 API endpoints, 6 React components (celebration, streak counter, achievement badge/panel, weekly stats, toggle). Respects prefers-reduced-motion. | DONE |

### TIER B — POWER FEATURES COMPETITORS DON'T HAVE

| # | Feature | Why It Wins | Status |
|---|---|---|---|
| B1 | **Programmable email (TypeScript snippets)** | Apps Script but better, type-safe, runs on every email. Sandboxed snippet runner, 8 API endpoints, DB-persisted scripts + run history, 8 templates, ScriptEditor UI, EmailScriptManager page. | DONE |
| B2 | **Email-as-database (SQL over inbox)** | Treat your inbox as a queryable dataset. NL + SQL-like query engine via Claude Haiku, 6 API endpoints, Drizzle schemas (saved_queries, query_history), split-pane console UI, CSV export, query history + saved queries sidebar. | DONE |
| B3 | **AI unsubscribe agent (browser automation)** | One click → AI navigates the unsubscribe page → confirms. | DONE |
| B4 | **Auto-translation badges** | "Translated from Spanish" badge with toggle to original. | DONE |
| B5 | **Real-time sender verification** | Check sender reputation, business legitimacy, recent news inline. SPF/DKIM/DMARC, DNS auth records, WHOIS domain age, typosquatting detection, trust badges. | DONE |
| B6 | **Phishing protection with explainer** | "This email is suspicious because..." AI-powered multi-signal analysis, urgency/credential harvesting/URL mismatch/lookalike/homograph/attachment detection, Claude Sonnet explainer, one-click report. | DONE |
| B7 | **AI calendar slot suggestions in compose** | Type "let's meet next week" → AI suggests slots inline. | DONE |
| B8 | **Voice-to-voice replies** | Voice messages as attachments + auto-transcription for recipient. Whisper transcription, inline HTML player, waveform viz, playback speed, keyboard-accessible recorder + player. | DONE |

### TIER C — POLISH & TRUST (REQUIRED FOR LAUNCH)

| # | Feature | Why It Wins | Status |
|---|---|---|---|
| C1 | **Status page** | status.alecrae.com showing uptime | DONE |
| C2 | **Public API docs site** | docs.alecrae.com — 22 pages, full endpoint ref, code examples, search | DONE |
| C3 | **Admin console SSO** | SAML for enterprise sales | DONE |
| C4 | **SOC 2 Type I → Type II** | Required for enterprise | NOT STARTED |
| C5 | **GDPR DPA template** | Legal pages exist, need DPA workflow | NOT STARTED |
| C6 | **Bug bounty program** | HackerOne or Intigriti | NOT STARTED |
| C7 | **Public roadmap** | Trello/Linear public board | NOT STARTED |
| C8 | **Changelog page** | changelog.alecrae.com | DONE |
| C9 | **Migration guides** | "From Gmail to AlecRae in 5 minutes" | DONE |
| C10 | **Spell check (multi-language)** | Native browser spell-check + custom dictionary | DONE |

---

## 🥊 COMPETITIVE POSITION SNAPSHOT (Locked from 2026-04-05)

### Where AlecRae already wins (no competitor matches us)
1. **Multi-account unified AI** — Gmail + Outlook + IMAP under one AI layer
2. **Free built-in grammar** — Replaces $12-30/mo Grammarly
3. **Email-aware dictation** — Replaces dead Dragon (no replacement exists)
4. **35+ language bidirectional translation** — Compose-side, not just receive
5. **True email recall** — Link-based with revoke (Outlook's is theater)
6. **Voice profile that learns YOU** — Generic AI is for everyone else
7. **Built-in shared inboxes** — Replaces Front ($19-59/user/mo)
8. **AI commitments tracker** — Nobody has this
9. **Smart inbox + screener** — Hey.com-style but AI-powered
10. **Sub-100ms inbox** — Local-first with IndexedDB
11. **One subscription for all the above** — $9 vs $100+ stack
12. **No ads, no tracking, no data mining** — Architectural, not policy

### What we cost vs the competitor stack
| Tool replaced | Their price | AlecRae's price |
|---|---|---|
| Gmail Workspace + Gemini | $12-30/mo | included |
| Grammarly Premium | $12-30/mo | included |
| Dragon Professional | $500+ (dead) | included |
| Front (per user) | $19-59/mo | included |
| Superhuman | $30/mo | included |
| Proton Mail | $5-10/mo | included |
| Otter.ai | $10/mo | included |
| **TOTAL competitor stack** | **~$100+/mo** | **$9/mo** |

### Where we're behind (acknowledge to fix)
- **Brand trust** — They have 1.8B+ users; we have 0
- **Battle-tested at scale** — Untested under production load
- **Mobile app polish** — Scaffolded, not yet polished
- **Calendar/contacts as products** — Ours are integrations
- **Marketing presence** — Zero, by design until launch

### The tech advantage that compounds
| Their Tech | AlecRae's Tech | Our Edge |
|---|---|---|
| React + reconciliation | SolidJS + signals (planned migration) | 3-5x faster UI |
| Server-side AI only | Client GPU + Edge + Cloud (3-tier) | $0 inference + lower latency |
| Monolith architecture | Edge-first microservices | Sub-50ms globally |
| Bolt-on AI | AI-native every layer | Compounding intelligence |
| Generic AI | Voice profile + grammar agent | Personal, not robotic |
| No dictation | Dragon-killer dictation engine | Multi-language voice |
| Basic search | Meilisearch + semantic vectors (planned) | Find by meaning |

---

## 📋 CURRENT BUILD COMPLETENESS (Updated 2026-04-18)

| Component | Status | % |
|---|---|---|
| Backend (API + MTA) | Production-ready | 100% |
| Web app (Coming Soon landing) | Production-ready, builds clean | 100% |
| Web app (full inbox UI) | Built, needs backend live | 95% |
| Desktop app (Electron) | Polished — native menus, tray, IPC, builds clean | 95% |
| Mobile app (RN/Expo) | Polished — all screens, auth, API, accessibility | 90% |
| Auth flow (frontend) | Passkey login/register wired with WebAuthn | 100% |
| Admin SSO (SAML) | Complete — SP metadata, ACS, SLO, admin login | 100% |
| DB schemas | All stores on Drizzle (55 schema files) | 100% |
| Stripe billing flow | Backend done, frontend wired | 95% |
| Cloudflare deployment configs | Ready | 100% |
| Vercel deployment | Configured, deploying from main | 100% |
| Neon SQL setup | Ready | 100% |
| CLAUDE.md Bible | Complete | 100% |
| **Tier S features (industry firsts)** | **S1-S10 done (10/10)** | **100%** |
| **Tier A features (cutting-edge UX)** | **A1-A7 done (7/7)** | **100%** |
| **Tier B features (power user)** | **B1-B8 done (8/8)** | **100%** |
| **Tier C features (polish + trust)** | **C1+C2+C3+C8+C9+C10 done (6/10)** | **60%** |
| **Tier 5 features (table stakes expansion)** | **20/20 done** | **100%** |
| **Tier 6 features (AI-powered platform)** | **9/9 done** | **100%** |
| **Tier 7 features (advanced intelligence)** | **6/6 done** | **100%** |
| **Tier 8 features (deep AI intelligence)** | **6/6 done** | **100%** |

**Overall: ~99% of launch-ready product. All code features complete (84 features, 90 routes, 61 schemas, 290+ endpoints). Remaining: Craig infra setup (Neon/Upstash/Stripe/DNS/API keys) + C4/C5/C6/C7 (compliance/legal — not code tasks).**

---

