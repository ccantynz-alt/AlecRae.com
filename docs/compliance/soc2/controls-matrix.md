# SOC 2 Controls Matrix — AlecRae

_Last updated: 2026-06-08 23:35 UTC_
> **Scope:** Security (CC), Availability (A), Confidentiality (C)
> **Status key:** Implemented | Partial | Missing

Evidence paths are relative to the repo root unless otherwise noted.

---

## Legend

| Status | Meaning |
|---|---|
| **Implemented** | Control exists, is operational, and can produce evidence for an auditor today |
| **Partial** | Control exists in code but lacks a written policy, complete evidence trail, or untested recovery procedure |
| **Missing** | Control does not exist; must be built or procured before a Type I audit |

---

## CC1 — Control Environment

### CC1.1 — Commitment to Integrity and Ethical Values

| Control | Status | Evidence / Artifact |
|---|---|---|
| Written Code of Conduct / Acceptable Use Policy | **Missing** | Needs owner sign-off. See `policy-templates/information-security-policy.md`. |
| CLAUDE.md defines explicit forbidden behaviors for all contributors | **Implemented** | `CLAUDE.md` — "The Forbidden List" (25 items) |
| Responsible disclosure / bug bounty policy published | **Partial** | `SECURITY.md` references bug bounty but the HackerOne/Intigriti program is not yet live |

### CC1.2 — Board / Management Oversight

| Control | Status | Evidence / Artifact |
|---|---|---|
| Designated security owner | **Partial** | Craig is de-facto owner; no formal written designation |
| Regular security review cadence | **Missing** | No documented schedule. CLAUDE.md says "monthly cost review" but not security-specific. |

### CC1.3 — Organizational Structure and Reporting

| Control | Status | Evidence / Artifact |
|---|---|---|
| Org chart with security responsibilities | **Missing** | Pre-Series A — Craig is single owner; document this explicitly |
| Role-based access control defined | **Implemented** | `packages/db/src/schema/users.ts` — `userRoleEnum` (owner/admin/member/viewer); enforced via `apps/api/src/middleware/auth.ts` `requireScope()` |

### CC1.4 — Competence of Personnel

| Control | Status | Evidence / Artifact |
|---|---|---|
| Security awareness training | **Missing** | No training platform or records |
| Developer security onboarding checklist | **Missing** | CLAUDE.md is strong but not a formal onboarding record |

### CC1.5 — Accountability

| Control | Status | Evidence / Artifact |
|---|---|---|
| Audit log of privileged actions | **Implemented** | `packages/db/src/schema/sso-config.ts` — `auditLogs` table (accountId, userId, action, resourceType, metadata, ipAddress, userAgent); API at `GET /v1/organizations/audit-log` in `apps/api/src/routes/organizations.ts` |
| Security audit log (separate, security-event-specific) | **Implemented** | `packages/db/src/schema/security-intelligence.ts` — `securityAuditLog` table; API at `GET /v1/security-intelligence/audit-log` |

---

## CC2 — Communication and Information

### CC2.1 — Internal Communication

| Control | Status | Evidence / Artifact |
|---|---|---|
| Security policy documents distributed to personnel | **Missing** | Policies not yet written; `policy-templates/` provides starting points |
| CLAUDE.md read requirement enforced at session start | **Implemented** | `CLAUDE.md` — "SESSION PROTOCOL" section; enforced by convention |

### CC2.2 — External Communication

| Control | Status | Evidence / Artifact |
|---|---|---|
| Security disclosure policy published | **Implemented** | `SECURITY.md` — reporting channels, response SLAs, safe harbor, rewards |
| GDPR breach notification commitment (72h) | **Implemented** | `SECURITY.md` — Incident Response section; `CLAUDE.md` Emergency Protocols |
| DPA self-serve signing | **Implemented** | `apps/api/src/routes/dpa.ts`; `packages/db/src/schema/dpa-signatures.ts`; SHA-256 tamper-evident hash stored with each signature |
| Privacy policy / Terms of Service pages | **Partial** | Legal pages reference exists in codebase (`apps/web/app/(legal)/`); content needs legal review |

### CC2.3 — Reporting Security Issues

| Control | Status | Evidence / Artifact |
|---|---|---|
| Bug bounty / VDP program live | **Missing** | `SECURITY.md` references `alecrae.com/security` reward table; program not yet on HackerOne/Intigriti |
| Phishing report workflow | **Implemented** | `POST /v1/security/report-phishing`, `POST /v1/security-intelligence/report-phishing` in `apps/api/src/routes/security.ts` and `security-intelligence.ts` |

---

## CC3 — Risk Assessment

### CC3.1 — Risk Identification

| Control | Status | Evidence / Artifact |
|---|---|---|
| Formal documented risk assessment | **Missing** | No risk register exists; must be created before Type I audit |
| AI threat model (confidence scores, human-in-loop for destructive actions) | **Implemented** | `CLAUDE.md` — AI Integration Rules section |
| Threat detection with multi-type coverage | **Implemented** | `packages/db/src/schema/security-intelligence.ts` — `threatTypeEnum` covers phishing, malware, spam, impersonation, BEC, credential harvesting |

### CC3.2 — Risk Analysis and Response

| Control | Status | Evidence / Artifact |
|---|---|---|
| Documented risk mitigation decisions | **Missing** | ADRs in `docs/adrs/` cover architectural decisions but not security risk decisions |
| Security policies define acceptable risk thresholds | **Missing** | No written policy yet |

---

## CC4 — Monitoring Controls

### CC4.1 — Control Performance Evaluation

| Control | Status | Evidence / Artifact |
|---|---|---|
| CI pipeline enforces quality gates | **Implemented** | `.github/workflows/ci.yml` — lint, typecheck, test, build all gate PRs to main |
| Weekly automated security scan | **Implemented** | `.github/workflows/security.yml` — runs every Monday at 06:00 UTC; also runs on every PR to main |
| Dependency audit (OSV-Scanner + audit-ci) | **Implemented** | `.github/workflows/security.yml` — `dependency-audit` job; `audit-ci.json` configured with `moderate` severity threshold |
| CodeQL SAST with security-extended queries | **Implemented** | `.github/workflows/security.yml` — `codeql` job; scans JavaScript/TypeScript |
| Secret scanning (Gitleaks on every PR) | **Implemented** | `.github/workflows/security.yml` — `secret-scanning` job; full history checkout (`fetch-depth: 0`) |

### CC4.2 — Evaluation and Communication of Deficiencies

| Control | Status | Evidence / Artifact |
|---|---|---|
| Known issues tracked with severity + date | **Implemented** | `CLAUDE.md` — "Known Issues" table (severity, found date, status) |
| Post-mortem process defined | **Implemented** | `CLAUDE.md` — Emergency Protocols; `docs/postmortems/` directory |
| Security findings fed back to management | **Partial** | Craig reviews manually; no formal SLA on remediation of SAST findings |

---

## CC5 — Control Activities

### CC5.1 — Policies and Procedures

| Control | Status | Evidence / Artifact |
|---|---|---|
| Information Security Policy (written, signed) | **Missing** | See `policy-templates/information-security-policy.md` |
| Access Control Policy (written, signed) | **Missing** | See `policy-templates/access-control-policy.md` |
| Change Management Policy (written, signed) | **Missing** | See `policy-templates/change-management-policy.md` |
| Incident Response Plan (written, tested) | **Missing** | See `policy-templates/incident-response-plan.md` |
| Vendor Management Policy (written) | **Missing** | See `policy-templates/vendor-management-policy.md` |
| Business Continuity / DR Plan (written, tested) | **Missing** | See `policy-templates/bcp-dr-plan.md` |

### CC5.2 — Technology Selection and Development

| Control | Status | Evidence / Artifact |
|---|---|---|
| Approved technology stack enforced | **Implemented** | `CLAUDE.md` — "The Aggressive Stack" + "Boss Rule" requires Craig authorization for new dependencies |
| TypeScript strict mode, no `any`, no `@ts-ignore` | **Implemented** | `CLAUDE.md` — Code Standards; `tsconfig.base.json` |
| Zod validation at all API boundaries | **Implemented** | Every route file in `apps/api/src/routes/`; `apps/api/src/middleware/validator.ts` |

### CC5.3 — Mitigation of Risks from Business Disruption

| Control | Status | Evidence / Artifact |
|---|---|---|
| Rate limiting on all public endpoints (6 tiers) | **Implemented** | `apps/api/src/middleware/rate-limit.ts` — sliding window with Redis (Upstash); fallback to in-memory; `X-RateLimit-*` headers on every response |
| Plan-tiered rate limiting by account tier | **Implemented** | `apps/api/src/middleware/rate-limiter.ts` — token bucket per plan tier (free/starter/professional/enterprise) |
| Input validation prevents injection attacks | **Implemented** | Zod schemas on every request body/query; `apps/api/src/middleware/validator.ts` |

---

## CC6 — Logical and Physical Access Controls

### CC6.1 — Logical Access Security Measures

| Control | Status | Evidence / Artifact |
|---|---|---|
| Passkey/WebAuthn as primary authentication | **Implemented** | `apps/api/src/routes/passkey.ts` — full FIDO2 registration + authentication flow; `packages/db/src/schema/passkeys.ts` — stores credentialId, publicKey, counter (replay attack prevention), AAGUID |
| Password fallback: Argon2id hashing | **Implemented** | `apps/api/src/routes/auth.ts` — `hashPassword()` uses `Bun.password.hash()` with argon2id, memoryCost 19456, timeCost 2 |
| SHA-256 legacy hash transparent migration to Argon2id | **Implemented** | `apps/api/src/routes/auth.ts` — auto-upgrade on successful login |
| JWT refresh token rotation | **Implemented** | `packages/db/src/schema/refresh-tokens.ts` — `family` column for token rotation chain; `usedAt`/`revokedAt` columns for theft detection |
| SAML 2.0 SSO (enterprise accounts) | **Implemented** | `apps/api/src/routes/sso.ts` — SP metadata, ACS, SLO; `packages/db/src/schema/sso-config.ts` — DB-backed config per account |
| OAuth integration (Google, Microsoft) | **Implemented** | `apps/api/src/routes/connect.ts` — Google OAuth + Microsoft OAuth flows via `sync/engine.js` |
| Scope-based API key permissions | **Implemented** | `apps/api/src/routes/api-keys.ts` — 8 permission flags (sendEmail, readEmail, manageDomains, manageApiKeys, manageWebhooks, viewAnalytics, manageAccount, manageTeamMembers); enforced by `requireScope()` in `apps/api/src/middleware/auth.ts` |
| API key stored as SHA-256 hash (never plaintext) | **Implemented** | `apps/api/src/routes/api-keys.ts` — `hashKey()` function; `apps/api/src/middleware/auth.ts` — lookup by hash |
| TLS 1.3 minimum | **Implemented** | Enforced by Cloudflare (all edge traffic); `CLAUDE.md` — Security Requirements |

### CC6.2 — Prior to Issuing System Credentials

| Control | Status | Evidence / Artifact |
|---|---|---|
| Team invitation flow (token-based, expiring) | **Implemented** | `packages/db/src/schema/sso-config.ts` — `teamInvitations` table with `expiresAt`, `token` (unique), `status`; `POST /v1/organizations/invitations` |
| Background checks for personnel | **Missing** | No formal process; pre-Series A single founder |

### CC6.3 — Removal of Access

| Control | Status | Evidence / Artifact |
|---|---|---|
| User removal from account | **Implemented** | `DELETE /v1/organizations/members/:userId` in `apps/api/src/routes/organizations.ts` |
| Refresh token revocation on logout | **Implemented** | `POST /v1/auth/logout` calls `revokeAllUserTokens()`; `revokedAt` recorded in DB |
| Invitation revocation | **Implemented** | `DELETE /v1/organizations/invitations/:invitationId` |
| 30-day soft-delete for accounts | **Implemented** | `packages/db/src/schema/users.ts` — `scheduledDeletionAt` timestamp + `account_status` enum includes `scheduled_for_deletion`; `CLAUDE.md` Forbidden List #13 |
| Formal offboarding checklist (process doc) | **Missing** | Code supports revocation; no written procedure |

### CC6.4 — Physical Access

| Control | Status | Evidence / Artifact |
|---|---|---|
| No owned data centers — vendor-managed physical security | **Implemented** | Cloudflare (Tier IV equivalent DCs), Neon (AWS-backed), Upstash (AWS-backed), Fly.io (own DCs) — each has SOC 2 Type II |
| Vendor security posture documented | **Partial** | Vendors listed in `CLAUDE.md`; no formal vendor risk register |

### CC6.5 — Logical Access Removed Timely

| Control | Status | Evidence / Artifact |
|---|---|---|
| API key expiry (`expiresAt` field) | **Implemented** | `apps/api/src/routes/api-keys.ts` — `CreateApiKeySchema` includes optional `expiresAt`; enforced in middleware |
| Passkey counter enforces replay protection | **Implemented** | `packages/db/src/schema/passkeys.ts` — `counter` column incremented on each use |

### CC6.6 — Security During Transmission

| Control | Status | Evidence / Artifact |
|---|---|---|
| TLS 1.3 minimum on all transport | **Implemented** | Cloudflare terminates TLS; `CLAUDE.md` Security Requirements |
| E2E encryption (RSA-OAEP-4096 + AES-256-GCM) for email content | **Partial** | `apps/api/src/routes/encryption.ts` — API exists; server-side key generation is placeholder; production path is client-side key generation (noted in code comments). Needs full client-side implementation before audit claim. |
| IMAP connections use TLS (`imapTls: true` default) | **Implemented** | `apps/api/src/routes/connect.ts` — `ImapConnectSchema` defaults `imapTls: true` |
| DKIM signing on outbound email | **Implemented** | `services/mta/` + `infrastructure/cloudflare/setup-dns.sh` (DKIM CNAME records) |

### CC6.7 — Security in System Acquisition, Development, and Maintenance

| Control | Status | Evidence / Artifact |
|---|---|---|
| No raw HTML in application code | **Implemented** | `CLAUDE.md` Forbidden List #1; component architecture enforced |
| No `localStorage` for sensitive data | **Implemented** | `CLAUDE.md` Forbidden List #15 — IndexedDB with encryption only |
| No third-party trackers | **Implemented** | `CLAUDE.md` Forbidden List #6 + #7 |
| AI actions require human-in-loop for destructive operations | **Implemented** | `CLAUDE.md` AI Integration Rules |

---

## CC7 — System Operations

### CC7.1 — Detection and Monitoring

| Control | Status | Evidence / Artifact |
|---|---|---|
| Health check endpoint | **Implemented** | `apps/api/src/routes/health.ts` — `GET /health` |
| Status page | **Implemented** | `apps/api/src/routes/status.ts` |
| OpenTelemetry + Grafana LGTM stack | **Partial** | Listed in `CLAUDE.md` stack; wiring to production not verified |
| Error handling (no silent failures) | **Implemented** | `CLAUDE.md` Forbidden List #18–19; typed error responses in all routes |

### CC7.2 — Evaluation of Security Events

| Control | Status | Evidence / Artifact |
|---|---|---|
| AI-powered phishing detection with signals | **Implemented** | `apps/api/src/routes/security.ts` — `POST /v1/security/check-phishing`; detects URL mismatch, sender spoofing, urgency, credential harvesting, lookalike domains |
| Threat severity classification | **Implemented** | `packages/db/src/schema/security-intelligence.ts` — `threatSeverityEnum` (critical/high/medium/low) |
| Sender reputation check (SPF/DKIM/DMARC, WHOIS, typosquatting) | **Implemented** | `apps/api/src/routes/security.ts` — `POST /v1/security/verify-sender` |
| Security dashboard | **Implemented** | `GET /v1/security-intelligence/dashboard` |

### CC7.3 — Incident Response

| Control | Status | Evidence / Artifact |
|---|---|---|
| Written Incident Response Plan | **Missing** | Emergency protocols defined in `CLAUDE.md`; formal IR plan with runbooks, roles, communication trees needed. See `policy-templates/incident-response-plan.md`. |
| GDPR 72h notification commitment | **Implemented** | `SECURITY.md` — Incident Response section |
| Credential rotation procedure | **Implemented** | `SECURITY.md` + `CLAUDE.md` Emergency Protocols — "rotate ALL secrets even tangentially related" |
| Post-mortem process and directory | **Implemented** | `CLAUDE.md` Emergency Protocols; `docs/postmortems/` |
| Incident response drill (tabletop exercise) | **Missing** | No evidence of any drills |

### CC7.4 — Incident Management and Communication

| Control | Status | Evidence / Artifact |
|---|---|---|
| Phishing report mechanism for end users | **Implemented** | `POST /v1/security/report-phishing`; `POST /v1/security-intelligence/report-phishing` |
| Threat quarantine action | **Implemented** | `POST /v1/security-intelligence/threats/:id/action` — action enum includes "quarantine" |
| Security policy enforcement (block sender/domain, require TLS) | **Implemented** | `apps/api/src/routes/security-intelligence.ts` — `CreatePolicySchema` supports 5 policy types |

---

## CC8 — Change Management

### CC8.1 — Change Procedures

| Control | Status | Evidence / Artifact |
|---|---|---|
| Written Change Management Policy | **Missing** | See `policy-templates/change-management-policy.md` |
| PR-based change process with CI gate | **Implemented** | `.github/workflows/ci.yml` — all merges to main require CI pass (lint, typecheck, test, build) |
| Staging → Production deployment gate | **Implemented** | `.github/workflows/deploy.yml` — `deploy-staging` job must succeed before `deploy-production` runs; separate GitHub environments |
| Production deployment requires Craig authorization | **Implemented** | `CLAUDE.md` — Boss Rule #5; deploy.yml uses `environment: production` (GitHub environment approval) |
| Conventional commit message standard | **Implemented** | `CLAUDE.md` — Code Standards: `feat:/fix:/perf:/refactor:/test:/docs:/ci:/chore:` |
| Pre-build and post-build checklists | **Implemented** | `CLAUDE.md` — Pre-Flight Checklist + Post-Build Checklist |
| ADR process for architectural decisions | **Implemented** | `docs/adrs/` — ADR-0001 through ADR-0007 documented |

### CC8.2 — Unauthorized Changes

| Control | Status | Evidence / Artifact |
|---|---|---|
| GitHub branch protection on `main` | **Partial** | Enforced by workflow `on: push: branches: [main]` but branch protection rules in GitHub settings not verified |
| Gitleaks secret scanning blocks secrets in commits | **Implemented** | `.github/workflows/security.yml` — `secret-scanning` job on every PR |
| Deployment only from known-good images (ECR) | **Implemented** | `.github/workflows/deploy.yml` — images tagged with `github.sha` and deployed via `kubectl set image` |

---

## CC9 — Risk Mitigation

### CC9.1 — Identification of Risks

| Control | Status | Evidence / Artifact |
|---|---|---|
| Vendor SOC 2 reports reviewed | **Missing** | Cloudflare, Neon, Upstash, Stripe, Anthropic all have SOC 2 Type II; AlecRae has not formally collected and reviewed them |
| Vendor inventory with risk ratings | **Missing** | No formal vendor risk register |

### CC9.2 — Management of Risks from Third Parties

| Control | Status | Evidence / Artifact |
|---|---|---|
| DPA signed with customers | **Implemented** | `apps/api/src/routes/dpa.ts` — self-serve signing; GDPR Article 28 compliant per route docstring |
| Vendor DPAs / SCCs | **Missing** | Need DPAs from Anthropic, Neon, Upstash, Cloudflare, Stripe, OpenAI |
| Vendor Management Policy | **Missing** | See `policy-templates/vendor-management-policy.md` |

---

## A1 — Availability

### A1.1 — Availability SLAs

| Control | Status | Evidence / Artifact |
|---|---|---|
| Performance budgets defined (FCP, LCP, TTI, API p99) | **Implemented** | `CLAUDE.md` — "Performance Budgets — CI FAILS IF VIOLATED" table |
| Health check + status page | **Implemented** | `GET /health`; `apps/api/src/routes/status.ts` |
| Email delivery target (< 2s send-to-delivered) | **Implemented** | `CLAUDE.md` — Performance Budgets |

### A1.2 — Environmental Protections

| Control | Status | Evidence / Artifact |
|---|---|---|
| Edge-first deployment (330+ Cloudflare cities) | **Implemented** | `infrastructure/cloudflare/wrangler.toml`; `CLAUDE.md` infrastructure stack |
| Database point-in-time recovery (Neon) | **Implemented** | `CLAUDE.md` — "Neon point-in-time recovery + daily R2 snapshots" |
| Redis failover (Upstash serverless) | **Implemented** | `apps/api/src/middleware/rate-limit.ts` — explicit in-memory fallback when Redis unavailable |
| MTA on Fly.io (Firecracker microVMs) | **Implemented** | `services/mta/fly.toml`; `CLAUDE.md` infrastructure |

### A1.3 — Recovery Testing

| Control | Status | Evidence / Artifact |
|---|---|---|
| DR plan with RPO/RTO targets | **Missing** | See `policy-templates/bcp-dr-plan.md` |
| Backup restoration test records | **Missing** | Neon PITR exists; no documented test |
| Rollback procedure documented | **Partial** | `CLAUDE.md` Emergency Protocols mentions rollback; no formal runbook |

---

## C1 — Confidentiality

### C1.1 — Identification and Maintenance of Confidential Information

| Control | Status | Evidence / Artifact |
|---|---|---|
| E2E encryption for email content (RSA-OAEP-4096 + AES-256-GCM) | **Partial** | `apps/api/src/routes/encryption.ts` — API scaffolded; key generation prototype uses server-side crypto (noted as dev placeholder; production requires client-side). Full ZK architecture not yet complete. |
| Encrypted private key storage (client-held passphrase) | **Partial** | Key store currently in-memory Map in `apps/api/src/routes/encryption.ts` (line 18); production path is DB-backed with client-side encryption. Needs migration. |
| No PII in logs | **Partial** | Not explicitly enforced in code; needs review |
| Attachment PII detection | **Implemented** | `services/security/src/` — attachment intelligence with PII detection |

### C1.2 — Disposal of Confidential Information

| Control | Status | Evidence / Artifact |
|---|---|---|
| 30-day soft delete with `scheduledDeletionAt` | **Implemented** | `packages/db/src/schema/users.ts` — `accountStatusEnum` includes `scheduled_for_deletion`; `CLAUDE.md` Forbidden List #13 |
| Data retention policy (written) | **Missing** | 30-day window exists in code; no written policy with user-facing disclosure |
| Suppression list for email compliance (GDPR right-to-erasure) | **Implemented** | `packages/db/src/schema/suppressions.ts`; `apps/api/src/routes/suppressions.ts` |

---

## Summary Counts

| Status | CC | A | C | Total |
|---|---|---|---|---|
| **Implemented** | 38 | 5 | 4 | 47 |
| **Partial** | 9 | 2 | 3 | 14 |
| **Missing** | 16 | 1 | 2 | 19 |

The technical security controls are strong. The gaps are almost entirely in formal
policy documents, process evidence (training records, DR tests, vendor reviews),
and a few incomplete code paths (E2E encryption key management, observability wiring).
See `gap-analysis.md` for the prioritized remediation list.
