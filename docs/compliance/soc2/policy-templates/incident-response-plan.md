# Incident Response Plan — AlecRae

> **Policy owner:** [CRAIG — INSERT FULL LEGAL NAME]
> **Version:** 1.0
> **Effective date:** [INSERT DATE]
> **Next review date:** [INSERT DATE — one year from effective date]
> **Last tabletop drill:** [INSERT DATE or "Not yet conducted"]
> **Approved by:** [CRAIG — INSERT FULL LEGAL NAME], Founder & CEO
> **Classification:** Internal — Restricted

---

## 1. Purpose

This plan defines how AlecRae detects, responds to, contains, and recovers from
security incidents affecting the confidentiality, integrity, or availability of
customer data or platform services.

---

## 2. Scope

This plan covers all security incidents affecting:
- AlecRae production infrastructure (Cloudflare Pages/Workers, Fly.io, Neon, Upstash)
- Customer email data, authentication credentials, billing data
- The GitHub repository and CI/CD pipeline
- Third-party service accounts (Stripe, Anthropic, OpenAI, etc.)

---

## 3. Incident Severity Classification

| Severity | Definition | Examples | Initial Response SLA |
|---|---|---|---|
| **P1 — Critical** | Active breach or imminent data exposure affecting customers | Confirmed credential exfiltration, database dump in progress, ransomware, MTA compromise sending spam | Immediate (< 15 minutes) |
| **P2 — High** | Suspected breach or significant security control failure | Unauthorized access to production, API key exposure in public repo, SAST finding with active exploit, bulk phishing campaign using AlecRae infrastructure | < 1 hour |
| **P3 — Medium** | Security degradation without confirmed data exposure | DoS/rate limit exhaustion, dependency vulnerability without active exploit, suspicious login patterns | < 4 hours |
| **P4 — Low** | Minor security issues | Single failed login burst, non-critical SAST finding, informational security scan result | < 24 hours |

---

## 4. Incident Response Team

| Role | Responsible party | Contact |
|---|---|---|
| **Incident Commander** | [CRAIG — INSERT FULL LEGAL NAME] | [INSERT PHONE / SIGNAL] |
| **Technical Lead** | [CRAIG — same at this stage; insert contractor name if applicable] | [INSERT CONTACT] |
| **Legal / Privacy counsel** | [INSERT LAWYER NAME AND FIRM] | [INSERT CONTACT] |
| **External IR firm (retainer)** | [INSERT FIRM — e.g., Mandiant, CrowdStrike, or regional equivalent] | [INSERT EMERGENCY NUMBER] |

> **Craig:** At Series A this expands. For now you are IC, Tech Lead, and probably
> your own comms. The key is to have legal counsel contactable within the hour for
> anything P1/P2 that may require customer notification.

---

## 5. Phase 1 — Detection and Triage

### 5.1 Detection Sources

| Source | Mechanism | Where to look |
|---|---|---|
| Automated security scans | GitHub Actions security.yml — weekly + every PR | GitHub Actions tab → security workflow |
| CodeQL findings | GitHub Security tab → Code scanning alerts | `github.com/[ORG]/AlecRae.com/security/code-scanning` |
| Secret scanning | Gitleaks in security.yml + GitHub native secret scanning | GitHub Security tab |
| Dependency vulnerabilities | OSV-Scanner + audit-ci | security.yml run logs |
| Threat detection alerts | `GET /v1/security-intelligence/threats` | Security Intelligence dashboard |
| Rate limit abuse | `X-RateLimit-*` headers + Redis metrics | Upstash dashboard + Grafana |
| Failed login spikes | Authentication logs in Neon (auth table, audit_logs) | Query `audit_logs` for `action = 'login_failed'` |
| External reports | `security@alecrae.com` | Email inbox |
| Bug bounty reports | [INSERT PLATFORM URL when live — HackerOne/Intigriti] | Platform dashboard |

### 5.2 Triage Steps
1. Identify the affected system(s), data, and time range
2. Assign severity (P1–P4) using the table in §3
3. If P1 or P2: notify Incident Commander immediately (do not wait for full analysis)
4. Log the incident: date/time detected, reporter, initial assessment, severity
5. Do NOT discuss the incident in public channels (Slack, Twitter, email threads with unauthorized parties)

---

## 6. Phase 2 — Containment

### 6.1 Immediate Containment Actions by Type

**Credential compromise (API key, OAuth token, JWT secret):**
1. Revoke the specific credential immediately
   - API keys: `DELETE /v1/api-keys/:id` or direct DB update
   - JWT secret: rotate `JWT_SECRET` environment variable and redeploy (invalidates all sessions)
   - OAuth token: revoke via Google/Microsoft OAuth revocation endpoint
2. Revoke all sessions for affected user: `POST /v1/auth/logout` with admin context
3. Rotate ALL related secrets (see CLAUDE.md Emergency Protocols — "even tangentially related")
4. Review audit log for all actions taken with the compromised credential:
   `GET /v1/organizations/audit-log?limit=100` (cursor-paginated)

**Database compromise:**
1. Immediately rotate `DATABASE_URL` / Neon connection string
2. Enable Neon point-in-time recovery — note the time of first suspicious activity
   as the recovery point target
3. Review Neon audit logs for unexpected queries
4. Stop all writes to preserve evidence: consider putting API into maintenance mode
5. Notify Neon support if compromise is at the infrastructure level

**Outbound spam / MTA abuse:**
1. Halt the MTA immediately: `fly scale count 0 --app alecrae-mta`
2. Check suppression list for bounce/complaint spikes: `GET /v1/suppressions`
3. Check FBL reports: `apps/api/src/routes/fbl.ts`
4. Review warmup logs: `apps/api/src/routes/warmup.ts`
5. Check for compromised sending domain DNS

**Code / repository compromise:**
1. Revoke all GitHub personal access tokens for affected accounts
2. Rotate GitHub Actions secrets immediately
3. Review GitHub audit log for unauthorized actions
4. If malicious code was committed: identify blast radius, notify affected deployments

**Production environment compromise (Cloudflare Workers / Fly.io):**
1. Roll back to last known good deployment:
   - Cloudflare: `wrangler rollback --env production`
   - Fly.io: `fly deploy --image [LAST_GOOD_IMAGE_TAG]`
2. Block suspicious IP ranges at Cloudflare WAF level if applicable
3. Review Cloudflare Access logs

### 6.2 Preserve Evidence
Before any remediation that modifies logs or systems:
- Export relevant database records (do not modify in place)
- Download GitHub Actions run logs
- Screenshot Cloudflare Analytics for the incident window
- Export Neon query history if available
- Keep the compromised credential (don't delete — mark as revoked; keep for forensics)

---

## 7. Phase 3 — Eradication

1. Identify the root cause (not just the symptom)
2. Remove the compromise entirely:
   - Patch the vulnerability
   - Remove malicious code, unauthorized accounts, or backdoors
   - Verify no persistence mechanisms remain
3. Scan the entire codebase for related vulnerabilities (CodeQL + manual review)
4. Run full dependency audit: `bun run security:audit` (or the equivalent OSV-Scanner run)
5. Verify all secrets have been rotated (see §6.1 credential rotation steps)

---

## 8. Phase 4 — Recovery

1. Restore from the last verified clean backup if data integrity is in question
   - Neon: use point-in-time recovery console at `console.neon.tech`
   - Verify data integrity before resuming writes
2. Redeploy from a clean build artifact (do not redeploy a potentially compromised image)
3. Restore service incrementally — start with read-only operations, verify integrity,
   then restore write operations
4. Monitor intensively for 48 hours post-recovery:
   - Watch rate limit metrics, authentication failure rates, threat detection alerts
5. Confirm the vulnerability is no longer exploitable via targeted testing

---

## 9. Phase 5 — Communication

### 9.1 Internal Communication
- Incident Commander keeps a running log (date/time of each action)
- No external communication without Incident Commander approval
- Legal counsel notified for any P1/P2 incident involving personal data

### 9.2 Customer Notification (GDPR / Data Breach)

If personal data has been or may have been exposed:

**Within 72 hours of confirmed breach** (GDPR Article 33):
- Notify the relevant supervisory authority (in NZ: Office of the Privacy Commissioner;
  in EU: the relevant EU member state DPA if EU residents are affected)
  [CRAIG: confirm primary jurisdiction and DPA contact]
- Notification must include: nature of breach, categories/volume of data, likely
  consequences, measures taken
- Use the communication template in §9.4

**Within reasonable time** (GDPR Article 34 — notify individuals if high risk):
- Email affected customers with: what happened, what data was involved,
  what AlecRae has done, what affected users should do

### 9.3 Regulator Notification

| Jurisdiction | Regulator | Notification deadline | Contact |
|---|---|---|---|
| New Zealand | Office of the Privacy Commissioner | 72 hours (Privacy Act 2020 Part 6) | privacy.org.nz |
| European Union | Lead supervisory authority (if EU data subjects affected) | 72 hours (GDPR Art. 33) | [CRAIG: identify lead SA if applicable] |
| United States | State AGs (if US residents affected — varies by state) | Varies (30–90 days depending on state) | [CRAIG: get legal advice] |

### 9.4 Customer Notification Template

```
Subject: Security Notice — AlecRae Account [IMPACT DESCRIPTION]

Dear [Customer Name],

We are writing to inform you of a security incident that may have affected your
AlecRae account.

What happened: [DESCRIPTION — be specific, honest, and plain-language]

When it happened: [DATE RANGE]

What data was involved: [SPECIFIC DATA TYPES — e.g., "email addresses and account
metadata" or "email message content for messages dated X through Y"]

What we have done: [CONCRETE ACTIONS — credential rotation, vulnerability patched,
system hardened]

What you should do: [SPECIFIC USER ACTIONS — e.g., "We recommend changing your
password, reviewing connected accounts, and watching for suspicious emails"]

We sincerely apologize for this incident. We are committed to the security of your
email data and are taking [SPECIFIC MEASURES] to prevent recurrence.

If you have questions, please contact security@alecrae.com.

[CRAIG — INSERT FULL LEGAL NAME]
Founder & CEO, AlecRae
```

### 9.5 Public Disclosure
If the incident becomes public knowledge or affects a large number of users,
consider publishing a transparency report at `docs/postmortems/`. This builds trust
and is standard practice in the security community.

---

## 10. Phase 6 — Post-Incident Review

Within **14 days** of closing the incident:

1. Write a post-mortem document (`docs/postmortems/YYYY-MM-DD-[short-description].md`):
   - Timeline (when detected, when contained, when eradicated, when recovered)
   - Root cause (not "human error" — go deeper; what system/process failed?)
   - Impact (number of users, data types, duration)
   - Actions taken
   - What went well
   - What went poorly
   - Action items with owners and due dates

2. Add a test that would have caught the vulnerability (add to CI gate if possible)
3. Update this IRP if the incident revealed a gap in the plan
4. Conduct a brief lessons-learned session

---

## 11. Tabletop Exercise Record

Exercises should be conducted at least annually. Record:

| Date | Scenario | Participants | Duration | Key findings | Actions |
|---|---|---|---|---|---|
| [INSERT DATE] | [e.g., "API key exfiltrated via SAST bypass"] | [Names] | [Hours] | [What gaps did we find?] | [What changed?] |

> **Craig:** A tabletop is a 1–2 hour meeting where you walk through a hypothetical
> incident ("our Neon credentials just appeared in a public repo — what do we do?")
> step by step. No live systems are touched. Just document the exercise and what you
> learned. Auditors treat this as evidence of a tested IRP.

---

## 12. Emergency Contacts

| Service | Emergency contact | URL |
|---|---|---|
| Cloudflare | support.cloudflare.com | https://support.cloudflare.com |
| Neon | support@neon.tech or console.neon.tech | https://neon.tech/docs/introduction/support |
| Upstash | support@upstash.com | https://upstash.com/docs/common/help/support |
| Fly.io | community.fly.io or fly.io/docs | https://fly.io/docs/about/support |
| Stripe | stripe.com/contact | https://support.stripe.com |
| GitHub | support.github.com | https://support.github.com |
| Anthropic | console.anthropic.com | https://console.anthropic.com |

---

**[CRAIG — INSERT FULL LEGAL NAME]**
**Title:** Founder & CEO, AlecRae
**Signature:** ________________________
**Date:** [INSERT DATE]
