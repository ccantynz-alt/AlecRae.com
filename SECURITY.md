# Security Policy

AlecRae is built to protect the most sensitive thing a person owns — their
email. We take security and privacy seriously, and we welcome responsible
disclosure from the security research community.

## Reporting a vulnerability

**Preferred channel:** email `security@alecrae.com` with a detailed
description, proof of concept if available, and your contact information.

**Alternative channels:**
- Web form: https://alecrae.com/security
- Encrypted: see `https://alecrae.com/.well-known/security.txt` for the
  current PGP key / transport guidance.

We will acknowledge your report within **2 business days** and provide a
status update within **5 business days**. For critical issues we aim to
ship a fix within **30 days**; lower severity fixes are triaged on our
public security roadmap.

## Scope

**In scope:**
- `*.alecrae.com` (all production and public staging subdomains)
- The AlecRae desktop, web and mobile applications
- The AlecRae public REST / tRPC API
- Email authentication surfaces (SPF, DKIM, DMARC, ARC, BIMI)
- Supporting open-source code in this repository

**Out of scope:**
- Denial-of-service, volumetric, or resource-exhaustion attacks
- Social engineering of employees, contractors or users
- Physical security attacks
- Issues that require physical access to a victim's device
- Issues that require a privileged network position (MITM on the
  victim's local network, compromised CA, etc.)
- Third-party services we do not operate (Stripe, Cloudflare, Neon,
  etc.) — please report those directly to the vendor
- Missing best-practice HTTP headers that do not lead to a concrete
  exploit
- Rate-limiting on authenticated endpoints protected by our 6-tier
  limiter unless bypass is demonstrated
- Vulnerabilities in third-party libraries without a demonstrated
  exploit against AlecRae

## Safe harbor

Security research conducted in accordance with this policy is
authorised. AlecRae will not pursue civil or criminal action under the
Computer Fraud and Abuse Act (CFAA), the Digital Millennium Copyright
Act (DMCA), equivalent state laws, or similar laws in other
jurisdictions, provided you:

1. Make a good-faith effort to avoid privacy violations, degradation of
   user experience, disruption to production systems, and destruction
   or manipulation of data.
2. Only interact with accounts that you own, or with the explicit
   permission of the account holder.
3. Do not exfiltrate any data beyond the minimum necessary to
   demonstrate the vulnerability.
4. Give AlecRae a reasonable time to remediate before publicly
   disclosing. We target 90 days from acknowledgment; we will work
   with you on coordinated disclosure if more time is required.
5. Do not engage in extortion, threats, or any other conduct that
   would cause material harm to AlecRae or its users.

## Rewards

AlecRae runs a bug bounty programme for qualifying reports. Rewards
scale with severity (CVSS 3.1) and blast radius. See
`https://alecrae.com/security` for the current reward table,
Hall of Fame, and canonical rules.

## What to include in a report

To help us triage and fix faster, please include:

- A clear description of the issue and the impact on users
- Steps to reproduce, including URLs and payloads
- A proof-of-concept (script, video, or screenshots)
- Your suggested severity (CVSS vector if possible)
- Any CVE, advisory or public discussion already linked to the issue
- Your preferred name / handle for acknowledgment (or "anonymous")

## What we will NOT do

- We will never sue a researcher acting in good faith under this
  policy.
- We will never share your identity publicly without your consent.
- We will never share a report with third parties except our counsel,
  insurer, or law enforcement where legally required.
- We will never silently ship a security fix without crediting the
  reporter (unless requested).

## Incident response

In the event of a security incident affecting user data we commit to:

- Notifying affected users within 72 hours of confirmed breach, as
  required by GDPR Article 33.
- Publishing a post-mortem at `docs/postmortems/` within 14 days.
- Rotating any credentials even tangentially related to the incident.
- Funding independent review when appropriate.

See `CLAUDE.md` -> "Emergency Protocols" for our internal playbook.

---

Last updated: 2026-04-16.
