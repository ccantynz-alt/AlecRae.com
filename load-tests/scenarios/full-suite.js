/**
 * load-tests/scenarios/full-suite.js
 *
 * Combined load-test scenario that exercises every hot path together.
 * Use this to simulate a realistic mixed workload before launch.
 *
 * Scenarios included:
 *   - auth (get_me)          — 20 % of traffic
 *   - inbox list (cached)    — 35 % of traffic
 *   - search smart filter    — 15 % of traffic
 *   - read-heavy (list msgs) — 20 % of traffic
 *   - compose assist         — 10 % of traffic  (no real sends in this suite)
 *
 * CLAUDE.md budgets enforced:
 *   Inbox (cached)  p99 < 200 ms
 *   Search          p99 < 200 ms
 *   List emails     p99 < 200 ms
 *   Auth /me        p99 < 200 ms
 *   Error rate      < 1 %
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL=https://api.alecrae.com \
 *     -e AUTH_TOKEN=<bearer_token> \
 *     load-tests/scenarios/full-suite.js
 *
 * To stress-test at higher load, increase --vus or --iterations on the CLI.
 */

import { sleep } from "k6";
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { baseUrl, authToken, authHeaders, parseJson, pick } from "../lib/helpers.js";

const suiteErrors = new Counter("suite_errors");

const AI_QUERIES = [
  "Find emails about the budget",
  "Show unread messages from last week",
  "Emails with PDF attachments",
  "Follow-up reminders due today",
];

const COMPOSE_PROMPTS = [
  "Reply to a client asking for an update",
  "Decline a meeting politely",
  "Thank a colleague for their help",
];

export const options = {
  scenarios: {
    /**
     * Mixed realistic traffic ramp: 0 → 80 VUs over 2 min, hold 5 min,
     * ramp down over 1 min.  Each VU runs a random action per iteration
     * (see default function below).
     */
    mixed_workload: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m",  target: 20 },
        { duration: "2m",  target: 50 },
        { duration: "5m",  target: 80 },
        { duration: "1m",  target: 0  },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    // inbox list — must stay under cached budget even at 80 VUs
    "http_req_duration{name:suite_inbox_list}":  ["p(95)<150",  "p(99)<200"],
    // auth /me — cheap DB lookup
    "http_req_duration{name:suite_auth_me}":     ["p(95)<100",  "p(99)<200"],
    // search smart filter
    "http_req_duration{name:suite_search}":      ["p(95)<150",  "p(99)<200"],
    // compose assist — AI call, wider budget
    "http_req_duration{name:suite_compose}":     ["p(95)<1000", "p(99)<2000"],
  },
};

// ─── Default function — random action selection ───────────────────────────────

export default function () {
  const token = authToken();
  const base = baseUrl();

  // Weighted random selection matching the traffic split described above
  const r = Math.random();

  if (r < 0.20) {
    // Auth /me (20 %)
    const res = http.get(`${base}/v1/auth/me`, {
      headers: authHeaders(token),
      tags: { name: "suite_auth_me" },
    });
    check(res, {
      "suite /me not 5xx": (r) => r.status < 500,
    }) || suiteErrors.add(1);

  } else if (r < 0.55) {
    // Inbox list (35 %)
    const res = http.get(`${base}/v1/messages?limit=25`, {
      headers: authHeaders(token),
      tags: { name: "suite_inbox_list" },
    });
    check(res, {
      "suite inbox 200": (r) => r.status === 200,
      "suite inbox has data": (r) => parseJson(r)?.data !== undefined,
    }) || suiteErrors.add(1);

  } else if (r < 0.70) {
    // Smart search (15 %)
    const res = http.post(
      `${base}/v1/search/smart`,
      JSON.stringify({ isUnread: true, limit: 20 }),
      {
        headers: authHeaders(token),
        tags: { name: "suite_search" },
      }
    );
    check(res, {
      "suite search not 5xx": (r) => r.status < 500,
    }) || suiteErrors.add(1);

  } else if (r < 0.90) {
    // List emails with status filter (20 %)
    const statuses = ["delivered", "queued", "bounced"];
    const status = pick(statuses);
    const res = http.get(`${base}/v1/messages?limit=50&status=${status}`, {
      headers: authHeaders(token),
      tags: { name: "suite_inbox_list" }, // same tag → same threshold
    });
    check(res, {
      "suite list by status 200": (r) => r.status === 200,
    }) || suiteErrors.add(1);

  } else {
    // Compose assist (10 %)
    const res = http.post(
      `${base}/v1/compose-assist/draft`,
      JSON.stringify({ prompt: pick(COMPOSE_PROMPTS), tone: "professional", length: "short" }),
      {
        headers: authHeaders(token),
        tags: { name: "suite_compose" },
      }
    );
    check(res, {
      "suite compose not 5xx": (r) => r.status < 500,
    }) || suiteErrors.add(1);
  }

  sleep(Math.random() * 2 + 1);
}
