# Information Security Policy — AlecRae

> **Policy owner:** [CRAIG — INSERT FULL LEGAL NAME]
> **Version:** 1.0
> **Effective date:** [INSERT DATE]
> **Next review date:** [INSERT DATE — one year from effective date]
> **Approved by:** [CRAIG — INSERT FULL LEGAL NAME], Founder & CEO
> **Classification:** Internal — distribute to all personnel with system access

---

## 1. Purpose

This policy establishes the framework for protecting the confidentiality, integrity,
and availability of AlecRae's information systems, customer data, and business
operations. AlecRae processes customers' email — one of the most sensitive categories
of personal data — and this policy reflects the elevated duty of care that entails.

---

## 2. Scope

This policy applies to:

- All employees, contractors, and consultants with access to AlecRae systems
- All AlecRae information systems, including production infrastructure hosted on
  Cloudflare Pages/Workers, Fly.io, Neon Serverless Postgres, and Upstash Redis
- All customer data processed by the AlecRae platform at `mail.alecrae.com`,
  `api.alecrae.com`, and `admin.alecrae.com`
- The AlecRae monorepo at `github.com/[ORGANIZATION]/AlecRae.com` [CRAIG: INSERT CORRECT GITHUB ORG]
- All devices (personal and company-issued) used to access AlecRae systems

---

## 3. Information Classification

| Level | Definition | Examples | Handling |
|---|---|---|---|
| **Restricted** | Highest sensitivity; disclosure would cause material harm | Customer email content, authentication credentials, encryption keys, Stripe API keys, Anthropic API keys | Encrypted at rest and in transit; access limited to personnel with explicit need |
| **Confidential** | Sensitive business or customer information | Customer account data, billing information, internal source code, infrastructure configuration | Encrypted in transit; access controlled by role |
| **Internal** | Internal operational information | This policy, runbooks, architectural docs | Not for public release; no special encryption required |
| **Public** | Intentionally public | Marketing pages, API documentation at docs.alecrae.com | No restrictions |

Customer email content is always classified **Restricted**.

---

## 4. Roles and Responsibilities

### 4.1 Security Owner
[CRAIG — INSERT FULL LEGAL NAME] is the designated Information Security Owner responsible for:
- Maintaining and enforcing this policy
- Approving exceptions
- Overseeing security incident response
- Authorizing changes to the production environment per CLAUDE.md Boss Rule

### 4.2 All Personnel
All individuals with access to AlecRae systems must:
- Read and acknowledge this policy before receiving system access
- Complete annual security awareness training
- Report security incidents or suspected vulnerabilities immediately to `security@alecrae.com`
- Follow the principle of least privilege — request only the access needed for current work
- Never share credentials or API keys
- Not use personal email for business communications involving Restricted data

---

## 5. Access Control

Access to AlecRae systems follows the principle of least privilege and is governed by
the separate Access Control Policy. Key requirements:

- Authentication uses Passkeys/WebAuthn (FIDO2) as the primary method; Argon2id-hashed
  passwords as fallback (`apps/api/src/routes/passkey.ts`, `apps/api/src/routes/auth.ts`)
- API access uses scoped keys (`apps/api/src/routes/api-keys.ts`); each key has only
  the permissions required for its purpose
- RBAC roles (owner/admin/member/viewer) are enforced in the database and API
  (`packages/db/src/schema/users.ts`)
- All privileged actions are logged to the audit log (`packages/db/src/schema/sso-config.ts`)

---

## 6. Data Protection

### 6.1 Encryption
- All data in transit uses TLS 1.3 minimum (enforced by Cloudflare)
- Customer email content with end-to-end encryption uses RSA-OAEP-4096 + AES-256-GCM
  (`apps/api/src/routes/encryption.ts`)
- Encryption keys are managed client-side; the server stores only public keys and
  passphrase-encrypted private key blobs
- Sensitive data at rest in Neon Postgres is encrypted by the Neon platform (AES-256)

### 6.2 Data Retention
- Customer account data is retained for the duration of the subscription plus a
  30-day soft-delete window (`packages/db/src/schema/users.ts` — `scheduledDeletionAt`)
- Detailed retention periods by data type:

| Data type | Retention | Authority |
|---|---|---|
| Email content | Duration of account + 30 days | `scheduledDeletionAt` field |
| Audit logs | [INSERT PERIOD — recommend 1 year] | [CRAIG: confirm] |
| Analytics events | [INSERT PERIOD — recommend 90 days] | [CRAIG: confirm] |
| Authentication tokens | Until expiry or revocation | `refresh_tokens` table |
| Stripe billing records | 7 years (regulatory requirement) | Stripe-managed |

### 6.3 Data Minimization
AlecRae collects only the personal data necessary to provide the service. No user data
is sold or shared with third parties for advertising. No third-party trackers are
embedded in the platform (per CLAUDE.md Forbidden List items 6–7).

---

## 7. Cryptographic Controls

- No custom cryptography — only Web Crypto API (RSA-OAEP, AES-GCM, SHA-256)
- No secrets in source code — all credentials via environment variables
- API keys are stored as SHA-256 hashes; plaintext keys are shown to the user once
  and never stored (`apps/api/src/routes/api-keys.ts`)
- JWT tokens signed with HS256/RS256 using the `jose` library
- Passphrase-derived keys use AES-GCM with a 256-bit key

---

## 8. Vulnerability Management

- Automated dependency scanning runs every Monday (OSV-Scanner + audit-ci)
  and on every pull request to `main` (`.github/workflows/security.yml`)
- CodeQL SAST analysis with `security-extended` query pack runs on every PR
- Gitleaks secret scanning runs on every PR with full commit history
- Third-party penetration tests are conducted [INSERT FREQUENCY — recommend annually]
- Critical and High vulnerabilities are remediated within [INSERT SLA — recommend
  30 days for Critical, 90 days for High]
- Security findings are tracked in [INSERT TOOL — GitHub Issues / Vanta / Jira]

---

## 9. Incident Response

A detailed Incident Response Plan is maintained separately at
`docs/compliance/soc2/policy-templates/incident-response-plan.md`. In summary:

- All suspected security incidents are reported to `security@alecrae.com` immediately
- The Security Owner is notified within [INSERT SLA — recommend 1 hour for Critical]
- Affected customers are notified within 72 hours of confirmed breach (GDPR Article 33)
- Post-mortems are published at `docs/postmortems/` within 14 days

---

## 10. Change Management

All changes to production systems follow the Change Management Policy at
`docs/compliance/soc2/policy-templates/change-management-policy.md`. The technical
implementation is:

- All changes via pull request to the `main` branch
- CI gate: lint + typecheck + test + build must pass (`.github/workflows/ci.yml`)
- Staging deployment and health check before production (`.github/workflows/deploy.yml`)
- Production deployments authorized by [CRAIG — INSERT FULL LEGAL NAME] per CLAUDE.md

---

## 11. Third-Party and Vendor Management

AlecRae uses the following critical sub-processors that handle Restricted data:

| Vendor | Purpose | SOC 2 Type II | DPA obtained |
|---|---|---|---|
| Cloudflare | Edge compute, CDN, DNS | Yes (request at trust.cloudflare.com) | [INSERT DATE or "Pending"] |
| Neon (AWS-backed) | Primary database | Yes | [INSERT DATE or "Pending"] |
| Upstash | Redis cache / rate limiting | Yes | [INSERT DATE or "Pending"] |
| Fly.io | MTA / long-lived processes | [CHECK] | [INSERT DATE or "Pending"] |
| Stripe | Billing | Yes | [INSERT DATE or "Pending"] |
| Anthropic | AI processing (Claude) | [REQUEST from account manager] | [INSERT DATE or "Pending"] |
| OpenAI | Voice transcription (Whisper) | Yes | [INSERT DATE or "Pending"] |

Vendor selection and ongoing management follows the Vendor Management Policy.

---

## 12. Physical Security

AlecRae operates on cloud infrastructure only and does not own or operate any
data centers. Physical security is delegated to the infrastructure vendors listed
above, each of which maintains SOC 2 Type II certification covering physical
access controls.

Work is conducted from [INSERT WORK LOCATION DESCRIPTION — e.g., "Craig's home
office in Auckland, New Zealand"]. Access to work devices is protected by:
- Device password / biometric lock
- Full-disk encryption [CRAIG: confirm FileVault / BitLocker is enabled]
- Screen lock after [INSERT TIMEOUT — recommend 5 minutes] of inactivity

---

## 13. Acceptable Use

Personnel must not:
- Access customer email content except to investigate a reported technical issue
  with the customer's knowledge and consent
- Use production credentials for development or testing
- Commit secrets, API keys, or passwords to any code repository
- Install software with known vulnerabilities on systems used for AlecRae development
- Use `any` type, `@ts-ignore`, or other type safety bypasses in production code
  (CLAUDE.md Forbidden List)
- Make production deployments without authorization from the Security Owner

---

## 14. Policy Enforcement

Violations of this policy may result in:
- Revocation of system access
- Termination of employment or contract
- Legal action where the violation causes harm to customers or the business

---

## 15. Policy Review

This policy is reviewed annually or following any significant security incident.
Changes require approval from [CRAIG — INSERT FULL LEGAL NAME].

---

## Acknowledgment

By receiving access to AlecRae systems, all personnel acknowledge that they have
read, understood, and agree to comply with this policy.

**[CRAIG — INSERT FULL LEGAL NAME]**
**Title:** Founder & CEO, AlecRae
**Signature:** ________________________
**Date:** [INSERT DATE]

---

*See also: Access Control Policy, Incident Response Plan, Change Management Policy,
Vendor Management Policy, Business Continuity / DR Plan*
