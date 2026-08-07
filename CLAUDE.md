# ALECRAE — THE BIBLE

> **This document is the single source of truth for AlecRae.**
> **Read it FIRST. Reference it ALWAYS. Violate it NEVER.**
>
> This is an **operating doc, not a history ledger.** Detailed histories of fixed issues and past
> sessions live in `docs/archive/` (see Ground-Truth Sources below). Keep this file lean — see
> the Doc Hygiene rule.

---

## ⚡ THE PRIME DIRECTIVE

**AlecRae kills Gmail. AlecRae kills Outlook. AlecRae kills Superhuman.** Email has not been
reinvented since 2004; we are the reinvention. The standard: 80–90% ahead of every competitor at
all times. One subscription, every account, every device, AI in every layer. No ads, no data
mining, no bloat, no compromise. **We dominate or we die — there is no second place.**

Every feature must answer: *"Why would someone switch from Gmail/Outlook for this?"* If the answer
isn't compelling, don't build it. If it is, build it 10x better.

---

## 📖 THE BIBLE RULE

Before ANY new build, refactor, or significant change — read this file first. It is read at the
start of every session, referenced before every architectural decision, and updated at the end of
every session. No scatter-gun. No drift. No "just this once."

### 🕒 The Timestamp Rule
Every doc file (`CLAUDE.md`, `docs/**`, READMEs, ADRs, runbooks) touched in a change must have its
`Last updated:` line refreshed in the same change, format `YYYY-MM-DD HH:MM UTC`. Enforced in CI:
`bun run docs:check` gates every push/PR; `bun run docs:fix` stamps/normalizes.

### 🧹 The Doc Hygiene Rule (added 2026-08-07)
This file stays small so every session can actually read it end to end:
- **Known Issues holds OPEN items only**, one row each, a few lines max. When an issue is fixed,
  move its full row (with the fix note) to the current `docs/archive/claude-bible-archive-*.md`
  in the same commit and leave only the number + one-line closure here if cross-referenced.
- **Session narratives go to the archive**, not here. This file records *current state* — what is
  live, what is open, what is next — never the story of how we got there.
- Deep forensics belong in the issue's archive row, a postmortem, or an audit doc — link, don't inline.
- If this file exceeds ~500 lines, the next session's first task is to re-archive.

---

## 👑 THE BOSS RULE — CRAIG MUST AUTHORIZE

Explicit authorization from Craig BEFORE execution for:

1. Major architectural changes (frameworks, core stack, data model)
2. New dependencies outside the approved stack
3. Pricing changes
4. Domain or DNS changes (alecrae.com + subdomains)
5. Production deployments (first-time and rollbacks)
6. Stripe configuration
7. Schema migrations on production database
8. External API integrations (new third-party services)
9. Brand/marketing changes (landing copy, logos, taglines)
10. Anything touching money, users' data, or public-facing communication

**When in doubt, ask Craig.** Cost of asking = 30 seconds; cost of acting wrong = days of damage.
**The exception:** continuous building within the existing build plan and stack is pre-authorized —
routine code, bug fixes, refactors, committing/pushing to development branches.

---

## 🔥 THE STACK (approved — Boss Rule #2 gates anything else)

**Backend:** Bun · Hono · TypeScript strict · tRPC + REST + OpenAPI · Drizzle · Zod
**Frontend:** Next.js 15 App Router · custom design system + Radix · Tailwind · Signals + TanStack
Query · Tiptap · Motion · Turbopack
**AI:** Claude primary (Haiku default / Sonnet Pro / Opus Enterprise) · Whisper (ASR) ·
Transformers.js/WebLLM (local GPU) · Voyage (embeddings, when added)
**Data:** Postgres (Drizzle; prod = local PG16 on Jarvis, 151 tables) · Redis (BullMQ; prod = local
on Jarvis) · Meilisearch · Vapron Object Storage · IndexedDB (local-first cache) · ClickHouse (later)
**Infra:** Jarvis box (66.42.121.161, systemd + Coolify/Traefik) · mail box 149.28.119.158 ·
Cloudflare DNS · GitHub Actions · OTel → Grafana (aspirational, nothing alerts today — #72)
**Auth/Security:** Passkeys/WebAuthn · Google/Microsoft OAuth · jose JWT · Web Crypto
(RSA-OAEP-4096 + AES-256-GCM) · TLS 1.3 min
**Payments:** Stripe. **Desktop/Mobile:** Electron→Tauri · React Native + Expo · PWA.

**Actual-vs-aspirational (verified):** Linter is **ESLint + Prettier**, not Biome. Prod
cache/queue is **local Redis** on Jarvis (Upstash serverless is aspiration; nothing reads
`UPSTASH_REDIS_REST_*`). Neon/Cloudflare-Workers rows are aspiration; prod runs on the boxes.
Vapron email/AI/storage client uses the documented REST transport (#83); Vapron **DNS** methods
remain on an unverified guessed transport — do not trust auto-config until #83's DNS half is fixed.

**Architecture principles:** local-first (IndexedDB cache, optimistic UI, offline), edge-first
where possible, AI-native in every layer, ZERO raw HTML in app code (components only, Zod schema
per component, Server Components by default).

---

## 🛡️ THE QUALITY BAR

**Performance budgets (CI-relevant):** FCP <1.0s · LCP <1.5s · TTI <2.0s · inbox cached <100ms /
cold <1.5s · search <50ms local / <200ms server · API p99 <50ms edge / <200ms cloud · AI <200ms
client / <500ms edge / <2s cloud · initial JS <100KB · send time-to-delivered <2s.

**Code standards — no exceptions:** TS strict + `noUncheckedIndexedAccess`; no `any`, no
`@ts-ignore`, no `as unknown as X`; explicit return types; Zod at every boundary; typed error
handling (Result types preferred); conventional commits; OpenAPI for public APIs; integration
tests for endpoints; accessible (WCAG 2.2 AA min, full keyboard nav, 44px touch targets).

**AI integration rules:** every AI call has a fallback; decisions logged/auditable; confidence
scores on classifications; degraded results carry `degraded: true` and callers must read it;
destructive AI actions require human approval; prompt-injection framing on every Claude call.

**Security requirements:** no secrets in code; TLS 1.3; rate limiting on every public endpoint —
one deliberate exception: `/t/*` is throttled per email id, not per IP (`lib/tracking-throttle.ts`,
#147), because provider image proxies make per-IP limits an engagement-data outage; Zod input
validation everywhere; CSP + HSTS; dependency audits (`scripts/check-dependency-audit.ts` blocks
unreviewed criticals — #161); no third-party trackers.

---

## ❌ THE FORBIDDEN LIST — NEVER, WITHOUT EXCEPTION

1. Never write raw HTML in app code — components only.
2. Never use `any` — use `unknown` and narrow.
3. Never use `@ts-ignore` — fix the type.
4. Never commit secrets — env vars only.
5. Never skip tests for "speed" — untested code does not exist.
6. Never use external JS trackers.
7. Never sell user data. Period. This is the moat.
8. Never show ads in the client.
9. Never break the local cache contract — reads from cache must always return.
10. Never deploy to production without Craig's authorization.
11. Never modify Stripe configuration without Craig's authorization.
12. Never add a dependency outside the approved stack without Craig's authorization.
13. Never delete user data without explicit user action AND a 30-day soft-delete window.
14. Never ship an inaccessible feature — if a screen reader can't use it, it's broken.
15. Never use `localStorage` for sensitive data — IndexedDB with encryption only.
16. Never trust user input — validate everything with Zod.
17. Never block on a single AI provider — always a fallback path.
18. Never let an error bubble unhandled to the user — wrap, log, recover, retry.
19. Never silently fail — errors are visible to monitoring.
20. Never ship a feature without a CLAUDE.md update.
21. Never approve a PR you didn't read end-to-end.
22. Never use "Vienna" or "Emailed" in user-facing copy.
23. Never refer to competitors by name in marketing.
24. Never make up user metrics for marketing.
25. Never let speed be an excuse for sloppiness.

---

## 📋 CHECKLISTS

**Pre-flight (before new code):** read the relevant CLAUDE.md section → task is in the build plan →
doesn't need Craig → follow existing patterns → deps are approved → know the perf budget +
accessibility bar → identify tests + wiring needed → plan the commit message.

**Post-build (before committing):** `bun run test` · `bun run typecheck` · `bun run lint` ·
`bun run build` all green → no `any`/`@ts-ignore`/`console.log` → new endpoints registered in
server.ts with rate limiting + auth → schemas exported from `packages/db/src/index.ts` →
CLAUDE.md updated → conventional commit → keyboard nav works.

**Session protocol:** START — read this file, check Known Issues + Next Actions, confirm alignment.
END — update Build Status / Known Issues / Next Actions, refresh `Last updated`, run
`bun run docs:check`, commit + push, leave the codebase runnable.

---

## 🚨 EMERGENCY PROTOCOLS

**Outage:** roll back to last good commit → notify Craig immediately → postmortem within 24h to
`docs/postmortems/` → add a regression test.
**Security incident:** revoke compromised credentials immediately → notify Craig within 15 min →
rotate ALL tangentially-related secrets (note: rotating `JWT_SECRET` breaks stored OAuth-token and
DKIM-key decryption — plan for reconnection/re-keying, see #160's module docs) → audit-log review →
notify affected users within 72h (GDPR) → postmortem.
**Data loss:** stop writes → restore from backup (PITR) → notify Craig + users → verify integrity
before resuming → postmortem.
**Cost overrun:** AI spend 10x normal auto-throttles to free-tier limits; infra spikes alert Craig;
budget alerts on every paid service.

---

## 💰 PRICING (LOCKED — CRAIG ONLY)

**Consumer:** Free $0 (1 account, 5 composes/day, 30-day search) · Personal $9 (3 accounts, full
AI, E2EE, snooze, schedule send) · Pro $19 (unlimited accounts, Sonnet AI, team features, API,
analytics) · Team $12/user (shared inboxes, admin, audit, SSO) · Enterprise custom (on-prem,
compliance, SLA, Opus).

**Business email (approved 2026-06-11, own-domain mailboxes; localized price points, Stripe Tax):**

| Per user/mo | Business | Business Plus |
|---|---|---|
| NZD (incl. GST) | $25 | $45 |
| AUD (incl. GST) | $22 | $39 |
| GBP (+VAT) | £15 | £28 |
| EUR (+VAT) | €16 | €30 |
| USD | $16 | $30 |
| CAD (+tax) | $22 | $42 |

Business = mailboxes on your domain, full AI, shared inboxes, admin, SSO, migration. Plus =
priority AI, compliance/eDiscovery, larger storage, unlimited accounts, dedicated support.
Billing wiring pending (currency-aware price per tier). Add-ons and revenue targets: see archive.

---

## 🌐 DOMAINS & PRODUCTION STATE (verified 2026-08-06)

**Production = Jarvis box `66.42.121.161`** (Tailscale SSH `ssh root@jarvis`). Coolify/Traefik owns
80/443 (`/data/coolify/proxy/dynamic/alecrae.yaml`); systemd `alecrae-api` :4100 + `alecrae-web`
:4200; env in `/opt/alecrae/.env` — **Bun auto-loads it and it silently overrides systemd env; never
set the same var in both.** Mail box `149.28.119.158` is dedicated for mail (port 25 unblocked, PTR
`smtp.alecrae.com`, SPF done — Phase 0 DNS complete).

- alecrae.com / mail.alecrae.com / api.alecrae.com — ✅ live on Jarvis
- mx1/mx2/smtp/bounce/_spf/_dmarc records — ✅ published (mail plan Phase 0)
- status.alecrae.com — ❌ 503, nothing deployed (#71) · docs.alecrae.com — not set up
- **Live code: `f9d1528` deployed 2026-08-06** (the full #120–#163 audit campaign). DB at
  migration 0011, 151 tables. `/v1/health` reports `degraded` **correctly**: `alecrae-mta` is
  stopped (deliberate, #105) and Meilisearch is down (predates deploy).
- **Not running anywhere:** `services/mta` (stopped since the #105 open-relay incident — restart is
  Craig's call; relay control #127 + receiver-off-default #128 have since landed) and
  `services/inbound` (never deployed; it IS a complete, bootable receive pipeline — the
  "placeholder inbound" warning was about the MTA's removed duplicate, not this service).

**Deploy ritual ("deployed" = merged to main AND pulled+built on the box):**
`ssh root@jarvis` → `cd /opt/alecrae && git pull --ff-only origin main && bun install &&
bun run -C packages/db build && bun run db:migrate` (or `scripts/box-deploy.sh`) →
`sudo systemctl restart alecrae-api alecrae-web` → `curl https://api.alecrae.com/health`.
Never commit on the box; if `--ff-only` refuses, stop and reconcile (that's the #78 drift signal —
drift + service/port checks self-report via `/v1/health` on 15-min timers).

**Deployment gates (production):** all tests + typecheck + lint + build green · e2e vs staging ·
perf budgets · accessibility · security scans · migrations tested on staging · rollback plan ·
**Craig's authorization** · status page updated · on-call for 2h.
**Branch workflow:** main is protected — branch → PR → 4 required checks green → merge. Direct
push to main only via admin bypass (emergencies).

---

## 🎨 BRAND & COPY

**AlecRae** (exact capitalization). Tagline: "Email, Evolved." Tone: confident, sharp, human, no
buzzwords. Never claim features we don't have; never invent numbers; be specific with proof.
Colors/logo TBD (Craig). Marketing phases + competitive positioning: see archive.

---

## 📚 GROUND-TRUTH SOURCES — which doc is authoritative for what

| Question | Authoritative source |
|---|---|
| Live infra state, box, outages | `DEVOPS_TRACKER.md` |
| Backend↔UI wiring coverage (heuristic) | `docs/audits/route-coverage.md` (generated — never hand-edit) |
| **Does a feature work end-to-end right now** | `docs/audits/2026-07-22-full-journey-audit.md` (49 journeys; trust it over "FIXED" claims for what it covers; re-run periodically) |
| Mail architecture + multi-platform plan | `docs/infra/multi-platform-mail-plan.md` |
| Incident history | `docs/postmortems/` |
| **Fixed-issue history #120–#163 + session narratives through 2026-08-06** | `docs/archive/claude-bible-archive-2026-08-07.md` |
| Historical build detail, tiers, issues #1–#57 | `docs/archive/claude-bible-archive-2026-07-13.md` + git history |
| Business-email onboarding runbook | `docs/infra/business-email-domain-onboarding.md` |
| Shared-Redis bring-up (MTA prerequisite) | `docs/infra/redis-tailnet-setup.md` |

**Build status, honestly:** 84 features / ~681 endpoints / 151 tables are code-complete; that is
NOT the same as reachable or working. ~75%+ of endpoints have UI. The 2026-07-22 journey audit's
seven broken journeys are all closed. The 2026-08-07 spine audit re-verified the send chain
end-to-end (contracts match, controls wired) and fixed the receive chain's six breaks (#164) —
and surfaced a fresh batch of ~16 fabricated-output sites (the earlier "fabricated count is 0"
claim was wrong outside the 49 audited journeys) — **all fixed 2026-08-08** (#166, archive): real
implementations where the data existed, honest 501s elsewhere, UIs updated. Email send/receive is
code-ready but **not operational** — bring-up is the critical path (see Next Actions).

---

## 🔧 KNOWN ISSUES — OPEN ONLY

> One row per issue. Full history and fix notes for everything closed: `docs/archive/`.
> When you fix one of these, move the row + fix note to the archive in the same commit.

| # | Issue | Sev |
|---|-------|-----|
| 29 | ~8 backend stubs remain: documents ai-assist; search-intelligence suggestions/trending/related; attachment OCR; contact-enrichment (domain-only); contacts-extended insights; delegation inbox. (files/voice-storage/rule-test/virus-scan halves are fixed — archive.) | MED |
| 30 | Thin executable API test coverage overall; see also #143. | MED |
| 59 | Old `.env.production`/`.env.test` contents still in git history — rotation of any ever-real values unconfirmed. | HIGH |
| 61 | Inline markdown parsing unimplemented in `packages/email-parser/src/document-model.ts` (bold/italic/link/code). | LOW |
| 62 | MTA `/metrics` returns placeholder 404 instead of OTel export. | LOW |
| 69 | 14 orphaned web components never imported by any page — wire or delete (list in archive). | MED |
| 71 | `status.alecrae.com` 503 — no status app deployed. | LOW |
| 72 | No staging environment + no alerting (outages have run days unnoticed). Blocks anomaly-alerting halves of other issues. Needs its own design session. | HIGH |
| 73 | Residual tranche-1 report-only items: (b) synthetic meet eventId, (c) `meet.alecrae.com` unserved, (d) global room-slug uniqueness oracle, (h) sender-reputation threat counts, (j) analytics goals never auto-sync. | MED |
| 74 | Residual tranche-2 items: (d) context-intelligence hardcoded confidence / naive promisor / 25 serial Claude calls per batch, (e) notification-evaluate mutates state + ignores senderVip/labels conditions, (g) writeRateLimit applied to reads. | MED |
| 76 | Residual tranche-4 items: (f) signature context auto-switch stored but never consumed, (h) no "list recalls" endpoint, (i) programs/scripts conceptual overlap. | LOW |
| 77 | Residual tranche-5 items: (c) push `/test` stub (no server VAPID key), (e) SSO PUT requires re-pasting full certificate. | LOW |
| 81 | `OWNER_EMAILS` not set on the box — founder allowlist runs on hardcoded default. | LOW |
| 82 | (c) Google Postmaster Tools + (d) Microsoft SNDS credentials — **Craig-only**. | HIGH |
| 83 | Vapron **DNS** auto-config still on guessed/unverified transport — needs real Vapron DNS API docs from Craig; do not re-guess. | HIGH |
| 103 | Integrations (Zapier/Make/n8n) + Programs advertise `email.received` triggers with **no dispatcher** — CRUD-only theater; also SDK event-name convention mismatch. Needs its own session + safety pass (user TS on real mail). | HIGH |
| 110 | Web session tokens (incl. 7-day refresh) in `localStorage`; desktop has zero keychain integration. Architectural — httpOnly-cookie session redesign. | HIGH |
| 112 | Firewall/SSH-hardening-as-code missing (live-box state invisible to review). Service/port drift half is fixed. | MED |
| 114 | HTML email rendering pipeline (SEDM) fully built, fully unused — the moment it's wired, XSS/pixel/CID/CSS isolation all go live at once. **Design as one piece before shipping; no groundwork exists** (no sanitizer, no iframe isolation, no image proxy). | HIGH |
| 115 | (a) IndexedDB corruption/eviction unhandled + two parallel cache DBs; (b) DB restore never drilled (BCP doc has placeholders); (d) no proactive E2EE key backup/export flow. | HIGH |
| 116 | (b) No multi-currency handling in billing.ts (blocks business-plan billing); (d) **no GDPR export / right-to-be-forgotten self-service** — highest-priority remaining compliance gap. | HIGH |
| 122 | `/v1/sso/config` gated on admin role but no `requirePlan` — Free-tier admin can configure SSO. Revenue-policy decision, not a security hole. | LOW |
| 126 | Connected-account (Gmail/Outlook) send path: unsubscribe suppression + per-account quota deliberately unapplied — product/billing decisions (Boss Rule #10). | MED |
| 129 | Real encrypt-on-send / decrypt-on-read E2EE pipeline — scoped project (key discovery, MIME encryption, search/AI implications). The fabricated claims are gone; the feature honestly says "not encrypted yet". | MED |
| 132 | Automation dispatcher for the 11 "runs on new mail" features — needs opt-in schema + cost model, **Craig's call** (Boss Rules #7/#10); must not fan out per-message AI calls (#130's lesson). | MED |
| 143 | The 7-file e2e suite executes nowhere — needs a CI job booting Postgres + Redis + API, plus fixtures. Honest executing-e2e coverage today: 0 endpoints. | MED |
| 146 | Five undeployed services (`analytics`, `collab`, `jmap`, `sentinel`, `support`) need keep-or-delete (Craig); `collab.alecrae.com` documented but unresolved. | LOW |
| 154 | Mailto unsubscribe: fails honestly now, but the real fix needs account + verified-domain context threaded into `executeOption`, `from` validated against owned domains, and the pre-send gate. | MED |
| 156a | `POST /v1/auth/register` grants **owner** to every signup — the privilege half of the fixed RCE; needs Craig's review. | HIGH |
| 158a | Whether to configure `VIRUSTOTAL_API_KEY` (free tier shares customer samples — confidentiality/GDPR call) — **Craig**. | DEC |
| 167 | **Dead/duplicate spine modules — adopt or delete (some are Craig scope calls):** `EmailQueueManager` (360-line parallel queue impl, zero callers), `FeedbackLoopProcessor` (FBL subscription state machine, not even barrel-exported), DNS cluster (`AuthoritativeDnsServer`, `DnsRecordManager`, `DnsHealthMonitor`, `DnsPropagationChecker` — all dead), `retry-policy.ts` (bounce-class-aware 72h retry curve, test-only — worker uses generic BullMQ retries instead), `fbl-parser.ts` (full RFC 5965 parser test-only while `routes/fbl.ts` runs a weaker inline copy that misclassifies `not-spam`/`opt-out` as abuse), MTA `telemetry.ts` (DKIM-failure/queue-depth metrics never recorded), `warmup.ts` cap functions (re-implemented in warmup-gate), `ReputationEngine`. Postmaster/SNDS timers exist only as copy-paste shell in a runbook — nothing installs them. | MED |
| 168 | **No real TLS on the mail path.** Inbound STARTTLS is now honestly absent (was fabricated — advertised + acked with no handshake, #164) so received mail transits plaintext; needs a certificate on the mail box (ACME task) + a genuine `tls.TLSSocket` upgrade. MTA outbound TLS cert is the same pending box task (#107 wired the manager; no cert exists). | HIGH |
| 169 | **API-side half only (events + webhooks FIXED 2026-08-08, PR #95):** mail received via our own MX now emits `email.received` events + webhooks, but still gets no AI triage, no user rules, no semantic indexing — those live API-side (`storeReceivedEmail`) and need a design for how inbound reaches them (mind #130's spend guard). | MED |
| 170 | **Spine-audit residuals:** warm-up gate's Redis connection never closed on worker stop; `postgres-store.resolveDomainId` auto-creates `domains` rows on lookup miss (policy question); catch-all routing dead for DB-resolved domains (`catchAllMailbox` never populated; falls through to a sentinel `"inbox"` mailboxId); inbound AV filter stage matches EICAR only with unscanned indistinguishable from clean; HTTP-ingest reject bodies include `verdict.reason` (authenticated-only, low); `packages/crypto/src/encryption.ts` produces placeholder S/MIME/PGP envelopes; IMAP mailbox state is a process-local Map + JMAP threading no-ops (both services undeployed); `emails.source` backfill for pre-existing rows not done (new rows only); calendar `/today` field named `aiAgenda` for a template sentence (content honest, name overclaims — rename pass); context-intelligence hardcodes `isExplicit: true` on every deadline (schema doc says false = AI-inferred — needs an extractor prompt change). | LOW-MED |

---

## ⏳ WAITING ON CRAIG — business email cannot work without 1–4

1. **Tailnet Redis** executed on the boxes before the MTA ever starts (#149,
   `docs/infra/redis-tailnet-setup.md`) — otherwise every send silently vanishes.
2. **Deploy `services/inbound`** on the mail box (port 25 + ufw) — receiving is most of what
   business email means. Runbook: `docs/infra/business-email-domain-onboarding.md`.
3. **Per-platform DNS** (MX/SPF/DKIM/DMARC/bounce per domain) — auto-config broken (#83), so
   manual; `GET /v1/domains/:id/dns` prints exactly what to paste.
4. One TXT in the alecrae.com zone: `*._report._dmarc` → `v=DMARC1` (#148,
   `docs/infra/dns-zone-alecrae.md` §5a) — without it no customer DMARC reports are ever sent.
5. Vapron DNS API docs (#83) · Postmaster/SNDS credentials (#82) · Stripe live keys + webhook ·
   Google OAuth test users (console step, documented in `docs/infra/morning-setup.md`) · disable
   GitHub Default-Setup CodeQL.
6. **Decisions:** restart MTA (#105) · #152 marketing-vs-correspondence classification as policy ·
   dispatcher opt-in schema (#132) · keep-or-delete five services (#146) · register-grants-owner
   (#156a) · VirusTotal key (#158a).
7. **Landing-page + legal copy (Boss Rule #9/#10, biggest trust/legal exposure):** site sells E2EE/
   zero-knowledge the code doesn't do, "tracked automatically" features that don't run, names
   competitors, legal pages name an unverifiable "AlecRae, Inc., San Francisco", claim AWS/Hetzner
   infra, and commit to a 99.99% SLA nothing supports. ~12 false/inoperable claims logged in the
   archive (2026-08-05 live-site audit). Needs Craig's copy/legal pass before real traffic.

---

## 🗓️ NEXT ACTIONS — IN ORDER (business email is the driving priority)

Craig's goal (2026-08-04): each of his platforms (Zoobicon, BookARide, DavenRoe, Gluecron, Verom,
Dominat8, …) gets an organisation with business email on its own domain. Critical path = **send AND
receive on customer domains**, not the general backlog.

1. **Send/receive smoke test against a real domain** once Craig's box steps (Waiting 1–4) are done —
   nothing in this repo can prove the loop end to end. Includes SPF/DKIM/DMARC pass into Gmail.
2. **#168** real TLS on the receive path (needs cert — Craig's box task) and the API-side half of
   **#169** (AI triage/rules/indexing for MX-received mail; events + webhooks are DONE, PR #95).
3. **#154** real mailto-unsubscribe fix (shape above).
4. **#116(d)** GDPR export/erasure — highest remaining compliance gap.
5. **#110** token storage · **#114** HTML rendering (design-first) ·
   **#115(a)(b)(d)** · **#116(b)** multi-currency.
6. Backlog: #167 dead-module adopt-or-delete · #103 dispatcher session · #29 remaining stubs ·
   #69 orphan components · #72 staging/alerting design session · #170 residuals · flywheel builds
   (F4→F1→F2→F3, table in archive: instrument the AI flywheel, make it visible, tie to referrals,
   then network effects).

---

## 🧭 PRODUCT DECISIONS LOG

| Date | Decision |
|---|---|
| 2026-07-01 | Native IMAP not required for launch — OAuth sync is the path (#58). |
| 2026-07-01 | First users: general beta, no vertical. |
| 2026-07-03 | Multi-workspace via `workspace_members`; active accountId chosen at login/switch — downstream stays scoped by `auth.accountId`. |
| 2026-07-13 | Mail stays on the 158 box (dedicated sending IP, port 25 unblocked, PTR/SPF done); Jarvis keeps web/api. |
| 2026-07-20 | Branch protection on main: PR + 4 required checks; admin bypass left open (Craig). |
| 2026-07-29 | Redis bound to the tailnet, shared by both boxes, with `requirepass` (#149) — over hosted Redis or moving the MTA. |
| 2026-08-04 | Business email on own domains is the driving priority. |

**ADRs** (`docs/adrs/`): Neon over Supabase · Cloudflare over Vercel · Bun over Node ·
Hono over Express · Tailwind over CSS-in-JS · Drizzle over Prisma · Claude over GPT.

---

## 🧠 STANDING LESSONS — how to find what matters (keep these; they keep paying)

1. **Verify before trusting any status claim, in both directions.** Recorded "FIXED" rows have been
   wrong repeatedly (#105's relay was never closed; #98/#73i incomplete) and "open" rows were
   already fixed (#76d). A wrong doc note caused a real bug (#8 → Drafts built on the wrong enum).
2. **The mock is the blind spot.** #152 (every ordinary send 422'd) sat under a green suite because
   the test mocked `ComplianceEngine`. Same shape: #131 (mocked `requireScope` hides wiring gaps),
   #120 (green typecheck, suite never ran). Where a test mocks a collaborator, it has stopped
   testing what that collaborator does — run the real thing at least once for load-bearing paths.
3. **Ask structural questions instead of re-reading files.** The biggest finds came from "who
   enqueues onto the send queue?" (#151), "who mounts a router without auth?" (#131), "who imports
   this module?" (#125, #139, #159a — fully-built code with zero callers is a recurring class).
4. **Built ≠ wired ≠ running.** A complete, tested module with no production caller protects
   nothing. Map importers; enforce wiring with structural tests (`route-auth-coverage`,
   `route-header-paths`, `scripts-execution-disabled` are the pattern).
5. **Honest degradation over fabrication, always.** Never invent a verdict, score, or success
   (#141, #84, #95, #163, #158). Unscanned ≠ clean; not-sent ≠ sent. Prefer 501/`degraded: true`
   and make callers read it.
6. **Choose the fail direction deliberately and pin it with tests.** Relay control fails closed
   (#127); DKIM holds rather than bounces (#144); quota fails open behind a circuit breaker.
   State *why* in the code; a test should pin the default posture.
7. **Don't duplicate a security boundary.** The second copy is the one that stays vulnerable
   (#124's second header builder, #160's second crypto path). Extract and share.
8. **Don't half-build.** If a real fix needs a schema migration, a product decision, or a new
   dependency, log it for Craig rather than shipping a partial that lies (#132, #129, #154).
9. **One shared helper beats N re-implementations** — keyset cursors, pre-send gate, secret-box,
   header-safety all became correct only when centralized.
10. **Externalize history.** This file's job is current truth; the archive's job is memory. A doc
    nobody can read end-to-end protects nobody.

---

## 🎯 CRAIG'S ACCOUNTS

✅ Apple Developer · ✅ alecrae.com · ⏳ Google Play · ⏳ Stripe live · ⏳ Anthropic API key (prod) ·
⏳ OpenAI key (Whisper) · ⏳ Google Cloud project (Gmail OAuth — test users step pending) ·
⏳ Azure project (Outlook OAuth).

**Bigger picture:** Craig is also building a Render+Vercel+AI hybrid platform; AlecRae is both a
standalone revenue product and the flagship reference app for it. Build with discipline — AlecRae
must deploy today without the platform, and migrate later with zero rewrites.

---

## ⚖️ THE BIBLE RULE (REPRISE)

If something contradicts this file, this file wins. If you don't know what to do, this file tells
you. Changing this file needs Craig's approval. Shipping something not in this file breaks the
rules. **AlecRae dominates or AlecRae dies. There is no second place.**

**Last updated:** 2026-08-08 00:15 UTC
