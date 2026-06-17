#!/usr/bin/env bash
#
# AlecRae box deploy — the "pull ritual" as one command.
#
# Run ON the production box (149.28.119.158) as the operator user:
#
#   cd /path/to/AlecRae.com && bash scripts/box-deploy.sh
#
# What it does, in order:
#   1. git pull (fast-forward only — refuses to deploy a diverged tree)
#   2. bun install
#   3. bun run db:migrate   (requires DATABASE_URL in the environment)
#   4. next build for apps/web
#   5. restart the systemd units: alecrae-api (:4100), alecrae-web (:4200)
#   6. health-check both services and report the deployed commit
#
# Fails fast at every step: if a step fails the services are NOT restarted,
# so the box keeps serving the previous (working) build.

set -euo pipefail

BRANCH="${ALECRAE_BRANCH:-main}"
API_UNIT="${ALECRAE_API_UNIT:-alecrae-api}"
WEB_UNIT="${ALECRAE_WEB_UNIT:-alecrae-web}"
API_HEALTH_URL="${ALECRAE_API_HEALTH_URL:-http://127.0.0.1:4100/health}"
WEB_HEALTH_URL="${ALECRAE_WEB_HEALTH_URL:-http://127.0.0.1:4200/api/version}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }

step "1/6 git pull (fast-forward only, branch: $BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"
DEPLOYED_COMMIT="$(git rev-parse --short HEAD)"
echo "At commit: $DEPLOYED_COMMIT"

step "2/6 bun install"
bun install

step "3/6 database migrations"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set in this shell." >&2
  echo "Source the production env first (e.g. set -a; . /etc/alecrae/api.env; set +a)" >&2
  exit 1
fi
bun run db:migrate

step "4/6 build web app"
bun run --cwd apps/web build

step "5/6 restart services"
sudo systemctl restart "$API_UNIT"
sudo systemctl restart "$WEB_UNIT"
# Restart MTA worker if it exists (optional — only present after mta-box-setup.md is followed)
if systemctl is-enabled alecrae-mta &>/dev/null; then
  sudo systemctl restart alecrae-mta
  echo "alecrae-mta restarted"
fi

step "6/6 health checks"
sleep 3
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 5 "$API_HEALTH_URL" > /dev/null; then
    echo "API healthy ($API_HEALTH_URL)"
    break
  fi
  if [ "$attempt" -eq 5 ]; then
    echo "ERROR: API failed health check after 5 attempts — check: journalctl -u $API_UNIT -n 100" >&2
    exit 1
  fi
  sleep 3
done
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 5 "$WEB_HEALTH_URL" > /dev/null; then
    echo "Web healthy ($WEB_HEALTH_URL)"
    break
  fi
  if [ "$attempt" -eq 5 ]; then
    echo "ERROR: Web failed health check after 5 attempts — check: journalctl -u $WEB_UNIT -n 100" >&2
    exit 1
  fi
  sleep 3
done

printf '\n\033[1;32m✔ Deployed %s — alecrae-api + alecrae-web restarted and healthy.\033[0m\n' "$DEPLOYED_COMMIT"
