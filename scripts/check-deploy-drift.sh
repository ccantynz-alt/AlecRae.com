#!/usr/bin/env bash
#
# AlecRae deploy-drift check (Known Issue #78).
#
# Compares the box's checked-out HEAD to origin/main and writes a status
# file that apps/api/src/lib/deploy-info.ts reads back into /health and
# /v1/health/detailed. Run on a timer (see the systemd unit below) — this
# script never restarts services or pulls code, it only reports.
#
# Background: the box once served a 10-day-stale build because an unpushed
# on-box hotfix made `git merge --ff-only` refuse to pull, and nothing
# compared box HEAD to origin/main (DEVOPS_TRACKER.md §1.7). This is the
# fix: catch that state on a schedule instead of by accident.
#
# Usage (on the box):
#   bash scripts/check-deploy-drift.sh
#
# Env overrides:
#   ALECRAE_BRANCH              default "main"
#   DEPLOY_DRIFT_STATUS_FILE    default "/opt/alecrae/deploy-drift-status.json"

set -euo pipefail

BRANCH="${ALECRAE_BRANCH:-main}"
STATUS_FILE="${DEPLOY_DRIFT_STATUS_FILE:-/opt/alecrae/deploy-drift-status.json}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

write_status() {
  # $1=local $2=remote $3=drifted $4=behindBy $5=error(optional)
  local tmp
  tmp="$(mktemp)"
  if [ -n "${5:-}" ]; then
    printf '{"checkedAt":"%s","localCommit":"%s","remoteCommit":"%s","drifted":%s,"behindBy":%s,"error":"%s"}\n' \
      "$(now_iso)" "$1" "$2" "$3" "$4" "$5" > "$tmp"
  else
    printf '{"checkedAt":"%s","localCommit":"%s","remoteCommit":"%s","drifted":%s,"behindBy":%s}\n' \
      "$(now_iso)" "$1" "$2" "$3" "$4" > "$tmp"
  fi
  mkdir -p "$(dirname "$STATUS_FILE")"
  mv "$tmp" "$STATUS_FILE"
  # World-readable: this script typically runs as the deploy user (root or
  # the git-owning account), but apps/api/src/lib/deploy-info.ts reads this
  # file from the alecrae-api service, which usually runs as a different,
  # less-privileged user — without this, deployDrift silently reads as null.
  chmod 644 "$STATUS_FILE" 2>/dev/null || true
}

FETCH_ERR_FILE="$(mktemp)"
if ! git fetch origin "$BRANCH" --quiet 2>"$FETCH_ERR_FILE"; then
  ERR="$(tr -d '"\n' < "$FETCH_ERR_FILE" | head -c 200)"
  rm -f "$FETCH_ERR_FILE"
  LOCAL="$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
  write_status "$LOCAL" "unknown" "false" "0" "fetch failed: $ERR"
  echo "ERROR: git fetch failed — $ERR" >&2
  exit 1
fi
rm -f "$FETCH_ERR_FILE"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"
LOCAL_SHORT="$(git rev-parse --short=12 HEAD)"
REMOTE_SHORT="$(git rev-parse --short=12 "origin/$BRANCH")"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  write_status "$LOCAL_SHORT" "$REMOTE_SHORT" "false" "0"
  echo "OK: box HEAD ($LOCAL_SHORT) matches origin/$BRANCH"
  exit 0
fi

BEHIND_BY="$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "?")"
write_status "$LOCAL_SHORT" "$REMOTE_SHORT" "true" "$BEHIND_BY"
echo "DRIFT: box HEAD ($LOCAL_SHORT) is $BEHIND_BY commit(s) behind origin/$BRANCH ($REMOTE_SHORT)" >&2
exit 1
