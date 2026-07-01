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
| **DNS** | Vapron / Custom DNS | Managed via production box (149.28.119.158) |
| **CDN** | Vapron | Built-in with platform |
| **Container Registry** | Vapron Object Storage | S3-compatible, integrated |
| **GPU Compute** | Modal.com | A100/H100 on-demand for heavy AI |
| **Long-Lived Processes** | Vapron / Production Box (149.28.119.158) | MTA, WebSocket, systemd-managed |
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

### Domains (alecrae.com confirmed)
- **alecrae.com** — Landing/marketing site (Cloudflare Pages)
- **mail.alecrae.com** — Email web app (Cloudflare Pages)
- **admin.alecrae.com** — Admin dashboard (Cloudflare Pages)
- **api.alecrae.com** — API server (Cloudflare Workers / Fly.io)
- **smtp.alecrae.com** — MTA outbound (Fly.io, NOT proxied)
- **mx1.alecrae.com / mx2.alecrae.com** — Inbound MX (Fly.io, NOT proxied)
- **status.alecrae.com** — Status page (when set up)
- **docs.alecrae.com** — Developer docs (when set up)

### Hosting Stack
- **Compute:** Cloudflare Pages + Workers (web/api), Fly.io (MTA/long-lived)
- **Database:** Neon Serverless Postgres
- **Cache/Queue:** Upstash Redis
- **Object Storage:** Cloudflare R2
- **DNS:** Cloudflare
- **Backups:** Neon point-in-time recovery + daily R2 snapshots
- **Monitoring:** OpenTelemetry → Grafana

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

---

## 🧭 PRODUCT DECISIONS LOG

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | **Native IMAP: not required for launch.** Gmail/Outlook OAuth sync is the supported path; `services/imap`'s TCP listener stays broken (issue #58) and is documented honestly rather than claimed done. | OAuth covers the real-world usage pattern; fixing the IMAP handler/type-shape mismatch is ~1 week of work with no launch-blocking upside right now. |
| 2026-07-01 | **First users: general beta, no specific vertical (not lawyers/accountants-only).** All modules held to a general-beta quality bar rather than a compliance-heavy vertical bar. | No vertical has been chosen yet; revisit this once first users are actually onboarded — a legal/accounting focus would raise the bar on E2EE, audit logging, and retention features specifically. |

---

## 🗓️ NEXT ACTIONS — IN ORDER

1. ~~Build "Coming Soon" landing page~~ DONE
2. ~~Verify monorepo build end-to-end~~ DONE 2026-04-24 — 29/29 static pages, zero errors
3. ~~Fix any build errors~~ DONE 2026-04-24 — landing page merge conflict fixed
4. ~~Wire passkey login handler~~ DONE 2026-04-09
5. ~~Build Electron desktop app~~ DONE 2026-04-09
6. ~~Build React Native mobile app~~ DONE 2026-04-09
7. ~~Wire in-memory stores to DB~~ DONE 2026-04-09
8. ~~Complete Admin SSO~~ DONE 2026-04-09
9. ~~Fix Vercel deployment~~ DONE 2026-04-09
10. ~~Rebrand Vienna/48co/@emailed → AlecRae~~ DONE 2026-04-12
11. **Provision Neon Postgres** + run `bun run db:migrate` (Craig)
12. **Provision Upstash Redis** (Craig)
13. **Configure DNS** for alecrae.com — MX, SPF, DKIM, DMARC, CNAMEs (Craig)
14. **Set up Stripe** live keys + webhook URL → api.alecrae.com/billing/webhook (Craig)
15. **Add API keys** — Anthropic, OpenAI, Google OAuth, Microsoft OAuth (Craig)
16. **Deploy to Vapron** — Craig: get `VAPRON_API_KEY` (vpk_*) from the Vapron dashboard, then one command: `VAPRON_API_KEY=vpk_... bun run deploy:vapron`. Full checklist: `docs/infra/vapron-go-live.md`. For continuous deploys: add the key as a GH secret + set `ENABLE_VAPRON_DEPLOY=true` (gated job in standalone-deploy.yml). **The key is the only blocker — everything else is ready.**
17. **Stand up sending for Craig** — see `docs/infra/email-sending-runbook.md` (DNS + SES relay + warmup, no Neon dependency)
18. ~~Full CI suite green (lint, typecheck, test, build, security scan)~~ DONE 2026-05-29 — PR #44 merged
19. ~~Wire full marketing landing page~~ DONE 2026-05-29 — dark component suite + ProductSuite section live
20. **Disable GitHub Default Setup CodeQL** — Settings → Code security → Code scanning → Default setup → Disable (Craig)
21. **Configure GateTest CLI** — add `GATETEST_API_KEY` to repo secrets, then set `continue-on-error: false` in ci.yml (Craig + Claude)

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

### 🚨 PRODUCTION DEPLOYMENT STATE — READ FIRST (recorded 2026-06-12, per Craig/operator)

**Production is the dedicated box at `149.28.119.158`, NOT Vercel.** Migration
direction is Vercel → box, one way; the old Vercel deployments and Neon DB are
legacy with no customers. Do not add domains to Vercel or propose CNAMEs back.

- **Verified from this repo's side (DNS, 2026-06-12):** `mail.alecrae.com` and
  `api.alecrae.com` have A records to `149.28.119.158`; apex `alecrae.com`
  still resolves to Vercel (legacy); `admin.alecrae.com` does not resolve.
- **Operator-reported box layout (not independently verifiable from here):**
  `vapron-bun-gateway` (custom Bun reverse proxy) owns 80/443 + TLS —
  Caddy/nginx/certbot are not used on this box. systemd services:
  `alecrae-api` (:4100), `alecrae-web` (:4200, Next.js build). Local
  PostgreSQL migrated with the 136-table baseline and seeded.
- **"Deployed" now means:** merged to main **AND** pulled+built on the box —
  `git pull → bun install → bun run db:migrate → web build → restart units`.
  The operator runs that ritual; anything merged after the last pull is NOT
  live until he does. (This explains "merged but not visible" reports.)
  **Now scripted:** `scripts/box-deploy.sh` (one command on the box, fail-fast
  + health checks) and the manual `Deploy to Box` GitHub workflow (one tap
  from iPad once `BOX_SSH_KEY`/`BOX_HOST`/`BOX_USER`/`BOX_REPO_PATH` secrets
  are set — runbook: `docs/infra/box-deploy.md`).
- Open items handed to repo-side (2026-06-12): (1) OAuth callback
  session-cookie behavior across the api./mail. split — code review found the
  flow sound (token via URL fragment + Bearer auth; cookie is host-only by
  design); `Secure` flag hardening landed; re-verify on the box after it pulls
  today's main, which also carries the earlier Google sign-in fixes (#25).
  (2) DKIM for `mail.vapron.ai` + webhook consumer signing secret — both are
  box/DNS-side (repo expects `WEBHOOK_SECRET` env for HMAC; no `mail.vapron.ai`
  surface exists in this repo).


**Last updated:** 2026-07-01 00:36 UTC
**Current phase:** Phase 1 — Beta Launch in Progress. Infra migrating from Vapron box (149.28.119.158) to Jarvis box (66.42.121.161) — see Known Issue #55 and Next Actions.
**Current focus:** Full ground-truth code audit run 2026-07-01 (see Known Issues #58-62 + Product Decisions Log above) — found `services/imap` non-bootable (decided: OAuth-only, not a blocker) and `.env.production`/`.env.test` were git-tracked (fixed + pushed). Previously: Vapron Type 2 migration COMPLETE, `mail.vapron.ai` fully verified (SPF ✅ DKIM ✅ DMARC ✅ MX ✅ Return-Path ✅), smoke test passed. Outstanding Craig tasks: (1) finish 158→161 infra migration (copy `.env`, stand up `alecrae-api`/`alecrae-mta`/`alecrae-web` systemd units on 161); (2) set PTR record on 161 to `mail.alecrae.com` (currently resolves to `mail.vapron.ai`, which stays correct for 158); (3) confirm email arrives in Gmail inbox; (4) run MTA idempotency check (same message_id → no duplicate).
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

**Production is the dedicated box at `149.28.119.158`** (Vapron platform). Deployment process:
1. SSH to box: `ssh root@149.28.119.158`
2. Pull and migrate: `cd /root/AlecRae.com && git pull --ff-only origin main && bun install && bun run -C packages/db build && bun run db:migrate`
3. Restart: `sudo systemctl restart alecrae-api alecrae-web`
4. Verify: `curl https://api.alecrae.com/health`

Full checklist (env vars, Google OAuth, DNS, Vultr PTR): **`docs/infra/morning-setup.md`**

Note: Vercel is fully removed as a deployment target. The Vercel GitHub App must be uninstalled from repo settings (it fires on every push and fails, creating noise in CI).

---

## 🏗️ THE BIGGER PICTURE — ALECRAE AS FLAGSHIP

Craig is also building a **Render+Vercel+AI hybrid platform** (the "Back to the Future" infrastructure). AlecRae will eventually deploy on this platform — making AlecRae both:
1. **A standalone product** that generates revenue
2. **The flagship reference app** that proves the underlying platform works

This is why we move with discipline: every architectural choice in AlecRae informs the platform underneath. We don't build AlecRae in a way that requires the platform to ship first — AlecRae deploys to Cloudflare today, and migrates to the new platform when it's ready, with zero rewrites needed (because the new platform supports the same primitives).

