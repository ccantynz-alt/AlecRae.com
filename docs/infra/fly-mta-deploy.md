# Fly.io MTA Deployment Runbook

Operational runbook for deploying AlecRae's Mail Transfer Agent (MTA) to Fly.io. This is the service that handles inbound (MX) and outbound (SMTP) email delivery for alecrae.com.

**Assumed path:** `services/mta/` — TODO for Craig to confirm the MTA code lives here. If it lives elsewhere, substitute the path throughout this doc.

**Audience:** Craig (non-technical). Every command is copy-pasteable. Placeholders are marked `<like-this>` — replace them before running.

---

## 1. Prerequisites

Run these once on your machine before anything else.

```bash
# Install the Fly CLI
curl -L https://fly.io/install.sh | sh

# Log in to Fly (opens a browser window)
fly auth login
```

Also required:

- **Payment method on file** at https://fly.io/dashboard/<your-org>/billing. A card is mandatory for static IPv4 addresses and for outbound port 25. The free tier will not work for a production MTA.
- **`services/mta/` directory** exists in the repo with a `fly.toml` and a `Dockerfile`. Sample contents for both are inlined in sections 2 and 3 below — copy them in if they are missing.
- **DNS access** to alecrae.com via Cloudflare (needed in step 4.7 to point `mx1.alecrae.com` at the allocated IP).

---

## 2. Sample `fly.toml` (inline)

Save this as `services/mta/fly.toml`:

```toml
app = "alecrae-mta"
primary_region = "iad"

[build]

[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"

[[services]]
  protocol = "tcp"
  internal_port = 25
  [[services.ports]]
    port = 25
  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"

[[services]]
  protocol = "tcp"
  internal_port = 587
  [[services.ports]]
    port = 587
  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"

[[services]]
  protocol = "tcp"
  internal_port = 465
  [[services.ports]]
    port = 465

[[services]]
  protocol = "tcp"
  internal_port = 8080
  [[services.http_checks]]
    interval = "10s"
    path = "/healthz"
    method = "get"

[mounts]
  source = "mta_data"
  destination = "/data"
```

**Notes:**
- `primary_region = "iad"` — US East (Ashburn). Change if we decide to host elsewhere. Keep consistent with the volume region in step 4.3.
- Port 25 (inbound SMTP), 465 (SMTPS), 587 (submission), 8080 (internal healthcheck).
- `[mounts]` gives the container a persistent disk at `/data` for the mail spool and TLS certs. Without it, a redeploy wipes queued mail.

---

## 3. Sample `Dockerfile` (inline)

Save this as `services/mta/Dockerfile`. Multi-stage Bun build, non-root runtime, ports 25/465/587/8080, `/data` for spool and certs.

```dockerfile
# syntax=docker/dockerfile:1.6

# ---------- Stage 1: build ----------
FROM oven/bun:1.1 AS builder
WORKDIR /app

# Install deps first (better layer caching)
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# ---------- Stage 2: runtime ----------
FROM oven/bun:1.1-slim AS runtime
WORKDIR /app

# Create non-root user
RUN groupadd --system --gid 1001 mta \
 && useradd  --system --uid 1001 --gid mta mta \
 && mkdir -p /data \
 && chown -R mta:mta /data /app

# Copy built artefacts and node_modules from builder
COPY --from=builder --chown=mta:mta /app/dist         ./dist
COPY --from=builder --chown=mta:mta /app/node_modules ./node_modules
COPY --from=builder --chown=mta:mta /app/package.json ./package.json

USER mta

# SMTP (25), SMTPS (465), submission (587), health (8080)
EXPOSE 25 465 587 8080

# Persistent spool + TLS certs
VOLUME ["/data"]

ENV NODE_ENV=production

CMD ["bun", "run", "dist/index.js"]
```

**Notes:**
- Non-root user `mta` (uid 1001). The MTA process does not need root once Fly maps external ports → internal ports for you.
- Binary entrypoint assumes `bun run build` emits `dist/index.js`. Adjust if our build outputs a different path.

---

## 4. First deploy sequence

Run these in order. Do not skip steps.

```bash
# 4.1  Move into the MTA app directory
cd services/mta

# 4.2  Register the app with Fly (reads the fly.toml above, does not deploy yet)
fly launch --no-deploy

# 4.3  Create the persistent volume for spool + TLS certs (10 GB, same region as the app)
fly volumes create mta_data --size 10 --region iad

# 4.4  Allocate a dedicated static IPv4 — REQUIRED for sending reputation.
#      Write the returned IP down. You will paste it into DNS in step 4.7
#      and send it to Fly support in section 5.
fly ips allocate-v4

# 4.5  Set production secrets. Replace every <placeholder> with a real value.
fly secrets set \
  DATABASE_URL=<neon-postgres-connection-string> \
  REDIS_URL=<upstash-redis-url> \
  DKIM_PRIVATE_KEY=<pem-encoded-dkim-private-key> \
  ANTHROPIC_API_KEY=<anthropic-api-key> \
  POSTMASTER_EMAIL=postmaster@alecrae.com

# 4.6  Ship it
fly deploy
```

### 4.7  Paste the IP into DNS

In Cloudflare → alecrae.com → DNS:

| Type | Name | Value                 | Proxy status   |
|------|------|-----------------------|----------------|
| A    | mx1  | `<ip-from-step-4.4>`  | **DNS only**   |

**Critical:** proxy status must be **DNS only** (grey cloud). Cloudflare's orange-cloud proxy does not support SMTP and will break mail delivery.

Then create the MX record itself:

| Type | Name | Priority | Value              |
|------|------|----------|--------------------|
| MX   | @    | 10       | mx1.alecrae.com.   |

---

## 5. Request rDNS / PTR from Fly support

rDNS (reverse DNS) is what major mail providers use to decide whether to accept or silently drop our outbound mail. Without a matching PTR record, Gmail and Outlook will throttle or reject us.

Email **support@fly.io** with the following (copy-paste, replace placeholders):

> **Subject:** PTR record request for app alecrae-mta
>
> Please set PTR for IP `<X.X.X.X>` to `mx1.alecrae.com`. Used for outbound mail delivery.
>
> App: `alecrae-mta`
> Account: `<your-fly-email>`

**Turnaround:** 1-3 business days.

**Warning:** This blocks outbound deliverability. Send the request the same day you allocate the IP — do not wait until launch week.

---

## 6. Verify the deploy

```bash
# App should be in 'running' state across all allocations
fly status

# Tail logs — look for bind errors on port 25 or TLS handshake failures
fly logs

# From your local machine, hit the public IP on port 25.
# You should see the SMTP banner.
telnet <ip-from-step-4.4> 25
# Expected: 220 mx1.alecrae.com ESMTP

# SSH into the running container for deeper checks
fly ssh console
# Inside: run your DKIM signing smoke test and a DB connection test
```

If `telnet` hangs, your local ISP is blocking outbound port 25 — normal, try from a VPS. The MTA itself is still working.

---

## 7. Scale and rollback

```bash
# Scale to 2 instances for HA (runs in multiple Fly machines)
fly scale count 2

# List recent releases (most recent is at the top)
fly releases list

# Roll back to a previous release
fly releases revert <version-number>

# Force an immediate, non-rolling restart (use sparingly — causes brief outage)
fly deploy --strategy immediate
```

---

## 8. Load progression (IP warmup)

Do **not** open the firehose on day one. A brand-new IP sending thousands of messages will be flagged as spam across every major provider, and the reputation damage can take months to undo.

See `docs/infra/deliverability.md` for the full IP warmup schedule. Short version:

1. **Week 1:** internal-only mail. `postmaster@alecrae.com`, `abuse@alecrae.com`, team replies. Target: under 50 messages/day.
2. **Week 2:** transactional only (signup confirmations, password resets). Under 500/day.
3. **Weeks 3-4:** ramp 2x per day, watching bounce rate.
4. **Week 5+:** full production volume.

Monitor Google Postmaster Tools and Microsoft SNDS daily during warmup.

---

## 9. Troubleshooting

| Symptom                                | Cause                                                      | Fix                                                                                           |
|----------------------------------------|------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `telnet <ip> 25` hangs                 | Your local network (or cloud provider) blocks egress on 25 | Test from a different network. Fly itself allows 25 on paid tier — confirm with `fly ips list`. |
| Deploy hangs on "waiting for health"   | Healthcheck grace period too short                         | Raise `grace_period` in the `[[services.http_checks]]` block, then `fly deploy` again.        |
| OOMKilled in logs / container restarts | Default memory (256 MB) too low for peak load              | `fly scale memory 512` (or 1024 if still tight).                                              |
| Volume full, deliveries queuing        | Spool disk exhausted                                       | `fly volumes list` → find `mta_data` → `fly volumes extend <id> --size 20`.                   |
| Mail accepted but not delivered        | PTR missing, SPF/DKIM/DMARC wrong, or IP cold              | Check section 5 (PTR) and deliverability.md (warmup + DNS auth records).                      |
| `fly deploy` fails with "no builder"   | Dockerfile not at `services/mta/Dockerfile`                    | Confirm path, or set `[build].dockerfile` explicitly in `fly.toml`.                           |
| TLS cert expired                       | Auto-renewal failed inside container                       | `fly ssh console` → check `/data/certs/` → re-run cert provisioner → `fly apps restart`.      |

---

**Last updated:** 2026-04-18
**Owner:** Craig (escalate infra changes per CLAUDE.md Boss Rule)
