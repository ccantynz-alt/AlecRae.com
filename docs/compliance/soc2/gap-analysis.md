# SOC 2 Gap Analysis — AlecRae

_Last updated: 2026-06-08 23:35 UTC_
> **Based on:** controls-matrix.md audit of codebase, CLAUDE.md, SECURITY.md, and GitHub workflows
> **Audience:** Craig + any readiness consultant or auditor

This document lists everything that must be addressed before a Type I audit can begin.
Items are grouped by category and prioritized by auditor impact.

---

## Severity Scale

| P | Label | Meaning |
|---|---|---|
| P1 | **Audit blocker** | Auditor will qualify or disclaim the report without this |
| P2 | **Material weakness** | Likely finding; must be remediated or auditor will note it |
| P3 | **Deficiency** | Should fix; may appear as observation but won't block opinion |
| P4 | **Enhancement** | Best practice; low audit risk |

---

## Category 1: Policy Documents (P1)

These are the #1 cause of failed readiness assessments. Auditors look for *written, dated, signed policies* before they look at technical controls. Six policies are essentially mandatory for SOC 2 Security criteria.

### 1.1 Information Security Policy
**Status:** Missing
**Why it matters:** CC1, CC5 — the foundational document that all other policies reference. Auditors ask to see it on day one.
**What to do:**
- Fill in and sign `policy-templates/information-security-policy.md`
- Craig signs as owner; record the date
- Store the signed PDF in a location with access controls (not just the repo)
- Review annually (set a calendar reminder)

### 1.2 Access Control Policy
**Status:** Missing
**Why it matters:** CC6 — the code has excellent access controls (passkeys, RBAC, scope-based API keys, SSO), but without a *written policy* that says "we follow least-privilege, we review access quarterly, we revoke within 24h of termination," the controls are orphaned.
**What to do:**
- Fill in `policy-templates/access-control-policy.md`
- Document the user roles defined in `packages/db/src/schema/users.ts` (owner/admin/member/viewer)
- Document the 8 API key permission scopes in `apps/api/src/middleware/auth.ts`
- Define the access review cadence (quarterly recommended)

### 1.3 Incident Response Plan
**Status:** Missing (partial prose exists in CLAUDE.md and SECURITY.md, but not a formal IRP)
**Why it matters:** CC7 — the most scrutinized policy in every SOC 2 audit. Auditors want named roles, escalation paths, communication templates, and evidence of at least one tabletop drill.
**What to do:**
- Fill in `policy-templates/incident-response-plan.md`
- Assign incident severity levels (Critical/High/Medium/Low) with response time SLAs
- Define the 72h GDPR notification workflow (already committed to in SECURITY.md)
- Conduct a tabletop exercise (1–2 hours, document who participated and outcomes)
- Keep records (the drill counts as evidence)

### 1.4 Change Management Policy
**Status:** Missing (process exists in CI/CD, but no policy document)
**Why it matters:** CC8 — PR-based changes with CI gates and staging→production gates are already in place. The policy document captures this in auditable prose so auditors don't have to reverse-engineer it from the YAML.
**What to do:**
- Fill in `policy-templates/change-management-policy.md`
- Reference `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` as the technical implementation
- Document what counts as an "emergency change" and how it's handled differently
- Define who approves production deployments (currently Craig per CLAUDE.md Boss Rule)

### 1.5 Vendor Management Policy
**Status:** Missing
**Why it matters:** CC9 — AlecRae processes customer emails through Anthropic (Claude), OpenAI (Whisper), Neon, Cloudflare, Upstash, Stripe, Fly.io. Auditors ask for a vendor list, risk ratings, and evidence that critical vendors have their own SOC 2 reports.
**What to do:**
- Fill in `policy-templates/vendor-management-policy.md`
- Collect SOC 2 Type II reports from: Cloudflare, Neon (via AWS), Upstash, Stripe, Anthropic (request from account manager), OpenAI, Fly.io
- Document sub-processor disclosure (required for GDPR DPA)
- Collect DPAs from each vendor that touches personal data

### 1.6 Business Continuity / Disaster Recovery Plan
**Status:** Missing (Neon PITR and rollback procedures mentioned in CLAUDE.md but no formal plan)
**Why it matters:** A1 — Availability criteria requires documented RPO/RTO targets and evidence that recovery has been tested.
**What to do:**
- Fill in `policy-templates/bcp-dr-plan.md`
- Define RPO and RTO for each service tier (email delivery vs. AI features vs. analytics)
- Document the Neon point-in-time recovery procedure step by step
- Run and record at least one restoration test
- Define what constitutes a disaster and who declares it

---

## Category 2: Risk Assessment (P1)

### 2.1 Formal Written Risk Assessment
**Status:** Missing
**Why it matters:** CC3 — the AICPA requires a documented risk assessment that identifies threats, likelihood, impact, and mitigations. This cannot be inferred from code.
**What to do:**
- Create a risk register (spreadsheet or Vanta/Drata tool)
- For each risk: threat source, threat event, likelihood (1–5), impact (1–5), inherent risk score, existing controls, residual risk score
- Common risks to include for email infrastructure:
  - Email account credential compromise
  - OAuth token exfiltration
  - AI prompt injection leading to data exfiltration
  - Database credential exposure
  - MTA abuse (outbound spam)
  - Supply chain compromise (npm dependency)
  - Cloudflare or Neon outage
  - GDPR data subject request not fulfilled within 30 days
- Review and re-sign the risk assessment at least annually

---

## Category 3: Personnel Controls (P2)

### 3.1 Security Awareness Training
**Status:** Missing
**Why it matters:** CC1 — auditors ask for training records. "Craig read CLAUDE.md" does not satisfy the requirement.
**What to do:**
- Enroll in a lightweight security awareness training platform: KnowBe4 Free, Curricula, or a Vanta-integrated option
- Complete training for all people with system access (Craig + any contractors)
- Record completion dates — this is evidence
- Train annually minimum; recommend quarterly phishing simulations

### 3.2 Background Checks
**Status:** Missing
**Why it matters:** CC6.2 — standard for SOC 2; "reasonable steps" to vet personnel with privileged access.
**What to do:**
- For Craig (founder/sole engineer): Self-attestation is acceptable at this stage
- For contractors: Require background check as a contract condition before granting system access
- Document the policy in the Access Control Policy

### 3.3 Onboarding / Offboarding Checklist
**Status:** Missing (process described in CLAUDE.md for AI agents, not for human employees)
**Why it matters:** CC6 — auditors want to see that access provisioning and deprovisioning follows a defined process.
**What to do:**
- Create a simple checklist (Notion, GitHub issue template, or standalone doc)
- Onboarding: background check complete → policy training complete → minimal-necessary access provisioned → access logged in audit log
- Offboarding: access revoked (all API keys, OAuth connections, DB access, GitHub) → audit log entry → token revocation (`POST /v1/auth/logout` for each session) → equipment wiped if applicable
- CLAUDE.md Boss Rule already handles production access — reference it

---

## Category 4: Third-Party Penetration Test (P2)

### 4.1 Annual Penetration Test
**Status:** Missing
**Why it matters:** CC7 — auditors strongly prefer a third-party pentest report, especially for a platform that processes email (a high-value target). Some auditors will note its absence even if not technically required.
**What to do:**
- Engage a pentest firm once the API is live against a production-equivalent staging environment
- Recommended firms for SaaS startups: Cobalt.io, Synack, Bishop Fox, NCC Group, or Detectify for automated surface scanning first
- Scope: `api.alecrae.com`, `mail.alecrae.com`, `admin.alecrae.com`, OAuth flows, WebAuthn flows, MTA
- Remediate all Critical and High findings before the Type I audit
- Keep the pentest report and remediation evidence — auditors will want to see both

---

## Category 5: Evidence Collection Infrastructure (P2)

### 5.1 Compliance Automation Platform
**Status:** Missing
**Why it matters:** Auditors require continuous evidence, not point-in-time screenshots. Manual evidence collection at scale is error-prone and expensive.
**What to do:**
- Evaluate: **Vanta** (best GitHub/Cloudflare/AWS integrations, most common for SaaS), **Drata**, or **Sprinto** (cheaper, good for small teams)
- Connect integrations: GitHub (auto-collect PR reviews, CI runs), AWS ECR (image scanning), Cloudflare, Stripe, Neon (via custom connector or Vanta's Postgres integration)
- Vanta can auto-collect: employee training completion, background check status, access review completion, vendor SOC 2 report status
- Cost: $1K–$3K/month; negotiable for early-stage startups

### 5.2 Access Review Records
**Status:** Missing
**Why it matters:** CC6 — auditors look for quarterly access reviews: who has access, was it reviewed, were any accounts removed.
**What to do:**
- Use the existing `GET /v1/organizations/members` and `GET /v1/organizations/audit-log` APIs — these already produce the right data
- Run a quarterly access review export and store it (screenshot or CSV)
- Document the review in the audit log: who reviewed, when, what actions taken

---

## Category 6: Encryption Control Gaps (P2)

### 6.1 E2E Encryption Key Management (Server-Side Placeholder)
**Status:** Partial — code has a note that production must use client-side key generation
**File:** `apps/api/src/routes/encryption.ts` (line 18 — `keyStore` is an in-memory Map; lines 44, 60–80 — server generates keys as a dev placeholder)
**Why it matters:** C1 — if auditors examine the encryption route and find server-side key generation in production, the "zero-knowledge" claim collapses.
**What to do:**
- Before audit: Migrate `keyStore` to a DB-backed table (schema already partially described in the route comments)
- Ensure the private key passphrase never reaches the server (client-side AES-GCM derivation only)
- Update the route to return only the encrypted private key blob
- Document the key management procedure in the Information Security Policy

### 6.2 PII in Logs
**Status:** Partial — not explicitly checked
**What to do:**
- Audit all `console.log` / `console.error` calls in `apps/api/src/` to confirm email addresses and message bodies are not logged
- Add a lint rule or log scrubber to prevent PII in structured logs

---

## Category 7: Monitoring and Observability (P3)

### 7.1 OpenTelemetry / Grafana Wiring
**Status:** Partial — listed in CLAUDE.md stack; actual wiring to production not verified
**Why it matters:** CC7 — continuous monitoring evidence requires actual telemetry data, not just the capability.
**What to do:**
- Wire OpenTelemetry SDK into `apps/api/src/` (request traces, error rates, latency percentiles)
- Connect to Grafana LGTM (Loki for logs, Tempo for traces, Mimir for metrics)
- Create a dashboard with: API error rate, p99 latency, rate limit rejections, failed login attempts, phishing detections per hour
- Enable alerting on anomalies (5xx spike, unusual login failures, throughput drop)

### 7.2 Phishing Reports Stored In-Memory
**Status:** Partial — `apps/api/src/routes/security.ts` lines 32–45: `phishingReports` is a `Map<string, PhishingReport[]>`
**What to do:**
- Migrate to DB table (similar pattern to `securityAuditLog` already in `packages/db/src/schema/security-intelligence.ts`)
- Phishing reports are evidence of threat detection; losing them on restart is an availability and integrity issue

---

## Category 8: Legal and Compliance Process (P3)

### 8.1 GDPR Data Processing Agreement (Enterprise Workflow)
**Status:** Partial — self-serve DPA signing works (`apps/api/src/routes/dpa.ts`); sub-processor DPAs from vendors not collected
**What to do:**
- Collect DPAs from: Anthropic, Neon, Upstash, Cloudflare, Stripe, OpenAI, Fly.io
- Update the DPA text in `apps/api/src/routes/dpa.ts` (`CURRENT_DPA_TEXT`) to include the current sub-processor list
- Set up a sub-processor notification mechanism (email customers when sub-processors change — GDPR requirement)

### 8.2 Data Retention Policy
**Status:** Missing (30-day soft delete is in code; no user-facing policy document or privacy policy disclosure)
**What to do:**
- Document retention periods for each data type: emails, attachments, audit logs, analytics events, AI training signals
- Disclose retention in the Privacy Policy
- Implement automated purge for expired data (connect `scheduledDeletionAt` to a background job)

### 8.3 Bug Bounty Program (Formalized)
**Status:** Partial — SECURITY.md references a reward table at `alecrae.com/security`; the HackerOne/Intigriti program is not yet live
**What to do:**
- Stand up on HackerOne (preferred for SaaS) or Intigriti
- Define reward tiers by CVSS score (e.g., Critical: $500–$2K, High: $200–$500, Medium: $100–$200)
- Link from SECURITY.md
- Update the `SECURITY.md` Hall of Fame as researchers are credited

---

## Remediation Priority Order

For the fastest path to a Type I audit opinion:

| Week | Actions |
|---|---|
| **Weeks 1–2** | Sign the 6 policy templates. Write and sign the risk assessment. These are zero-cost and unblock everything else. |
| **Weeks 3–4** | Engage a compliance platform (Vanta trial). Connect GitHub, AWS, Cloudflare. Begin automated evidence collection. |
| **Month 2** | Complete security awareness training (Craig + any contractors). Collect vendor SOC 2 reports. Stand up pentest with a firm. |
| **Month 2–3** | Migrate encryption key store to DB. Migrate phishing reports to DB. Wire OpenTelemetry. Fix PII-in-logs risk. |
| **Month 3** | Pentest completed, Critical/High findings remediated. Conduct tabletop IR drill. Record DR test. Run first quarterly access review. |
| **Month 4** | Engage audit firm. Readiness assessment. Final gap remediation. |
| **Months 5–6** | Auditor fieldwork. Type I report issued. Begin Type II observation period. |

---

## Items That Are NOT Code Problems

The following gaps cannot be resolved with a pull request. They require Craig's time
or an external engagement:

1. Signing policy documents (1–2 hours)
2. Writing the risk assessment (2–4 hours with a template)
3. Completing security awareness training (1–2 hours)
4. Engaging a pentest firm (requires production-equivalent environment to be live)
5. Collecting vendor SOC 2 reports (email requests to account managers)
6. Conducting a tabletop IR drill (1–2 hours with Craig + any contractors)
7. Running a quarterly access review (30 minutes)
8. Engaging an audit firm (procurement process)
9. Budget approval for Vanta/Drata and the audit fee
