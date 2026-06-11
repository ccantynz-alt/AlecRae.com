#!/usr/bin/env bash
#
# check-schema-drift.sh — fail if the Drizzle schema and the committed migrations
# have drifted apart (e.g. a table added to the schema but never generated into a
# migration — the "17 of 137 tables" trap).
#
# How it works: compile the schema, then run `drizzle-kit generate` into a
# throwaway output dir pre-seeded with the committed migration snapshot. If the
# schema is fully captured by the migrations, drizzle-kit reports "no changes"
# and writes nothing. If anything drifted, it emits a new migration file — which
# we detect and fail on.
#
# The probe dir + config live INSIDE packages/db so the config can resolve the
# `drizzle-kit` module from node_modules. Non-destructive: never touches the
# tracked migrations dir, and cleans up after itself.
#
# Usage: bun run db:check-drift   (or)   bash scripts/check-schema-drift.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/packages/db"
MIG="$DB/src/migrations"
PROBE="$DB/.drift-probe"
CFG="$DB/drizzle.drift.config.ts"

cd "$DB"
cleanup() { rm -rf "$PROBE" "$CFG"; }
trap cleanup EXIT

echo "→ Building schema (tsc)…"
bun run build >/dev/null

# Seed the probe out dir with the committed migrations + snapshot so drizzle-kit
# diffs the schema against the current baseline, not against an empty database.
rm -rf "$PROBE"; mkdir -p "$PROBE/meta"
cp "$MIG"/*.sql "$PROBE/" 2>/dev/null || true
cp "$MIG"/meta/* "$PROBE/meta/" 2>/dev/null || true

cat > "$CFG" <<EOF
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./dist/schema/*.js",
  out: "./.drift-probe",
});
EOF

baseline_count="$(find "$MIG" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"

echo "→ Probing for drift (drizzle-kit generate)…"
gen_out="$(bunx drizzle-kit generate --config "$CFG" --name drift_check 2>&1)" || {
  echo "$gen_out"; echo "::error::drift check failed to run drizzle-kit generate"; exit 1;
}

after_count="$(find "$PROBE" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"

if [ "$after_count" -gt "$baseline_count" ]; then
  echo ""
  echo "::error::Schema/migration DRIFT detected — the Drizzle schema has changes not captured by a migration."
  for f in "$PROBE"/*.sql; do
    case "$f" in
      *drift_check*) echo "  ── would-be migration: $(basename "$f") ──"; sed 's/^/    /' "$f" ;;
    esac
  done
  echo ""
  echo "  Fix: run 'cd packages/db && bun run db:generate' and commit the new migration."
  exit 1
fi

echo "✓ Drizzle schema and migrations are in sync ($baseline_count migration(s), schema fully captured)."
