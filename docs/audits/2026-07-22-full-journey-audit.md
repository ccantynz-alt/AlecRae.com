# Full Journey Audit & Build Plan — 2026-07-22

> **Last updated: 2026-07-22 09:00 UTC**

**This is the source of truth for "does it actually work," superseding any status claims in CLAUDE.md's Known Issues table for the 49 journeys covered below.** It was produced by 49 independent, code-grounded audits — one per sidebar tab — each explicitly instructed to trust nothing in any markdown doc and verify directly against current source (frontend → API route → database/AI call). This is the audit Craig asked for after the previous one (2026-07-19) was never saved anywhere and got lost. It will not happen again — this file stays in the repo, gets checked off as items ship, and gets re-run periodically rather than trusted forever.

**Method:** one Explore agent per journey, each tracing the real request path (page component → API client call → backend route handler → DB write/AI call), rendering one of: `real` / `partial` / `fabricated` / `broken` / `not_wired`. Full evidence (file + line) for every verdict is below. Raw agent transcripts: workflow run `wf_2b488e29-191`.

---

## The one finding that matters most

**A third of this app's "automatic" features are not automatic.** Eleven separate features across four different nav sections promise some version of "this runs automatically as email arrives / syncs" — and in every single case, the promise is false because **nothing in the real email-ingestion pipeline (`apps/api/src/sync/engine.ts`, the mailbox-sync worker, the MTA inbound worker) ever calls the feature's own, otherwise-correctly-built trigger endpoint.** The CRUD, the database schema, the auth scoping, and often the AI call itself are all genuinely real — someone built the back half of each feature correctly and then never connected the front half. This is not 11 separate bugs; it's one missing integration point repeated 11 times:

| Feature | What never fires | Real endpoint that exists and works, but nothing calls |
|---|---|---|
| Knowledge Graph | entity/relationship extraction from new mail | `POST /v1/knowledge/extract` |
| Hygiene | habit/subscription tracking from mailbox activity | (no endpoint even exists yet — no producer at all) |
| Productivity | time-on-email tracking | `POST /v1/productivity/track` |
| Sentiment | relationship-health scoring | `POST /v1/sentiment/analyze` |
| Attachments | attachment analysis on new mail | `POST /v1/attachment-intelligence/analyze` |
| Scheduling (proposals) | meeting-intent detection | `POST /v1/scheduling/detect` + `/propose` |
| Scripts | user-authored on_receive/on_send automations | `runProgram`-equivalent (`snippet-runner.ts`) |
| Programs | same, differently-shaped table | `runProgram()` (QuickJS sandbox) |
| Auto-Responder | vacation replies to incoming mail | nothing — no dispatcher exists |
| A/B Testing | actually sending + tracking variants | nothing — "Start Test" only zeroes counters |
| Mail Merge | actually sending the campaign | nothing — code comment admits a worker "would" do this |

**Fix this once, well, and eight of these features become real in the same afternoon.** The shape of the fix: a single hook point in the real inbound pipeline (`sync/engine.ts` / `received-email-store.ts`, which already exists and already fires `email.received` webhooks per issue #70) that, for each new email, checks each account's enabled automations of every kind above and dispatches to the already-built handlers. Mail Merge and A/B Testing need a separate outbound-send worker (different shape — campaign fan-out, not per-message reaction), but it's the same category: one real background worker, not eleven.

---

## Scorecard

Legend: 🟢 real · 🟡 partial · 🟠 not wired (real underneath, never triggered) · 🔴 broken (crashes/fails today) · ⚫ fabricated (fake data presented as real)

### Mail
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Inbox | 🟢 real | Full real CRUD, real AI reply/summarize (Claude, honest degrade), correct tenant scoping. | none |
| Compose | 🟢 real | Real send pipeline, undo-send, grammar (real Claude call), calendar slots, dictation (real Whisper). | none |
| Sent | 🟡 partial | Real list/send, but "Opened" badge is permanently false — tracking pixel fires but never updates the read tag. | small |
| Drafts | 🔴 broken | "Save Draft" in Compose persists nothing. Drafts page queries the wrong status (`queued` instead of `draft`). Two independent bugs stacked. | small |
| Snoozed | 🟢 real | Real snooze/unsnooze, background resurface job actually runs. | none |

### AI Features
| Journey | Status | Summary | Fix |
|---|---|---|---|
| AI Agent | 🟢 real | Overnight triage/draft/approve is real end to end, including real send on approval. | none |
| AI Intelligence | 🟡 partial | Priority/sentiment/replies/predictions all real Claude calls, persisted correctly. Relationship Insights panel reads a table nothing ever writes to. | medium |
| Commitments | 🟡 partial | Real Claude extraction, real persistence. Confidence % is a hardcoded constant (0.85/0.95/0.80), not model output. No auto-extraction despite the page claiming it. | small |
| Knowledge Graph | 🟠 not wired | Real CRUD/graph view; extraction endpoint real but never called by anything — permanently empty for every user. Extraction itself is regex, not AI, despite "AI-built" framing. | medium |
| Attachments | 🟡 partial | Real persistence/scoping, but virus scan is `Math.random()` generating fake malware names, "AI analysis" is if/else regex, OCR returns a hardcoded placeholder string, and nothing ever populates the library for a real user. | medium |
| Scheduling | 🟡 partial | Send-Time Analytics tab is fully real. Meeting Intelligence proposals are real DB/auth but never created — no dispatcher — and "AI reasoning"/confidence is a keyword count, not AI. | medium |
| AI Triage | 🔴 broken | Real Claude categorization underneath, but the page's client-side plan gate says "personal" while the backend requires "pro" — every API call 403s for Personal-tier users who the page lets in. | trivial |
| Voice | 🟢 real | Voice-clone training (real feature extraction + confidence) and voice messages (real Vapron upload + Whisper transcription) both genuinely wired, honest degrade if unconfigured. | none |
| Translation | 🔴 broken | Real Claude translation exists on the backend, but this page sends the wrong field names (`sourceLang` vs `sourceLanguage`) and calls a `/history` endpoint that doesn't exist — every translate attempt 422s. | small |
| Achievements | 🔴 broken | Real streak/achievement logic on the backend, but the page calls `GET /v1/gamification/streak`, which doesn't exist (404), and two other endpoints have mismatched response shapes — page always shows an error banner and fake demo badges. | small |
| Hygiene | 🟠 not wired | Real CRUD/scoring math, but the two tables the whole dashboard reads from are never populated by anything — permanently empty for every user. "AI Audit"/"AI Cleanup" are threshold rules, not AI. | medium |

### Tools
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Templates | 🟢 real | Real CRUD, real render engine. Minor: create response omits body fields until reload. | trivial |
| Contacts | 🟡 partial | Core contacts/notes/timeline real. "Groups" tab's entire router is missing `authMiddleware` — every request 401s. | trivial |
| Calendar | 🟡 partial | Real event CRUD. "Find a time" ignores attendees/availability entirely and fabricates 5 slots with a made-up confidence score. | medium |
| Tasks | 🟢 real | Real Claude extraction, real persistence, honest fallback if no API key. | none |
| Files | 🔴 broken | Real, correctly-scoped backend (including the presigned-upload fix from earlier today) — but the frontend and backend speak different response shapes (`{data:...}` envelope, field names), so `files.map()` throws and the page crashes for every user. | small |
| Documents | 🟡 partial | Real CRUD, versioning, real Claude AI Assist. PDF export honestly returns 501 instead of a fake PDF. | small |
| Meet | 🟡 partial | Room management is real. Video calling itself doesn't exist (join link points nowhere), scheduling doesn't persist, recordings never populate, AI summary is a hardcoded canned string — though the frontend does honestly detect and flag the fake summary. | large |
| Search | 🟡 partial | Core keyword + NL search real (Meilisearch + Claude). Four secondary widgets (suggestions, trending, related-emails, NL structuring) are hardcoded stubs — honestly labeled "Sample terms..." to the user. | medium |
| Smart Folders | 🟡 partial | Real CRUD and a real filtered-emails endpoint exists — but the "Open inbox" link passes a query param the Inbox page never reads, so the filter silently does nothing. | small |
| Scripts | 🟡 partial | Real CRUD, real sandboxed test-run (QuickJS). Nothing in the mail pipeline ever runs a saved script against real mail — only manual "Test" executes anything. | medium |

### Automation
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Automations | 🟡 partial | AI Rules tab: real Claude rule creation, real application to incoming mail (7/11 action types). Auto-Responder and Workflows tabs are inert — see below and Mail Merge/A-B pattern. | medium |
| Auto-Responder | 🟡 partial | Config genuinely saves. Nothing ever sends a reply to incoming mail. "AI Reply Preview" is also broken today (request/response contract mismatch) on top of being templated, not AI. | medium |
| A/B Testing | 🟡 partial | Real CRUD. "Start Test" never sends anything; open/click/reply counts can never move off zero; winner "confidence" is a hardcoded 0.95. | medium |
| Mail Merge | 🟠 not wired | Real campaign/recipient CRUD. Clicking "Send" only flips a status flag — a code comment admits the worker that should send emails was never written. Every campaign sits at "sending" forever, 0 delivered. | medium |
| Programs | 🟡 partial | Real CRUD, real sandboxed test-run. No dispatcher runs a program against real mail — only the manual "Run test" button executes anything. | medium |

### Security & Compliance
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Security | 🔴 broken | The four Security Intelligence tabs (threats/policies/audit-log/reputation) are genuinely real and correctly refuse to fabricate scores. The default Overview tab — the first thing every user sees — calls three endpoints that don't exist (404) and a fourth whose response shape doesn't match what the page expects (crashes on success). | small |
| Notifications | 🟡 partial | Preferences, devices, and rule-matching are all real. Push delivery itself is honestly stubbed — "queued," no real APNs/FCM/web-push send yet. | small |

### Integrations
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Integrations | 🔴 broken | Webhooks section is fully real. "Connected Apps" (Notion/Linear/etc.) has no matching backend at all — crashes on load. "Generate New Key" fails validation every time (missing required field the frontend never sends). | medium |

### Insights
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Analytics | 🟢 real | Every stat, chart, snapshot, and goal is real, correctly scoped, real persistence on every action. | none |
| Productivity | 🟠 not wired | Real, correctly-scoped backend (including a documented past cross-tenant leaderboard fix). The two tables it depends on are never written to by anything — permanently empty for every user despite the page claiming automatic tracking. | medium |
| Sentiment | 🟠 not wired | Real Claude sentiment analysis exists and is correctly built — nothing in the product ever calls it. Permanently empty despite claiming automatic analysis. | medium |

### Team
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Team Chat | 🟢 real | Fully real, correct membership/ownership checks on every action. | none |
| Shared Inboxes | 🟢 real | Fully real CRUD, correct workspace-membership validation on delegation creation. | none |
| Delegation | 🟡 partial | Delegation CRUD and the full shared-drafts review workflow are real. "Delegated Inbox" tab's email list is a hardcoded empty array — honestly labeled as pending sync-engine support. | medium |

### Settings
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Settings | 🟡 partial | Name, plan/usage, passkeys, and account deletion (real 30-day soft delete) are real. Notification toggles don't save (always reports all-on regardless of what's clicked). Email-address change is silently dropped despite showing "Saved." "Enable 2FA"/"View Sessions" buttons do nothing. | small |
| Signatures | 🟡 partial | Real CRUD. Never actually appended to outgoing mail despite the page's own claim. | small |
| Encryption | ⚫ fabricated | Real-looking UI, real DB table, real network calls — but the server generates its own unrelated keypair instead of using the client's real public key, so anything "encrypted" to a user could never be decrypted by them. No actual encrypt/decrypt step exists anywhere in the send/receive pipeline. This is the one outright false security claim on a settings page in the whole app. | medium |
| Single Sign-On | 🟢 real | Real SAML config storage, real cryptographic signature verification on login, correct admin-only access. | none |
| Billing | 🟡 partial | Stripe checkout, portal, webhooks, and dunning are all real. Domains/Webhooks usage bars are hardcoded to 0 regardless of actual usage. | trivial |
| Developer | 🟢 real | API keys, webhooks, integrations all real, correctly scoped and authenticated. | none |

### Admin
| Journey | Status | Summary | Fix |
|---|---|---|---|
| Workspace | 🟢 real | Mailboxes, team invites, Gmail/Outlook import all genuinely real, including live external API calls. | none |
| Domains | 🟡 partial | Adding a domain, viewing real DNS records, manual "Check Now" verification (real DNS lookups) all work. "Configure Automatically → Vapron" is broken — same unverified/broken transport as the email/AI/storage bug fixed earlier today, deliberately left unfixed pending Vapron DNS docs. No background job ever re-checks a pending domain. **This is Craig's current live blocker.** | medium |
| Admin | 🟢 real | Platform stats, users, domains, DLQ management all real, real admin-role enforcement server-side. | none |

---

## Tally

| Status | Count |
|---|---|
| 🟢 real | 14 |
| 🟡 partial | 22 |
| 🔴 broken | 7 |
| 🟠 not wired | 5 |
| ⚫ fabricated | 1 |
| **Total** | **49** |

---

## Build plan — priority order

Track progress here directly; check items off as they ship (this replaces trusting a summary paragraph in CLAUDE.md).

### Phase 0 — Craig's live blocker
- [ ] **Domains/Vapron DNS** — get real Vapron DNS API docs from Craig (same category as the email fix), correct `dns.*` transport in `lib/vapron.ts`, add a background re-check job for pending domains.

### Phase 1 — Broken today (crashes/fails for a real user, not a missing-feature question)
- [ ] Drafts — wire Compose's "Save Draft" to a real API call; fix the Drafts page's status filter.
- [ ] Files — align frontend/backend response envelope and field names (page currently crashes).
- [ ] Achievements — add missing `/streak` endpoint; align response shapes.
- [ ] Translation — align field names and add/remove the `/history` call.
- [ ] Security (Overview tab) — add the three missing endpoints; fix the sender-verification response shape.
- [ ] Integrations — fix Connected Apps envelope + decide whether to build real app-connect or remove the section; fix API-key generation's missing `permissions` field.
- [ ] AI Triage — fix the plan-gate mismatch (trivial, one-line).

### Phase 2 — Fabricated/dishonest claims (worse than broken — actively misleading)
- [ ] **Encryption** — either wire real client-key storage + an actual encrypt/decrypt pipeline, or remove the "encrypted automatically" claim until it's real. This is a security promise currently being made falsely.
- [ ] Attachments — replace `Math.random()` virus scan with a real scanner or remove the feature; same for the OCR placeholder.
- [ ] Calendar "Find a time" — replace the fabricated slot generator with real free/busy computation, or relabel as a placeholder.
- [ ] Commitments/Scheduling — replace hardcoded confidence constants with real model output or drop the metric.
- [ ] A/B Testing — replace the hardcoded 0.95 "confidence" with a real calculation or remove it.

### Phase 3 — The systemic dispatcher gap (see above — one fix, eight-plus features)
- [ ] Build the single real-mail dispatch hook in the ingestion pipeline (`sync/engine.ts`/`received-email-store.ts`).
- [ ] Wire in: Knowledge Graph, Sentiment, Attachments analysis, Scheduling detection, Scripts, Programs, Auto-Responder.
- [ ] Build the separate outbound-campaign worker for Mail Merge + A/B Testing send.
- [ ] Build the Hygiene/Productivity tracking producers (different shape — instrument read/compose UI, not inbound mail).

### Phase 4 — Real feature, meaningful gap (each is its own scoped fix)
- [ ] AI Intelligence — build the relationship-insights producer.
- [ ] Meet — this is a large, separate build (real video calling + recording + AI summary + real scheduling persistence). Scope as its own project, not a quick fix.
- [ ] Search — wire the four stub widgets to real logic (pattern already exists in `ai-search.ts`).
- [ ] Smart Folders — wire the Inbox page to read `?smartFolder=`.
- [ ] Delegation — extend sync engine to support delegation-scoped inbox queries.
- [ ] Signatures — auto-append default signature on send.
- [ ] Notifications — wire a real push-delivery worker.
- [ ] Contacts Groups — one-line `authMiddleware` fix.

### Phase 5 — Cosmetic / trivial
- [ ] Sent — wire open-tracking to actually flip the "opened" tag.
- [ ] Settings — wire 2FA/Sessions buttons (or remove), fix email-change persistence, fix notification-preference save.
- [ ] Billing — compute real Domains/Webhooks usage counts instead of hardcoded 0.
- [ ] Templates — return full row on create so the UI doesn't need a reload.

---

## What this audit did NOT cover

- **Live browser/click testing.** No Playwright/E2E harness exists in this repo (confirmed during scoping) — every verdict above comes from tracing real code paths (frontend call → backend handler → DB/AI), not from clicking through a running instance. This is materially stronger than the grep-based `route-coverage.md` tool (which only checks whether a route *string* appears in a UI file) but is not the same as a live user session. Recommend standing up Playwright as a follow-up so future audits can also catch pure rendering/CSS/interaction bugs this method can't see.
- **Mobile and desktop apps** — this audit is dashboard-web-only (`apps/web`).
- **Everything outside the 49-tab dashboard nav** — onboarding flow, marketing site, auth/login pages, admin sub-pages not reachable from the main admin tab.
