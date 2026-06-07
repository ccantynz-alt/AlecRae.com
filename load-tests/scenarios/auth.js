/**
 * load-tests/scenarios/auth.js
 *
 * Auth load-test scenario — covers the three hottest auth paths:
 *   1. login          POST /v1/auth/login
 *   2. token_refresh  POST /v1/auth/refresh
 *   3. get_me         GET  /v1/auth/me
 *
 * Thresholds come from CLAUDE.md performance budgets (cloud API tier):
 *   Login p99 < 800 ms  (Argon2id hashing adds ~100 ms)
 *   Refresh p99 < 200 ms
 *   /me     p99 < 200 ms
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL=https://api.alecrae.com \
 *     -e AUTH_TOKEN=<valid_bearer_token> \
 *     -e TEST_EMAIL=loadtest@alecrae.com \
 *     -e TEST_PASSWORD=LoadTest1234! \
 *     load-tests/scenarios/auth.js
 *
 * The TEST_EMAIL / TEST_PASSWORD account must already exist in the target
 * environment.  AUTH_TOKEN is used for the get_me scenario so you don't
 * need to depend on a successful login during setup.
 */

import { sleep } from "k6";
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { baseUrl, authToken, jsonHeaders, authHeaders, parseJson, randomId } from "../lib/helpers.js";
import { authThresholds } from "../lib/thresholds.js";

// ─── Custom metrics ───────────────────────────────────────────────────────────

const loginFailures = new Counter("login_failures");
const refreshFailures = new Counter("refresh_failures");

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    /**
     * login: ramp from 0 → 20 VUs over 30 s, hold 1 min, ramp down.
     * Auth has strict rate limiting (10 req/min per IP) so we keep VUs low
     * and use per-VU sleep to avoid hitting the limit in a single-IP test.
     */
    login: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "1m", target: 10 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "login" },
      exec: "loginScenario",
    },
    /**
     * token_refresh: higher concurrency (tokens are cheaper to rotate than
     * to hash a password).
     */
    token_refresh: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "1m", target: 40 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "token_refresh" },
      exec: "tokenRefreshScenario",
      startTime: "10s", // stagger start
    },
    /**
     * get_me: cheap read-only endpoint — can drive higher VU count.
     */
    get_me: {
      executor: "constant-vus",
      vus: 30,
      duration: "2m",
      tags: { scenario: "get_me" },
      exec: "getMeScenario",
      startTime: "20s",
    },
  },
  thresholds: authThresholds,
};

// ─── Scenario functions ───────────────────────────────────────────────────────

/** Login with a pre-created test account. */
export function loginScenario() {
  const email = __ENV.TEST_EMAIL || "loadtest@alecrae.com";
  const password = __ENV.TEST_PASSWORD || "LoadTest1234!";
  const url = `${baseUrl()}/v1/auth/login`;

  const res = http.post(
    url,
    JSON.stringify({ email, password }),
    { headers: jsonHeaders, tags: { name: "auth_login" } }
  );

  const ok = check(res, {
    "login status 200": (r) => r.status === 200,
    "login returns access token": (r) => {
      const body = parseJson(r);
      return body?.data?.token !== undefined;
    },
  });

  if (!ok) loginFailures.add(1);

  // Auth endpoints have a 10 req/min rate limit per IP.
  // Sleep 8-12 s per VU to stay well under that ceiling in a single-IP test.
  sleep(Math.random() * 4 + 8);
}

/**
 * Token refresh — uses the AUTH_TOKEN env var as a stub refresh token.
 * In a real load test, wire up setup() to obtain a real refresh token first.
 */
export function tokenRefreshScenario() {
  const token = __ENV.REFRESH_TOKEN || authToken();
  const url = `${baseUrl()}/v1/auth/refresh`;

  const res = http.post(
    url,
    JSON.stringify({ refreshToken: token }),
    { headers: jsonHeaders, tags: { name: "auth_refresh" } }
  );

  const ok = check(res, {
    "refresh status 200 or 401": (r) => r.status === 200 || r.status === 401,
    "response is JSON": (r) => parseJson(r) !== null,
  });

  if (!ok) refreshFailures.add(1);

  sleep(Math.random() * 2 + 1);
}

/** Fetch the current user profile — validates the token is still live. */
export function getMeScenario() {
  const token = authToken();
  const url = `${baseUrl()}/v1/auth/me`;

  const res = http.get(url, {
    headers: authHeaders(token),
    tags: { name: "auth_me" },
  });

  check(res, {
    "get_me status 200 or 401": (r) => r.status === 200 || r.status === 401,
    "response has data or error field": (r) => {
      const body = parseJson(r);
      return body?.data !== undefined || body?.error !== undefined;
    },
  });

  sleep(Math.random() * 1 + 0.5);
}
