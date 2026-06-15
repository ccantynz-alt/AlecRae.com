# MTA Setup on the Production Box

> **Last updated: 2026-06-15 22:00 UTC**

AlecRae's outbound email path: web UI → API (`POST /v1/messages/send`) → BullMQ (Redis) → **MTA worker** → Resend SMTP relay → recipient inbox.

The MTA worker (`services/mta`) must be running on the box as a systemd service. Without it, emails get queued in Redis but never consumed.

---

## Prerequisites

- Box is live at `149.28.119.158`
- API (`alecrae-api`) is running
- Resend SMTP relay is configured in `/opt/alecrae/.env`

---

## Step 1 — Install Redis (if not already installed)

The MTA worker uses BullMQ, which requires Redis. Install it:

```bash
apt-get update && apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server
redis-cli ping  # should return PONG
```

No configuration needed — BullMQ uses `redis://localhost:6379` by default.

---

## Step 2 — Create the MTA systemd service

```bash
cat > /etc/systemd/system/alecrae-mta.service << 'EOF'
[Unit]
Description=AlecRae MTA Worker
After=network.target redis.service alecrae-api.service
Requires=redis.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/alecrae
EnvironmentFile=/opt/alecrae/.env
ExecStart=/root/.bun/bin/bun run /opt/alecrae/services/mta/src/index.ts
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

> If you're running as `root` instead of `deploy`, change `User=deploy` to `User=root`.

---

## Step 3 — Enable and start

```bash
systemctl daemon-reload
systemctl enable alecrae-mta
systemctl start alecrae-mta
systemctl status alecrae-mta
```

Should show `active (running)`.

---

## Step 4 — Test outbound email

Send a test email via the API:

```bash
TOKEN="paste_your_bearer_token_here"

curl -X POST https://api.alecrae.com/v1/messages/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from": {"email": "craig@alecrae.com", "name": "Craig"},
    "to": [{"email": "ccantynz@gmail.com"}],
    "subject": "AlecRae send test",
    "html": "<p>If you see this, outbound email works.</p>"
  }'
```

Then check the logs:

```bash
journalctl -u alecrae-mta -f --since "2 minutes ago"
```

You should see the job being picked up and sent via Resend.

---

## Step 5 — Add to deploy script

The `scripts/box-deploy.sh` already restarts `alecrae-api` and `alecrae-web`. To include the MTA:

```bash
# After the existing systemctl restart lines, add:
sudo systemctl restart alecrae-mta
```

Or just run:

```bash
sudo systemctl restart alecrae-api alecrae-web alecrae-mta
```

---

## Checking the MTA queue

If you want to see jobs waiting in the queue:

```bash
redis-cli LLEN "bull:alecrae-outbound:wait"
redis-cli LLEN "bull:alecrae-outbound:active"
redis-cli ZCARD "bull:alecrae-outbound:failed"
```

A job stuck in `failed` means the Resend relay rejected it — check the MTA logs.

---

## Resend domain verification (required before sending)

The MTA relay uses `smtp.resend.com:465` with your Resend API key. For emails from `@alecrae.com` to work, the domain must be verified in Resend:

1. Go to `https://resend.com/domains`
2. Find `alecrae.com`
3. Status must show ✅ **Verified** — not pending
4. If still pending: check Cloudflare DNS has the `resend._domainkey` TXT records and `send.alecrae.com` MX/TXT records

Until the domain is verified, Resend will reject every outbound message with "Domain is not verified".
