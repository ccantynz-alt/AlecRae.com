# Feature Gap Audit — Full Codebase

**Scope:** Entire monorepo (apps, services, packages) audited against the build
status claimed in CLAUDE.md. Four parallel deep audits: backend route
mounting/auth, web UI feature coverage, non-web apps + services, and code
quality vs stated standards.

**Headline:** The backend is genuinely ~complete (95/96 route files mounted,
all with auth + rate limiting, real DB integration, real services). **The gap
is almost entirely in the web frontend** — the dashboard sidebar exposes 10
items while the backend ships ~84 features across 96 route groups. Roughly
**15+ backend feature domains have zero web UI**, and **14 finished React
components are orphaned** (built, polished, never imported by any page).

---

## 1. What the user actually sees vs what exists

The dashboard sidebar (`apps/web/app/(dashboard)/layout.tsx`) renders exactly
10 items: Inbox, Compose, Sent, Drafts, Snoozed, Templates, Contacts, Domains,
Analytics, Settings.

| Layer | Size | Surfaced in web UI |
|---|---|---|
| API route files | 96 (95 mounted) | ~14 route groups called |
| Backend feature domains | ~84 features | ~20% reachable from UI |
| Web dashboard pages | 13 | 10 in sidebar |
| Feature components in `apps/web/components` | ~40 | 14 orphaned (never imported) |

All 13 web pages that DO exist are real (fetch live API data, no mock data
anywhere in the repo). The problem is breadth, not quality.

---

## 2. GAP A — Backend feature domains with ZERO web UI

These have mounted, auth'd, rate-limited API routes and (mostly) DB schemas,
but no page, panel, or button anywhere in `apps/web`:

| Domain | Backend routes | Notes |
|---|---|---|
| Rules & automations | `ai-rules`, `auto-responder`, `workflows` | No rule builder, no OOO UI, no workflow UI |
| Knowledge graph / context AI | `knowledge-graph`, `context-intelligence`, `ai-intelligence` | No visualization |
| Collaboration | `collaborate`, `delegation`, `chat` | `CollaborativeDraftView` component exists, orphaned |
| Voice | `voice-clone`, `dictation`, `voice-message` | `VoiceCloneManager`, `VoiceReplyComposer` orphaned |
| Advanced search | `email-query` (SQL console), `ai-search`, `semantic-search` | `EmailQueryConsole` orphaned |
| Tasks & gamification | `todo`, `gamification` | `TaskProviderSelector`, `ActionItemExtractor` orphaned |
| Integrations | `integrations` (Zapier/Make/n8n), `contact-enrichment`, `contact-groups` | No settings section |
| Programmable email | `scripts`, `programs` | `EmailScriptManager` orphaned |
| Mail tooling | `ab-tests`, `mail-merge`, `smart-folders`, `labels` (UI partial), `link-previews`, `screener` | No UI |
| Webhooks & API keys | `webhooks`, `api-keys`, `suppressions` | API clients defined in `lib/api.ts`, never called |
| Meetings | `meetings`, `meeting-link`, `video-meetings` | `MeetingTranscriptPanel` orphaned |
| Docs/Files/Notes suite | `documents`, `files`, `notes` | No file manager, no docs UI |
| Wellness/productivity | `email-hygiene`, `focus sessions`, `productivity-analytics`, `sentiment-timeline` | `FocusModeOverlay` orphaned |
| Security intelligence | `security-intelligence`, `encryption` | No E2EE UI, no threat dashboard |
| Translation / unsubscribe | `translate`, `unsubscribe` | No UI exposure |
| Calendar (full) | `calendar`, `calendar-events` | Only compose slot-suggestions wired; no calendar page |

**7 API clients are defined in `apps/web/lib/api.ts` but never called from any
page:** `webhooksApi`, `apiKeysApi`, `suppressionsApi`, `taskApi`,
`collaborationApi`, `meetingsApi`, `emailQueryApi`, `voiceCloneApi`.

## 3. GAP B — Orphaned components (quick wins: built, just not wired)

`ActionItemExtractor`, `CollaborativeDraftView`, `DragToSnooze`,
`EmailQueryConsole`, `EmailScriptManager`, `InboxHeatmapView`,
`LocalAIStatusIndicator`, `MeetingTranscriptPanel`, `RecipientAutocomplete`
(not even in compose!), `SpatialInboxView`, `SwipeableEmailRow`,
`TaskProviderSelector`, `VoiceCloneManager`, `VoiceReplyComposer`,
`ChangelogPage`.

Inside the inbox page itself, four handlers are literal no-ops:
**AI reply, AI summarize, command palette toggle, focus mode toggle** are
wired to `/* no-op */` despite the components/backends existing.

## 4. GAP C — Backend stubs/placeholders (13 endpoints)

| File | What's stubbed |
|---|---|
| `routes/files.ts` | Presigned R2 upload URL is mocked |
| `routes/voice-message.ts` | Storage URL mocked (no real R2 upload) |
| `routes/documents.ts` | AI assist returns canned text; export not implemented |
| `routes/search-intelligence.ts` | Suggestions/trending/related are hardcoded |
| `routes/video-meetings.ts` | Recording summarize returns stub text |
| `routes/ai-categorization.ts` | Smart-rule test + retrain not implemented |
| `routes/attachment-intelligence.ts` | OCR/extract-text returns stub |
| `routes/contact-enrichment.ts` | Enrichment is domain-extraction only |
| `routes/contacts-extended.ts` | AI contact insights placeholder |
| `routes/delegation.ts` | Delegated inbox not implemented |
| `routes/meeting-link.ts:299` | TODO: token storage not AES-encrypted |

`routes/warmup.ts` is the one **unmounted** route file (commented out of
server.ts pending typecheck fixes in `@alecrae/reputation` + `services/dns`).

## 5. GAP D — In-memory stores that lose data on restart

CLAUDE.md issue #3 says the in-memory→DB migration was FIXED 2026-04-09, but
**10 stores remain in-memory** (regression or incomplete fix):

Critical (user data lost on restart): `snooze.ts` (undo-send queue),
`voice-message.ts`, `import.ts` (import jobs), `ai-rules.ts`, `programs.ts`,
`calendar.ts` (events + scheduling links), `security.ts` (phishing reports).
Medium: `collaborate.ts` (DB tables exist but route still uses Maps),
`lib/dlq-processor.ts`, `voice.ts` (profile cache).
Acceptable: realtime WebSocket registry, rate-limit Redis fallback.

## 6. GAP E — Tests

- 61 test files repo-wide, but **only ~7 e2e files cover 310+ API endpoints**
  (billing, domains, health, messages, suppressions, templates, webhooks).
- Zero tests in 11 workspaces: `services/collab`, `services/jmap`,
  `services/support`, `services/analytics`, `packages/db`, `packages/ui`,
  `apps/admin`, `apps/status`, `apps/mobile`, `apps/desktop` (+ api-engine).
- No middleware tests (auth, rate-limit, idempotency).
- Services that ARE well tested: MTA (11), ai-engine (6), reputation (5),
  sentinel (3), crypto (3).

## 7. GAP F — Code standards vs CLAUDE.md claims

| Standard | Reality |
|---|---|
| No `as any` / `@ts-ignore` / `@ts-expect-error` | ✅ Clean (0) |
| No `: any` | 7, all in `services/mta/src/telemetry.ts` (declared no-op stub) |
| No `as unknown as` | ❌ 49 (28 in production; worst: `semantic-search.ts`, `email-query.ts` 5 each, `mta/smtp/server.ts`, `jmap/index.ts` 4 each) |
| No `console.log` | ❌ 135 in production source (worst: `mta/index.ts` 34, `api/server.ts` 16, `inbound/index.ts` 14) — should be structured logger |
| Mock data in UIs | ✅ None found |
| CI gates | ✅ Strong: lint, typecheck, test, build, schema-drift, bundle-size all blocking; no `continue-on-error` |

## 8. GAP G — Production blockers (pre-launch)

1. **`services/dns` hard-codes `.dev` hostnames** (known issue #26):
   `mx1/mx2.alecrae.dev`, `include:spf.alecrae.dev`, `bounce.alecrae.dev`,
   `ns1/ns2.alecrae.dev` in `auto-config.ts` + `records/manager.ts`. Also
   `TRACKING_BASE_URL` defaults to `https://t.alecrae.dev` and MTA
   `SMTP_HOSTNAME` defaults to `mail.alecrae.dev`. Customer domain onboarding
   produces wrong records until fixed.
2. **Env handling is loose** — most critical vars fall back to defaults
   instead of fail-fast. Production minimum: `DATABASE_URL`, `JWT_SECRET`
   (≥32 chars), `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `REDIS_URL`,
   `WEBHOOK_SECRET`, `NEXT_PUBLIC_API_URL`. No env schema validation file.
3. **`warmup.ts` unmounted** until reputation/dns type errors fixed.
4. **Settings page placeholders:** 2FA and active-sessions sections render but
   do nothing.

## 9. What's verifiably solid (no action needed)

- 95/96 API routes mounted, every protected route has `authMiddleware` + a
  rate-limit tier; public exceptions are intentional (health, tracking pixel,
  Stripe webhook, FBL, recall links).
- `apps/admin` is real (8 pages calling live `/v1/admin/*`).
- `apps/mobile` is real (Expo, secure-store tokens, real API client).
- `apps/desktop` is a real Electron wrapper (tray, notifications,
  auto-update, mailto deep links).
- `apps/status`, `apps/changelog`, `apps/docs` deployable.
- All 12 `services/*` are real implementations, not scaffolds (MTA is a full
  implementation running via systemd on the Vapron box; collab is a working
  Yjs CRDT server; sentinel/inbound pipeline is wired end-to-end).
- `packages/db`: comprehensive schema; migrations baseline + drift CI guard.
- CI is comprehensive and blocking.

---

## 10. Recommended priority order

1. **Wire the orphaned components + no-op handlers** (days, not weeks —
   highest visible-value-per-hour: command palette, focus mode, AI
   reply/summarize, RecipientAutocomplete in compose, heatmap in analytics).
2. **Expand the sidebar/IA** to expose built domains: Automations (rules,
   auto-responder, workflows), Calendar, Tasks, Voice, Collaboration,
   Integrations/Webhooks/API-keys (settings sections), Advanced search.
3. **Migrate the 7 critical in-memory stores to DB** (data-loss risk; tables
   mostly exist already).
4. **Fix `.dev` hostnames in services/dns** (blocks business-email
   onboarding — known issue #26).
5. **Fail-fast env validation** at API boot (one Zod schema).
6. **Finish the 13 backend stubs** (R2 presigned uploads first — files +
   voice messages depend on it).
7. **API integration tests** for the top user-facing route groups (auth,
   messages/send, inbox, billing webhook already covered).
8. Burn down `as unknown as` (28) and migrate `console.log` → structured
   logger (135).

---

## Status update — same day

The build wave that followed this audit (PR #63) closed: priority 1 (orphans +
no-ops, except the items blocked on packages/ui), priority 2 (sidebar IA + 7
new pages + developer settings), priority 3 (all in-memory stores → DB,
migration `0002`), priority 4 (`.dev` hostnames, full sweep incl.
inbound/imap/support), and priority 5 (fail-fast env validation). Also fixed
en route: dead sidebar navigation (the root cause of "nothing in the left pane
is clickable"), unprotected `/v1/admin/*` (any authenticated user could read
cross-account data), and two cross-tenant leaks (import job status, collab
comments). Remaining open: priorities 6–8 (backend stubs, broader API tests,
standards burn-down) and the unwired components listed in CLAUDE.md issue #27.

---

_Last updated: 2026-06-20 14:00 UTC_
