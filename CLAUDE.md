# EMAILED - AI-Native Email Infrastructure Platform

## CRITICAL: Development Execution Rules

**DO NOT STOP. DO NOT ASK. DO NOT WAIT.**

- When you finish a task, immediately move to the next one. Never pause to ask "what should I work on next?" — look at what's missing and build it.
- When an agent finishes, commit its output and start the next piece of work immediately.
- When you hit an error, fix it and keep going. Do not stop to report the error unless you are truly blocked with no path forward.
- The owner is busy with other projects and cannot babysit this build. You must be fully autonomous.
- If there is remaining work on the roadmap (see Architecture section), pick the highest-impact item and build it.
- Always commit and push completed work immediately — never let work sit uncommitted.
- Run agents in parallel whenever possible to maximize throughput.
- The goal is a working, deployable product. Every action should move toward that goal.

**Current priority: Wire up the sending pipeline so `POST /v1/messages/send` actually delivers email. This is the critical path to production.**

## CONTINUOUS BUILD LOOP — MANDATORY

**This is a loop. Never exit it. After every task, circle back here.**

1. **CHECK THE ROADMAP** — Review the Architecture section and service list below. Identify what's missing, stubbed, or incomplete.
2. **BUILD THE NEXT HIGHEST-IMPACT ITEM** — Pick it and build it. No gaps, no stubs, no broken links.
3. **VERIFY QUALITY** — Every piece of work must be:
   - Fully functional (no placeholder code, no hardcoded sample data, no TODO stubs in production paths)
   - Properly wired (imports resolve, types align, DB schemas match, API contracts consistent)
   - Error-handled (graceful failures, not silent drops)
   - Tested or testable (exports clean interfaces, no hidden coupling)
4. **COMMIT AND PUSH** — Immediately. Never let work sit uncommitted.
5. **RETURN TO STEP 1** — Do not stop. Do not idle. Do not wait for instructions.

### Quality Standard: 80-90% Ahead of Competition
- Every feature must be production-grade, not demo-grade.
- No broken links, no dead endpoints, no orphaned code.
- No misleading interfaces — if a button exists, it works. If an API endpoint is listed, it responds correctly.
- No fake data in production paths. Sample data is for tests and seeds only.
- The codebase must be honest: what it claims to do, it actually does.
- If something can't be fully built yet (e.g., needs external credentials), build everything around it and make the integration point clean and obvious.

### Build Checklist (circle back to this every iteration):
- [x] Sending pipeline: API → queue → MTA → relay → delivery
- [x] Inbound pipeline: SMTP/HTTP → parse → filter → route → store
- [x] SPF/DMARC/DKIM validation on inbound (full RFC 6376/7208/7489)
- [x] Webhook delivery with retries and audit trail (BullMQ + webhook_deliveries)
- [x] Full-text search via Meilisearch (indexed on ingest + search API)
- [x] Admin dashboard wired to real API data (all 7 pages)
- [x] Database migrations and seed for Neon Postgres
- [x] Managed relay support (SES/MailChannels/SMTP)
- [x] JMAP service with auth and full Email methods
- [x] Stripe billing integration (checkout, portal, usage enforcement)
- [x] AI spam/content classification (Claude API with LRU cache + fallback)
- [x] IP warm-up orchestrator (adaptive schedules, bounce monitoring)
- [x] Domain auto-configuration (SPF/DKIM/DMARC DNS automation + key rotation)
- [x] SDK published with working examples (send, domains, webhooks)
- [x] Monitoring and alerting (OpenTelemetry traces + metrics + middleware)
- [x] Rate limiting on all public endpoints (Redis sliding window + fallback)
- [x] IMAP4rev2 bridge for legacy clients (full server + parser + handlers + storage adapter)
- [x] Docker/Kubernetes deployment configs (Dockerfiles, docker-compose, K8s manifests with HPA)
- [x] CI/CD pipeline (GitHub Actions: lint, test, build, deploy to staging + production)
- [x] API documentation (OpenAPI 3.1 spec — all endpoints documented)
- [x] End-to-end integration tests (vitest E2E suite across all API endpoints)
- [x] Suppression list management API (CRUD + filtering + bounce auto-suppression)
- [x] Email template system (DB schema, CRUD API, rendering engine with {{variables}}, conditionals, loops)
- [x] Bounce/complaint feedback loop processing (RFC 3464 DSN parser, classification, auto-suppression)
- [x] Communication Intelligence Graph (relationship scoring, follow-up reminders, decay factor)
- [x] Voice Synthesis Engine (VoiceProfileBuilder + ComposeAssistant + Claude API integration + API routes)
- [x] Grammar Agent (real-time grammar/spelling/tone correction, email etiquette checks, 30+ languages, FREE)
- [x] Advanced Dictation Engine (email-aware voice commands, multi-language, AI polish)
- [x] Smart Inbox (AI classification, Screener, commitments tracker, follow-up nudges)
- [x] Email Recall (link-based viewing, revoke access, self-destruct timers)
- [x] Bidirectional Translation (compose in any language, 35+ languages, email-aware)
- [x] Collaboration (shared inboxes, internal comments, assignments, collaborative drafts)

## Vision

Emailed is the most advanced AI-native email infrastructure platform ever built. It competes directly with Mailgun, Google Workspace, Outlook 365, and SendGrid — but surpasses all of them through deep AI integration at every layer. AI controls filtering, reputation, support, abuse detection, deliverability optimization, and operations. This is not email with AI bolted on — this is AI that does email.

Emailed is part of a larger ecosystem of AI-powered infrastructure products that will eventually converge into a unified platform. The email service is designed from day one to integrate with companion products (backend/frontend servers, etc.) as they come online.

## Core Principles

### 1. ZERO HTML — Component Architecture Only
- **No raw HTML anywhere in the frontend.** Everything is built with modern component frameworks.
- UI is built with React (Next.js App Router) using advanced component libraries (Radix UI primitives, custom design system).
- All rendering is component-based. No `dangerouslySetInnerHTML`, no HTML templates, no server-side HTML generation for UI.
- Email rendering (for previews/composition) uses a structured JSON document model, never raw HTML editing.

### 2. AI-First, Not AI-Assisted
- AI is not a feature — it IS the platform.
- Every decision that traditionally required human operators is handled by AI: spam classification, reputation scoring, abuse response, customer support, deliverability optimization, infrastructure scaling.
- AI models are trained continuously on platform data to improve over time.
- The AI learns individual user patterns: writing style, communication graph, priority signals.

### 3. Self-Contained Infrastructure
- Emailed manages its own DNS (authoritative nameservers, automated SPF/DKIM/DMARC).
- Emailed runs its own SMTP/MTA stack (no dependency on Postfix/Sendmail — custom built).
- Emailed handles its own IMAP/JMAP for client access.
- Emailed runs its own API gateway, rate limiting, authentication.
- Emailed manages its own IP reputation and warm-up.
- Zero external email service dependencies.

### 4. Unbreakable Reputation
- Deep internet scanning for sender reputation intelligence.
- AI-powered warm-up sequences that build IP and domain reputation automatically.
- Real-time feedback loop processing (FBL) with all major ISPs.
- Predictive deliverability scoring before emails are sent.
- Automated abuse detection and response — bad actors are identified and removed before they damage platform reputation.
- Compliance engine that enforces CAN-SPAM, GDPR, CASL automatically.

### 5. The "Can't Leave" Factor
- Not through lock-in — through genuine value that compounds over time.
- AI learns user communication patterns, writing style, priority signals.
- Relationship intelligence: who matters, when to follow up, sentiment tracking.
- Communication analytics that get smarter the longer you use the platform.
- Developer API so powerful that businesses build critical workflows on top.
- When you leave, you lose months/years of accumulated intelligence.

## Architecture

### Tech Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Language** | TypeScript (full stack) | Type safety, single language across all services, excellent AI tooling |
| **Runtime** | Node.js + Bun | Bun for performance-critical paths (SMTP, filtering), Node for ecosystem compatibility |
| **Frontend** | Next.js 15 (App Router) | Server components, streaming, zero HTML philosophy via component model |
| **UI Components** | Radix UI + custom design system | Accessible, unstyled primitives we fully control |
| **Styling** | Tailwind CSS + CSS Modules | Utility-first, no raw HTML styling |
| **State** | Zustand + TanStack Query | Lightweight, performant, server-state aware |
| **SMTP/MTA** | Custom TypeScript MTA | Full control over sending pipeline, AI integration at every hop |
| **IMAP/JMAP** | Custom JMAP server | Modern protocol, better than IMAP for AI integration |
| **DNS** | Custom authoritative DNS | Full control over records, automated SPF/DKIM/DMARC management |
| **Database** | PostgreSQL + Redis + ClickHouse | Postgres for relational, Redis for sessions/queues, ClickHouse for analytics |
| **Queue** | BullMQ (Redis-backed) | Reliable job processing for email pipeline |
| **AI/ML** | Claude API + custom models | Claude for NLP tasks, custom models for spam/reputation scoring |
| **Search** | Meilisearch | Fast full-text email search |
| **Storage** | S3-compatible (MinIO self-hosted) | Attachment storage, email archival |
| **Auth** | Custom OAuth2/OIDC + Passkeys | Modern auth, passwordless-first |
| **Monitoring** | OpenTelemetry + Grafana | Full observability, AI-driven alerting |
| **Container** | Docker + Kubernetes | Production orchestration |
| **IaC** | Pulumi (TypeScript) | Infrastructure as code in the same language |

### Service Architecture

```
emailed/
├── CLAUDE.md                          # This file — project constitution
├── package.json                       # Monorepo root (workspaces)
├── turbo.json                         # Turborepo build orchestration
├── tsconfig.base.json                 # Shared TypeScript config
│
├── apps/
│   ├── web/                           # Main web application (Next.js 15)
│   │   ├── app/                       # App Router pages
│   │   ├── components/                # UI components (ZERO HTML)
│   │   └── lib/                       # Client utilities
│   │
│   ├── api/                           # REST/GraphQL API gateway
│   │   ├── routes/                    # API endpoints
│   │   ├── middleware/                # Auth, rate limiting, validation
│   │   └── webhooks/                  # Inbound webhook handlers
│   │
│   └── admin/                         # AI-powered admin dashboard
│       ├── app/                       # Admin UI
│       └── components/               # Admin components
│
├── services/
│   ├── sentinel/                      # AI-Powered Zero-Latency Validation Pipeline
│   │   ├── src/
│   │   │   ├── pipeline.ts           # Main orchestrator (tiered confidence routing)
│   │   │   ├── cache/                # Decision cache (sub-microsecond lookups)
│   │   │   ├── fingerprint/          # Item fingerprinting for cache matching
│   │   │   ├── scoring/              # AI confidence scorer (determines inspection depth)
│   │   │   └── inspection/           # Parallel check engine + built-in checks
│   │   └── tests/
│   │
│   ├── mta/                           # Mail Transfer Agent (SMTP sending)
│   │   ├── src/
│   │   │   ├── smtp/                  # SMTP server & client
│   │   │   ├── queue/                 # Send queue management
│   │   │   ├── dkim/                  # DKIM signing
│   │   │   ├── spf/                   # SPF validation
│   │   │   ├── dmarc/                 # DMARC policy enforcement
│   │   │   ├── tls/                   # TLS/STARTTLS handling
│   │   │   ├── bounce/               # Bounce processing
│   │   │   └── delivery/             # Delivery optimization
│   │   └── tests/
│   │
│   ├── inbound/                       # Inbound email processing
│   │   ├── src/
│   │   │   ├── receiver/             # SMTP receiver
│   │   │   ├── parser/               # MIME parsing
│   │   │   ├── filter/               # Spam/phishing filtering pipeline
│   │   │   ├── routing/              # Mailbox routing
│   │   │   └── storage/              # Email storage
│   │   └── tests/
│   │
│   ├── ai-engine/                     # Core AI/ML engine
│   │   ├── src/
│   │   │   ├── spam/                  # AI spam detection
│   │   │   ├── reputation/           # Sender reputation scoring
│   │   │   ├── content/              # Content analysis & classification
│   │   │   ├── compose/              # AI writing assistance
│   │   │   ├── priority/             # Smart inbox prioritization
│   │   │   ├── relationships/        # Communication graph & intelligence
│   │   │   ├── sentiment/            # Sentiment analysis
│   │   │   ├── threat-intel/         # Real-time threat intelligence
│   │   │   └── models/               # Model management & training
│   │   └── tests/
│   │
│   ├── dns/                           # DNS management service
│   │   ├── src/
│   │   │   ├── authoritative/        # Authoritative DNS server
│   │   │   ├── records/              # Record management (SPF/DKIM/DMARC/MX)
│   │   │   ├── monitoring/           # DNS health monitoring
│   │   │   └── propagation/          # Propagation checking
│   │   └── tests/
│   │
│   ├── jmap/                          # JMAP protocol server (modern IMAP replacement)
│   │   ├── src/
│   │   │   ├── server/               # JMAP protocol handler
│   │   │   ├── mailbox/              # Mailbox operations
│   │   │   ├── thread/               # Threading engine
│   │   │   └── push/                 # Push notifications
│   │   └── tests/
│   │
│   ├── reputation/                    # IP & domain reputation management
│   │   ├── src/
│   │   │   ├── warmup/               # Automated IP warm-up
│   │   │   ├── scoring/              # Reputation scoring engine
│   │   │   ├── feedback-loops/       # ISP feedback loop processing
│   │   │   ├── blocklist/            # Blocklist monitoring & remediation
│   │   │   └── compliance/           # CAN-SPAM/GDPR/CASL enforcement
│   │   └── tests/
│   │
│   ├── support/                       # AI-powered customer support
│   │   ├── src/
│   │   │   ├── agent/                # AI support agent
│   │   │   ├── knowledge/            # Knowledge base management
│   │   │   ├── tickets/              # Ticket system
│   │   │   ├── diagnostics/          # Automated issue diagnosis
│   │   │   └── escalation/           # Smart escalation
│   │   └── tests/
│   │
│   └── analytics/                     # Analytics & reporting
│       ├── src/
│       │   ├── tracking/             # Open/click/delivery tracking
│       │   ├── reporting/            # Report generation
│       │   ├── insights/             # AI-generated insights
│       │   └── export/               # Data export
│       └── tests/
│
├── packages/
│   ├── shared/                        # Shared types, utilities, constants
│   │   ├── src/
│   │   │   ├── types/                # Shared TypeScript types
│   │   │   ├── constants/            # Platform constants
│   │   │   ├── utils/                # Shared utilities
│   │   │   └── errors/               # Error types & handling
│   │   └── tests/
│   │
│   ├── db/                            # Database schema, migrations, client
│   │   ├── src/
│   │   │   ├── schema/               # Drizzle ORM schema
│   │   │   ├── migrations/           # Database migrations
│   │   │   └── client/               # Database client
│   │   └── tests/
│   │
│   ├── ui/                            # Design system & component library
│   │   ├── src/
│   │   │   ├── primitives/           # Base components (Radix-based)
│   │   │   ├── composites/           # Composed components
│   │   │   ├── layouts/              # Layout components
│   │   │   ├── icons/                # Icon system (SVG components, not HTML)
│   │   │   └── theme/                # Theme system
│   │   └── tests/
│   │
│   ├── email-parser/                  # Email parsing library (MIME, headers, etc.)
│   │   ├── src/
│   │   └── tests/
│   │
│   ├── crypto/                        # Cryptography utilities (DKIM, TLS, encryption)
│   │   ├── src/
│   │   └── tests/
│   │
│   └── sdk/                           # Public developer SDK (@emailed/sdk)
│       ├── src/
│       │   ├── client/               # API client
│       │   ├── resources/            # Resource classes (messages, domains, etc.)
│       │   └── webhooks/             # Webhook verification
│       └── tests/
│
├── infrastructure/
│   ├── docker/                        # Docker configurations
│   ├── kubernetes/                    # K8s manifests
│   ├── pulumi/                        # Infrastructure as Code
│   └── scripts/                       # Deployment & maintenance scripts
│
└── docs/
    ├── api/                           # API documentation
    ├── architecture/                  # Architecture decision records
    └── guides/                        # Developer guides
```

### Key Innovations

1. **Sentinel — Zero-Latency Validation Pipeline**: The biggest innovation. Traditional email security runs checks sequentially (300-800ms). Sentinel uses an AI confidence model to route items through tiered inspection paths. Known-good patterns (95% of traffic) bypass deep checks in <1ms via a decision cache. Ambiguous items (4%) get parallel inspection in <50ms. Only truly suspicious items (1%) get deep analysis. This eliminates the security-vs-speed tradeoff entirely.

2. **Neural Reputation Engine (NRE)**: AI model that predicts deliverability before sending by analyzing content, recipient patterns, sender history, and real-time ISP signals. No other platform does pre-send deliverability prediction at this depth.

3. **Communication Intelligence Graph (CIG)**: Builds a knowledge graph of user relationships, communication patterns, and sentiment over time. Powers smart prioritization, follow-up reminders, and relationship health scoring.

3. **Zero-Config Authentication**: AI automatically configures SPF, DKIM, DMARC, BIMI, and MTA-STS for every domain. Users never touch a DNS record — the system handles it all through integrated DNS management.

4. **Adaptive Content Shield**: AI content filter that evolves in real-time against new phishing/spam techniques by scanning the broader internet for emerging threats and patterns.

5. **Voice Synthesis Engine**: Learns each user's writing style and can draft emails that sound exactly like them, with appropriate tone adjustment for context (formal, casual, urgent).

6. **Autonomous Support Agent**: AI support system with full platform access that can diagnose and resolve issues (deliverability problems, authentication failures, reputation drops) without human intervention.

7. **Predictive Warm-up Orchestrator**: AI-driven IP warm-up that adapts sending patterns in real-time based on ISP response signals, achieving optimal reputation faster than static warm-up schedules.

## Development Rules

### Code Standards
- TypeScript strict mode everywhere (`strict: true`, `noUncheckedIndexedAccess: true`)
- All code must pass ESLint + Prettier
- Every service must have >80% test coverage
- No `any` types — use `unknown` and narrow
- Prefer `const` assertions and discriminated unions
- Error handling via Result types, not try/catch for business logic
- All public APIs must have OpenAPI specs

### Component Rules (Frontend)
- ZERO raw HTML elements — wrap everything in components
- Every component must be accessible (ARIA, keyboard nav)
- All components must support theming
- No inline styles — Tailwind classes or CSS modules only
- Components must be documented with Storybook stories
- Server Components by default, Client Components only when needed

### AI Integration Rules
- All AI calls must have fallback behavior if AI is unavailable
- AI decisions must be logged and auditable
- User data used for AI must be anonymizable
- AI models must be versioned and rollback-capable
- Confidence scores must accompany all AI classifications

### Email Protocol Rules
- Full RFC 5321 (SMTP), RFC 5322 (IMF), RFC 6376 (DKIM) compliance
- JMAP over IMAP for client connections (RFC 8620, 8621)
- TLS 1.3 minimum for all connections
- DANE/TLSA support for enhanced security
- ARC (Authenticated Received Chain) support

### Security Rules
- No secrets in code — environment variables or secrets manager only
- All inter-service communication over mTLS
- Rate limiting on all public endpoints
- Input validation at service boundaries
- Regular dependency auditing
- CSP headers on all web responses
- HSTS preloading

### Performance Targets
- Email send API: <100ms p99 response time
- Inbound processing: <500ms from receipt to mailbox
- Web UI: <1s LCP, <100ms FID
- Search: <50ms for queries up to 10 million emails
- AI classification: <200ms per email
- 99.99% uptime SLA target

## AI Automation Strategy

### Tier 1 — Fully Autonomous (No Human Required)
- Spam/phishing classification
- Email routing and delivery
- IP warm-up and reputation management
- DNS record management
- Basic customer support (account issues, how-to questions)
- Abuse detection and initial response
- Infrastructure scaling
- Monitoring and alerting
- Compliance checking

### Tier 2 — AI-Driven, Human-Supervised
- Complex abuse cases (requires review before account termination)
- Major infrastructure changes
- Model retraining decisions
- Policy changes
- Enterprise customer onboarding

### Tier 3 — Human-Led, AI-Assisted
- Product strategy and roadmap
- Pricing decisions
- Legal and regulatory compliance review
- Partnership negotiations
- Marketing strategy

## Getting Started

```bash
# Install dependencies
bun install

# Start development environment
bun run dev

# Run all tests
bun run test

# Build all packages
bun run build
```
