# Access Control Policy — AlecRae

> **Policy owner:** [CRAIG — INSERT FULL LEGAL NAME]
> **Version:** 1.0
> **Effective date:** [INSERT DATE]
> **Next review date:** [INSERT DATE — one year from effective date]
> **Approved by:** [CRAIG — INSERT FULL LEGAL NAME], Founder & CEO
> **Classification:** Internal

---

## 1. Purpose

This policy defines how access to AlecRae systems is granted, reviewed, and revoked.
It operationalizes the principle of least privilege across all roles, environments,
and credential types.

---

## 2. Scope

- All personnel (employees, contractors, consultants) with access to AlecRae systems
- All system accounts: human users, API keys, OAuth service accounts, deployment tokens
- Environments: production (`api.alecrae.com`, `mail.alecrae.com`, `admin.alecrae.com`),
  staging, and the GitHub repository

---

## 3. Roles and Permission Levels

### 3.1 Application User Roles

Defined in `packages/db/src/schema/users.ts` (`userRoleEnum`) and enforced at the API
layer via `apps/api/src/middleware/auth.ts` (`requireScope()`):

| Role | Description | Assigned to |
|---|---|---|
| `owner` | Full account control, billing, SSO configuration | Account owner (typically a business customer's admin) |
| `admin` | User management, organization settings, SSO | Designated account admins |
| `member` | Standard email access, compose, AI features | Regular users |
| `viewer` | Read-only email access, analytics | Analytics users, auditors |

### 3.2 API Key Permission Scopes

API keys grant per-scope access. Defined in `apps/api/src/routes/api-keys.ts`:

| Scope | Permission flag | Risk level |
|---|---|---|
| `messages:send` | `sendEmail: true` | High — can send email on behalf of account |
| `messages:read` | `readEmail: true` | Medium — can read all email in account |
| `domains:manage` | `manageDomains: true` | High — can add/modify sending domains |
| `api_keys:manage` | `manageApiKeys: true` | Critical — can create new keys; never grant unless required |
| `webhooks:manage` | `manageWebhooks: true` | Medium — can create/modify webhook endpoints |
| `analytics:read` | `viewAnalytics: true` | Low — read-only analytics data |
| `account:manage` | `manageAccount: true` | High — can modify account settings |
| `team:manage` | `manageTeamMembers: true` | High — can add/remove team members |

Keys with `api_keys:manage` or `account:manage` are **Privileged Keys** and require
additional justification and approval before issuance.

### 3.3 Infrastructure / Platform Access

| System | Who has access | Credential type |
|---|---|---|
| GitHub repository | [CRAIG: list all collaborators] | GitHub SSO + 2FA |
| Cloudflare Dashboard | [CRAIG: list] | Cloudflare SSO + 2FA |
| Neon Console | [CRAIG: list] | Neon SSO + 2FA |
| Upstash Console | [CRAIG: list] | Upstash SSO + 2FA |
| Fly.io Console | [CRAIG: list] | Fly.io SSO + 2FA |
| Stripe Dashboard | [CRAIG: list] | Stripe SSO + 2FA |
| AWS ECR / EKS (deploy) | GitHub Actions via OIDC | OIDC — no long-lived key |
| Anthropic API | GitHub Actions secret | Secret rotation: [INSERT SCHEDULE] |
| OpenAI API | GitHub Actions secret | Secret rotation: [INSERT SCHEDULE] |

---

## 4. Provisioning Process

### 4.1 New Personnel Onboarding
1. Background check completed (if required — see §8 and Access Control Policy §6.2)
2. Security awareness training completed and recorded
3. Information Security Policy read and acknowledged (signed copy filed)
4. Minimal access provisioned based on role
5. Access creation logged in audit log (`auditLogs` table in `packages/db/src/schema/sso-config.ts`)
6. No production database access without specific justification and approval from the Security Owner

### 4.2 API Key Issuance
1. Requester specifies use case and required permission scopes
2. Only scopes necessary for the use case are granted (least privilege)
3. Expiry date set for all keys (no indefinitely valid keys unless justified)
4. Keys are stored as SHA-256 hashes in the database; the plaintext key is shown once
   and the requester is responsible for secure storage
5. Key purpose documented at time of creation (`name` field)

### 4.3 Shared Access
Shared credentials are prohibited. Every human user must have their own account.
System-to-system access uses scoped API keys or OIDC tokens (not shared passwords).

---

## 5. Authentication Requirements

### 5.1 Primary Authentication
All human user authentication to the AlecRae web application uses:
- **Passkeys (WebAuthn/FIDO2)** as the primary method — implemented in
  `apps/api/src/routes/passkey.ts`; credentials stored in `packages/db/src/schema/passkeys.ts`
- **Password fallback** — Argon2id hashing (memoryCost: 19456, timeCost: 2) via
  `apps/api/src/routes/auth.ts`; legacy SHA-256 hashes auto-migrate to Argon2id on login

### 5.2 Enterprise SSO
Enterprise accounts may configure SAML 2.0 IdP-initiated SSO via
`apps/api/src/routes/sso.ts`. SSO configuration is stored per-account in
`packages/db/src/schema/sso-config.ts`. SSO enforcement (preventing password login
when SSO is configured) is controlled by the `enforced` flag.

### 5.3 Infrastructure Access
- All console access to Cloudflare, Neon, Upstash, Fly.io, Stripe requires MFA
- GitHub repository access requires 2FA
- Deployment credentials use OIDC (no long-lived secrets): `deploy.yml` uses
  `aws-actions/configure-aws-credentials` with `role-to-assume` via OIDC

### 5.4 Session Management
- JWT access tokens expire after [INSERT DURATION — e.g., 15 minutes]
- Refresh tokens rotate on each use; reuse of a consumed token triggers revocation of
  the entire family (theft detection) — `packages/db/src/schema/refresh-tokens.ts`
- Users can revoke all sessions via `POST /v1/auth/logout`

---

## 6. Access Review

| Review type | Frequency | Owner | Evidence artifact |
|---|---|---|---|
| Application user access review | Quarterly | Security Owner | Export of `GET /v1/organizations/members` + review sign-off |
| Infrastructure / console access review | Quarterly | Security Owner | Screenshot/export from each vendor console |
| API key review (expiry, scope appropriateness) | Quarterly | Security Owner | Export from `api_keys` table |
| GitHub collaborator review | Quarterly | Security Owner | GitHub Settings → Collaborators export |
| Privileged key review | Monthly | Security Owner | Filtered export of keys with `manageApiKeys` or `account:manage` |

Reviews must be documented: who conducted the review, date, any changes made.

---

## 7. Revocation

### 7.1 Immediate Revocation Triggers
- Employee or contractor termination
- Suspected credential compromise
- Account owner request
- Security incident involving the account

### 7.2 Revocation Process
1. Revoke all application-level sessions: `POST /v1/auth/logout` (revokes all refresh tokens via `revokeAllUserTokens()`)
2. Revoke all API keys for the user/account
3. Remove from GitHub repository if applicable
4. Remove from all cloud console access
5. Revoke OAuth connections (`DELETE /v1/connect/accounts/:id`)
6. Log the revocation in the audit log
7. Complete within **[INSERT SLA — recommend 2 hours for termination, 30 minutes for compromise]**

### 7.3 Team Member Removal
`DELETE /v1/organizations/members/:userId` in `apps/api/src/routes/organizations.ts`
handles application-level removal; infrastructure access must be revoked separately
following the checklist above.

---

## 8. Privileged Access

"Privileged access" means direct database access, production deployment capabilities,
or API keys with `account:manage` or `api_keys:manage` scope.

- Privileged access is restricted to the Security Owner [CRAIG: name] unless a
  specific, time-limited exception is approved
- No persistent privileged database access for individuals — use short-lived
  credentials or Neon connection strings scoped to specific operations
- Privileged access sessions are logged
- Production deployments follow the gate in `.github/workflows/deploy.yml`
  (staging → production with GitHub environment approval)

---

## 9. Remote Access

All remote access to AlecRae systems occurs over TLS 1.3 (enforced by Cloudflare).
There is no VPN requirement given the edge-first architecture, but:
- Work devices must use full-disk encryption
- Screen lock must engage after [INSERT TIMEOUT — recommend 5 minutes] of inactivity
- Work must not be performed on untrusted public networks without a VPN
  [CRAIG: specify a VPN if required, or note "accepted risk at this stage"]

---

## 10. Policy Review

Reviewed annually or following any access control incident (unauthorized access,
credential compromise, unintended access grants).

---

**[CRAIG — INSERT FULL LEGAL NAME]**
**Title:** Founder & CEO, AlecRae
**Signature:** ________________________
**Date:** [INSERT DATE]
