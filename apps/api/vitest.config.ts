import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for apps/api.
 *
 * WHY THIS EXISTS: the default 5s test / 10s hook timeouts are too tight for
 * this codebase's module graph. Importing `src/routes/messages.js` alone takes
 * ~8.7s cold — it pulls in the AI engine, the reputation service, the MTA
 * library, the security package and the whole DB schema. Suites that
 * dynamically import a route inside a hook were therefore sitting a second or
 * two under the limit, and any small addition to the graph pushed an unrelated
 * test over it.
 *
 * That produced the worst kind of failure: tests that pass alone and fail in
 * the full run, or pass today and fail tomorrow because someone added an
 * import somewhere else entirely. Three separate suites hit it
 * (billing-dunning-notifications, persistent-stores, and drafts +
 * message-open-tracking), each looking like an unrelated bug.
 *
 * Raising the ceiling is the honest fix: nothing here is genuinely slow at
 * runtime, the cost is one-time module resolution in the test harness. The
 * ceiling is deliberately well clear of the current 8.7s rather than just
 * above it, so the next dependency added does not re-open the same flake.
 *
 * This is a workaround, not a resolution — the real answer is that route
 * modules should not transitively pull in every service in the monorepo. That
 * is a structural change, and worth doing separately.
 */
export default defineConfig({
  test: {
    /** Cold-importing a route module is ~9s; leave real headroom above it. */
    hookTimeout: 60_000,
    /** Tests that dynamically import a module pay the same cost inline. */
    testTimeout: 30_000,
    // The e2e suite fetches a live API and is excluded from `bun run test`;
    // it has its own script (`test:e2e`) and needs a running server.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
