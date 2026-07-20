# Service/Port Drift Detection (Known Issue #112)

> **Last updated: 2026-07-20 00:00 UTC**

`scripts/check-deploy-drift.sh` (issue #78) only catches drift in the
**code version** a box is running. It says nothing about whether the box
is running services it shouldn't be, or missing ones it should — and that
second class of drift is what actually let issue #105 happen: an
unauthenticated SMTP relay ran on Jarvis's mail box for 9 days, and
nothing in the repo's tooling would ever have caught it short of manually
SSHing in, which is exactly how it was eventually found.

## How it works

`scripts/check-service-drift.sh` checks two things on a timer, both
host-configurable so the same script covers every box with different
expectations:

1. **Every unit in `EXPECTED_SERVICES` is actually active.** A stopped
   expected service is a regression (e.g. `alecrae-api` crashed).
2. **Every publicly-bound (`0.0.0.0`) listening TCP port is in
   `EXPECTED_PORTS`.** An unexpected listening port is exactly issue
   #105's signature — something is reachable from the internet that
   nobody decided should be.

It deliberately does **not** try to enumerate every systemd unit on a
shared/multi-tenant box — Jarvis and the mail box both run many unrelated
platform services (dozens of `vapron-preview-*`/`crontech-*` units on the
mail box alone). That's noisy and not alecrae's concern; this only tracks
what alecrae itself is responsible for.

`apps/api/src/lib/deploy-info.ts`'s `getServiceDriftStatus()` reads the
status file back into `/health` and `/v1/health/detailed` — a drift
(either kind) flips `/health`'s status to `degraded` (still 200 — this is
visibility, not an outage signal on its own).

## One-time setup on each box

**Jarvis** (web/api):

```bash
cat > /etc/systemd/system/alecrae-service-drift-check.service << 'EOF'
[Unit]
Description=AlecRae service/port drift check (report-only, Known Issue #112)
After=network.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/alecrae
Environment=EXPECTED_SERVICES=alecrae-api alecrae-web
Environment=EXPECTED_PORTS=80 443 4100 4200
ExecStart=/bin/bash /opt/alecrae/scripts/check-service-drift.sh
EOF

cat > /etc/systemd/system/alecrae-service-drift-check.timer << 'EOF'
[Unit]
Description=Run AlecRae service/port drift check every 15 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now alecrae-service-drift-check.timer
systemctl start alecrae-service-drift-check.service
cat /opt/alecrae/service-drift-status.json
```

**Mail box (`vapron-158`)** — deliberately does **not** include
`alecrae-mta` in `EXPECTED_SERVICES` while it stays stopped per issue
#105 (see CLAUDE.md Next Actions item 0b). Add it back once the inbound
handler is finished and the service restarts intentionally. Port 587 is
`vapron-email-send.service` (platform-wide, not alecrae's — not listed
here since this check only tracks alecrae's own expected surface):

```bash
cat > /etc/systemd/system/alecrae-service-drift-check.service << 'EOF'
[Unit]
Description=AlecRae service/port drift check (report-only, Known Issue #112)
After=network.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/alecrae
Environment=EXPECTED_SERVICES=
Environment=EXPECTED_PORTS=
ExecStart=/bin/bash /opt/alecrae/scripts/check-service-drift.sh
EOF
# Same .timer unit as above.
```

> **Must run as `User=root`**, same reasoning as `check-deploy-drift.sh`
> (issue #78) — `write_status()` `chmod 644`s the file after every write so
> `alecrae-api` (a different, less-privileged user) can still read it.

## Verifying it's working

```bash
curl -s https://api.alecrae.com/health | jq '{commit, serviceDrift}'
```

- `serviceDrift: null` — the timer isn't installed on this box yet.
- `serviceDrift.drifted: false` — all expected services active, no
  unexpected public listeners.
- `serviceDrift.unexpectedListeningPorts` non-empty — **investigate
  immediately**, this is issue #105's exact signature.
