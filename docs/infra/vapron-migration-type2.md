# AlecRae Migration Spec — Type 2

> **Last updated: 2026-06-20 10:00 UTC**

> **Type 2 migration** = migrate a product from an external managed platform
> (Vercel, Cloudflare, Mailgun, Resend) onto Vapron's own bare-metal stack.
> This document covers moving AlecRae from any prior cloud hosting to
> self-managed deployment on Vapron infrastructure (Vultr Chicago, `149.28.119.158`).

This is the authoritative runbook. `docs/LAUNCH_CHECKLIST.md` (§1) calls into
this document for the AlecRae side of Vapron's own launch. Both docs must stay
in sync.

---

## What AlecRae is in the Vapron ecosystem

AlecRae (`api.alecrae.com`) is Vapron's **transactional email MTA**. It sits
immediately above the SMTP relay layer and is the first fallback in
`apps/api/src/email/client.ts`:

```
Vapron email call path:
  customer-email tRPC → sendEmail() →
    1. Self-hosted SMTP (EMAIL_SEND_PORT / EMAIL_SEND_TOKEN)
    2. AlecRae MTA  ← this is what this doc configures
    3. Resend       ← cloud fallback #2
    4. console.log  ← last resort, silent failure guard
```

AlecRae handles: email verification, password reset, welcome, magic-link,
waitlist confirmation, subscription receipts, deploy success/failure notifications,
and custom-domain-verified alerts.

---

## Prerequisites

- SSH access to the production server (`149.28.119.158`, user: `deploy`)
- `api.alecrae.com` DNS A record pointing at the server (add in whatever
  DNS panel manages `alecrae.com`)
- AlecRae repo cloned and built under `/opt/alecrae/`
- AlecRae's own dependencies: a Postgres or SQLite DB (`DATABASE_URL`),
  Redis or Upstash (`REDIS_URL`), SMTP relay credentials

---

## Step 1 — Server-side env for AlecRae itself

AlecRae reads its env from `/opt/alecrae/.env.production`. The minimum set:

```sh
# /opt/alecrae/.env.production
NODE_ENV=production
PORT=4100

DATABASE_URL=postgres://alecrae:PASS@localhost:5432/alecrae
REDIS_URL=redis://127.0.0.1:6379/1

# Auth / OAuth (AlecRae's own dashboard login)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=<openssl rand -hex 32>

# AlecRae's own email sending (for its own transactional mail)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# Stripe (for AlecRae's own billing if applicable)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AI keys (if AlecRae uses them)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

After editing: `sudo systemctl restart alecrae`

---

## Step 2 — Systemd service for AlecRae

Create `/etc/systemd/system/alecrae.service`:

```ini
[Unit]
Description=AlecRae transactional email MTA
After=network-online.target postgres.service
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/alecrae
ExecStartPre=-/bin/sh -c 'fuser -k 4100/tcp 2>/dev/null || true; sleep 1'
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30s
KillMode=mixed
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/opt/alecrae/.env
EnvironmentFile=-/opt/alecrae/.env.production
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/alecrae
StandardOutput=journal
StandardError=journal
SyslogIdentifier=alecrae

[Install]
WantedBy=multi-user.target
```

Enable and start:

```sh
sudo systemctl daemon-reload
sudo systemctl enable alecrae
sudo systemctl start alecrae
sudo systemctl status alecrae
```

---

## Step 3 — Caddy routing for api.alecrae.com

Add a block to `/etc/caddy/Caddyfile` (Caddy is the TLS front door):

```caddyfile
api.alecrae.com {
    reverse_proxy 127.0.0.1:4100
}
```

Reload Caddy: `sudo systemctl reload caddy`

Caddy auto-provisions the TLS cert via ACME on first request.

---

## Step 4 — Seed AlecRae with a Vapron account

```sh
cd /opt/alecrae

# Run migrations
bun run db:migrate

# Create the Vapron platform account (prints API key + account ID — save both)
bun run scripts/seed.ts

# Seed the 10 email templates Vapron needs
ACCOUNT_ID=<vapron-account-id-from-above> bun run scripts/seed-vapron-templates.ts
```

**Save the API key printed by `seed.ts`.** It goes into Vapron's env in Step 7.

---

## Step 5 — Register the Vapron sender domain on AlecRae

```sh
# Register mail.vapron.ai as a sending domain
curl -s -X POST https://api.alecrae.com/v1/domains \
  -H "Authorization: Bearer <api-key-from-step-4>" \
  -H "Content-Type: application/json" \
  -d '{"domain": "mail.vapron.ai"}'
```

The response includes DKIM, SPF, and DMARC records. Add each one to
**Porkbun DNS** for `vapron.ai` (porkbun.com → DNS Management → vapron.ai).
All records are DNS-only — no proxy.

| Type | Host | Value |
|------|------|-------|
| TXT | `mail.vapron.ai` | the SPF value from the response |
| CNAME | `<selector>._domainkey.mail.vapron.ai` | the DKIM CNAME from the response |
| TXT | `_dmarc.mail.vapron.ai` | the DMARC value from the response |

After adding records (allow 1–5 min propagation), verify:

```sh
# Replace <domain-id> with the id from the register response
curl -s -X POST https://api.alecrae.com/v1/domains/<domain-id>/verify \
  -H "Authorization: Bearer <api-key-from-step-4>"
# Expected: {"spf":"passing","dkim":"passing","dmarc":"passing"}
```

---

## Step 6 — Register the Vapron inbound webhook

```sh
# Generate a secret
WEBHOOK_SECRET=$(openssl rand -hex 16)
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"  # save this for Step 7

curl -s -X POST https://api.alecrae.com/v1/webhooks \
  -H "Authorization: Bearer <api-key-from-step-4>" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"https://vapron.ai/api/alecrae/webhook\",
    \"events\": [\"delivered\",\"bounced\",\"complained\",\"opened\",\"clicked\"],
    \"secret\": \"$WEBHOOK_SECRET\"
  }"
```

---

## Step 7 — Set Vapron env vars (bare-metal, NOT Vercel)

> **This is the most common source of misconfiguration.** The old Vercel-era
> instructions told you to set env vars in the Vercel dashboard. Vapron no
> longer runs on Vercel. Env vars live in `/opt/vapron/.env.production` on the
> bare-metal server.

```sh
sudo tee -a /opt/vapron/.env.production <<EOF
ALECRAE_BASE_URL=https://api.alecrae.com/v1
ALECRAE_API_KEY=<api-key-from-step-4>
ALECRAE_FROM_ADDRESS=Vapron <noreply@mail.vapron.ai>
ALECRAE_WEBHOOK_SECRET=<WEBHOOK_SECRET-from-step-6>
EOF

sudo systemctl restart vapron-api
```

Verify the env landed:

```sh
sudo grep ALECRAE /opt/vapron/.env.production
journalctl -u vapron-api -n 20 | grep -i alecrae
```

---

## Step 8 — Smoke test

```sh
curl -s -X POST https://api.alecrae.com/v1/messages/send \
  -H "Authorization: Bearer <api-key-from-step-4>" \
  -H "Content-Type: application/json" \
  -d '{
    "from": {"email": "noreply@mail.vapron.ai", "name": "Vapron"},
    "to": [{"email": "ccantynz@gmail.com"}],
    "template_id": "vapron.verify-email",
    "variables": {"firstName": "Craig", "verifyUrl": "https://vapron.ai/verify/test123"},
    "message_id": "migration-smoke-test-001"
  }'
```

Expected: `{"id":"...","messageId":"...","status":"queued"}`

- Email should arrive in inbox within 60s
- `journalctl -u vapron-api -n 50 | grep alecrae-webhook` should show `event=delivered message_id=migration-smoke-test-001`
- Retry the same POST (same `message_id`) — confirm NO duplicate email (idempotency proof)

---

## Step 9 — Confirm the 10 templates

```sh
curl -s https://api.alecrae.com/v1/templates \
  -H "Authorization: Bearer <api-key-from-step-4>" | jq '.[].id'
```

Must include all 10:

```
vapron.verify-email
vapron.welcome
vapron.password-reset
vapron.magic-link
vapron.waitlist-confirm
vapron.subscription-created
vapron.payment-failed
vapron.deploy-success
vapron.deploy-failure
vapron.custom-domain-verified
```

If any are missing, re-run:

```sh
ACCOUNT_ID=<id> bun run scripts/seed-vapron-templates.ts
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[EMAIL] AlecRae failed: HTTP 404` | `ALECRAE_BASE_URL` missing `/v1` | Set to `https://api.alecrae.com/v1`, restart vapron-api |
| `[EMAIL] AlecRae failed: HTTP 401` | Wrong or rotated API key | Re-run `seed.ts`, update `ALECRAE_API_KEY`, restart |
| `invalid_signature` on webhook | `ALECRAE_WEBHOOK_SECRET` mismatch | Must match exactly what was passed to `POST /v1/webhooks` |
| `signature verification SKIPPED` log | `ALECRAE_WEBHOOK_SECRET` not set | Add to `.env.production`, restart vapron-api |
| Env var change not taking effect | Process reads env at startup | Always run `sudo systemctl restart vapron-api` after any `.env.production` edit |
| `api.alecrae.com` 502 | AlecRae service down | `sudo systemctl status alecrae`, `journalctl -u alecrae -n 50` |
| DKIM/SPF check failing on verify | DNS not propagated or wrong record | Wait 5 min, re-run verify. `dig TXT mail.vapron.ai` to confirm live. |

---

## Rollback

If AlecRae is unreachable, Vapron's email client automatically falls through
to Resend (`RESEND_API_KEY`) and finally to `console.log`. No downtime for
users — set `RESEND_API_KEY` and restart while you fix AlecRae.

---

## What NOT to do

- Do not set env vars in Vercel — Vapron no longer runs on Vercel
- Do not set DNS records in Cloudflare for `vapron.ai` — DNS is at Porkbun
- Do not proxy the AlecRae domain through Cloudflare — use DNS-only (grey cloud)
- Do not hardcode the API key in source code — it lives in `/opt/vapron/.env.production`
