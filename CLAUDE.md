# VIENNA — The Email Client That Kills Gmail

> **Email hasn't been reinvented since 2004. We're fixing that.**

---

## CRITICAL: Development Execution Rules

**DO NOT STOP. DO NOT ASK. DO NOT WAIT.**

- When you finish a task, immediately move to the next one.
- When an agent finishes, commit its output and start the next piece of work immediately.
- When you hit an error, fix it and keep going.
- Always commit and push completed work immediately.
- Run agents in parallel whenever possible to maximize throughput.

---

## MISSION

Kill the bloated, slow, privacy-violating email clients that the world is stuck with. Email hasn't been reinvented since Gmail in 2004. It's been 22 years. Vienna is the reinvention.

**The customer sees:** The fastest, smartest, most beautiful email client ever made. One subscription. Works with all their accounts.
**You see:** AI-powered email on a lean stack. Margin on every subscription. No ads. No data mining. Clean revenue.
**The gap between what they expect from email and what we deliver is our competitive advantage.**

---

## SUPPLIER STACK (INVISIBLE TO CUSTOMERS)

| Customer pays for | Powered by | Your cost | Margin |
|---|---|---|---|
| AI features | Claude API (Anthropic) | ~$0.02-0.10/user/day | ~85% |
| Email sync | JMAP/IMAP (free protocols) | $0 | 100% |
| Account storage | Neon Postgres | ~$0.05/user/mo | ~95% |
| Search | Typesense (self-hosted) | ~$0.01/user/mo | ~98% |
| Push notifications | Firebase (free tier) | $0 | 100% |
| Payments | Stripe | 2.9% + $0.30 | ~95% |
| Desktop delivery | Electron (free) | $0 | 100% |
| Mobile delivery | App Store ($99/yr) + Play ($25 once) | Negligible | ~99% |

---

## PRICING TIERS

| Plan | Price | Includes |
|---|---|---|
| Free | $0/mo | 1 account, basic AI (5 composes/day), 30-day search, no E2EE |
| Personal | $9/mo | 3 accounts, full AI, unlimited search, E2EE, snooze, schedule send |
| Pro | $19/mo | Unlimited accounts, priority AI (Opus), team features, API access, analytics |
| Team | $12/user/mo | Shared inboxes, admin console, audit logs, SSO, priority support |
| Enterprise | Custom | On-prem option, compliance, dedicated support, SLA |

---

## REVENUE TARGETS

| Milestone | Users | MRR | Team |
|---|---|---|---|
| Beta launch | 500 free, 50 paid | ~$700/mo | You + AI |
| Product-market fit | 2,000 free, 500 paid | ~$6K/mo | You + AI |
| Growth mode | 10K free, 2K paid | ~$25K/mo | You + 1 dev |
| Scale | 50K free, 10K paid | ~$130K/mo | Team of 5 |
| Series A ready | 200K free, 40K paid | ~$500K/mo | Team of 15 |
| Exit ready | 1M+ free, 200K paid | ~$2.5M/mo | Team of 40 |

---

## REVENUE STREAMS

**Core subscription (95% of revenue):**
- Personal: $9/mo
- Pro: $19/mo
- Team: $12/user/mo
- Enterprise: custom

**Add-on revenue:**
- Custom domain email hosting: $4/user/mo
- Priority AI processing: $5/mo
- Email analytics premium: $7/mo
- API access: usage-based ($0.01/API call)
- White-label licensing: $2K-10K/mo

---

## GO-TO-MARKET STRATEGY

**Phase 1 — Build in Public (Month 1-3)**
- Ship weekly updates on X/Twitter
- "Gmail is 22 years old" narrative
- Demo videos: Vienna vs Gmail speed comparison
- Waitlist with early access for influencers
- Target: 10K waitlist signups

**Phase 2 — Private Beta (Month 3-5)**
- 500 beta users (tech-savvy, power users, email-heavy professionals)
- Focus: speed, AI compose, multi-account
- Weekly feedback calls

**Phase 3 — Public Launch (Month 5-7)**
- Product Hunt launch (target #1 of the day)
- Hacker News Show HN
- Tech press outreach (The Verge, TechCrunch, Wired)
- Launch offer: 50% off first year

**Phase 4 — Growth (Month 7+)**
- SEO: "best email client", "Gmail alternative"
- Content marketing: "Why I quit Gmail" blog series
- Referral program: give a month, get a month
- Enterprise sales team

---

## DOMAIN ARCHITECTURE

- **vienna.com** — Landing/marketing site
- **mail.vienna.com** — Email web app (inbox, compose, settings)
- **admin.vienna.com** — Admin dashboard
- **api.vienna.com** — API server
- **smtp.vienna.com** — MTA (outbound email delivery)
- **mx1.vienna.com / mx2.vienna.com** — MX records for inbound

**Hosting:** Cloudflare (Pages + Workers + R2)
**Database:** Neon Serverless PostgreSQL
**Redis:** Upstash (serverless, CF Workers compatible)

---

## PHASE 1 BUILD PLAN — DO IN ORDER

### STEP 1 — Core Email Engine
- [x] IMAP sync engine (connect any email account)
- [x] Google OAuth + Gmail API sync
- [x] Microsoft OAuth + Graph API sync (Outlook)
- [ ] IndexedDB local email cache
- [ ] Background sync worker (Web Worker)
- [x] Email send via SMTP/API

### STEP 2 — Inbox UI
- [x] Inbox list with conversation threading
- [x] Thread view with full message rendering
- [x] HTML email sanitization + rendering
- [x] Compose with rich text editor
- [x] Attachments (upload, download, inline preview)
- [x] Reply, reply all, forward
- [x] Labels, folders, move, archive, delete
- [ ] Snooze and schedule send
- [ ] Undo send (configurable delay)
- [ ] Multi-account switching

### STEP 3 — AI Features
- [x] AI Compose (Claude writes emails from description)
- [x] AI Reply (suggested replies with tone control)
- [x] AI Triage (auto-categorize incoming mail + Screener)
- [x] AI Summary (thread summarization)
- [ ] AI Search (natural language email search)
- [x] Voice Profile (learns your writing style from sent mail)
- [ ] AI Unsubscribe (one-click, AI handles the rest)
- [x] AI Follow-up reminders

### STEP 4 — Speed & Polish
- [ ] <200ms inbox load (local-first)
- [x] <50ms search (Meilisearch full-text + local)
- [x] Keyboard shortcut system (vim + Gmail modes + Cmd+K palette)
- [ ] Dark mode + themes
- [ ] Density settings (compact/comfortable/spacious)
- [ ] Notification system (web push + native)

### STEP 5 — Platform
- [x] Stripe subscriptions + billing page
- [x] Auth (email + OAuth)
- [x] Settings (accounts, signatures, rules, preferences)
- [ ] Desktop app (Electron wrapper)
- [ ] Mobile app (React Native/Expo)
- [ ] Import/migration tool (Gmail, Outlook, Apple Mail)

### STEP 6 — Growth Features
- [ ] Calendar integration
- [ ] Contact management
- [ ] Team shared inboxes
- [ ] Admin console
- [ ] E2E encryption
- [ ] Public API + webhooks
- [ ] Email analytics dashboard

---

## URGENT BUILD LIST — EVERYTHING BELOW MUST BE BUILT. NO EXCEPTIONS.

### TIER 1: BUILD IMMEDIATELY (blocks launch)

| # | Task | Why | Status |
|---|------|-----|--------|
| 1 | **IMAP/JMAP sync engine** | Can't have an email client without email | DONE |
| 2 | **Gmail OAuth + API sync** | 1.8B users on Gmail. Must support day one. | DONE |
| 3 | **Outlook OAuth + Graph API** | 400M users. Must support day one. | DONE |
| 4 | **Inbox UI + thread view** | The core product. Everything else is built on this. | DONE |
| 5 | **Compose with Tiptap editor** | Users need to send email. | DONE |
| 6 | **AI Compose (Claude)** | Our #1 differentiator. What makes Vienna not just another client. | DONE |
| 7 | **AI Triage + priority inbox** | The reason power users will switch from Gmail | DONE |
| 8 | **Local IndexedDB cache** | Speed depends on this. No local cache = slow = dead. | DONE |
| 9 | **Keyboard shortcuts** | Power users are our first adopters. They demand this. | DONE |
| 10 | **Search (local full-text)** | Can't find email = broken product | DONE |

### TIER 2: BUILD THIS WEEK (competitive parity)

| # | Task | Why | Status |
|---|------|-----|--------|
| 11 | **AI Reply suggestions** | Superhuman has this. We must have it better. | DONE |
| 12 | **AI Thread summary** | 50-reply threads are common. Summary saves hours. | DONE |
| 13 | **Snooze + schedule send** | Table stakes. Every modern client has this. | DONE |
| 14 | **Undo send** | Gmail trained users to expect this. | DONE |
| 15 | **Multi-account** | One client, all accounts. Our advantage over Superhuman (Gmail-only). | DONE |
| 16 | **Dark mode + themes** | Non-negotiable for 2026. | DONE |
| 17 | **Stripe billing** | Need to charge money. | DONE |
| 18 | **Auth system** | Login, signup, OAuth, password reset. | DONE |
| 19 | **Settings pages** | Signatures, rules, preferences, accounts. | DONE (existing) |
| 20 | **Import/migration** | Users need to bring their email history. One-click migration. | DONE |

### TIER 3: BUILD THIS MONTH (market leadership)

| # | Task | Why | Status |
|---|------|-----|--------|
| 21 | **Electron desktop app** | Native notifications, dock badge, system tray. | NOT STARTED |
| 22 | **React Native mobile app** | Email is mobile-first for most users. | NOT STARTED |
| 23 | **Voice Profile (AI learns your style)** | NO competitor has this. Game-changer. | DONE (backend) |
| 24 | **AI natural language search** | "Find that PDF from Sarah about Q3 budget" | DONE |
| 25 | **Calendar integration** | Read meeting invites, show availability, schedule. | DONE |
| 26 | **Contact management** | Auto-complete, avatars, notes, interaction history. | DONE |
| 27 | **E2E encryption** | Privacy-conscious users demand this. Proton Mail competitor angle. | DONE |
| 28 | **Email analytics** | Response time, volume, peak hours. Power user feature. | DONE |
| 29 | **AI-powered rules/filters** | "Start filtering these" → AI creates the rule. | DONE |
| 30 | **AI follow-up reminders** | "You emailed them 3 days ago. No reply." | DONE (backend) |

### TIER 4: INFRASTRUCTURE OWNERSHIP (the moat)

| # | Task | Why | Status |
|---|------|-----|--------|
| 31 | **Own email hosting (Postal/Mailcow)** | Offer @yourdomain.com email. Recurring revenue. | DONE (full MTA built) |
| 32 | **On-device AI models** | Zero-latency triage without API calls. True privacy. | NOT STARTED |
| 33 | **Public API + webhooks** | Developers build on Vienna. Platform play. | DONE (21 API routes) |
| 34 | **Team shared inboxes** | Enterprise feature. $12/user/mo. | DONE (backend) |
| 35 | **Admin console + SSO** | Enterprise requirement. | PARTIAL (admin dashboard exists) |
| 36 | **White-label email SDK** | Other apps embed Vienna's email. Licensing revenue. | DONE (SDK published) |

---

## BACKEND ALREADY BUILT (from previous sessions)

The following backend infrastructure is complete and production-ready:

- Full sending pipeline (API → BullMQ → MTA → DKIM sign → SMTP/relay delivery)
- Inbound pipeline (SMTP → parse → filter → route → store)
- SPF/DMARC/DKIM validation + auto-configuration
- Managed relay (SES, MailChannels, generic SMTP)
- IMAP4rev2 server + JMAP service
- Stripe billing (checkout, portal, webhooks, usage enforcement)
- Email template system (CRUD, rendering engine with variables/conditionals/loops)
- Grammar Agent (real-time, 30+ languages, email etiquette checks)
- Advanced Dictation Engine (email-aware voice commands, multi-language)
- Smart Inbox (AI classification, Screener, commitments tracker)
- Email Recall (link-based viewing, revoke, self-destruct)
- Bidirectional Translation (35+ languages)
- Collaboration (shared inboxes, internal comments, assignments)
- Voice Synthesis Engine (VoiceProfileBuilder + ComposeAssistant)
- IP warm-up orchestrator
- Bounce/complaint processing + suppression lists
- Communication Intelligence Graph
- Full-text search (Meilisearch)
- OpenTelemetry monitoring
- Rate limiting (6 tiers)
- Docker/K8s configs, CI/CD pipeline
- E2E test suite (97 tests)
- OpenAPI 3.1 docs (21 routes)
- SDK with examples
- Cloudflare deployment config (DNS, Pages, wrangler.toml)
- Neon PostgreSQL setup SQL
- Production .env template for vienna.com

---

## KNOWN ISSUES — QUEUED FOR FIX

| # | Issue | Severity | Found | Status |
|---|-------|----------|-------|--------|
| 1 | Monorepo `bun run build` not verified | HIGH | 2026-04-05 | PENDING |
| 2 | Web app passkey login button has no onClick handler | MEDIUM | 2026-04-05 | PENDING |
| 3 | Some in-memory stores need DB migration (screener, recall) | MEDIUM | 2026-04-05 | PENDING |

---

## CURRENT STATUS — UPDATE THIS EVERY SESSION

**Date last updated:** 2026-04-05
**Current phase:** Phase 1 — Building the client
**Current step:** TIER 1 COMPLETE — Moving to TIER 2

**Completed this session:**
- Gmail OAuth + API sync engine
- Outlook OAuth + Graph API sync
- Unified IMAP sync engine
- Account connection routes (connect/disconnect/sync)
- Grammar Agent (real-time, 30+ languages)
- Dictation Engine (email-aware voice commands)
- Smart Inbox (AI triage, screener, commitments tracker)
- Email Recall (link-based, revoke, self-destruct)
- Bidirectional Translation (35+ languages)
- Collaboration (shared inboxes, comments, assignments)
- Keyboard shortcuts + Cmd+K command palette
- Full CLAUDE.md business strategy
- Cloudflare + Neon deployment config
- Rebranded to Vienna

**Next action:** Build IndexedDB local cache, dark mode, import/migration tool, desktop app

**MANDATE: Email hasn't been reinvented in 22 years. Gmail has 1.8 BILLION users and hasn't innovated since 2004. The AI wave means the next great email client will be built NOW. Vienna IS that client. Foot on the accelerator at all times.**

---

## CLAUDE.MD IS THE SINGLE SOURCE OF TRUTH

Everything must be stored in CLAUDE.md. Every decision, every component built, every strategic direction. When a new agent starts, it reads CLAUDE.md and knows EXACTLY what's been done, what's next, and why.
