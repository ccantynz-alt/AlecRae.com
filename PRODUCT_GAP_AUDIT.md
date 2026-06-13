# AlecRae — Product Gap Audit (code-verified)

**Audit date:** 2026-06-13
**Method:** Direct read of the live repo (apps/api, apps/web, packages, services). NOT a re-read of prior status docs — those are out of date, which is exactly why this audit was requested.
**Scope:** What a signed-in user/owner can actually *reach and use in the web app today* vs. what the backend claims to support.

---

## TL;DR — the one thing to understand

**CLAUDE.md says "84 features, ~99% launch-ready, all complete." That is true for *backend code that exists*, and false for *product a user can reach*.** The API is genuinely deep (≈96 mounted route groups, 300+ endpoints, all DB-backed). The **web app exposes only a fraction of it.** Most of the "business / workspace" surface is real, mounted, working API with **no screen in front of it** — so from the product it looks "missing" even though the code is there.

The gap is **frontend wiring + a few stub workers**, not missing backend.

---

## ✅ Fixed in this session (2026-06-13)

| Issue | Root cause | Fix |
|---|---|---|
| **Sidebar collapses and can't be re-expanded** (you press the `‹` "left arrow" and it's a dead end) | When collapsed to 64px the sidebar is `overflow-hidden`, but the full-size "AlecRae" wordmark still rendered and pushed the `›` *expand* button off the visible edge — so there was no way to click it back. | Hide the wordmark when collapsed so the toggle stays visible & centered; added a keyboard path (`⌘\` / `Ctrl\`) so a collapsed sidebar is never a dead end. (`apps/web/app/(dashboard)/layout.tsx`) |
| **"Invalid or expired bearer token" mid-session** | Access tokens live **15 min**; the API issues a 7-day refresh token alongside them, but the **web client threw the refresh token away and never refreshed.** After 15 min idle, every request 401'd and you were silently logged out with no recovery. | New `apps/web/lib/auth-token.ts`: stores the refresh token, and on any 401 silently calls `/v1/auth/refresh` (single-flight) and retries once before giving up. Wired into both fetch wrappers (`api.ts`, `api-features.ts`), login/register/passkey/Google flows, and the Google callback now forwards the refresh token. |
| **Connect Gmail/Outlook was completely broken** (the path to importing inboxes) | Three bugs stacked: (1) onboarding used a **relative** `/v1/connect/gmail` → hit the web host, not the API; (2) it was a top-level browser redirect carrying **no Bearer header** → 401; (3) the route required scope `accounts:write`, which **no token is ever granted** → 403 regardless. | API now returns the OAuth consent URL as JSON from an authenticated `GET /v1/connect/gmail|outlook` (signed `state` still carries identity to the public callback — no token in any URL), and uses the satisfiable `account:manage` scope. Web fetches the URL authenticated, then navigates. (`apps/api/src/routes/connect.ts`, `apps/web/lib/api.ts`, `apps/web/app/(dashboard)/onboarding/page.tsx`) |

> ⚠️ **These fixes are repo-side.** Production is the box at `149.28.119.158`, which (per CLAUDE.md issue #35) may still be serving a pre-2026-06-11 build. **Nothing here is live until the box runs its pull/build ritual** (`scripts/box-deploy.sh`). The "merged but not visible" pattern is the box being behind, not the merge failing.
>
> 🔑 **Also verify on the box:** a *stable* `JWT_SECRET` (≥32 chars) must be set. If it isn't, every API restart regenerates an ephemeral signing key and invalidates **everyone's** tokens at once — a second, infra-side cause of "invalid or expired bearer token" that the client refresh can't fix.

---

## (A) ADMIN ACCESS — "do I have full admin, and how would I know?"

**Verdict: you ARE an owner, you CAN see it, but there is no working admin console in the main web app.**

- **Are you admin?** Yes. `ccantynz@gmail.com` is hard-coded in the owner allowlist (`apps/api/src/lib/owner-allowlist.ts`) and every first user of an account is created with role `owner`. `requireAdmin()` (`apps/api/src/middleware/auth.ts`) passes for `owner`/`admin` roles, so you reach all `/v1/admin/*` endpoints.
- **Can you tell from the UI?** Yes — the sidebar footer shows an **"OWNER"/"ADMIN" badge** next to your name (sourced from `/v1/auth/me`). That's the role indicator you said you had no way to see.
- **The gap (now closed):** previously the only admin page (`apps/web/app/admin/page.tsx`) was unlinked, ungated, and wired to nothing — static content linking out to a dead `admin.alecrae.com`. **Fixed 2026-06-13:** that stub is removed and replaced by a real role-gated console at `(dashboard)/admin` (inside the dashboard shell), wired to all 8 `/v1/admin/*` endpoints, with an "Admin" sidebar entry for owner/admin.
- ⚠️ **Security note worth your attention:** because "owner" means "owner of your own account," and `/v1/admin/*` exposes **cross-account** data, the role gate is the only thing standing between any signed-up user and global stats. That's by-design today but worth hardening before public signups (a separate "platform staff" flag distinct from per-account owner).

---

## (B) BUSINESS / WORKSPACE ("the Google-Workspace equivalent — import inboxes, addresses")

The backend for this is **real and mounted**, not a facade. The product in front of it is mostly missing. Status per capability:

| Capability | Backend | Web UI | Verdict |
|---|---|---|---|
| Add / verify a sending **domain** (with DNS records) | ✅ live (`/v1/domains`) | ✅ `(dashboard)/domains` page, linked in sidebar | **WORKING end-to-end** |
| **Connect** an external Gmail/Outlook/IMAP inbox | ✅ live (`/v1/connect`) | ✅ onboarding (**fixed this session**) | **WORKING** (was broken) |
| **Provision mailboxes on your own domain** (the core Workspace move) | ✅ live (`/v1/mailboxes`) | ❌ none | **BACKEND-ONLY — no screen** |
| **Bulk import a Google Workspace** (admin OAuth → list users → provision up to 1000) | ✅ live (`/v1/import/workspace/*`) | ❌ none | **BACKEND-ONLY — no screen** |
| **Organizations / teams** — create org, invite users, roles, audit log, SSO | ✅ live (`/v1/organizations`, 12+ endpoints) | ❌ none | **BACKEND-ONLY — no screen** |
| **Import jobs** (Gmail/Outlook/MBOX/EML mailbox migration) | ⚠️ routes live, **workers are stubs** | ❌ none | **STUB + no screen** — jobs mark "completed" without importing any messages |

**So today, to actually provision a mailbox, bulk-import a Workspace, or invite a team member, you'd have to call the API directly** (e.g. with the seeded API key). There is no screen for any of it. That's why "the business side" feels unset-up: the engine is built, the dashboard for it isn't.

---

## (C) Other built-but-unreachable domains (from CLAUDE.md issue #27, still open)

Backend exists, no web UI: **knowledge graph, chat / delegation, docs / files / notes, A/B tests, mail merge, smart folders, screener, security-intelligence console.** Plus orphaned finished components (`CollaborativeDraftView`, `SpatialInboxView`, `MeetingTranscriptPanel`) blocked on `packages/ui` export-map + optional 3D deps.

## (D) Stub endpoints that look done but no-op (CLAUDE.md issue #29, still open)

Import workers (above), R2 presigned uploads (files + voice depend on it), documents ai-assist/export, several search-intelligence + ai-categorization + attachment OCR endpoints. They return success shapes without doing the work.

---

## 🎯 Recommended build order to close the gap (frontend-first)

The backend is the moat and it's largely done. The fastest way to make AlecRae *feel* as complete as it *is*:

1. ✅ **Admin console page** — DONE 2026-06-13. Real role-gated `(dashboard)/admin` wired to all 8 `/v1/admin/*` endpoints (overview stats, users, domains, messages, events, dead-letter queue with clear actions). The old unlinked static `/admin` stub was removed; the sidebar now shows "Admin" for owner/admin. Directly answers "how do I know I have admin / that things are set up."
2. **Workspace setup flow** — one section under Manage that strings together the *existing* APIs: add domain (done) → provision mailboxes (`/v1/mailboxes`) → bulk-import Workspace (`/v1/import/workspace`) → invite team (`/v1/organizations`). All backend exists; this is pure UI. ~3–5 days.
3. **Make import real** — replace the stub import workers with actual message ingestion (the sync engine already exists for live connect; reuse it for backfill). ~2–3 days.
4. Then chip at (C)/(D) by user demand.

None of this is blocked on new backend or new dependencies — it's wiring screens onto endpoints that are already mounted and tested.

---

_Last updated: 2026-06-13 04:54 UTC_
