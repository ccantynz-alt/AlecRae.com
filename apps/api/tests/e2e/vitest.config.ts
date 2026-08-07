import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the E2E suite ONLY.
 *
 * WHY THIS EXISTS: the app-level vitest.config.ts excludes `tests/e2e/**` so
 * that `bun run test` never needs a live server — but a config-level exclude
 * also wins over a CLI path filter, so the old `test:e2e` script
 * (`vitest run tests/e2e/`) collected ZERO test files and exited 0. That made
 * "run the e2e suite" a no-op that reported success (the same
 * control-that-does-nothing class as CLAUDE.md issues #150/#161). Running with
 * this dedicated config is what actually collects the seven e2e files.
 *
 * The suite fetch()es a live API at E2E_API_URL (default
 * http://localhost:3001) — see helpers.ts. It needs a booted server whose
 * database has been seeded by apps/api/scripts/seed-e2e.ts. CI wires all of
 * that up in the "E2E API" job in .github/workflows/ci.yml.
 */
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.e2e.test.ts"],
    // Real network round-trips plus DNS lookups (domain verification resolves
    // records for nonexistent test domains) — keep generous headroom.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
