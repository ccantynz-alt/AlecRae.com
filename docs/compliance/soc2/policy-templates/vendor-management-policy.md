# Vendor Management Policy — AlecRae

> **Policy owner:** [CRAIG — INSERT FULL LEGAL NAME]
> **Version:** 1.0
> **Effective date:** [INSERT DATE]
> **Next review date:** [INSERT DATE — one year from effective date]
> **Approved by:** [CRAIG — INSERT FULL LEGAL NAME], Founder & CEO
> **Classification:** Internal

---

## 1. Purpose

This policy governs how AlecRae selects, onboards, monitors, and offboards third-party
vendors and sub-processors — particularly those that handle customer email data or
have access to AlecRae infrastructure. Because AlecRae processes customers' most
sensitive communications, the security posture of every vendor in the chain matters.

---

## 2. Scope

All third-party services that:
- Process, transmit, or store personal data on behalf of AlecRae customers
- Have access to AlecRae infrastructure, source code, or secrets
- Provide security-critical capabilities (authentication, encryption, email delivery)

---

## 3. Vendor Categories

| Category | Risk level | Review frequency |
|---|---|---|
| **Critical** | Handles Restricted data (email content, credentials) or provides core infrastructure | Annual + on material change |
| **High** | Handles Confidential data or has privileged infrastructure access | Annual |
| **Medium** | Handles Internal data or provides non-critical services | Every 2 years |
| **Low** | No data access; commodity services | Ad-hoc |

---

## 4. Current Vendor Inventory

### 4.1 Critical Vendors

| Vendor | Purpose | Data processed | SOC 2 Type II | DPA | Last reviewed |
|---|---|---|---|---|---|
| **Neon** | Primary Postgres database | All customer data, emails, account data | Yes (via AWS) — obtain from [neon.tech/security] | [INSERT DATE or "Pending"] | [INSERT DATE] |
| **Cloudflare** | Edge compute, CDN, DNS, WAF, TLS termination | All request traffic; may see email metadata in transit | Yes — obtain from [trust.cloudflare.com] | [INSERT DATE or "Pending"] | [INSERT DATE] |
| **Anthropic** | AI processing — Claude Haiku/Sonnet/Opus for email AI features | Email content (sent to Claude API for compose/triage/analysis) | [Request from account manager — https://anthropic.com/trust] | [INSERT DATE or "Pending"] | [INSERT DATE] |
| **Stripe** | Payment processing, subscription billing | Billing email, payment card data (Stripe-side only) | Yes — obtain from [stripe.com/docs/security] | [INSERT DATE or "Pending"] | [INSERT DATE] |
| **OpenAI** | Whisper ASR for voice transcription | Voice audio of user recordings | Yes — obtain from [openai.com/security] | [INSERT DATE or "Pending"] | [INSERT DATE] |

### 4.2 High Vendors

| Vendor | Purpose | Data processed | SOC 2 Type II | DPA | Last reviewed |
|---|---|---|---|---|---|
| **Upstash** | Redis cache — rate limiting, queuing | API keys (hashed), rate limit counters, session metadata | Yes — obtain from [upstash.com/trust] | [INSERT DATE or "Pending"] | [INSERT DATE] |
| **Fly.io** | MTA (outbound/inbound email), long-lived processes | Email content in transit (SMTP relay) | [Check fly.io/docs/about/privacy — request from support] | [INSERT DATE or "Pending"] | [INSERT DATE] |
| **Cloudflare R2** | Object storage for attachments | Email attachment files | Yes (same as Cloudflare above) | [Same as Cloudflare DPA] | [INSERT DATE] |
| **GitHub** (Microsoft) | Source code, CI/CD, secret management | Source code, GitHub Actions secrets | Yes — obtain from [docs.github.com/en/site-policy] | Microsoft DPA covers GitHub | [INSERT DATE] |
| **AWS** (via deploy.yml) | Container registry (ECR), Kubernetes (EKS) | Container images (built from source) | Yes — aws.amazon.com/compliance/soc | [INSERT DATE or "Pending"] | [INSERT DATE] |

### 4.3 Medium Vendors

| Vendor | Purpose | Data | Last reviewed |
|---|---|---|---|
| **Voyage AI** | Semantic search embeddings (planned) | Email excerpts | [Not yet active — review before enabling] |
| **Modal.com** | GPU compute for heavy AI | Prompts / responses | [Not yet active — review before enabling] |
| **HackerOne / Intigriti** | Bug bounty platform | Vulnerability reports, researcher contact info | [Not yet active] |

---

## 5. Vendor Selection Process

Before engaging a new vendor that will handle Restricted or Confidential data:

1. **Security review:** Obtain and review the vendor's SOC 2 Type II report (or equivalent)
2. **DPA review:** Ensure a Data Processing Agreement is in place (required for any vendor touching personal data of EU residents under GDPR)
3. **Authorization:** Craig must authorize any new third-party integration (CLAUDE.md Boss Rule #8)
4. **Sub-processor disclosure:** Add the vendor to the sub-processor list disclosed to customers in the DPA (`apps/api/src/routes/dpa.ts` — `CURRENT_DPA_TEXT`)
5. **Minimum necessary access:** Grant only the permissions required for the specific integration

---

## 6. Data Processing Agreements

### 6.1 Customer-Facing DPA
AlecRae's customer-facing DPA is available at `apps/api/src/routes/dpa.ts` with
self-serve signing. It lists AlecRae as the Processor and includes:
- The scope of processing
- Technical and Organizational Measures (TOMs) — update this section as controls mature
- Sub-processor list (must be kept current with the vendor table in §4)
- Data subject rights mechanism

The DPA text (`CURRENT_DPA_TEXT`) must be updated whenever sub-processors are added
or removed. The `CURRENT_DPA_VERSION` string must be bumped when any change is made.

### 6.2 Vendor DPAs
AlecRae must have a signed or accepted DPA with every vendor in §4.1–4.2 that
processes personal data. DPA status is tracked in the table above.

**To obtain vendor DPAs:**
- Cloudflare: cloudflare.com/gdpr/
- Neon: neon.tech/legal
- Upstash: upstash.com/trust or email trust@upstash.com
- Stripe: stripe.com/legal/dpa
- Anthropic: Contact your account manager; check anthropic.com/trust
- OpenAI: platform.openai.com/terms (includes DPA)
- GitHub/Microsoft: microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA

---

## 7. Ongoing Vendor Monitoring

| Activity | Frequency | Owner |
|---|---|---|
| Review vendor security status / trust pages | Annual | Security Owner |
| Collect updated SOC 2 reports (new reports issued annually) | Annual | Security Owner |
| Review sub-processor change notifications from vendors | As received | Security Owner |
| Assess material changes to vendor service terms | As received | Security Owner |
| Review vendor incident notifications | As received | Immediate — follow IRP if AlecRae data affected |

When a vendor notifies AlecRae of a security incident:
1. Assess whether AlecRae customer data was affected
2. If yes: follow the Incident Response Plan and assess GDPR notification obligations
3. Document the vendor incident in the vendor risk register

---

## 8. Vendor Offboarding

When a vendor relationship ends:
1. Revoke all API keys and access credentials for the vendor
2. Delete or confirm deletion of AlecRae data stored by the vendor
3. Obtain written confirmation of data deletion where possible
4. Remove the vendor from the sub-processor list in the customer DPA
5. Update `CURRENT_DPA_VERSION` in `apps/api/src/routes/dpa.ts`
6. Notify customers of sub-processor removal if required by the DPA

---

## 9. AI Vendor Special Provisions

Anthropic (Claude) and OpenAI (Whisper) process customer email content. Additional
requirements:

- Confirm that vendor API agreements prohibit use of AlecRae customer data for model training
  (Anthropic: API usage is not used for training by default per their policy; verify OpenAI similarly)
- Implement prompt injection protections (current: Zod validation of all AI inputs)
- Ensure fallback behavior when AI vendor is unavailable (current: all AI calls have
  fallback per CLAUDE.md AI Integration Rules)
- Audit AI decisions are logged (current: `CLAUDE.md` AI Integration Rules)
- Anthropic: users on Pro/Enterprise tiers get Sonnet/Opus; confirm data handling
  commitment per tier

---

## 10. Policy Review

Reviewed annually or when a critical vendor has a security incident.

---

**[CRAIG — INSERT FULL LEGAL NAME]**
**Title:** Founder & CEO, AlecRae
**Signature:** ________________________
**Date:** [INSERT DATE]

---

_Last updated: 2026-06-08 23:35 UTC_
