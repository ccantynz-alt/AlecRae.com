# ALECRAE — THE BIBLE

> **This document is the single source of truth for AlecRae.**
> **Read it FIRST. Reference it ALWAYS. Violate it NEVER.**

---

## ⚡ THE PRIME DIRECTIVE

**AlecRae kills Gmail. AlecRae kills Outlook. AlecRae kills Superhuman.**

Email has not been reinvented since 2004. We are the reinvention. There is no second place. We dominate or we die. Every line of code, every component, every decision, every commit must serve this mission.

**The standard:** 80-90% ahead of every competitor at all times. Not 10%. Not 30%. Eighty to ninety percent.

If a competitor closes the gap, we accelerate. If new technology threatens our lead, we absorb it or destroy the need for it. We are not in a race — we are lapping the field.

---

## 📖 THE BIBLE RULE

**Before ANY new build, ANY refactor, ANY significant change — READ THIS FILE FIRST.**

This file is read at the start of every session. It is referenced before every architectural decision. It is updated at the end of every session. No work happens outside the framework defined here.

**No scatter-gun. No drift. No "just this once."** Every action ties back to this document.

### 🕒 THE TIMESTAMP RULE

**Every documentation file carries a full date AND time stamp, kept current.**

- Any doc file (`CLAUDE.md`, `docs/**`, `README`s, ADRs, runbooks) that is touched **must** have its `Last updated:` line refreshed in the same change, in the format `YYYY-MM-DD HH:MM UTC` (date AND time, not date alone).
- Docs are kept current on a **daily cadence** — if you work in a doc, it gets today's stamp. Stale stamps mean stale docs.
- The stamp is applied **on every edit** (when content changes), so the timestamp always reflects a real change — not a meaningless background bump.
- **Enforced in CI:** `bun run docs:check` fails if any doc is missing a valid stamp (the `Docs` workflow gates every push + PR). Run `bun run docs:fix` to stamp/normalize. **Docs stay clean and green at all times.**

---

## 👑 THE BOSS RULE — CRAIG MUST AUTHORIZE

The following actions require **explicit authorization from Craig (the boss/owner) BEFORE execution**:

1. **Major architectural changes** — swapping frameworks, changing core stack, altering data model
2. **New dependencies that aren't already in the approved stack** — we don't add bloat
3. **Pricing changes** — any modification to plans, tiers, or billing logic
4. **Domain or DNS changes** — anything touching alecrae.com or its subdomains
5. **Production deployments** — first-time deploy and any rollback
6. **Stripe configuration** — webhook URLs, price IDs, plan structures
7. **Schema migrations on production database** — irreversible changes need sign-off
8. **External API integrations** — adding new third-party services
9. **Brand/marketing changes** — copy on landing page, logos, taglines
10. **Anything that touches money, users' data, or public-facing communication**

**The rule:** When in doubt, ask Craig. Cost of asking = 30 seconds. Cost of acting wrong = days of damage.

**The exception:** Craig has pre-authorized continuous building of features within the existing build plan and stack. Routine code, bug fixes, refactors within the approved architecture, and committing/pushing to the development branch do NOT require additional authorization.

---

## 🎯 THE MISSION

Build the fastest, smartest, most beautiful, most aggressive email client ever made. One subscription. Every account. Every device. Every language. AI in every layer. No ads. No data mining. No bloat. No compromise.

**The customer sees:** Magic. Speed. Beauty. Their email actually works.
**The competition sees:** A force they cannot match without rebuilding from scratch.
**Craig sees:** Recurring revenue with 85%+ margins on a moat that compounds over time.


---

## 🔥 THE AGGRESSIVE STACK

Every tool here was chosen because it is the **best in its class right now**. If something better emerges, we replace it without sentiment. Loyalty is to the mission, not the tools.

### Backend & Runtime
| Layer | Choice | Why |
|---|---|---|
| **Runtime** | Bun | 52K req/s, 10-20x faster installs, native TS, replaces npm/yarn/pnpm |
| **API Framework** | Hono | 4x faster than Express, runs everywhere, RegExpRouter is the fastest JS router |
| **Type Safety** | TypeScript strict mode | No `any`, no `@ts-ignore`, no exceptions |
| **API Layer** | tRPC + REST + OpenAPI | Type-safe end-to-end, no codegen, no drift |
| **ORM** | Drizzle | 7.4KB bundle, SQL-like TS, optimal for serverless cold starts |
| **Validation** | Zod | Schema validation at every boundary |

### Frontend & UI
| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | RSC, streaming, deployment to Cloudflare Pages |
| **Language** | TypeScript strict | Same rules as backend |
| **Components** | Custom design system + Radix primitives | Accessible, themeable, ZERO HTML in app code |
| **Styling** | Tailwind CSS | Utility-first, atomic, zero unused CSS shipped |
| **State** | Signals + TanStack Query | Reactive, server-state aware, no Redux bloat |
| **Editor** | Tiptap (compose) | Best-in-class rich text |
| **Animation** | Motion (Framer Motion) | Spring physics, layout animations |
| **Bundler** | Turbopack | Rust-based, 10x faster than Webpack |
| **Linter/Formatter** | Biome | 50-100x faster than ESLint+Prettier |

### AI Layer
| Layer | Choice | Why |
|---|---|---|
| **Primary LLM** | Claude (Anthropic) | Best reasoning, best at following instructions, fastest improvement curve |
| **Models** | Haiku 4.5 (default), Sonnet 4.6 (Pro), Opus 4.6 (Enterprise) | Tier features by model power |
| **Transcription** | Whisper API (OpenAI) | Best multi-language ASR |
| **Local Inference** | Transformers.js / WebLLM | Free, private, runs on user GPU |
| **Translation** | Claude API | Beats Google Translate on context |
| **Embeddings** | Voyage AI (when added) | Best semantic search quality |

### Data
| Layer | Choice | Why |
|---|---|---|
| **Primary DB** | Neon Serverless Postgres | Scale-to-zero, branches like Git, edge replicas |
| **Cache/Queue** | Upstash Redis | Serverless, CF Workers compatible, REST API |
| **Search** | Meilisearch | Sub-50ms full-text, typo tolerance, zero config |
| **Object Storage** | Vapron Object Storage | S3-compatible, integrated with platform |
| **Local Cache** | IndexedDB | Browser-native, offline-first, infinite size |
| **Analytics DB** | ClickHouse | Time-series at scale (when needed) |

### Infrastructure
| Layer | Choice | Why |
|---|---|---|
| **Hosting** | Vapron | Permanent platform — AI gateway, email, object storage, deploy |
| **DNS** | Cloudflare (alecrae.com zone) | Mail records must be DNS-only — see multi-platform-mail-plan.md |
| **CDN** | Vapron | Built-in with platform |
| **Container Registry** | Vapron Object Storage | S3-compatible, integrated |
| **GPU Compute** | Modal.com | A100/H100 on-demand for heavy AI |
| **Long-Lived Processes** | Jarvis box (66.42.121.161) | API, web, MTA — systemd-managed behind Coolify/Traefik |
| **CI/CD** | GitHub Actions | Already wired |
| **Monitoring** | OpenTelemetry + Grafana LGTM stack | Vendor-neutral observability |

### Auth & Security
| Layer | Choice | Why |
|---|---|---|
| **Primary Auth** | Passkeys / WebAuthn (FIDO2) | 98% login success vs 13.8% for passwords |
| **OAuth** | Direct integrations (Google, Microsoft) | Email account connection |
| **JWT** | jose library | Standards-compliant, fast |
| **Encryption** | Web Crypto API (RSA-OAEP-4096 + AES-256-GCM) | Native browser, FIPS-equivalent |
| **TLS** | TLS 1.3 minimum | No exceptions |

### Payments
| Layer | Choice | Why |
|---|---|---|
| **Billing** | Stripe | Industry standard, best DX, lowest churn tools |
| **Plans** | Free / Personal $9 / Pro $19 / Team $12pp / Enterprise | Fixed — Craig must authorize changes |

### Mobile & Desktop
| Layer | Choice | Why |
|---|---|---|
| **Desktop App** | Electron (initially), Tauri (v2) | Ship fast, optimize later |
| **Mobile App** | React Native + Expo | Single codebase, native performance |
| **PWA** | Built into Next.js | Day-one install on any device |


---

## ⚔️ THE AGGRESSIVE ARCHITECTURE

### Three-Tier Compute Model
```
CLIENT GPU (WebGPU) ──→ EDGE (Cloudflare Workers) ──→ CLOUD (Modal GPUs)
       $0/token              sub-50ms                    Full H100 power
       sub-10ms              lightweight inference        heavy AI / training
       grammar/triage        compose/translate            voice profile train
```

The platform decides where each request runs based on cost, latency, and capability. **The user never sees the tier. They just see speed.**

### Local-First Architecture
- All emails cached in IndexedDB on first sync
- UI reads from local cache (sub-50ms)
- Background workers sync changes to/from server
- Offline support out of the box
- Optimistic UI updates with rollback on failure

### Edge-First Deployment
- Every API route deployable to Cloudflare Workers
- Sub-50ms response times globally
- No regional bottlenecks
- Stateful workloads (MTA, WebSocket) on Fly.io microVMs

### AI-Native Architecture
**AI is woven into every layer, not bolted on:**
- AI in routing (predictive prefetch)
- AI in data fetching (smart cache invalidation)
- AI in UI (adaptive density, smart suggestions)
- AI in error recovery (self-healing)
- AI in search (natural language)
- AI in compose (voice profile + grammar agent)
- AI in triage (priority inbox + commitments)
- AI in security (threat detection)

### Component Architecture
- **ZERO HTML in app code.** Everything is a component.
- Every component has a Zod schema for AI composition
- Every component is themeable, accessible, keyboard-navigable
- Server Components by default, Client Components only when needed
- Storybook for visual testing (when added)

---

## 🛡️ THE QUALITY BAR

### Performance Budgets — CI FAILS IF VIOLATED
| Metric | Budget |
|---|---|
| First Contentful Paint | < 1.0s |
| Largest Contentful Paint | < 1.5s |
| Time to Interactive | < 2.0s |
| Inbox load (cached) | < 100ms |
| Inbox load (cold) | < 1.5s |
| Search response | < 50ms (local), < 200ms (server) |
| API response (edge) | < 50ms p99 |
| API response (cloud) | < 200ms p99 |
| AI response (client) | < 200ms |
| AI response (edge) | < 500ms |
| AI response (cloud) | < 2s |
| Initial JS bundle | < 100KB |
| Email send time-to-delivered | < 2s |

### Code Standards — NO EXCEPTIONS
- TypeScript strict mode (`strict: true`, `noUncheckedIndexedAccess: true`)
- No `any`. No `@ts-ignore`. No `as unknown as X`. Use `unknown` and narrow.
- Every function has explicit return types
- Every prop has explicit types
- Every API boundary has Zod validation
- Every error case has typed handling (Result types preferred over try/catch for business logic)
- Conventional commits: `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `ci:`, `chore:`
- All public APIs have OpenAPI specs
- All endpoints have integration tests
- All components have visual snapshots
- Biome formats and lints — no ESLint, no Prettier

### Component Rules
- ZERO raw HTML elements outside of `packages/ui` primitives
- Every component must be accessible (ARIA, keyboard nav, screen reader friendly)
- Every component must support themes (light/dark/system + accent colors)
- No inline styles — Tailwind classes or CSS modules only
- No CSS-in-JS runtime (build-time only)
- Server Components by default

### AI Integration Rules
- All AI calls have fallback behavior if AI is unavailable
- AI decisions are logged and auditable
- Confidence scores accompany all classifications
- User data used for AI must be anonymizable
- Model selection is automatic based on task complexity
- All AI interactions are traced via OpenTelemetry
- Destructive AI actions require human-in-the-loop approval

### Accessibility — CHARLIE BROWN TO 007
**AlecRae must work for novices AND experts equally well:**
- WCAG 2.2 AA minimum (target AAA where possible)
- Full keyboard navigation (every action has a shortcut)
- Screen reader optimization (real ARIA, real focus management)
- Voice control (dictation engine + command palette)
- High contrast mode
- Reduced motion mode
- Adjustable density (compact/comfortable/spacious)
- Adjustable font sizes (small/medium/large)
- Color blind safe palettes
- Minimum touch target 44x44px on mobile

### Security Requirements
- No secrets in code — env vars or secrets manager only
- All inter-service communication over TLS 1.3
- Rate limiting on every public endpoint (already done — 6 tiers)
- Input validation at every boundary (Zod)
- CSP headers on all web responses
- HSTS preloading
- Regular dependency audits (Renovate + Dependabot)
- E2E encryption for users who enable it
- Zero-knowledge architecture for encrypted content
- No third-party trackers, no analytics that send PII off-server


---

## ❌ THE FORBIDDEN LIST

**NEVER do these things. Ever. Without exception:**

1. **Never write raw HTML in app code.** Components only.
2. **Never use `any` type.** Use `unknown` and narrow.
3. **Never use `@ts-ignore`.** Fix the type.
4. **Never commit secrets.** Env vars only.
5. **Never skip tests for "speed."** Untested code does not exist.
6. **Never use external JavaScript trackers.** No Google Analytics, no Hotjar, no Mixpanel-as-default.
7. **Never sell user data.** Period. This is the moat.
8. **Never show ads in the email client.** We're not Gmail.
9. **Never break the local cache contract.** Reads from cache must always return.
10. **Never deploy to production without Craig's authorization.**
11. **Never modify Stripe configuration without Craig's authorization.**
12. **Never add a dependency that isn't in the approved stack without Craig's authorization.**
13. **Never delete user data without explicit user action AND a 30-day soft-delete window.**
14. **Never ship a feature that isn't accessible.** If a screen reader can't use it, it's broken.
15. **Never use `localStorage` for sensitive data.** IndexedDB with encryption only.
16. **Never trust user input.** Validate everything with Zod.
17. **Never block on a single AI provider.** Always have a fallback path.
18. **Never let an error bubble unhandled to the user.** Wrap, log, recover, retry.
19. **Never silently fail.** Errors are visible to monitoring.
20. **Never ship a feature without a CLAUDE.md update.** This file is the source of truth.
21. **Never approve a PR you didn't read end-to-end.**
22. **Never use the word "Vienna" or "Emailed" in user-facing copy.** It's AlecRae.
23. **Never refer to competitors by name in marketing.** Show, don't tell.
24. **Never make up user metrics for marketing.** Real numbers or no numbers.
25. **Never let speed be an excuse for sloppiness.** Move fast WITHOUT breaking things.

---

## 📋 PRE-FLIGHT CHECKLIST (BEFORE EVERY BUILD)

Before writing a single line of new code:

1. ✅ Read the relevant section of CLAUDE.md
2. ✅ Confirm the task is in the build plan (TIER 1-4)
3. ✅ Confirm the task doesn't require Craig's authorization
4. ✅ Confirm the existing patterns to follow (check similar files)
5. ✅ Confirm the dependencies are already in the approved stack
6. ✅ Confirm the performance budget for this feature
7. ✅ Confirm the accessibility requirements
8. ✅ Identify which tests need to be added
9. ✅ Identify which routes/APIs need to be wired
10. ✅ Plan the commit message in advance

---

## 🧪 POST-BUILD CHECKLIST (BEFORE COMMITTING)

After writing the code:

1. ✅ Tests pass locally (`bun run test`)
2. ✅ Type check passes (`bun run typecheck`)
3. ✅ Lint passes (`bun run lint`)
4. ✅ Build passes (`bun run build`)
5. ✅ No `any`, `@ts-ignore`, `console.log` left over
6. ✅ All new endpoints registered in server.ts
7. ✅ All new routes have rate limiting + auth
8. ✅ All new schemas exported from packages/db/src/index.ts
9. ✅ CLAUDE.md updated with new feature in build status
10. ✅ Conventional commit message ready
11. ✅ Performance budget verified
12. ✅ Accessibility verified (keyboard nav works)

---

## 🚨 EMERGENCY PROTOCOLS

### Production Outage
1. **Check status page** (when set up): status.alecrae.com
2. **Roll back** to last known good commit
3. **Notify Craig** immediately
4. **Post-mortem** within 24 hours, written and committed to `docs/postmortems/`
5. **Add a test** that prevents the same failure

### Security Incident
1. **Immediately revoke** any compromised credentials
2. **Notify Craig** within 15 minutes of discovery
3. **Rotate ALL secrets** even tangentially related
4. **Audit log review** for the affected period
5. **Notify affected users** within 72 hours (GDPR requirement)
6. **Public disclosure** if appropriate, within 30 days
7. **Post-mortem** + prevention plan

### Data Loss
1. **Stop writes immediately** to prevent further loss
2. **Restore from most recent backup** (Neon point-in-time recovery)
3. **Notify Craig** + affected users immediately
4. **Verify integrity** of restored data before resuming writes
5. **Post-mortem** + prevention plan

### Cost Overrun
1. **If AI cost spikes 10x normal:** Auto-throttle to free tier limits
2. **If infrastructure cost spikes:** Alert Craig immediately
3. **Set budget alerts** on every paid service
4. **Review monthly** — anything growing unexpectedly gets investigated


---

## 💰 PRICING & REVENUE (LOCKED — CRAIG ONLY)

### Plans
| Plan | Price | Includes |
|---|---|---|
| **Free** | $0/mo | 1 account, basic AI (5 composes/day), 30-day search, no E2EE |
| **Personal** | $9/mo | 3 accounts, full AI, unlimited search, E2EE, snooze, schedule send |
| **Pro** | $19/mo | Unlimited accounts, priority AI (Sonnet), team features, API access, analytics |
| **Team** | $12/user/mo | Shared inboxes, admin console, audit logs, SSO, priority support |
| **Enterprise** | Custom | On-prem option, compliance, dedicated support, SLA, Opus AI |

**These prices are LOCKED. Changes require Craig's authorization.**

### Business Email Plans (native mailboxes on your own domain) — APPROVED 2026-06-11 by Craig
Separate product line from the consumer tiers above. Multi-currency from launch
(localized price points, NOT FX conversion; Stripe Tax for GST/VAT). Positioned
in the gap between Google Workspace Standard (floor) and MS 365 Premium+Copilot
(ceiling), bundling all AI included.

| Per user/mo | **Business** | **Business Plus** |
|---|---|---|
| NZD (incl. GST) | $25 | $45 |
| AUD (incl. GST) | $22 | $39 |
| GBP (+VAT) | £15 | £28 |
| EUR (+VAT) | €16 | €30 |
| USD | $16 | $30 |
| CAD (+tax) | $22 | $42 |

Business = mailboxes on your domain, full AI, shared inboxes, admin, SSO,
migration. Plus = priority AI (Sonnet/Opus), advanced compliance/eDiscovery,
larger storage, unlimited accounts, dedicated support. Billing wiring pending
(currency-aware: price per tier per currency).

### Add-On Revenue
- Custom domain email hosting: $4/user/mo
- Priority AI processing: $5/mo
- Email analytics premium: $7/mo
- API access (usage-based): $0.01/call
- White-label licensing: $2K-$10K/mo

### Revenue Targets
| Stage | Users | MRR | Team |
|---|---|---|---|
| Beta | 500 free / 50 paid | ~$700/mo | Craig + AI |
| PMF | 2K free / 500 paid | ~$6K/mo | Craig + AI |
| Growth | 10K free / 2K paid | ~$25K/mo | Craig + 1 dev |
| Scale | 50K free / 10K paid | ~$130K/mo | 5 |
| Series A | 200K free / 40K paid | ~$500K/mo | 15 |
| Exit | 1M+ free / 200K paid | ~$2.5M/mo | 40 |

---

## 🌐 DOMAIN & INFRASTRUCTURE

### Domains (live state verified 2026-07-13)
- **alecrae.com** — Landing site (Jarvis box via Cloudflare proxy) ✅ 200
- **mail.alecrae.com** — Email web app (Jarvis box) ✅ 200 — ⚠ must become DNS-only (grey cloud) for SMTP (mail plan Phase 0)
- **api.alecrae.com** — API server (Jarvis box) ✅ 200
- **mx1/mx2.alecrae.com** — Inbound MX — ❌ NO A RECORDS YET (mail plan Phase 0)
- **smtp.alecrae.com** — Authenticated submission — ❌ not created yet (optional, later)
- **status.alecrae.com** — ❌ 503, no app deployed (issue #71)
- **admin.alecrae.com** — never resolved; admin console lives inside the web app at `/admin` (apps/admin was deleted)
- **docs.alecrae.com** — Developer docs (when set up)

### Hosting Stack (actual, since 2026-07)
- **Compute:** Jarvis box `66.42.121.161` — systemd (`alecrae-api` :4100, `alecrae-web` :4200) behind Coolify/Traefik (owns 80/443)
- **Database:** local PostgreSQL 16 on the box (136-table baseline migrated)
- **Cache/Queue:** local Redis on the box (BullMQ queues)
- **Object Storage:** Vapron Object Storage (S3-compatible)
- **DNS:** Cloudflare (alecrae.com zone)
- **Mail:** self-hosted MTA + inbound (code-ready, NOT running — `docs/infra/multi-platform-mail-plan.md`)
- **Monitoring:** OpenTelemetry → Grafana (aspirational — nothing alerting today; issue #72)

---

## 🚀 DEPLOYMENT GATES

**Production deployment requires ALL of these to be green:**

1. ✅ All tests pass (`bun run test`)
2. ✅ Type check passes
3. ✅ Lint passes
4. ✅ Build artifacts generated successfully
5. ✅ E2E tests pass against staging
6. ✅ Performance budgets met (Lighthouse CI)
7. ✅ Accessibility audit passes
8. ✅ Security scan clean (Dependabot, secret scanning)
9. ✅ Database migrations tested on staging
10. ✅ Rollback plan documented
11. ✅ **Craig has authorized the deployment**
12. ✅ Status page updated
13. ✅ On-call engineer available for next 2 hours

**Staging deployments:** Auto-deploy from main branch.
**Production deployments:** Manual trigger after ALL gates pass + Craig authorization.

---

## 🎨 BRAND & VOICE

### The AlecRae Brand
- **Name:** AlecRae (always capitalized as "AlecRae", never "ALECRAE" or "alecrae")
- **Tagline:** "Email, Evolved."
- **Tone:** Confident, sharp, no corporate fluff. Speak like a human who knows what they're doing.
- **Colors:** TBD (Craig to approve)
- **Logo:** TBD (Craig to approve)

### Copy Rules
- Never use the word "Vienna" or "Emailed" in user-facing text — those were codenames
- Never refer to competitors by name in marketing copy
- Never use marketing buzzwords ("synergy", "leverage", "best-in-class")
- Never claim features we don't have
- Never make up user numbers
- Always be specific ("3x faster than Gmail" with proof, not "blazing fast")

### Marketing Strategy
- **Phase 1 (Build in Public):** Weekly X/Twitter updates, "Gmail is 22 years old" narrative
- **Phase 2 (Private Beta):** 500 power users, weekly feedback calls
- **Phase 3 (Public Launch):** Product Hunt #1, Hacker News, tech press
- **Phase 4 (Growth):** SEO, content, referrals, enterprise sales


---

## 📦 BUILD STATUS

All planned feature tiers are **code-complete**: Tiers 1–8 (36 core + 20 expansion + 9 platform + 6 intelligence + 6 deep-AI), Tier S/A/B (industry firsts + UX + power features), and 7 bonus features — **84 features, 97 API route files, 681 endpoints, 136 DB tables, ~64K lines of TypeScript**. The per-tier checklists are archived verbatim in `docs/archive/claude-bible-archive-2026-07-13.md`.

**The honest caveat (2026-07-13 full audit):** code-complete ≠ reachable product.

- **46% of endpoints / 60% of route files have web UI** — 39 route files are fully unwired. Live numbers: `docs/audits/route-coverage.md` (regenerate with `bun run audit:routes`, CI-gated for new routes). Prioritized wiring roadmap: `DEVOPS_TRACKER.md` §3.
- ~10 backend endpoints are still stubs (Known Issue #29 below).
- Tier C compliance items (SOC 2, DPA workflow, bug bounty, public roadmap) are not started — legal/process tasks, not code.
- Email sending/receiving is code-ready but **not operational** — see `docs/infra/multi-platform-mail-plan.md` (the plan for all platforms sending/receiving through alecrae.com).

### 📚 GROUND-TRUTH SOURCES (which doc is authoritative for what)

| Question | Authoritative source |
|---|---|
| Live infra state, box, outages | `DEVOPS_TRACKER.md` |
| Backend↔UI wiring coverage | `docs/audits/route-coverage.md` (generated — never hand-edit) |
| Mail architecture + multi-platform plan | `docs/infra/multi-platform-mail-plan.md` |
| Incident history | `docs/postmortems/` |
| Historical build detail + fixed issues | `docs/archive/claude-bible-archive-2026-07-13.md` + git history |
## 🔧 KNOWN ISSUES — OPEN

> Issues #1–#57 and #63–#65 are resolved; their full history (root causes + fixes) is archived in `docs/archive/claude-bible-archive-2026-07-13.md`. Numbering continues from there. Keep this table OPEN-items-only; when an issue is fixed, move its row (with the fix note) to the archive.

| # | Issue | Severity | Found | Status |
|---|-------|----------|-------|--------|
| 8 | `emailStatusEnum` missing "draft" value — using "queued" as workaround | LOW | 2026-04-09 | NOTED |
| 29 | **~10 backend endpoints still stubs** (re-verified 2026-07-13): files presigned-upload (mock URL — uploads don't persist), voice-message storage (placeholder URL, lost on restart), documents ai-assist, search-intelligence suggestions/trending/related (3), video-meetings summarize, ai-categorization test/retrain (2), attachment-intelligence OCR, contact-enrichment (domain-only), contacts-extended insights, delegation inbox. documents export + warmup + meeting-token encryption are FIXED (see archive). | HIGH | 2026-06-11 | OPEN — files + voice-message storage are the worst (silent data loss) |
| 30 | Thin API test coverage (~7 e2e files for 681 endpoints); 11 workspaces zero tests; `console.log` in production source: **185 as of 2026-07-13** (down from 205) — sweep to structured logger before paying customers | MEDIUM | 2026-06-11 | OPEN |
| 55 | MTA + inbound services not running; mail DNS incomplete | HIGH | 2026-06-19 | SUPERSEDED — full current state + phased fix in `docs/infra/multi-platform-mail-plan.md` |
| 58 | `services/imap` TCP listener not bootable | HIGH | 2026-07-01 | DECIDED 2026-07-01 (Craig): OAuth-only for launch — not blocking |
| 59 | `.env.production`/`.env.test` old contents still in git history (untracked 2026-07-01 but not scrubbed) — rotate any values that were ever real | HIGH | 2026-07-01 | OPEN (rotation unconfirmed) |
| 61 | Inline markdown parsing unimplemented in `packages/email-parser/src/document-model.ts:575` (bold/italic/link/code) | LOW | 2026-07-01 | OPEN |
| 62 | MTA `/metrics` returns placeholder 404 instead of OTel export (`services/mta/src/health.ts:207`) | LOW | 2026-07-01 | OPEN |
| 66 | **main failed typecheck for 9 days** (2026-07-04 → 07-13) — 3 errors introduced by audit commit 0947895: plan-gate.tsx `PlanBadge` missing business/business_plus tiers, dns auto-config.ts unchecked regex captures, agent.ts missing `sql` import + phantom `draft.accountId`. | HIGH | 2026-07-13 | FIXED 2026-07-13 (all three) — **follow-up OPEN:** CI should have blocked this; verify the typecheck gate in ci.yml actually runs/fails on pushes to main |
| 67 | Sidebar "Delegation" item links to `/shared-inboxes` (label/page mismatch); delegation route only 33% wired | MEDIUM | 2026-07-13 | OPEN |
| 68 | **Mail-blocking DNS gaps** — mx1/mx2/`_spf`/smtp records missing, bounce CNAME mistargeted, PTR on wrong hostname | HIGH | 2026-07-13 | FIXED 2026-07-13 — Craig executed the full Cloudflare changeset + Vultr PTR change (`smtp.alecrae.com`); all records + FCrDNS verified live. Mail plan Phase 0 COMPLETE; next is Phase 1 (MTA bring-up on 158). |
| 69 | 14 orphaned web components never imported by any page: CollaborativeDraftView, SpatialInboxView, MeetingTranscriptPanel, EmailQueryConsole, VoiceCloneManager, SignatureManager, TaskProviderSelector, EmailScriptManager, NewsletterSummaryPreview, FocusModeEmailCard, DragToSnooze, LocalAIStatusIndicator, + SwipeableEmailRow (mobile-only), others per audit | MEDIUM | 2026-07-13 | OPEN — wire or delete per DEVOPS_TRACKER §3 roadmap |
| 70 | No `email.received` webhook event — external platforms can't programmatically react to inbound mail (needed for the multi-platform mail story) | MEDIUM | 2026-07-13 | OPEN — mail plan Phase 4 |
| 71 | `status.alecrae.com` returns 503 — no status app deployed on Jarvis, no Traefik route | LOW | 2026-07-10 | OPEN |
| 72 | No staging environment + no alerting (outage ran 3 days unnoticed while fleet-check logged 503s) | HIGH | 2026-07-10 | OPEN — see `docs/postmortems/2026-07-07-alecrae-503-outage.md` + DEVOPS_TRACKER §1.7; staging design needs its own session |
## 🧭 PRODUCT DECISIONS LOG

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | **Native IMAP: not required for launch.** Gmail/Outlook OAuth sync is the supported path; `services/imap`'s TCP listener stays broken (issue #58) and is documented honestly rather than claimed done. | OAuth covers the real-world usage pattern; fixing the IMAP handler/type-shape mismatch is ~1 week of work with no launch-blocking upside right now. |
| 2026-07-01 | **First users: general beta, no specific vertical (not lawyers/accountants-only).** All modules held to a general-beta quality bar rather than a compliance-heavy vertical bar. | No vertical has been chosen yet; revisit this once first users are actually onboarded — a legal/accounting focus would raise the bar on E2EE, audit logging, and retention features specifically. |
| 2026-07-03 | **Multi-workspace: one login can own/join several separate workspaces (accounts), each with its own billing, domains, mailboxes, and team — via a `workspace_members` table, not by widening `users.accountId` to a many-to-many everywhere.** | Every downstream resource (mailboxes, domains, emails, billing — 90+ route files) is already scoped purely by `auth.accountId` from the JWT; keeping that contract and only changing how the ACTIVE accountId is chosen (login → home workspace; switch-workspace → any workspace you're a member of) avoided touching those 90+ files. Alternative considered: give every `users` row a home account only and require a separate login per workspace (Slack-style) — rejected, worse UX for "one login, many workspaces." |
| 2026-07-13 | **Mail engine stays on the "158" box (149.28.119.158) as a dedicated mail box; Jarvis (161) keeps web/api.** All mail DNS records target 158. | 158 already has outbound port 25 unblocked by Vultr, PTR → mail.alecrae.com, and SPF authorizing it — weeks of deliverability groundwork kept, and a dedicated sending IP is isolated from other products on Jarvis. Alternative (consolidate on 161) rejected for now: would need a Vultr port-25 ticket, new PTR, SPF rewrite, and IP warmup from zero. Full plan: `docs/infra/multi-platform-mail-plan.md`. |

---

## 🗓️ NEXT ACTIONS — IN ORDER

> Completed items 1–10 + 18–19 of the old list are in the archive. Current list (2026-07-13):

1. ~~Craig: Decision 1~~ — **DECIDED 2026-07-13: keep the "158" box (149.28.119.158) as the dedicated mail box** (see Product Decisions Log).
2. ~~Craig: Phase 0 DNS fixes~~ — **COMPLETE 2026-07-13, verified live incl. FCrDNS**: mx1/mx2/smtp A → 149.28.119.158 (grey), MX 10+20, `_spf` TXT, bounce CNAME → smtp, PTR → `smtp.alecrae.com`. NB: `mail.alecrae.com` stays PROXIED (webmail on Jarvis); the MTA identity is `smtp.alecrae.com` (`MTA_HOSTNAME` env).
3. **Phase 1: bring up `alecrae-mta`** on the mail box (`docs/infra/mta-box-setup.md`), test send → Gmail inbox with SPF/DKIM/DMARC pass, run the idempotency check.
4. **Phase 2: deploy the inbound service** (port 25 listener) + test receiving into a provisioned mailbox.
5. **Phase 3: onboard each platform domain** (mail.vapron.ai already verified; repeat the 5-record recipe per platform) + mint per-platform API keys with `messages:send`.
6. **Verify the CI typecheck gate** actually blocks bad pushes to main (Known Issue #66 follow-up — main was red for 9 days and CI didn't stop it).
7. **Fix the 2 data-loss stubs** — files presigned-upload + voice-message storage (Known Issue #29).
8. **Wire `email.received` webhook event** (Known Issue #70) so platforms can react to inbound mail programmatically.
9. **Route-wiring roadmap** per `DEVOPS_TRACKER.md` §3 (security-intelligence → contact-enrichment → delegation/collaboration → analytics subsystems → AI stack).
10. **Alerting + staging design** (Known Issue #72) — dedicated session; don't architect inline.
11. **Set up Stripe** live keys + webhook URL → api.alecrae.com/billing/webhook (Craig).
12. **Disable GitHub Default Setup CodeQL** — Settings → Code security (Craig).

---

## 🌀 FLYWHEEL BACKLOG — Make the moat visible (added 2026-05-08)

The platform's moat is the AI flywheel — every user action makes every AI feature better, and the data that compounds cannot be cloned by Gmail or Outlook. The signals + learning cycles are wired in `.ai-flywheel/config.json`. What's missing is **visibility, virality, and instrumentation**. These are the highest-leverage next builds AFTER the email-sending stack is operational:

| # | Item | Why | Effort |
|---|---|---|---|
| F1 | **"Your AlecRae" page** — voice-profile confidence over time, drafts accepted, time saved, words AI has learned | Without it, users can't see the wheel turning, which kills retention narrative + marketing screenshots | ~2 days |
| F2 | **Voice-primed referral loop** — "Invite a contact → they get 3 months free, you get 1 month free, AND their voice profile is primed from the emails you've already exchanged" | Ties acquisition to the moat; Gmail/Superhuman literally cannot ship the parenthetical | ~1 week |
| F3 | **AlecRae↔AlecRae network features** — real-time read/draft state, "Sarah is replying", presence in compose, calendar slot proposals that auto-resolve when both ends are on AlecRae | Turns AlecRae from "a client" into "a platform" — each new user makes existing users' product better | ~2 weeks |
| F4 | **Flywheel instrumentation** — wire `.ai-flywheel/config.json` signals to ClickHouse + surface weekly RPM in `/admin` | Right now the wheel turns but we can't measure it. Need weekly compose-acceptance, triage-accuracy, voice-edit-distance trend lines | ~3 days |

**Build order:** F4 → F1 → F2 → F3. Instrument first so we know the wheel is real, then make it visible, then tie it to virality, then to network effects. None of these block launch — but all four together are what turns AlecRae into a $2.5M MRR exit instead of a $10M lifestyle business.

---

## 📊 SESSION PROTOCOL

### At the START of every session:
1. Read this file (CLAUDE.md) end to end
2. Check the "Known Issues" section
3. Check the "Next Actions" section
4. Confirm what you're working on aligns with the build plan
5. If unclear, ask Craig

### At the END of every session:
1. Update the "Build Status" section with what got done
2. Update the "Known Issues" section with anything discovered
3. Update the "Next Actions" section with what's next
4. Update "Last updated" (date + time, UTC) at the bottom — run `bun run docs:check`
5. Commit and push everything
6. Leave the codebase in a runnable state

### When starting a NEW build:
1. Run the Pre-Flight Checklist
2. Build it
3. Run the Post-Build Checklist
4. Commit with conventional commit message
5. Push to development branch
6. Update CLAUDE.md

---

## 📝 ARCHITECTURE DECISION RECORDS (ADRs)

When making a significant architectural decision, document it in `docs/adrs/NNNN-title.md` with:
- **Context:** What's the problem?
- **Decision:** What did we decide?
- **Alternatives:** What did we consider?
- **Consequences:** What does this mean going forward?
- **Status:** Proposed / Accepted / Deprecated / Superseded

Major past decisions:
- ADR-0001: Use Neon over Supabase (serverless economics)
- ADR-0002: Use Cloudflare over Vercel (cost + edge presence)
- ADR-0003: Bun over Node.js (speed)
- ADR-0004: Hono over Express (4x faster, edge-compatible)
- ADR-0005: Tailwind over CSS-in-JS (zero runtime cost)
- ADR-0006: Drizzle over Prisma (smaller bundle, edge-friendly)
- ADR-0007: Claude over GPT (better instruction following, faster improvement)

---

## 🎯 THE COMPETITIVE MANDATE

**We are not building "another email client." We are building the LAST email client.**

Every feature must answer: "Why would someone switch from Gmail/Outlook for this?"

If the answer isn't compelling, don't build it. If it is, build it 10x better than the competition.

**Examples of compelling answers:**
- "AlecRae's grammar agent replaces Grammarly, which costs $30/mo. AlecRae includes it free."
- "AlecRae's dictation lets you reply by voice with email-aware commands. Dragon is dead. Nothing else does this."
- "AlecRae's email recall actually works. Outlook's is theater."
- "AlecRae's AI learns YOUR writing style. Gmail's AI sounds like a robot."
- "AlecRae runs on YOUR computer's GPU for free AI. Gmail charges $30/mo for Gemini."
- "AlecRae's commitments tracker catches every promise made in email. Gmail catches none."
- "AlecRae unifies Gmail + Outlook + Yahoo + iCloud in one inbox. Superhuman is Gmail-only."

**Examples of bad answers (don't build):**
- "It would be cool"
- "Other apps have it"
- "It's a small change"

---

## 📅 STATUS

### 🚨 PRODUCTION DEPLOYMENT STATE — READ FIRST (updated 2026-07-13)

**Production is the Jarvis box at `66.42.121.161`** — access via Tailscale SSH
(`ssh root@jarvis`, identity-based, no keys; if it breaks check `tailscale status`
locally first). The old Vapron box `149.28.119.158` is **DEPRECATED for compute**;
mail DNS (SPF/PTR) still references it pending the mail-box decision in
`docs/infra/multi-platform-mail-plan.md`.

- **Box layout:** Coolify/Traefik owns 80/443 (route file
  `/data/coolify/proxy/dynamic/alecrae.yaml`: web/mail/www → `10.0.1.1:4200`,
  api → `10.0.1.1:4100`). systemd services `alecrae-api` (:4100) and
  `alecrae-web` (:4200) bind `0.0.0.0`; env lives in `/opt/alecrae/.env` —
  **Bun auto-loads `.env` and it silently OVERRIDES systemd unit env** (this
  caused the July outage; don't set the same var in both places).
- **Verified live 2026-07-13:** alecrae.com, mail.alecrae.com, and
  api.alecrae.com/health all return 200. `status.alecrae.com` is 503 (no app
  deployed, no route — Known Issue #71).
- **Outage 2026-07-07 → 07-11:** three stacked failures (missing Traefik route,
  services disabled, 127.0.0.1 bind) — postmortem:
  `docs/postmortems/2026-07-07-alecrae-503-outage.md`.
- **"Deployed" means:** merged to main **AND** pulled+built on the box
  (`scripts/box-deploy.sh` or the manual ritual). Anything merged after the last
  pull is NOT live.
- **Mail services** (`alecrae-mta` outbound worker, `services/inbound` MX
  listener) are **not running anywhere yet** — phased bring-up is the mail plan.

**Last updated:** 2026-07-13 06:30 UTC
**Current phase:** Phase 1 — Beta Launch in Progress. Web/API live on Jarvis (66.42.121.161) since 2026-07-11 outage resolution; mail stack bring-up is the critical path.
**Current focus:** Third full audit (2026-07-13): 4-agent sweep (UI wiring, stubs, docs drift, mail/DNS ground truth) + live DNS/HTTP checks. Fixed 3 typecheck breaks that had main red since 2026-07-04 (issue #66). Bible restructured — history archived to `docs/archive/claude-bible-archive-2026-07-13.md`, Known Issues now OPEN-only. Outage postmortem written (`docs/postmortems/2026-07-07-alecrae-503-outage.md`). **The multi-platform mail architecture (all of Craig's platforms sending/receiving through alecrae.com, Vapron DNS relationship clarified) is specified in `docs/infra/multi-platform-mail-plan.md` — Craig has 1 decision + Phase 0 DNS to authorize, then the phased bring-up starts.**
**Build completion:** TIER 1-4 (36/36) + 7 bonus + 31 advanced (S10/10 + A7/7 + B8/8 + C6/10) + 20 expansion (Tier 5) + 9 platform (Tier 6) + 6 intelligence (Tier 7) + 6 deep AI (Tier 8)

**Next review:** Before any major architectural change, before any production deployment, at the start of every session.

---

## ⚖️ THE BIBLE RULE (REPRISE)

**This file is the source of truth.**

If something contradicts this file, this file wins.
If you don't know what to do, this file tells you.
If you want to change this file, Craig has to approve it.
If you ship something not in this file, you broke the rules.

**No scatter-gun. No drift. No "just this once."**

**AlecRae dominates or AlecRae dies. There is no second place.**


---

## 🚀 FEATURE STATE — SUMMARY

Tier S (10/10), Tier A (7/7), Tier B (8/8) all DONE; Tier C polish/trust 6/10 (C4 SOC 2, C5 GDPR DPA workflow, C6 bug bounty, C7 public roadmap NOT STARTED — process tasks, not code). The full feature tables, competitive snapshot, and completeness matrix are archived in `docs/archive/claude-bible-archive-2026-07-13.md`. For what's actually reachable in the product today, trust `docs/audits/route-coverage.md` over any checklist.
## 🎯 CRAIG'S CONFIRMED ACCOUNTS

- ✅ **Apple Developer account** — DONE
- ⏳ **Google Play Developer** — needed for Android
- ✅ **Domain** — alecrae.com confirmed
- ⏳ **Stripe account** — needed before charging
- ⏳ **Anthropic API key** — needed for AI features in production
- ⏳ **OpenAI API key** — needed for Whisper transcription
- ⏳ **Google Cloud project** — for Gmail OAuth
- ⏳ **Microsoft Azure project** — for Outlook OAuth

---

## 🚀 FASTEST PATH TO LIVE URL

**Production is the Jarvis box at `66.42.121.161`.** Deployment process:
1. SSH to box: `ssh root@jarvis` (Tailscale SSH — no keys; check `tailscale status` if it fails)
2. Pull and migrate: `cd /opt/alecrae && git pull --ff-only origin main && bun install && bun run -C packages/db build && bun run db:migrate` (or run `scripts/box-deploy.sh`)
3. Restart: `sudo systemctl restart alecrae-api alecrae-web`
4. Verify: `curl https://api.alecrae.com/health` (Traefik route: `/data/coolify/proxy/dynamic/alecrae.yaml`)

Full checklist (env vars, Google OAuth, DNS, Vultr PTR): **`docs/infra/morning-setup.md`**

Note: Vercel is fully removed as a deployment target. The Vercel GitHub App must be uninstalled from repo settings (it fires on every push and fails, creating noise in CI).

---

## 🏗️ THE BIGGER PICTURE — ALECRAE AS FLAGSHIP

Craig is also building a **Render+Vercel+AI hybrid platform** (the "Back to the Future" infrastructure). AlecRae will eventually deploy on this platform — making AlecRae both:
1. **A standalone product** that generates revenue
2. **The flagship reference app** that proves the underlying platform works

This is why we move with discipline: every architectural choice in AlecRae informs the platform underneath. We don't build AlecRae in a way that requires the platform to ship first — AlecRae deploys to Cloudflare today, and migrates to the new platform when it's ready, with zero rewrites needed (because the new platform supports the same primitives).

