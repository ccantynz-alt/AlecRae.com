#!/usr/bin/env bash
#
# AlecRae live service/port drift check (Known Issue #112).
#
# scripts/check-deploy-drift.sh (issue #78) only catches drift in the
# CODE VERSION a box is running — it says nothing about whether the box
# is running services it shouldn't be, or missing ones it should. That
# second class of drift is what actually let issue #105 happen: an
# unauthenticated SMTP relay ran for 9 days and nothing in the repo's
# tooling would ever have caught it short of manually SSHing in, which
# is exactly how it WAS eventually found.
#
# This checks two things, both host-configurable via env vars so the same
# script covers Jarvis (web/api) and the mail box (MTA) with different
# expectations:
#   1. Every unit in EXPECTED_SERVICES is actually active. A stopped
#      expected service is a regression (e.g. alecrae-api crashed).
#   2. Every publicly-bound (0.0.0.0) listening TCP port is in
#      EXPECTED_PORTS. An unexpected listening port is exactly issue
#      #105's signature — something is reachable from the internet that
#      nobody decided should be.
#
# This does NOT try to enumerate every systemd unit on a shared/
# multi-tenant box (Jarvis and the mail box both run many unrelated
# platform services) — that's noisy and not alecrae's concern. It only
# tracks what alecrae itself is responsible for.
#
# Usage (on the box):
#   EXPECTED_SERVICES="alecrae-api alecrae-web" \
#   EXPECTED_PORTS="80 443 4100 4200" \
#   bash scripts/check-service-drift.sh
#
# Env overrides:
#   EXPECTED_SERVICES            space-separated systemd unit names (no default — required)
#   EXPECTED_PORTS                space-separated TCP ports allowed to LISTEN on 0.0.0.0 (no default — required)
#   SERVICE_DRIFT_STATUS_FILE    default "/opt/alecrae/service-drift-status.json"

set -euo pipefail

STATUS_FILE="${SERVICE_DRIFT_STATUS_FILE:-/opt/alecrae/service-drift-status.json}"

if [ -z "${EXPECTED_SERVICES:-}" ] && [ -z "${EXPECTED_PORTS:-}" ]; then
  echo "ERROR: set EXPECTED_SERVICES and/or EXPECTED_PORTS (space-separated) before running this check." >&2
  echo "Example: EXPECTED_SERVICES=\"alecrae-api alecrae-web\" EXPECTED_PORTS=\"80 443 4100 4200\" bash $0" >&2
  exit 2
fi

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ── 1. Expected services actually running ───────────────────────────────
down_services=()
for svc in ${EXPECTED_SERVICES:-}; do
  if ! systemctl is-active --quiet "$svc" 2>/dev/null; then
    down_services+=("$svc")
  fi
done

# ── 2. Publicly-listening ports match the allowlist ──────────────────────
# `ss -tlnp` output for a 0.0.0.0-bound listener looks like:
#   LISTEN 0 511 0.0.0.0:443 0.0.0.0:*
# Extract just the port number for 0.0.0.0-bound (not 127.0.0.1-bound) lines.
listening_ports="$(ss -tlnp 2>/dev/null | awk '$4 ~ /^0\.0\.0\.0:/ { split($4, a, ":"); print a[2] }' | sort -un)"

unexpected_ports=()
for port in $listening_ports; do
  found=0
  for expected in ${EXPECTED_PORTS:-}; do
    if [ "$port" = "$expected" ]; then
      found=1
      break
    fi
  done
  if [ "$found" -eq 0 ]; then
    unexpected_ports+=("$port")
  fi
done

# ── Write status ─────────────────────────────────────────────────────────
json_array() {
  # Prints a JSON string array from the positional args, or [] if none.
  if [ "$#" -eq 0 ]; then
    printf '[]'
    return
  fi
  local out="["
  local first=1
  for item in "$@"; do
    if [ "$first" -eq 1 ]; then first=0; else out+=","; fi
    out+="\"$item\""
  done
  out+="]"
  printf '%s' "$out"
}

drifted="false"
if [ "${#down_services[@]}" -gt 0 ] || [ "${#unexpected_ports[@]}" -gt 0 ]; then
  drifted="true"
fi

tmp="$(mktemp)"
printf '{"checkedAt":"%s","drifted":%s,"downServices":%s,"unexpectedListeningPorts":%s}\n' \
  "$(now_iso)" "$drifted" "$(json_array "${down_services[@]:-}")" "$(json_array "${unexpected_ports[@]:-}")" \
  > "$tmp"
mkdir -p "$(dirname "$STATUS_FILE")"
mv "$tmp" "$STATUS_FILE"
chmod 644 "$STATUS_FILE" 2>/dev/null || true

if [ "$drifted" = "true" ]; then
  if [ "${#down_services[@]}" -gt 0 ]; then
    echo "DOWN: expected service(s) not active: ${down_services[*]}" >&2
  fi
  if [ "${#unexpected_ports[@]}" -gt 0 ]; then
    echo "UNEXPECTED: publicly-listening port(s) not in EXPECTED_PORTS: ${unexpected_ports[*]} — this is exactly issue #105's signature, investigate immediately" >&2
  fi
  exit 1
fi

echo "OK: all expected services active, no unexpected public listeners"
