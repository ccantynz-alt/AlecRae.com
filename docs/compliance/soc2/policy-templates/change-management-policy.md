# Change Management Policy — AlecRae

> **Policy owner:** [CRAIG — INSERT FULL LEGAL NAME]
> **Version:** 1.0
> **Effective date:** [INSERT DATE]
> **Next review date:** [INSERT DATE — one year from effective date]
> **Approved by:** [CRAIG — INSERT FULL LEGAL NAME], Founder & CEO
> **Classification:** Internal

---

## 1. Purpose

This policy ensures that all changes to AlecRae production systems are authorized,
tested, reviewed, and reversible — preventing unauthorized changes and reducing the
risk of incidents caused by untested modifications.

---

## 2. Scope

All changes to:
- Application code (`apps/`, `packages/`, `services/`)
- Infrastructure configuration (`infrastructure/`, Kubernetes manifests, Cloudflare settings)
- Database schemas (Drizzle migrations in `packages/db/src/migrations/`)
- CI/CD pipeline configuration (`.github/workflows/`)
- Third-party service configuration (Stripe, Cloudflare, Neon, Upstash)
- Security controls and authentication configuration

---

## 3. Change Categories

| Category | Definition | Approval required | Examples |
|---|---|---|---|
| **Standard** | Pre-tested, low-risk changes following established patterns | CI gate pass + Security Owner for production | Bug fixes, feature additions, dependency updates, UI changes |
| **Major** | Architectural changes, new dependencies, schema migrations | Craig's explicit authorization (CLAUDE.md Boss Rule) | New framework, new third-party service, irreversible DB migration, pricing changes |
| **Emergency** | Urgent change to restore service or contain a security incident | Security Owner verbal approval (documented immediately after) | Critical CVE patch under active exploit, production outage fix |

---

## 4. Standard Change Process

All standard changes follow this process. The technical implementation is in
`.github/workflows/ci.yml` and `.github/workflows/deploy.yml`.

### Step 1: Branch
- Create a feature branch from `main`
- Branch naming convention: `feat/`, `fix/`, `perf/`, `chore/` prefix

### Step 2: Develop and Test Locally
- Pre-flight checklist from CLAUDE.md must be completed before writing code
- Post-build checklist from CLAUDE.md must be completed before creating a PR
- TypeScript strict mode, no `any`, no `@ts-ignore`
- Tests must be added for new functionality

### Step 3: Pull Request
- Open a pull request targeting `main`
- PR description must include:
  - What changed and why
  - Testing performed
  - Any performance or security implications
  - Rollback plan for non-trivial changes

### Step 4: Automated CI Gate
The following must pass (`.github/workflows/ci.yml`):
- Lint (Biome)
- TypeScript typecheck
- Unit/integration tests (`bun run test`)
- Full build (`bun run build`)
- Security scans on every PR:
  - Secret scanning (Gitleaks — `.github/workflows/security.yml`)
  - If a security.yml scan is triggered: CodeQL + dependency audit

If any gate fails, the PR cannot be merged.

### Step 5: Review
- [CRAIG: At pre-Series A with a single developer, Craig reviews his own PRs after a
  deliberate "cool-down" period. At Series A, a second-engineer review is required.]
- For changes touching authentication, billing, or security routes: mandatory review
  even if self-review is otherwise acceptable

### Step 6: Staging Deployment
- Merging to `main` triggers automatic staging deployment
  (`deploy.yml` — `deploy-staging` job)
- Staging environment uses the same container images as production
- Health check must pass against staging before production deployment proceeds

### Step 7: Production Deployment
- Production deployment from `.github/workflows/deploy.yml` requires:
  - Successful staging deployment
  - Manual approval from Craig (GitHub environment protection on `production`)
  - Health check verification after deployment
- Production deployments are not permitted during business-critical periods
  (e.g., end-of-month billing cycles) unless emergency

### Step 8: Post-Deployment Monitoring
- Monitor Grafana / CloudWatch for anomalies for [INSERT PERIOD — recommend 30 minutes]
  after each production deployment
- If a new error rate appears or health check degrades: immediate rollback

---

## 5. Major Change Process

Major changes (as defined in CLAUDE.md Boss Rule) require explicit authorization
from Craig before any code is written. This includes:

- Swapping frameworks or core stack components
- Altering the data model in a non-reversible way
- Adding new third-party service dependencies
- Pricing changes
- Domain or DNS changes
- Stripe configuration changes
- External API integrations

**Process:**
1. Propose the change in writing (design doc or ADR at `docs/adrs/NNNN-title.md`)
2. Craig reviews and provides written authorization (email or GitHub issue approval)
3. Document the authorization reference in the PR description
4. Follow the standard change process above

---

## 6. Emergency Change Process

For urgent changes that cannot wait for the standard process (e.g., active security
incident, production outage):

1. Security Owner gives verbal or written approval (Slack, Signal, email)
2. Change is deployed as quickly as safely possible
3. Within **24 hours**: document the emergency, the change made, and the authorization
4. Treat as a "post-hoc PR" — open a PR retroactively to capture the diff, test
   coverage, and review
5. Log the emergency change in the incident log

Emergency changes bypass the staging gate ONLY when waiting would make the incident
worse. Document the risk accepted.

---

## 7. Database Schema Changes

Schema migrations are irreversible in production. Special rules apply:

- All schema changes use Drizzle ORM migrations (`packages/db/src/migrations/`)
- Migration files are generated with `bun run db:generate` and reviewed before
  application
- Destructive migrations (dropping columns, changing enum values, altering constraints)
  require Craig's authorization (CLAUDE.md Boss Rule #7)
- Migration rollback plan must be documented in the PR
- Run `bun run db:migrate` against staging first; do not apply to production until
  staging is verified
- Never modify production schema directly (no manual psql commands without
  Craig's authorization and logging)

---

## 8. Dependency Updates

- Dependencies are monitored by OSV-Scanner and audit-ci (`.github/workflows/security.yml`)
- Routine patch-level updates (e.g., `1.2.3 → 1.2.4`) follow the standard change process
- Major version upgrades follow the major change process if they alter behavior
- New dependencies require Craig's authorization (CLAUDE.md Boss Rule #2)
- All dependency changes must pass the full CI gate

---

## 9. Configuration Changes

Changes to environment variables, Cloudflare settings, or infrastructure configuration:

- Document the change and reason before applying
- Test in staging environment first
- Production configuration changes follow the standard approval process
- Secrets are never committed to the repository (CLAUDE.md Forbidden List #4)
- All secrets are stored in [INSERT SECRET STORE — GitHub Actions secrets / Cloudflare environment variables]

---

## 10. Change Records

GitHub provides a complete, immutable audit trail of all code changes:
- Every commit is attributed to an author with timestamp
- Every PR has a review and CI gate audit trail
- Every deployment is recorded in GitHub Actions run history
- The `deploy.yml` workflow tags each deployed image with the exact `github.sha`

For infrastructure changes outside of GitHub (e.g., Cloudflare dashboard changes):
- Document in a GitHub issue or internal changelog
- [CRAIG: consider using `CHANGELOG.md` or Notion for this if Cloudflare changes become frequent]

---

## 11. Rollback Procedure

For each service:

| Service | Rollback method | Time to rollback |
|---|---|---|
| Web app (Cloudflare Pages) | `wrangler rollback` or revert commit + redeploy | ~5 minutes |
| API (Kubernetes) | `kubectl rollout undo deployment/alecrae-api --namespace=production` | ~2 minutes |
| MTA (Fly.io) | `fly deploy --image [PREVIOUS_TAG]` | ~3 minutes |
| Database migration | Drizzle `down` migration if written; Neon PITR if destructive | 5–15 minutes |

Rollback is always preferred to debugging in production for P1 incidents.

---

## 12. Policy Review

Reviewed annually or following any change-related incident.

---

**[CRAIG — INSERT FULL LEGAL NAME]**
**Title:** Founder & CEO, AlecRae
**Signature:** ________________________
**Date:** [INSERT DATE]

---

_Last updated: 2026-06-08 23:35 UTC_
