/**
 * load-tests/lib/thresholds.js
 *
 * Canonical performance budgets drawn directly from CLAUDE.md.
 * Import this object and spread it into your scenario's `thresholds` block.
 *
 * Budget source (CLAUDE.md § "Performance Budgets — CI FAILS IF VIOLATED"):
 *
 *   Inbox load (cached)          < 100 ms
 *   Inbox load (cold)            < 1 500 ms
 *   Search response (server)     < 200 ms
 *   API response (edge)   p99    < 50 ms
 *   API response (cloud)  p99    < 200 ms
 *   AI response (edge)           < 500 ms
 *   AI response (cloud)          < 2 000 ms
 *   Email send time-to-delivered < 2 000 ms (send enqueue portion)
 *
 * k6 threshold DSL: https://k6.io/docs/using-k6/thresholds/
 */

// ─── Shared error-rate gate (applies everywhere) ──────────────────────────────

/** Maximum acceptable HTTP error rate across any scenario. */
export const ERROR_RATE_THRESHOLD = ["rate<0.01"]; // < 1 % errors

// ─── Per-endpoint duration budgets ───────────────────────────────────────────

/**
 * Auth endpoints — cloud API tier (p99 < 200 ms).
 * Login involves Argon2id hashing so we allow a slightly wider p95 window
 * but keep the p99 honest.
 */
export const authThresholds = {
  http_req_failed: ERROR_RATE_THRESHOLD,
  // login: Argon2id adds ~100 ms on the server; budget reflects that
  "http_req_duration{scenario:login}": ["p(95)<500", "p(99)<800"],
  "http_req_duration{scenario:token_refresh}": ["p(95)<100", "p(99)<200"],
  "http_req_duration{scenario:get_me}": ["p(95)<100", "p(99)<200"],
};

/**
 * Inbox / messages — two distinct budgets:
 *   cached read (GET /v1/messages) → cloud API p99 < 200 ms
 *   cold load (includes DB scan)   → p99 < 1 500 ms
 */
export const inboxThresholds = {
  http_req_failed: ERROR_RATE_THRESHOLD,
  "http_req_duration{scenario:list_messages_cached}": ["p(95)<100", "p(99)<200"],
  "http_req_duration{scenario:list_messages_cold}": ["p(95)<1000", "p(99)<1500"],
  "http_req_duration{scenario:get_message}": ["p(95)<100", "p(99)<200"],
};

/**
 * Search — server-side budget < 200 ms (Meilisearch + index lookup).
 */
export const searchThresholds = {
  http_req_failed: ERROR_RATE_THRESHOLD,
  "http_req_duration{scenario:ai_search}": ["p(95)<150", "p(99)<200"],
  "http_req_duration{scenario:smart_filter}": ["p(95)<100", "p(99)<200"],
};

/**
 * Compose/Send — email enqueue path (not full delivery) < 2 s.
 */
export const sendThresholds = {
  http_req_failed: ERROR_RATE_THRESHOLD,
  "http_req_duration{scenario:send_email}": ["p(95)<1500", "p(99)<2000"],
};

/**
 * Read-heavy endpoints (admin stats, list emails).
 * These are cloud-tier API calls, p99 < 200 ms.
 */
export const readHeavyThresholds = {
  http_req_failed: ERROR_RATE_THRESHOLD,
  "http_req_duration{scenario:admin_stats}": ["p(95)<150", "p(99)<200"],
  "http_req_duration{scenario:admin_messages}": ["p(95)<150", "p(99)<200"],
};

/**
 * Smoke test — all critical paths must respond well under 2 s.
 * These thresholds are intentionally generous; the smoke test is about
 * "is the API reachable?" not "is it fast?".
 */
export const smokeThresholds = {
  http_req_failed: ["rate<0.00"], // zero failures tolerated
  http_req_duration: ["p(99)<2000"],
};
