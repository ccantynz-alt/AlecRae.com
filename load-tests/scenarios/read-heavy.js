/**
 * load-tests/scenarios/read-heavy.js
 *
 * Read-heavy endpoint load-test scenario.
 *
 * CLAUDE.md budgets:
 *   API response (cloud) p99 < 200 ms
 *
 * These endpoints are query-intensive but do no writes or AI calls.
 * They represent the "read path" that sustains background polling and
 * the admin dashboard.
 *
 * Endpoints exercised:
 *   GET /v1/admin/stats        — aggregated email counts by status
 *   GET /v1/admin/messages     — recent messages across all accounts
 *   GET /v1/admin/users        — all users with account info
 *   GET /v1/messages           — paginated message list (list emails)
 *   GET /v1/analytics/heatmap  — inbox heatmap grid (A3 feature)
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL=https://api.alecrae.com \
 *     -e AUTH_TOKEN=<admin_bearer_token> \
 *     load-tests/scenarios/read-heavy.js
 *
 * AUTH_TOKEN must belong to a user with admin scope for the /v1/admin/*
 * endpoints.  For non-admin testing supply a regular token and set
 * SKIP_ADMIN=1 to skip those scenarios.
 */

import { sleep } from "k6";
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { baseUrl, authToken, authHeaders, parseJson } from "../lib/helpers.js";
import { readHeavyThresholds } from "../lib/thresholds.js";

const readErrors = new Counter("read_heavy_errors");

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    /**
     * admin_stats: the most aggregate-heavy query — SUM across every email
     * row in the DB.  Run at moderate VUs; this is a dashboard endpoint,
     * not an inbox endpoint.
     */
    admin_stats: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m",  target: 30 },
        { duration: "1m",  target: 50 },
        { duration: "30s", target: 0  },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "admin_stats" },
      exec: "adminStats",
    },
    /**
     * admin_messages: paginated query across all accounts.
     */
    admin_messages: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m",  target: 25 },
        { duration: "30s", target: 0  },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "admin_messages" },
      exec: "adminMessages",
      startTime: "15s",
    },
    /**
     * list_emails: per-account list — the same path the web inbox hits.
     * Higher concurrency because each request is scoped to one account.
     */
    list_emails: {
      executor: "constant-vus",
      vus: 50,
      duration: "3m",
      tags: { scenario: "list_emails" },
      exec: "listEmails",
      startTime: "10s",
    },
    /**
     * heatmap: inbox activity heatmap — DB scan over events table.
     */
    heatmap: {
      executor: "constant-vus",
      vus: 10,
      duration: "2m",
      tags: { scenario: "heatmap" },
      exec: "heatmap",
      startTime: "20s",
    },
  },
  thresholds: readHeavyThresholds,
};

// ─── Scenario functions ───────────────────────────────────────────────────────

export function adminStats() {
  if (__ENV.SKIP_ADMIN === "1") { sleep(1); return; }

  const token = authToken();
  const url = `${baseUrl()}/v1/admin/stats`;

  const res = http.get(url, {
    headers: authHeaders(token),
    tags: { name: "admin_stats" },
  });

  const ok = check(res, {
    "admin_stats status 200 or 403": (r) => r.status === 200 || r.status === 403,
    "admin_stats body present": (r) => r.body && r.body.length > 0,
    "admin_stats JSON": (r) => parseJson(r) !== null,
  });

  if (!ok) readErrors.add(1);

  sleep(Math.random() * 2 + 1);
}

export function adminMessages() {
  if (__ENV.SKIP_ADMIN === "1") { sleep(1); return; }

  const token = authToken();
  const url = `${baseUrl()}/v1/admin/messages?limit=25`;

  const res = http.get(url, {
    headers: authHeaders(token),
    tags: { name: "admin_messages" },
  });

  const ok = check(res, {
    "admin_messages status 200 or 403": (r) => r.status === 200 || r.status === 403,
    "admin_messages body present": (r) => r.body && r.body.length > 0,
  });

  if (!ok) readErrors.add(1);

  sleep(Math.random() * 2 + 1.5);
}

export function listEmails() {
  const token = authToken();
  const limits = [10, 25, 50];
  const limit = limits[Math.floor(Math.random() * limits.length)];
  const url = `${baseUrl()}/v1/messages?limit=${limit}`;

  const res = http.get(url, {
    headers: authHeaders(token),
    tags: { name: "list_emails" },
  });

  const ok = check(res, {
    "list_emails status 200": (r) => r.status === 200,
    "list_emails data present": (r) => {
      const body = parseJson(r);
      return body?.data !== undefined;
    },
  });

  if (!ok) readErrors.add(1);

  sleep(Math.random() * 1.5 + 0.5);
}

export function heatmap() {
  const token = authToken();

  // Heatmap supports a ?period= query param (e.g. 30d, 90d)
  const periods = ["30d", "90d", "7d"];
  const period = periods[Math.floor(Math.random() * periods.length)];
  const url = `${baseUrl()}/v1/analytics/heatmap?period=${period}`;

  const res = http.get(url, {
    headers: authHeaders(token),
    tags: { name: "heatmap" },
  });

  check(res, {
    "heatmap not 5xx": (r) => r.status < 500,
    "heatmap body present": (r) => r.body && r.body.length > 0,
  });

  sleep(Math.random() * 3 + 2);
}
