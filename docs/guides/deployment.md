# Deployment Guide

Production deployment target is the **dedicated Vapron box at `149.28.119.158`**.
Kubernetes, Docker Compose, and Cloudflare Pages are not used. All services run
as systemd units managed by `vapron-bun-gateway` (custom Bun reverse proxy on
ports 80/443 with TLS via Caddy on-demand certs).

---

## Production Stack

| Service | systemd unit | Port | Managed by |
|---|---|---|---|
| API (`apps/api`) | `alecrae-api` | 4100 | systemd + vapron-bun-gateway |
| Web app (`apps/web`) | `alecrae-web` | 4200 | systemd + vapron-bun-gateway |
| MTA outbound | `alecrae-mta` | — (queue consumer) | systemd |
| Redis | `redis-server` | 6379 | apt / systemd |
| Postgres | `postgresql` | 5432 | apt / systemd (or Neon cloud) |

---

## Deploy to the Box

### One-command deploy (scripted)

```bash
# SSH to box then run:
cd /opt/alecrae && bash scripts/box-deploy.sh
```

The script: pulls latest main, installs deps, runs DB migrations, builds the
web app, and restarts all services with health checks. See
`docs/infra/box-deploy.md` for the full runbook and manual steps.

### GitHub Actions (one-tap from iPad)

Trigger the **"Deploy to Box"** workflow from the GitHub Actions tab. Requires
these repository secrets to be set:
- `BOX_SSH_KEY` — private key for the box
- `BOX_HOST` — `149.28.119.158`
- `BOX_USER` — `root` (or your operator username)
- `BOX_REPO_PATH` — `/opt/alecrae`

---

## Environment Variables

All env vars are stored in `/opt/alecrae/.env` on the box.
Full inventory: `docs/infra/env-audit.md`.
Quick-start env setup: `docs/infra/morning-setup.md`.

### Required for API boot (hard-fail without these)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (local or Neon) |
| `JWT_SECRET` | ≥32-char secret for session JWT signing |
| `WEBAUTHN_RP_ID` | `alecrae.com` |
| `WEBAUTHN_ORIGIN` | `https://mail.alecrae.com` |

### Required per-feature (warn-only, feature disabled when absent)

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection (rate limiting + BullMQ queues) |
| `ANTHROPIC_API_KEY` | Claude API for AI features |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail OAuth |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook OAuth |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing |
| `RELAY_PROVIDER` + `SMTP_RELAY_*` | Email relay (Resend/SES) |
| `DKIM_PRIVATE_KEY` | DKIM signing for outbound mail |

---

## Database Migrations

Run on the box before restarting services after any schema change:

```bash
cd /opt/alecrae && bun run db:migrate
```

Always back up before a destructive migration:

```bash
pg_dump -Fc $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).dump
```

---

## Health Checks

```bash
# API liveness
curl https://api.alecrae.com/health

# API deep check (DB + Redis)
curl https://api.alecrae.com/v1/health

# Web app version
curl https://mail.alecrae.com/api/version

# Directly on box (bypasses vapron-bun-gateway)
curl http://localhost:4100/health
curl http://localhost:4200/api/version
```

---

## Service Management

```bash
# Status
sudo systemctl status alecrae-api alecrae-web alecrae-mta

# Restart all
sudo systemctl restart alecrae-api alecrae-web
if systemctl is-enabled alecrae-mta 2>/dev/null; then sudo systemctl restart alecrae-mta; fi

# Logs (live tail)
sudo journalctl -u alecrae-api -f --since "5 minutes ago"
sudo journalctl -u alecrae-web -f --since "5 minutes ago"
sudo journalctl -u alecrae-mta -f --since "5 minutes ago"
```

---

## Rollback

```bash
# Find the last good commit
cd /opt/alecrae && git log --oneline -10

# Roll back to a specific commit
git checkout <sha>
bun install
bun run db:migrate     # only if there are new migrations to apply (usually skip for rollback)
bun run build:web
sudo systemctl restart alecrae-api alecrae-web
```

For MTA rollback, stop the service first to drain the queue gracefully:
```bash
sudo systemctl stop alecrae-mta
# fix the issue, then:
sudo systemctl start alecrae-mta
```

---

## DNS

All subdomains point to `149.28.119.158` as DNS-only (grey cloud) A records in
Cloudflare. See `docs/infra/dns-zone-alecrae.md` for the full zone.

Key records:
- `mail.alecrae.com` → web app
- `api.alecrae.com` → API
- `mx1.alecrae.com` / `mx2.alecrae.com` → inbound SMTP

---

## Monitoring

AlecRae uses OpenTelemetry for observability. Configure the collector endpoint:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=alecrae-api
```

Grafana dashboards (when configured) cover:
- **Email Pipeline** — send queue depth, delivery rates, bounce rates
- **API Performance** — request latency, error rates, throughput
- **AI Engine** — classification latency, token usage
- **Infrastructure** — CPU, memory, disk, network on the box

---

## Production Checklist

Before going live, verify:

- [ ] All environment variables set in `/opt/alecrae/.env`
- [ ] Database migrations applied (`bun run db:migrate`)
- [ ] DNS records correct (`docs/infra/dns-zone-alecrae.md`)
- [ ] TLS certs provisioned by Caddy (first request auto-issues via Let's Encrypt)
- [ ] `GET https://api.alecrae.com/health` returns `{"status":"ok"}`
- [ ] `GET https://mail.alecrae.com/login` loads without errors
- [ ] MTA service running (`sudo systemctl status alecrae-mta`)
- [ ] PTR / rDNS set in Vultr (`mail.alecrae.com` for `149.28.119.158`)
- [ ] IP warmup plan prepared (`docs/infra/deliverability.md`)
- [ ] Craig has authorised the deployment (Boss Rule)

---

_Last updated: 2026-06-20 14:00 UTC_
