# Deploy Drift Detection (Known Issue #78)

> **Last updated: 2026-07-20 00:00 UTC**

The box once served a **10-day-stale build** because an unpushed on-box
hotfix made `scripts/box-deploy.sh`'s `git merge --ff-only` refuse to pull —
correctly, but silently. Nothing ever compared the box's checked-out HEAD to
`origin/main`, so the drift went unnoticed until a manual audit
(`DEVOPS_TRACKER.md` §1.7). This is the fix: a scheduled check instead of an
accidental discovery.

## How it works

1. `scripts/check-deploy-drift.sh` runs on the box on a timer. It does a
   read-only `git fetch origin main`, compares local `HEAD` to
   `origin/main`, and writes a status file (default
   `/opt/alecrae/deploy-drift-status.json`). It never pulls, merges, or
   restarts anything — purely a report.
2. `apps/api/src/lib/deploy-info.ts` reads that file back on every
   `/health` and `/v1/health` request. If drifted, the basic `/health`
   check's overall `status` flips from `ok` to `degraded` (still 200, so it
   doesn't trip load-balancer health checks — this is visibility, not an
   outage) and `/v1/health/detailed` surfaces the same `deployDrift` object.
3. `/health` and `/v1/health` also always report the running process's own
   `commit` (git SHA of the checkout `apps/api` booted from), independent of
   drift-check timing — resolved once at first request via `git rev-parse`
   and cached.

There's no alerting pipeline yet (Known Issue #72), so today this is a
**pull signal**: check `curl -s https://api.alecrae.com/v1/health | jq
.deployDrift` (or just `/health`) instead of SSHing in and diffing SHAs by
hand. Once alerting exists, wire it to page on `deployDrift.drifted == true`.

## One-time setup on the box

```bash
cat > /etc/systemd/system/alecrae-drift-check.service << 'EOF'
[Unit]
Description=AlecRae deploy drift check (report-only, Known Issue #78)
After=network.target

[Service]
Type=oneshot
User=deploy
WorkingDirectory=/opt/alecrae
ExecStart=/bin/bash /opt/alecrae/scripts/check-deploy-drift.sh
EOF

cat > /etc/systemd/system/alecrae-drift-check.timer << 'EOF'
[Unit]
Description=Run AlecRae deploy drift check every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now alecrae-drift-check.timer
systemctl start alecrae-drift-check.service   # run once immediately
systemctl status alecrae-drift-check.timer
cat /opt/alecrae/deploy-drift-status.json
```

> If running as `root` instead of `deploy`, change `User=deploy` to
> `User=root`. `WorkingDirectory` must be the repo checkout so `git fetch`
> resolves `origin/main` correctly.

## Verifying it's working

```bash
curl -s https://api.alecrae.com/health | jq '{commit, deployDrift}'
```

- `deployDrift: null` — the timer isn't installed on this box yet, or hasn't
  run once (falls back to null rather than fabricating a status).
- `deployDrift.drifted: false` — box HEAD matches `origin/main` as of
  `checkedAt`.
- `deployDrift.drifted: true` — the box is behind; run the deploy ritual
  (`docs/infra/box-deploy.md`).
