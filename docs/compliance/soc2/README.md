# SOC 2 Compliance — AlecRae

> **Owner:** Craig (ccantynz@gmail.com)
> **Status:** Pre-audit groundwork — Type I target
> **Last updated:** 2026-06-08

---

## What SOC 2 Actually Means

SOC 2 (System and Organization Controls 2) is an audit framework developed by the
American Institute of CPAs (AICPA). A licensed CPA firm examines your controls
against published Trust Services Criteria and issues an opinion letter. Customers —
especially enterprise IT/security teams — use that letter to avoid doing their own
audit of every SaaS vendor.

### Type I vs Type II

| | Type I | Type II |
|---|---|---|
| **Question answered** | "Do your controls EXIST and are they DESIGNED correctly?" | "Did your controls actually OPERATE effectively over time?" |
| **Point-in-time or period** | Single date (a snapshot) | 6–12 month observation window |
| **Typical cost** | $15K–$35K | $30K–$80K+ |
| **Time to complete** | 3–6 months from groundwork start | 9–18 months total (includes the observation window) |
| **Market value** | Good for early enterprise sales, procurement questionnaires | Required by Fortune 500, government contractors, most financial sector customers |
| **Strategy** | Do Type I first to validate readiness, then roll directly into Type II | Observation window starts after Type I controls are in place |

**AlecRae's path:** Achieve Type I within 6 months, then automatically enter the
Type II observation period. This is the fastest credible path to the enterprise tier.

---

## The Five Trust Services Criteria

AICPA defines five criteria families. You choose which to include; Security (CC) is
mandatory. The others are optional but add credibility for email infrastructure.

| Criteria | Code | What it covers | AlecRae relevance |
|---|---|---|---|
| **Security** | CC | Logical and physical access, change management, risk assessment, incident response, monitoring | MANDATORY — covers the entire platform |
| **Availability** | A | System availability meets SLAs | HIGH — email delivery SLA is a core sales point |
| **Confidentiality** | C | Protection of confidential information | HIGH — customers' email content is confidential by definition |
| **Processing Integrity** | PI | System processes data completely, accurately, and timely | MEDIUM — email send reliability, delivery tracking accuracy |
| **Privacy** | P | Personal information lifecycle (GDPR-adjacent) | HIGH — email is PII-dense; enterprise customers ask for this |

**Recommended scope for AlecRae Type I:** CC (Security) + A (Availability) + C (Confidentiality).
Add P (Privacy) if targeting EU enterprise customers in the first cohort.

---

## Realistic Timeline: 3–6 Months to Type I

### Month 1 — Foundations (Craig + Claude)
- [ ] Engage a SOC 2 readiness firm or fractional CISO (budget: $5K–$15K)
- [ ] Select and engage audit firm (Big 4 sub is overkill; Prescient, Johanson, BARR, or A-LIGN work well for SaaS startups)
- [ ] Define system boundary: what's in scope (mail.alecrae.com, api.alecrae.com, Neon, Cloudflare, Upstash, R2)
- [ ] Write and sign the six core policy documents (see `policy-templates/`)
- [ ] Assign a dedicated compliance owner (Craig initially)
- [ ] Stand up evidence collection tooling (Vanta, Drata, or Sprinto — $1K–$3K/mo)

### Month 2 — Gap Remediation
- [ ] Implement all "Missing" controls from `controls-matrix.md`
- [ ] Train all personnel (Craig + any contractors) on security policies
- [ ] Complete vendor inventory and risk assessments for Anthropic, Stripe, Cloudflare, Neon, Upstash, OpenAI
- [ ] Stand up formal change management process (PR-based already exists — needs documentation)
- [ ] Commission penetration test (budget: $10K–$20K; firms like Cobalt, Synack, or Bishop Fox)

### Month 3 — Evidence Hardening
- [ ] Collect 30+ days of evidence for each control (screenshots, exports, automated collectors)
- [ ] Complete penetration test and remediate all critical/high findings
- [ ] Conduct formal risk assessment (document threats, likelihood, impact, mitigations)
- [ ] Run internal control self-assessment walkthrough
- [ ] Finalize security awareness training records

### Month 4 — Pre-Audit Readiness
- [ ] Readiness assessment with audit firm (they review your evidence, flag gaps)
- [ ] Remediate remaining gaps
- [ ] Prepare system description (narrative of AlecRae's platform — usually 10–20 pages)
- [ ] Legal review of policy documents

### Months 5–6 — Type I Audit
- [ ] Auditor fieldwork (interviews, evidence review, testing)
- [ ] Draft report review and management responses
- [ ] Final Type I report issued
- [ ] Begin Type II observation period

---

## What AlecRae Already Has (Technical Controls)

The following controls are implemented in code and are genuine audit evidence.
See `controls-matrix.md` for the full mapping.

| Control | Evidence location |
|---|---|
| Passkey/WebAuthn authentication | `apps/api/src/routes/passkey.ts`, `packages/db/src/schema/passkeys.ts` |
| JWT refresh token rotation with theft detection | `packages/db/src/schema/refresh-tokens.ts`, `apps/api/src/lib/jwt.ts` |
| Argon2id password hashing (with SHA-256 legacy migration) | `apps/api/src/routes/auth.ts` |
| RBAC via roles (owner/admin/member/viewer) | `packages/db/src/schema/users.ts` (`userRoleEnum`) |
| Scope-based API key permissions (8 permission flags) | `apps/api/src/middleware/auth.ts`, `apps/api/src/routes/api-keys.ts` |
| Audit log table (DB-backed, per account) | `packages/db/src/schema/sso-config.ts` (`auditLogs` table) |
| Organization audit log API | `apps/api/src/routes/organizations.ts` (`GET /audit-log`) |
| E2E encryption (RSA-OAEP-4096 + AES-256-GCM) | `apps/api/src/routes/encryption.ts` |
| 6-tier rate limiting (sliding window, Redis-backed) | `apps/api/src/middleware/rate-limit.ts` |
| AI-powered phishing detection with explainer | `apps/api/src/routes/security.ts`, `apps/api/src/routes/security-intelligence.ts` |
| Threat detection DB (phishing, malware, BEC, etc.) | `packages/db/src/schema/security-intelligence.ts` |
| Security policy engine (block sender/domain, require TLS, quarantine) | `apps/api/src/routes/security-intelligence.ts` |
| SPF/DKIM/DMARC enforcement | `infrastructure/cloudflare/setup-dns.sh`, `services/mta/` |
| TLS 1.3 minimum (Cloudflare enforced) | `infrastructure/cloudflare/wrangler.toml` + Cloudflare dashboard |
| SAML 2.0 SSO (SP-side, DB-backed config) | `apps/api/src/routes/sso.ts`, `packages/db/src/schema/sso-config.ts` |
| Dependency audit (npm audit + OSV-Scanner weekly) | `.github/workflows/security.yml` |
| CodeQL SAST (JavaScript/TypeScript, security-extended queries) | `.github/workflows/security.yml` |
| Secret scanning (Gitleaks on every PR) | `.github/workflows/security.yml` |
| DPA self-serve signing with tamper-evident hash | `apps/api/src/routes/dpa.ts`, `packages/db/src/schema/dpa-signatures.ts` |
| 30-day soft-delete window (account deletion) | `packages/db/src/schema/users.ts` (`scheduledDeletionAt`) |
| Virus scanning on attachments | `services/security/src/virus-scanner.ts` |
| Zod validation at every API boundary | All route files; `apps/api/src/middleware/validator.ts` |
| No secrets in code (env vars only) | CLAUDE.md Forbidden List #4; `.env` not committed |
| GDPR 72-hour breach notification commitment | `SECURITY.md` |
| CI pipeline (lint + typecheck + test + build gates) | `.github/workflows/ci.yml` |
| Staging → Production deployment gate | `.github/workflows/deploy.yml` (separate environments) |

---

## What AlecRae Needs (Process and Document Controls)

These are the gaps most commonly cited in SOC 2 audits for early-stage SaaS.
They are primarily human/process items, not code. See `gap-analysis.md` for detail.

| Gap | Type | Priority |
|---|---|---|
| Written Information Security Policy | Policy document | CRITICAL |
| Written Access Control Policy | Policy document | CRITICAL |
| Written Incident Response Plan | Policy document + drill | CRITICAL |
| Written Change Management Policy | Policy document | HIGH |
| Written Vendor Management Policy + risk register | Policy document + spreadsheet | HIGH |
| Written Business Continuity / DR Plan | Policy document + test | HIGH |
| Formal risk assessment (documented threats + mitigations) | Document | CRITICAL |
| Security awareness training records | Training + records | HIGH |
| Penetration test (third-party, annual) | Vendor engagement | HIGH |
| Evidence collection automation | Tooling (Vanta/Drata) | HIGH |
| Background checks for personnel | HR process | MEDIUM |
| Formal onboarding/offboarding checklist | Process doc | MEDIUM |
| Asset inventory | Spreadsheet/tool | MEDIUM |
| Encryption key management procedure | Policy section | MEDIUM |
| Backup and recovery testing records | Process + records | MEDIUM |
| GDPR DPA workflow (beyond self-serve signing) | Legal + process | MEDIUM |
| Bug bounty program (formalized) | Vendor: HackerOne/Intigriti | MEDIUM |

---

## Budget Estimate

| Item | Cost |
|---|---|
| Compliance automation platform (Vanta/Drata/Sprinto) | $12K–$36K/year |
| Readiness consultant / fractional CISO | $5K–$15K one-time |
| Penetration test | $10K–$20K |
| Type I audit fee | $15K–$35K |
| Legal review of policies | $2K–$5K |
| Security awareness training platform | $500–$2K/year |
| **Estimated total (Type I)** | **$45K–$113K** |

> **Craig:** The midpoint is roughly $75K to get to a signed Type I report.
> Vanta is the most common choice for Series A–stage SaaS; it auto-collects
> evidence from GitHub, AWS, Cloudflare, Stripe, and Neon, cutting manual
> evidence work by ~60%.
