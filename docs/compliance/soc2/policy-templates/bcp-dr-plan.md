# Business Continuity and Disaster Recovery Plan — AlecRae

> **Policy owner:** [CRAIG — INSERT FULL LEGAL NAME]
> **Version:** 1.0
> **Effective date:** [INSERT DATE]
> **Next review date:** [INSERT DATE — one year from effective date]
> **Last DR test:** [INSERT DATE or "Not yet conducted"]
> **Approved by:** [CRAIG — INSERT FULL LEGAL NAME], Founder & CEO
> **Classification:** Internal — Restricted

---

## 1. Purpose

This plan defines AlecRae's targets and procedures for maintaining business operations
and recovering from disasters that affect the availability or integrity of the AlecRae
email platform. It supports the Availability Trust Services Criterion (A1).

---

## 2. Scope

- AlecRae production platform: `mail.alecrae.com`, `api.alecrae.com`, `admin.alecrae.com`
- Email delivery infrastructure: MTA on Fly.io (`smtp.alecrae.com`, MX records)
- Data stores: Neon Serverless Postgres, Upstash Redis, Cloudflare R2
- AI services: Anthropic Claude API, OpenAI Whisper API

---

## 3. Recovery Objectives

| Service | RPO (Recovery Point Objective) | RTO (Recovery Target Objective) | Notes |
|---|---|---|---|
| **Email delivery (send)** | N/A (stateless) | 30 minutes | MTA restart; queued emails retried from DB |
| **Inbox / web app** | 0 (served from local IndexedDB cache) | 15 minutes for API recovery | UI stays functional from cache during API outage |
| **Primary database (Neon)** | 1 minute (Neon continuous WAL archiving) | 4 hours for full restore | Neon PITR allows recovery to any point in last 7 days (free tier) or 30 days (paid) |
| **Redis (Upstash)** | 0 for rate limiting (in-memory fallback exists) | 5 minutes | Rate limiter falls back to in-memory (`apps/api/src/middleware/rate-limit.ts`) |
| **Attachment storage (R2)** | 0 (R2 has 11 nines durability) | 15 minutes for API recovery | Objects are not replicated further — R2 durability is vendor-guaranteed |
| **AI features** | N/A (stateless) | On vendor restoration | Fallback behavior required per CLAUDE.md AI Integration Rules |

> **Craig:** RPO = how much data can we afford to lose? RTO = how long can we be down?
> The numbers above are targets. Verify them against actual Neon PITR behavior before
> putting them in front of an auditor.

---

## 4. Disaster Categories

| Category | Definition | Examples |
|---|---|---|
| **Infrastructure failure** | Cloud provider outage or degradation | Cloudflare edge outage, Neon database unavailability, Fly.io region outage |
| **Data corruption / loss** | Data in an inconsistent or unrecoverable state | Bad migration deployed, accidental DELETE, ransomware |
| **Security incident** | Attack requiring system shutdown or rebuild | Active breach, compromised MTA, malicious code deployed |
| **Vendor failure** | Critical vendor goes offline or discontinues service | Anthropic API outage, Stripe outage, Neon discontinuation |
| **Single-person dependency** | Craig is unavailable | Medical emergency, extended unavailability |

---

## 5. Disaster Declaration

**Who can declare a disaster:** [CRAIG — INSERT FULL LEGAL NAME]
**Alternate (if Craig is unavailable):** [INSERT BACKUP — a trusted contractor, advisor,
or legal representative who holds an emergency access document]

A disaster is declared when:
- The platform is unavailable for more than [INSERT THRESHOLD — recommend 1 hour] and
  cannot be restored by normal means, OR
- Data integrity cannot be confirmed, OR
- A security incident requires a full rebuild

---

## 6. Recovery Procedures by Component

### 6.1 API Service (Kubernetes / ECR)

**Symptom:** `api.alecrae.com` health check failing; kubectl rollout stuck

**Recovery steps:**
1. Check GitHub Actions run history to identify last successful deployment SHA
2. Roll back: `kubectl rollout undo deployment/alecrae-api --namespace=production`
   OR deploy a specific known-good image:
   `kubectl set image deployment/alecrae-api api=[ECR_REGISTRY]/alecrae-api:[LAST_GOOD_SHA]`
3. Wait for rollout: `kubectl rollout status deployment/alecrae-api --namespace=production`
4. Verify: `curl -sf https://api.alecrae.com/health | jq '.status'`
5. If rollback fails: rebuild from source (`bun run build` + `docker build` + push to ECR)

### 6.2 Web App (Cloudflare Pages)

**Symptom:** `mail.alecrae.com` returning errors or failing to load

**Recovery steps:**
1. Check Cloudflare Pages dashboard for deployment status
2. Roll back to previous deployment: Cloudflare dashboard → Pages → Deployments →
   find last good deployment → "Rollback to this deployment"
3. OR: revert the offending commit and push to `main` (auto-deploys)
4. Verify using a device not cached

### 6.3 MTA / Email Delivery (Fly.io)

**Symptom:** Outbound email not delivering; SMTP connections failing

**Recovery steps:**
1. Check Fly.io app status: `fly status --app alecrae-mta`
2. View logs: `fly logs --app alecrae-mta`
3. Restart app: `fly restart --app alecrae-mta`
4. If disk full: scale storage or prune old logs
5. If TLS certificate issue: `fly certs show alecrae-mta`; renew if expired
6. Check MX records are resolving: `dig MX alecrae.com` — should return
   `mx1.alecrae.com` and `mx2.alecrae.com`
7. If Fly.io region is completely down: redeploy to alternate region
   (Fly.io's Firecracker microVMs support multi-region via `fly.toml` `[regions]`)

### 6.4 Database (Neon)

**Symptom:** Database connection errors; `DATABASE_URL` connection failing

**Recovery — service degradation (Neon partial outage):**
1. Check status.neon.tech for ongoing incidents
2. If Neon is degraded, API will return 503 errors — alert customers via status page
3. Wait for Neon restoration (no action required unless data is affected)

**Recovery — data corruption or accidental deletion:**
1. STOP ALL WRITES IMMEDIATELY: scale API to 0 replicas or enable maintenance mode
2. Open Neon console → `console.neon.tech` → your project → Branches
3. Create a new branch from a timestamp just before the corruption event
   (Neon provides PITR with continuous WAL archiving)
4. Verify data integrity on the branch: connect with psql and run sample queries
5. Promote the branch to be the new primary OR export and restore
6. Scale API back up pointing at the restored connection string
7. Verify full functionality before declaring recovery complete

**Point-in-time recovery reference:**
- Neon free tier: 7 days of PITR
- Neon paid tier: up to 30 days of PITR
- Recovery granularity: any second within the retention window
- [CRAIG: confirm your Neon tier and document the actual retention window]

### 6.5 Redis (Upstash)

**Symptom:** Rate limiting falling back to in-memory; queue processing delayed

**Recovery:**
1. The rate limiter automatically falls back to in-memory when Redis is unavailable
   (`apps/api/src/middleware/rate-limit.ts` lines 46–50)
2. Service continues without Redis — with reduced rate limit accuracy (single-instance only)
3. Check Upstash dashboard for outage status
4. No data recovery action needed for Redis (rate limit counters are ephemeral)
5. When Upstash recovers, rate limiting automatically returns to Redis-backed mode

### 6.6 AI Services Unavailable

**Symptom:** AI features returning 503 or timeout errors

**Recovery:**
1. All AI features have defined fallback behavior per CLAUDE.md AI Integration Rules
2. Web UI should gracefully degrade (AI compose shows "AI unavailable" state, not an error)
3. Check Anthropic status: status.anthropic.com
4. Check OpenAI status: status.openai.com
5. If extended outage: notify customers via status page (`apps/api/src/routes/status.ts`)
6. No data recovery needed — AI features are stateless

---

## 7. Single-Person Dependency

Craig is currently the sole engineer and security owner. If Craig is unavailable:

1. **Emergency access document:** [CRAIG: Create a sealed document (physical or encrypted)
   that a trusted person can open in your absence. It should contain: GitHub login with
   2FA backup codes, Cloudflare credentials, Neon credentials, Stripe credentials,
   Fly.io credentials. Store this somewhere safe and separate from your devices.]

2. **Incident triage:** If a P1 incident occurs and Craig is unreachable for > [INSERT
   THRESHOLD — recommend 2 hours]: [INSERT TRUSTED CONTACT NAME] is authorized to
   execute the containment steps in the Incident Response Plan using the emergency
   access document.

3. **Customer communication:** In an extended outage without Craig: post a status
   update at `alecrae.com/status` and send a brief email to affected customers.

---

## 8. Communication During an Outage

| Channel | Used for | Who updates |
|---|---|---|
| `status.alecrae.com` (via `apps/api/src/routes/status.ts`) | Public-facing status updates | Craig |
| `security@alecrae.com` | Security-related incident updates | Craig |
| Customer email | When outage affects individual accounts | Craig |
| X / Twitter | Public status for widespread outages | Craig (if applicable) |

### Communication Templates

**Initial status page update:**
```
Investigating: We are aware of an issue affecting [COMPONENT — e.g., email delivery /
AI features / login]. Our team is investigating. Next update in 30 minutes.
[TIME]
```

**Progress update:**
```
Update: We have identified the issue ([BRIEF DESCRIPTION]) and are working on a fix.
An estimated resolution time is [TIME or "under investigation"].
[TIME]
```

**Resolution:**
```
Resolved: The issue affecting [COMPONENT] has been resolved at [TIME]. All systems
are operating normally. We apologize for the disruption. A post-mortem will be
published at docs.alecrae.com/postmortems.
[TIME]
```

---

## 9. Backup Strategy

| Data | Backup method | Frequency | Retention | Test frequency |
|---|---|---|---|---|
| Neon Postgres | Neon continuous WAL archiving + PITR | Continuous | 7 days (free) / 30 days (paid) | [CRAIG: INSERT — recommend quarterly] |
| Cloudflare R2 attachments | R2 native durability (11 nines) | N/A — durable by design | Indefinite until deleted | N/A |
| GitHub source code | GitHub-native; additionally export quarterly | Continuous push | Indefinite | N/A |
| Stripe billing data | Stripe-managed | N/A — Stripe manages | 7 years | N/A |

### Backup Test Record

| Date | Data restored | Tested by | Success | Issues found |
|---|---|---|---|---|
| [INSERT DATE] | Neon PITR — sample table restore | [Name] | [Yes/No] | [Notes] |

> **Craig:** An auditor reviewing Availability criteria will ask "have you tested your
> backup restoration procedure?" The table above is where you record those tests.
> A Neon PITR test takes about 30 minutes: create a branch from a point 24h ago,
> connect to it, verify a handful of rows are present, delete the branch.
> Document it here.

---

## 10. Annual Review and Testing

| Activity | Frequency | Owner | Last completed |
|---|---|---|---|
| Tabletop DR exercise | Annual | Security Owner | [INSERT DATE] |
| Neon PITR restoration test | Annual (or quarterly) | Security Owner | [INSERT DATE] |
| R2 object retrieval test | Annual | Security Owner | [INSERT DATE] |
| Infrastructure failover test | Annual | Security Owner | [INSERT DATE] |
| Review and update this document | Annual | Security Owner | [INSERT DATE] |

---

**[CRAIG — INSERT FULL LEGAL NAME]**
**Title:** Founder & CEO, AlecRae
**Signature:** ________________________
**Date:** [INSERT DATE]

---

_Last updated: 2026-06-08 23:35 UTC_
