# Deployment Guide

Production web/api deployment target is the **Jarvis box at `66.42.121.161`**
(hostname `jarvis`; SSH via Tailscale: `ssh root@jarvis`). The old Vapron box
(`149.28.119.158`, "158") is the **dedicated MAIL box** (MTA + inbound —
Option A, decided 2026-07-13; see `docs/infra/multi-platform-mail-plan.md` §4;
SSH: `ssh root@vapron-158` via Tailscale). Kubernetes and Cloudflare Pages are
not used. App services run as systemd units; **Coolify/Traefik owns ports 80/443**
and routes to them via the append-only dynamic route file
`/data/coolify/proxy/dynamic/alecrae.yaml` (web/mail/www → `:4200`, api →
`:4100`). Services must bind `0.0.0.0` so the proxy container can reach them.

---

## Production Stack

| Service | systemd unit | Port | Managed by |
|---|---|---|---|
| API (`apps/api`) | `alecrae-api` | 4100 | systemd + Coolify/Traefik route |
| Web app (`apps/web`) | `alecrae-web` | 4200 | systemd + Coolify/Traefik route |
| MTA outbound | `alecrae-mta` | health :8082 (queue consumer) | systemd on the **mail box (149.28.119.158)** — **not currently running** |
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
- `BOX_HOST` — `66.42.121.161` (public IP; GitHub runners are not on the tailnet)
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

# Directly on box (bypasses Coolify/Traefik)
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

Web subdomains (`alecrae.com`, `mail.alecrae.com`, `api.alecrae.com`) currently
resolve via Cloudflare **proxied** (orange cloud) to the Jarvis box
(`66.42.121.161`) and serve 200 OK. See `docs/infra/dns-zone-alecrae.md` for
the full zone.

**Mail DNS (Option A — EXECUTED 2026-07-13, verified live):** the mail box is
`149.28.119.158`. `mx1`/`mx2`/`smtp.alecrae.com` A records (grey), MX 10+20,
`_spf.alecrae.com` TXT, and the `bounce` → `smtp` CNAME are all live.
`mail.alecrae.com` stays **proxied** — it's the webmail app on Jarvis, not a
mail record; the MTA's HELO/PTR identity is `smtp.alecrae.com`
(`MTA_HOSTNAME=smtp.alecrae.com`). Remaining: PTR for `149.28.119.158` must
change `mail.alecrae.com` → `smtp.alecrae.com` (Vultr panel, Craig) — see
`docs/infra/multi-platform-mail-plan.md`.

Key records:
- `mail.alecrae.com` → web app (proxied, Jarvis)
- `api.alecrae.com` → API
- `mx1.alecrae.com` / `mx2.alecrae.com` → inbound SMTP on the mail box, `149.28.119.158` (live, grey)
- `smtp.alecrae.com` → MTA sending identity, `149.28.119.158` (live, grey)

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
- [ ] TLS terminating cleanly (Cloudflare proxy + Coolify/Traefik on the box)
- [ ] `GET https://api.alecrae.com/health` returns `{"status":"ok"}`
- [ ] `GET https://mail.alecrae.com/login` loads without errors
- [ ] MTA service running (`sudo systemctl status alecrae-mta`) — not yet stood up on the mail box (`149.28.119.158`)
- [x] PTR / rDNS set in Vultr (`mail.alecrae.com` for `149.28.119.158` — ✅ already set; Option A, see `docs/infra/multi-platform-mail-plan.md`)
- [ ] IP warmup plan prepared (`docs/infra/deliverability.md`)
- [ ] Craig has authorised the deployment (Boss Rule)

---

_Last updated: 2026-07-13 12:15 UTC_
