/**
 * load-tests/scenarios/search.js
 *
 * Search load-test scenario.
 *
 * CLAUDE.md budgets:
 *   Search response (local)  < 50 ms   — not tested here (client-side)
 *   Search response (server) < 200 ms  — Meilisearch + index lookup
 *   AI response (edge)       < 500 ms  — AI query parsing via Claude Haiku
 *
 * Endpoints exercised:
 *   POST /v1/search/ai       — natural language search (AI-powered)
 *   POST /v1/search/smart    — structured filter-based search
 *   GET  /v1/search/status   — vector search availability probe
 *
 * Rate limit: 60 req/min per API key → keep VU count moderate.
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL=https://api.alecrae.com \
 *     -e AUTH_TOKEN=<bearer_token> \
 *     load-tests/scenarios/search.js
 */

import { sleep } from "k6";
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { baseUrl, authToken, authHeaders, jsonHeaders, parseJson, pick } from "../lib/helpers.js";
import { searchThresholds } from "../lib/thresholds.js";

const searchErrors = new Counter("search_errors");

// ─── Fixture data ─────────────────────────────────────────────────────────────

const AI_QUERIES = [
  "Find the email about the Q3 budget",
  "Show me unread messages from last week",
  "Find emails with PDF attachments from Sarah",
  "Messages about the upcoming product launch",
  "Emails where someone asked me to review something",
  "Unsubscribe links I haven't clicked",
  "Any invoices received this month",
  "Emails mentioning the API migration",
];

const SMART_FILTER_PRESETS = [
  { hasAttachment: true, limit: 20 },
  { isUnread: true, limit: 25 },
  { isStarred: true, limit: 10 },
  { dateFrom: "2025-01-01T00:00:00.000Z", limit: 20 },
  { subject: "invoice", limit: 15 },
  { hasAttachment: true, attachmentType: "pdf", limit: 10 },
];

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    /**
     * AI natural language search — passes through Claude Haiku for query
     * parsing then hits Meilisearch.  Budget: p99 < 200 ms (server).
     * VUs kept low because search rate limit is 60 req/min per key.
     */
    ai_search: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5  },
        { duration: "2m",  target: 15 },
        { duration: "1m",  target: 20 },
        { duration: "30s", target: 0  },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "ai_search" },
      exec: "aiSearch",
    },
    /**
     * Smart filter search — no AI parsing step, just Meilisearch.
     * Can sustain higher concurrency.
     */
    smart_filter: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m",  target: 25 },
        { duration: "30s", target: 0  },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "smart_filter" },
      exec: "smartFilter",
      startTime: "15s",
    },
    /**
     * Vector search status check — cheap GET, verifies Voyage AI availability.
     */
    search_status: {
      executor: "constant-vus",
      vus: 5,
      duration: "2m",
      tags: { scenario: "search_status" },
      exec: "searchStatus",
      startTime: "10s",
    },
  },
  thresholds: searchThresholds,
};

// ─── Scenario functions ───────────────────────────────────────────────────────

export function aiSearch() {
  const token = authToken();
  const url = `${baseUrl()}/v1/search/ai`;

  const body = {
    query: pick(AI_QUERIES),
    limit: 20,
  };

  const res = http.post(url, JSON.stringify(body), {
    headers: authHeaders(token),
    tags: { name: "search_ai" },
  });

  const ok = check(res, {
    "ai_search status 200": (r) => r.status === 200,
    "ai_search returns results array": (r) => {
      const parsed = parseJson(r);
      return parsed?.data !== undefined;
    },
  });

  if (!ok) searchErrors.add(1);

  // Simulate realistic user think-time between searches
  sleep(Math.random() * 3 + 2);
}

export function smartFilter() {
  const token = authToken();
  const url = `${baseUrl()}/v1/search/smart`;
  const preset = pick(SMART_FILTER_PRESETS);

  const res = http.post(url, JSON.stringify(preset), {
    headers: authHeaders(token),
    tags: { name: "search_smart_filter" },
  });

  const ok = check(res, {
    "smart_filter status 200": (r) => r.status === 200,
    "smart_filter body is JSON": (r) => parseJson(r) !== null,
  });

  if (!ok) searchErrors.add(1);

  sleep(Math.random() * 2 + 1);
}

export function searchStatus() {
  const token = authToken();
  const url = `${baseUrl()}/v1/search/status`;

  const res = http.get(url, {
    headers: authHeaders(token),
    tags: { name: "search_status" },
  });

  check(res, {
    "search_status not 5xx": (r) => r.status < 500,
    "search_status has body": (r) => r.body && r.body.length > 0,
  });

  sleep(Math.random() * 5 + 5);
}
