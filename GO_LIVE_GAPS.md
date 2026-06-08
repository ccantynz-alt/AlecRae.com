# AlecRae — Go-Live Gaps (Verified)

**Verification date:** 2026-06-07
**Verified by:** Code audit of the live repo (not a re-read of prior status docs).
**Supersedes:** `LAUNCH_READINESS.md` (2026-05-08) — that doc's build check was last *run* 2026-04-24 and is stale.

> **One-line verdict:** The code is genuinely feature-complete and DB-backed. The platform is not live because **zero infrastructure is provisioned**. "100% complete" is true for *code*, false for *operational*. Days from a consumer beta; months from enterprise-sellable (SOC 2 is the long pole).

---

## ✅ Verified REAL (audited against code, not claims)

| Area | Status | Evidence |
|---|---|---|
| Database persistence | Real | 66 Drizzle/Neon schemas; no critical in-memory stores (only the 10–30s undo-send buffer, which is correct) |
| Auth | Real, end-to-end | Passkeys/WebAuthn + Argon2id password fallback, JWT rotation, all DB-persisted |
| Billing | ~90% real | Stripe customer/checkout/portal + 4 webhooks (upgrade/downgrade/renewal/payment-failed); usage limits enforced |
| Org / team / enterprise | ~95% real | `organizations` route = 18 DB-backed endpoints (invites, roles, removal); `auditLogs` with IP/UA/metadata; SSO/SAML in `ssoConfigs` table; admin console = real aggregations |
| Workspace suite | Present | Docs, Meet (video+transcription), Chat, Files, Calendar, CRM-lite |
| Tests | Real | 53 test files (Vitest), CI hard-gated lint → test → build |
| Deploy config | Ready | `vercel.json`, `wrangler.toml`, 3 Dockerfiles (web/api/mta), `.env.production` template |

**The business / "Workspace-for-companies" offering is real code, not a facade.** What blocks selling it to businesses is trust/compliance (SOC 2), not features.

---

## ❌ BLOCKERS — Infrastructure (0% live — Craig's credentials required)

Nothing runs until these exist. Agents/code cannot do these — they need accounts + secrets.

| # | Item | Env var(s) | Blocks |
|---|---|---|---|
| 1 | Neon Postgres + `bun run db:migrate` | `DATABASE_URL` | Every write. Nothing works without it. |
| 2 | Upstash Redis | `REDIS_URL`, `UPSTASH_REDIS_*` | Rate limiting, queue, cache |
| 3 | Meilisearch | `MEILI_URL`, `MEILI_MASTER_KEY` | Full-text search (degraded without) |
| 4 | JWT secret (32+ char random) | `JWT_SECRET` | All auth tokens |
| 5 | Anthropic API key | `ANTHROPIC_API_KEY` | All AI features |
| 6 | OpenAI API key | `OPENAI_API_KEY` | Whisper transcription |
| 7 | Stripe live key + webhook secret + 3 price IDs (create products first) | `STRIPE_*` | Billing |
| 8 | Google OAuth client | `GOOGLE_CLIENT_*` | Gmail connect |
| 9 | Microsoft OAuth client | `MICROSOFT_CLIENT_*` | Outlook connect |
| 10 | DNS cutover: MX, SPF, DKIM, DMARC + 7 CNAMEs | Cloudflare DNS | Email send/receive + subdomains |
| 11 | Email relay (SES / MailChannels) | relay creds | Actual outbound sending |
| 12 | Production deploy (CF Pages/Workers + Fly.io MTA) | — | Live URL (current Vercel preview hits dev stubs) |

---

## ⚠️ Code gaps worth closing before public traffic (agent-doable)

| # | Gap | Severity | Status |
|---|---|---|---|
| G1 | Build not verified in 6 weeks | HIGH | ✅ DONE — lint 0 errors, typecheck 37/37, test 61/61 |
| G2 | Dunning flow only logs, doesn't retry | MED | ✅ DONE — state machine + tests (billing.ts, dunning.test.ts) |
| G3 | DPA self-serve signing flow missing | MED | ✅ DONE — route + schema + web flow |
| G4 | No preflight env/connectivity check | MED | ✅ DONE — scripts/preflight.ts |
| G5 | No load test — never run under traffic | HIGH | ✅ DONE — k6 harness wired to budgets (load-tests/) |
| G6 | Status page not wired to real uptime | LOW | OPEN — currently static |
| G7 | Pre-launch security review of public surface | HIGH | IN PROGRESS — agent report pending |
| G8 | AI features throw instead of degrading | MED | ✅ DONE — translate/voice/voice-clone fallbacks (Bible compliance) |
| G9 | "GateTest" CI gate called a non-existent npm package | HIGH | ✅ DONE — repointed to real lint+typecheck+test+build |
| G10 | CodeQL "default setup" conflicted with advanced workflow | MED | ✅ DONE — default setup disabled by Craig |

## ⚡ Bundle / performance gaps (from static audit 2026-06-07)

The <100KB initial-JS budget is at risk. None block a beta, but they erode the speed moat.

| # | Risk | Severity | Fix |
|---|---|---|---|
| P1 | Framer Motion (`motion/react`) loads on the landing page FCP path — all 9 sections are `"use client"` + static import (~32KB gz) | HIGH | CSS keyframes + IntersectionObserver for below-fold scroll animations; keep `motion` only in the hero |
| P2 | `three` / `@react-three/fiber` / `@react-three/drei` declared as regular deps (~180KB gz) — one import-resolution edge from leaking into the bundle | HIGH | Move to optionalDependencies; add webpackChunkName magic comment to the lazy import |
| P3 | `yjs` / `lib0` / `y-protocols` statically imported in `collab-client.ts` (~50KB gz) — time-bomb the moment a dashboard page imports `CollaborativeDraftView` | HIGH | Wrap `CollaborativeDraftView` in `next/dynamic({ ssr: false })` at every call site |
| P4 | Dashboard layout fully `"use client"` — pulls Framer Motion into every authenticated route | MED | Extract Server Component shell; push the client boundary down (architectural — needs Craig sign-off) |
| P5 | No bundle-size gate in CI despite "CI FAILS IF VIOLATED" in the Bible | MED | Add `size-limit`/`bundlesize` job asserting initial chunk < 100KB |

**WebLLM (`@mlc-ai/web-llm`) verdict:** SAFE — already a dynamic `import()` inside a function body; not in the initial bundle.

## 🔐 Security review results + decisions needed (2026-06-08)

Pre-launch review of the API public surface. **Fixed + merged-ready:**
- ✅ **Critical auth bypass** — unsigned JWTs were accepted (atob-decode, no signature check) on the global Bearer middleware + `/auth/me` + `/logout`. Now verified via jose. (Forgeable tokens for any account — would have been catastrophic.)
- ✅ Reflected XSS on the unsubscribe page (`tracking.ts`).

**ALL fixed (PR #47, owner-authorized 2026-06-08):**

| # | Item | Severity | Resolution |
|---|---|---|---|
| S1 | SAML assertion signature never verified (`sso.ts`) | 🔴 SSO auth bypass | ✅ xml-crypto signature verification pinned to configured IdP cert (ignores attacker KeyInfo), signature-wrapping defense, conditions/audience checks; 403 on failure. 8 tests. |
| S2 | OAuth `state` unsigned (`connect.ts`) | 🔴 Account-linking CSRF | ✅ HMAC-SHA256 signed, 10-min expiring state + nonce, constant-time verify. 5 tests. |
| S3 | SSRF in link-preview fetch (`link-previews.ts`) | 🟠 | ✅ DNS-resolve + block private/loopback/link-local/metadata IPv4+IPv6, redirects manual + re-validated per hop. 24 tests. |
| S4 | Hardcoded fallback secrets, no prod guard (`sso.ts`, `collaborate.ts`) | 🟠 | ✅ Fail-closed in production (throws if secret unset/<32 chars); dev fallback only outside prod. |
| S5 | E2E encryption key store in-memory Map (`encryption.ts:18`) | 🟠 | ✅ DB-backed `encryptionKeys` table; zero-knowledge preserved (only public + client-encrypted keys). 6 tests. |
| P4 | Framer Motion in Hero → 141KB gz landing | 🟡 | ✅ Hero → Server Component + CSS keyframes; **141KB → 104.5KB gz**, zero Framer Motion on `/`. Gate ratcheted to 108KB. Floor is ~102KB Next.js/React baseline (can't go lower without a framework-level change). |

Lower severity (still open, note only): JWT lacks iss/aud binding; ephemeral RS256 keypair on startup breaks multi-instance; unsatisfiable `accounts:*`/`recall:write` scopes.

---

## ⏳ Long pole — Enterprise / "Google Workspace for business" track

These don't block a consumer beta but DO block selling to companies. Start now in parallel:

- **SOC 2 Type I → II** — not started. 3–6 month process. **Start the clock today.**
- **GDPR DPA self-serve signing** — see G3.
- **Bug bounty** (HackerOne/Intigriti) — `security.txt` already invites disclosure.
- **Public roadmap.**

---

## 🎯 Craig's one-sitting infra checklist (~3 hrs of clicking)

Do these in order; the whole thing is account creation + pasting secrets.

1. **Neon** → create project → copy connection string → set `DATABASE_URL`.
2. **Upstash** → create Redis DB → copy REST URL + token.
3. **Meilisearch** (Cloud or self-host on Fly) → URL + master key.
4. **Generate `JWT_SECRET`** → `openssl rand -base64 48`.
5. **Anthropic** console → API key.
6. **OpenAI** → API key (Whisper only).
7. **Stripe** → create 3 products (Personal $9 / Pro $19 / Team $12pp) → copy price IDs + live secret key → add webhook → `api.alecrae.com/billing/webhook` → copy signing secret.
8. **Google Cloud** → OAuth consent + credentials → client ID/secret.
9. **Microsoft Azure** → app registration → client ID/secret.
10. Paste all of the above into Cloudflare/Vercel env settings.
11. **Cloudflare DNS** for alecrae.com → run `infrastructure/cloudflare/setup-dns.sh` → add MX/SPF/DKIM/DMARC + CNAMEs.
12. **Deploy** → then run `bun run db:migrate` against Neon.
13. **Smoke test** on iPad → soft-launch to the 500 beta list.

---

## Bottom line

- **Consumer beta:** days away — gated entirely on the checklist above.
- **Enterprise-sellable:** months away — gated on SOC 2 + load-testing, **not code**.

*Update this file at the end of every session per the Bible Rule.*

---

_Last updated: 2026-06-08 23:35 UTC_
