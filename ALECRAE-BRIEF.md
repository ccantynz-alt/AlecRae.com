# ALECRAE.COM — FULL PLATFORM CAPABILITY BRIEF

**What it is:** AI-native email client platform. Replaces Gmail, Outlook, Superhuman, Grammarly, Dragon, Front, and Otter.ai — all in one $9/mo subscription.

**Codebase:** ~35,000 lines of TypeScript across a Bun monorepo. 100+ API endpoints. 67 features built across 4 tiers + 31 advanced features.

**Tagline:** "Email, Evolved."

---

## TECH STACK

### Backend & Runtime
- **Runtime:** Bun (52K req/s, native TypeScript)
- **API Framework:** Hono (4x faster than Express, edge-compatible)
- **TypeScript strict mode** — no `any`, no `@ts-ignore`
- **API Layer:** tRPC + REST + OpenAPI (type-safe end-to-end)
- **ORM:** Drizzle (7.4KB bundle, SQL-like TS, serverless-optimized)
- **Validation:** Zod at every boundary

### Frontend & UI
- **Framework:** Next.js 15 (App Router, RSC, streaming)
- **Custom design system** built on Radix primitives — zero raw HTML in app code
- **Tailwind CSS** (utility-first, zero unused CSS shipped)
- **State:** Signals + TanStack Query
- **Rich text editor:** Tiptap
- **Animations:** Framer Motion (spring physics, layout animations)
- **Bundler:** Turbopack (Rust-based)
- **Linter:** Biome (50-100x faster than ESLint+Prettier)

### AI Layer
- **Primary LLM:** Claude (Anthropic) — Haiku 4.5 / Sonnet 4.6 / Opus 4.6 by tier
- **Transcription:** Whisper API (OpenAI)
- **Local inference:** Transformers.js / WebLLM (runs on user GPU, $0/token)
- **Translation:** Claude API
- **Embeddings:** Voyage AI (semantic search)

### Data
- **Primary DB:** Neon Serverless Postgres (scale-to-zero, Git-like branches)
- **Cache/Queue:** Upstash Redis (serverless, REST API)
- **Search:** Meilisearch (sub-50ms full-text, typo tolerance)
- **Object Storage:** Cloudflare R2 (S3-compatible, zero egress fees)
- **Local Cache:** IndexedDB (browser-native, offline-first)
- **Analytics DB:** ClickHouse (time-series at scale)

### Infrastructure
- **Hosting:** Cloudflare Pages + Workers (sub-5ms cold starts, 330+ cities)
- **DNS/CDN:** Cloudflare
- **GPU Compute:** Modal.com (A100/H100 on-demand)
- **Long-lived processes:** Fly.io (Firecracker microVMs for MTA, WebSocket)
- **CI/CD:** GitHub Actions (multi-stage: lint, typecheck, test, build, deploy)
- **Monitoring:** OpenTelemetry + Grafana LGTM stack
- **Security scanning:** CodeQL + Gitleaks + OSV-Scanner + dependency audit

### Auth & Security
- **Primary auth:** Passkeys / WebAuthn (FIDO2) — 98% login success rate
- **OAuth:** Google + Microsoft direct integrations
- **JWT:** jose library (RS256 + refresh rotation)
- **Encryption:** Web Crypto API (RSA-OAEP-4096 + AES-256-GCM)
- **TLS 1.3 minimum** everywhere
- **Admin SSO:** SAML 2.0 SP (SP metadata, ACS, SLO endpoints)

### Payments
- **Stripe** — Free / Personal $9 / Pro $19 / Team $12pp / Enterprise custom

### Apps
- **Web:** Next.js 15 (PWA-ready)
- **Desktop:** Electron (native menus, tray, window management, IPC, deep links)
- **Mobile:** React Native + Expo (all screens, auth, API client, accessibility)

---

## CORE EMAIL FEATURES (Tier 1-2: 20 features)

1. **IMAP/JMAP sync engine** — connects any email provider
2. **Gmail OAuth + API sync** — native Google integration
3. **Outlook OAuth + Graph API sync** — native Microsoft integration
4. **Inbox UI + thread view** — full conversation threading
5. **Rich text compose** — Tiptap editor with formatting toolbar
6. **AI Compose** — Claude-powered email drafting
7. **AI Triage + priority inbox** — automatic email classification and prioritization
8. **Local IndexedDB cache** — sub-100ms inbox loads, works offline
9. **Keyboard shortcuts + Cmd+K command palette** — every action has a shortcut
10. **Search** — Meilisearch + local full-text search
11. **AI Reply suggestions** — one-click smart replies
12. **AI Thread summary** — collapse long threads to key points
13. **Snooze + schedule send** — time-based email management
14. **Undo send** — 10-30 second window to recall
15. **Multi-account** — Gmail + Outlook + IMAP all in one inbox
16. **Dark mode + themes** — 7 accent colors, 3 density levels (compact/comfortable/spacious)
17. **Stripe billing** — full subscription management flow
18. **Auth system** — passkeys, WebAuthn, OAuth
19. **Settings pages** — full account/preferences management
20. **Import/migration** — Gmail, Outlook, MBOX, EML file import

---

## MARKET LEADERSHIP FEATURES (Tier 3: 10 features)

21. **AI natural language search** — "find emails from last week about the budget"
22. **Calendar integration** — events linked to email threads
23. **Contact management** — DB-backed with relationship tracking
24. **E2E encryption** — RSA-OAEP-4096 + AES-256-GCM, zero-knowledge architecture
25. **Email analytics** — open rates, response times, patterns
26. **AI-powered rules/filters** — smart automation based on content
27. **AI follow-up reminders** — "you haven't replied to this in 3 days"
28. **Voice Profile** — AI learns YOUR writing style across emails
29. **AI Unsubscribe** — one-click unsubscribe automation
30. **Grammar Agent** — replaces Grammarly ($30/mo value), built in free

---

## INFRASTRUCTURE MOAT (Tier 4: 8 features)

31. **Own email hosting** — full custom MTA (SMTP server, relay, bounce processing, DKIM/SPF/DMARC, IP warmup, deliverability monitoring)
32. **Electron desktop app** — native menus, system tray, badge counts, auto-updater, deep links (mailto:)
33. **React Native mobile app** — all screens, tab navigation, auth, API client, haptics, gestures, accessibility
34. **On-device AI models** — Transformers.js wired into grammar agent, runs on user GPU at $0/token
35. **Public API + webhooks** — full REST API with webhook delivery, SDK, and OpenAPI spec
36. **Team shared inboxes** — collaborative email with assignments, comments
37. **White-label SDK** — rebrandable email client for enterprise customers
38. **Admin SSO** — SAML 2.0 SP with jose JWT, admin login page, SP metadata, ACS, SLO

---

## INDUSTRY-FIRST FEATURES (Tier S: 10 features)

39. **WebGPU client-side AI inference** — Llama 3.1 8B at 41 tok/sec IN THE BROWSER. $0/token. No competitor has this. Full WebLLM engine, Zod-validated API, IndexedDB model cache, progress events.
40. **CRDT real-time collaborative drafting** — two people editing the same email with live cursors (Yjs + WebSocket). Industry first in email.
41. **AI inbox agent (works while you sleep)** — overnight triage, drafts replies, schedules sends. You approve in the morning with one tap. Full engine with confidence scoring and human-in-the-loop.
42. **Voice cloning for AI replies** — drafts sound exactly like you. Multi-profile (professional/casual), DB-persisted style fingerprints (rhythm, vocabulary, punctuation, formality, emoji).
43. **Semantic vector search** — "find the email where someone said something like 'we should consider the budget'" — searches by meaning, not keywords.
44. **Auto-summary of every newsletter** — AI reduces newsletters to 3 bullet points in inbox preview. Full text on demand.
45. **AI "Why is this in my inbox?" explainer** — click any email, AI explains who sent it, history, why it landed here, suggested action.
46. **One-click thread to action items** — native Things, Todoist, Linear, Notion integration. AI extracts tasks from email threads.
47. **Email thread to meeting transcript link** — auto-links recordings + Whisper transcriptions + Claude summaries.
48. **Predictive send-time optimization** — AI predicts best send time based on recipient open patterns.

---

## CUTTING-EDGE UX (Tier A: 7 features)

49. **Magic UI animations (Linear-style)** — Framer Motion spring physics, 8 reusable animation components wired across the entire app.
50. **Spatial inbox (3D thread visualization)** — React Three Fiber 3D view. InstancedMesh for 1000+ threads, configurable axes, orbit controls, hover tooltips.
51. **Inbox heatmap** — GitHub-style contribution heatmap for email habits, 24h hourly activity chart, stats dashboard.
52. **Focus mode** — hides everything except important emails. Full screen, timer, progress tracking, Cmd+Shift+F shortcut.
53. **Quick-reply gestures (mobile)** — five-action swipe (reply/snooze/archive/flag/delete), AI quick-reply bottom sheet.
54. **Drag-to-snooze on mini-calendar** — HTML5 DnD + touch long-press, mini-calendar drop zones, time slot picker, quick presets.
55. **Inbox zero rituals (gamification)** — streaks, achievements, celebration animations. DB-backed. Respects prefers-reduced-motion.

---

## POWER USER FEATURES (Tier B: 8 features)

56. **Programmable email (TypeScript snippets)** — Apps Script but type-safe. Sandboxed runner, 8 templates, script editor UI, DB-persisted run history.
57. **Email-as-database (SQL over inbox)** — query your inbox with natural language or SQL-like syntax. Split-pane console, CSV export, saved queries.
58. **AI unsubscribe agent (browser automation)** — one click, AI navigates the unsubscribe page and confirms.
59. **Auto-translation badges** — "Translated from Spanish" badge with toggle to original. 35+ languages.
60. **Real-time sender verification** — SPF/DKIM/DMARC checks, DNS auth records, WHOIS domain age, typosquatting detection, trust badges.
61. **Phishing protection with explainer** — multi-signal AI analysis (urgency, credential harvesting, URL mismatch, homograph detection). Claude Sonnet explains WHY it's suspicious.
62. **AI calendar slot suggestions in compose** — type "let's meet next week" and AI suggests available slots inline.
63. **Voice-to-voice replies** — voice messages as attachments with auto-transcription. Whisper transcription, inline HTML player, waveform visualization.

---

## BONUS FEATURES (not in original plan)

64. **Advanced Dictation Engine** — replaces Dragon Professional ($500+). Email-aware voice commands, multi-language.
65. **Smart Inbox with Screener** — Hey.com-style inbox screening, AI-powered.
66. **Email Recall** — link-based email recall with revoke. Actually works (unlike Outlook's).
67. **Bidirectional Translation** — compose-side translation in 35+ languages.
68. **Real-time Collaboration** — shared inboxes, inline comments, task assignments.

---

## POLISH & TRUST (Tier C: 6/10 done)

69. **Status page app** — status.alecrae.com (built, ready to deploy)
70. **Public API docs site** — docs.alecrae.com (22 pages, full endpoint reference, code examples, search)
71. **Changelog app** — changelog.alecrae.com (built, ready to deploy)
72. **Migration guides** — "From Gmail to AlecRae in 5 minutes" + Outlook + Apple Mail
73. **Spell check (multi-language)** — native browser spell-check + custom dictionary
74. **Error boundaries** — root + dashboard error recovery pages, branded 404 page
75. **SEO** — sitemap.xml, robots.txt, Open Graph tags, Twitter cards, meta keywords

---

## INFRASTRUCTURE ALREADY BUILT

- **Full MTA** (Mail Transfer Agent) — SMTP server, relay, bounce processing, DKIM signing, SPF/DMARC enforcement, IP warmup, deliverability monitoring, feedback loop processing
- **12 microservices:** API, AI engine, MTA, inbound mail, IMAP server, JMAP server, DNS management, analytics, reputation scoring, security scanning, collaboration (WebSocket), support/ticketing
- **6 shared packages:** DB schemas, crypto utils, email parser, SDK, shared types, UI component library
- **Kubernetes manifests** — full deployment configs (API, MTA, web, Postgres, Redis, HPA, network policies, secrets)
- **Docker Compose** — local dev environment with all services
- **Pulumi IaC** — infrastructure-as-code for database, networking, Kubernetes
- **Cloudflare configs** — DNS setup script, wrangler.toml, Pages configuration
- **CI/CD pipeline** — GitHub Actions with lint, typecheck, test, build, Docker build, staging deploy, production deploy with health checks
- **Security scanning** — CodeQL, Gitleaks, OSV-Scanner, dependency audit on every PR

---

## DOMAIN STRUCTURE

| Subdomain | Purpose | Tech |
|-----------|---------|------|
| alecrae.com | Landing/marketing | Cloudflare Pages |
| mail.alecrae.com | Email web app | Cloudflare Pages |
| admin.alecrae.com | Admin dashboard | Cloudflare Pages |
| api.alecrae.com | API server | Cloudflare Workers / Fly.io |
| smtp.alecrae.com | MTA outbound | Fly.io |
| mx1/mx2.alecrae.com | Inbound MX | Fly.io |
| status.alecrae.com | Status page | Cloudflare Pages |
| docs.alecrae.com | API docs | Cloudflare Pages |
| changelog.alecrae.com | Changelog | Cloudflare Pages |

---

## APPS IN THE MONOREPO

| App | Path | Tech | Status |
|-----|------|------|--------|
| Web app (landing + inbox) | apps/web | Next.js 15 | Production-ready |
| API server | apps/api | Hono + Bun | Production-ready |
| Admin dashboard | apps/admin | Next.js 15 | Production-ready |
| Desktop app | apps/desktop | Electron | Polished |
| Mobile app | apps/mobile | React Native + Expo | Polished |
| API docs site | apps/docs | Next.js 15 | Production-ready |
| Status page | apps/status | Next.js 15 | Production-ready |
| Changelog | apps/changelog | Next.js 15 | Production-ready |

---

## PRICING MODEL

| Plan | Price | Includes |
|------|-------|----------|
| Free | $0/mo | 1 account, basic AI (5 composes/day), 30-day search |
| Personal | $9/mo | 3 accounts, full AI, unlimited search, E2EE, snooze, schedule send |
| Pro | $19/mo | Unlimited accounts, priority AI (Sonnet), team features, API access |
| Team | $12/user/mo | Shared inboxes, admin console, audit logs, SSO |
| Enterprise | Custom | On-prem, compliance, dedicated support, SLA, Opus AI |

**Add-ons:** Custom domain hosting ($4/user/mo), Priority AI ($5/mo), Email analytics ($7/mo), API access ($0.01/call), White-label ($2K-$10K/mo)

---

## COMPETITIVE POSITION

**What AlecRae replaces and what users save:**

| Tool | Their Price | AlecRae |
|------|------------|---------|
| Gmail Workspace + Gemini | $12-30/mo | included |
| Grammarly Premium | $12-30/mo | included |
| Dragon Professional | $500+ (dead) | included |
| Front (per user) | $19-59/mo | included |
| Superhuman | $30/mo | included |
| Proton Mail | $5-10/mo | included |
| Otter.ai | $10/mo | included |
| **TOTAL** | **~$100+/mo** | **$9/mo** |

---

## THREE-TIER COMPUTE MODEL

```
CLIENT GPU (WebGPU)  -->  EDGE (Cloudflare Workers)  -->  CLOUD (Modal GPUs)
$0/token                  sub-50ms                        Full H100 power
sub-10ms                  lightweight inference            heavy AI / training
grammar/triage            compose/translate                voice profile train
```

The platform picks the tier automatically. User just sees speed.

---

## WHAT'S NEEDED TO GO LIVE

All code is done. Remaining items are infrastructure accounts:
- Neon database (setup SQL already written)
- Upstash Redis
- Stripe account + webhook config
- Anthropic API key (for Claude AI)
- OpenAI API key (for Whisper)
- Google Cloud project (Gmail OAuth)
- Microsoft Azure app (Outlook OAuth)
- DNS pointed to Cloudflare

**Or:** onboard to Crontech and handle it all there.
