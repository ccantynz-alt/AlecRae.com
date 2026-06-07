/**
 * load-tests/scenarios/inbox.js
 *
 * Inbox load-test scenario — the single most performance-critical path.
 *
 * CLAUDE.md budgets:
 *   Inbox load (cached)  < 100 ms
 *   Inbox load (cold)    < 1 500 ms
 *   API response (cloud) p99 < 200 ms
 *
 * Endpoints exercised:
 *   GET  /v1/messages              — list messages (paginated)
 *   GET  /v1/messages/:id          — single message fetch
 *   GET  /v1/inbox/categories      — inbox category list
 *   GET  /v1/inbox/commitments     — commitment/follow-up items
 *   GET  /v1/inbox/screener        — sender screener queue
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL=https://api.alecrae.com \
 *     -e AUTH_TOKEN=<bearer_token> \
 *     [-e SEED_MESSAGE_ID=<existing_message_id>] \
 *     load-tests/scenarios/inbox.js
 *
 * Set SEED_MESSAGE_ID to a known message ID in the target environment.
 * If omitted, the single-message scenario is skipped gracefully.
 */

import { sleep } from "k6";
import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";
import { baseUrl, authToken, authHeaders, parseJson } from "../lib/helpers.js";
import { inboxThresholds } from "../lib/thresholds.js";

// ─── Custom metrics ───────────────────────────────────────────────────────────

const inboxErrors = new Counter("inbox_errors");
const inboxListSize = new Trend("inbox_list_size");

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    /**
     * Cached list — simulate steady-state users paging through their inbox.
     * The server-side cursor cache should be warm after the first few requests.
     */
    list_messages_cached: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 25 },
        { duration: "2m",  target: 50 },
        { duration: "1m",  target: 100 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "20s",
      tags: { scenario: "list_messages_cached" },
      exec: "listMessagesCached",
    },
    /**
     * Cold list — first-time load after a cache miss.
     * Fewer VUs because each request may hit Postgres directly.
     */
    list_messages_cold: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m",  target: 20 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "20s",
      tags: { scenario: "list_messages_cold" },
      exec: "listMessagesCold",
      startTime: "10s",
    },
    /**
     * Single message fetch — individual thread open.
     */
    get_message: {
      executor: "constant-vus",
      vus: 20,
      duration: "2m",
      tags: { scenario: "get_message" },
      exec: "getMessage",
      startTime: "20s",
    },
    /**
     * Inbox metadata (categories, commitments, screener) — lightweight reads
     * that the UI issues on every inbox open.
     */
    inbox_metadata: {
      executor: "constant-vus",
      vus: 15,
      duration: "2m",
      tags: { scenario: "inbox_metadata" },
      exec: "inboxMetadata",
      startTime: "15s",
    },
  },
  thresholds: inboxThresholds,
};

// ─── Scenario functions ───────────────────────────────────────────────────────

function makeParams(token, scenarioTag) {
  return {
    headers: authHeaders(token),
    tags: { name: scenarioTag },
  };
}

export function listMessagesCached() {
  const token = authToken();
  const limit = 25;
  const url = `${baseUrl()}/v1/messages?limit=${limit}`;

  const res = http.get(url, makeParams(token, "inbox_list_cached"));

  const ok = check(res, {
    "list_messages status 200": (r) => r.status === 200,
    "list_messages has data array": (r) => {
      const body = parseJson(r);
      return Array.isArray(body?.data);
    },
  });

  if (!ok) {
    inboxErrors.add(1);
  } else {
    const body = parseJson(res);
    if (body?.data) inboxListSize.add(body.data.length);
  }

  sleep(Math.random() * 2 + 1);
}

export function listMessagesCold() {
  const token = authToken();
  // Use a status filter to bypass any warm cursor cache on the server
  const status = ["queued", "delivered", "bounced", "failed"][
    Math.floor(Math.random() * 4)
  ];
  const url = `${baseUrl()}/v1/messages?limit=50&status=${status}`;

  const res = http.get(url, makeParams(token, "inbox_list_cold"));

  const ok = check(res, {
    "cold list status 200": (r) => r.status === 200,
    "cold list body present": (r) => r.body && r.body.length > 0,
  });

  if (!ok) inboxErrors.add(1);

  sleep(Math.random() * 3 + 2);
}

export function getMessage() {
  const token = authToken();
  const messageId = __ENV.SEED_MESSAGE_ID;

  // Skip gracefully if no seed ID was provided
  if (!messageId) {
    sleep(2);
    return;
  }

  const url = `${baseUrl()}/v1/messages/${messageId}`;
  const res = http.get(url, makeParams(token, "inbox_get_message"));

  const ok = check(res, {
    "get_message status 200 or 404": (r) =>
      r.status === 200 || r.status === 404,
    "get_message has body": (r) => r.body && r.body.length > 0,
  });

  if (!ok) inboxErrors.add(1);

  sleep(Math.random() * 1.5 + 0.5);
}

export function inboxMetadata() {
  const token = authToken();
  const base = baseUrl();

  const endpoints = [
    { url: `${base}/v1/inbox/categories`,   tag: "inbox_categories" },
    { url: `${base}/v1/inbox/commitments`,  tag: "inbox_commitments" },
    { url: `${base}/v1/inbox/screener`,     tag: "inbox_screener" },
    { url: `${base}/v1/inbox/follow-ups`,   tag: "inbox_followups" },
  ];

  for (const ep of endpoints) {
    const res = http.get(ep.url, {
      headers: authHeaders(token),
      tags: { name: ep.tag },
    });

    check(res, {
      [`${ep.tag} status not 5xx`]: (r) => r.status < 500,
    });
  }

  sleep(Math.random() * 2 + 1);
}
