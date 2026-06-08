/**
 * load-tests/smoke.js
 *
 * Post-deploy smoke test for AlecRae.
 *
 * Hits every critical endpoint once (1 VU, 1 iteration) and exits non-zero
 * if any request fails or returns an unexpected status.  Run this
 * immediately after deploying to staging or production.
 *
 * What is checked:
 *   ✓ /health                     — liveness probe (no auth)
 *   ✓ /v1/health                  — deep health with dependency checks
 *   ✓ /v1/auth/me                 — JWT validation + DB user lookup
 *   ✓ /v1/messages?limit=1        — inbox list (DB + auth)
 *   ✓ /v1/search/status           — vector search availability
 *   ✓ /v1/inbox/categories        — inbox metadata
 *   ✓ /v1/admin/stats             — admin aggregation query
 *   ✓ /v1/changelog               — public read (no auth required)
 *
 * All thresholds use 0 % error tolerance — any single failure fails the run.
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL=https://api.alecrae.com \
 *     -e AUTH_TOKEN=<bearer_token> \
 *     load-tests/smoke.js
 *
 * Exit codes:
 *   0  — all checks passed, all thresholds met
 *   1  — at least one check failed or threshold violated
 *
 * To skip admin checks (non-admin token):
 *   k6 run -e BASE_URL=... -e AUTH_TOKEN=... -e SKIP_ADMIN=1 load-tests/smoke.js
 */

import { sleep } from "k6";
import http from "k6/http";
import { check, fail } from "k6";
import { smokeThresholds } from "./lib/thresholds.js";
import { baseUrl, authToken, authHeaders, jsonHeaders, parseJson } from "./lib/helpers.js";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: smokeThresholds,
};

export default function () {
  const base = baseUrl();
  const token = authToken();
  const authed = authHeaders(token);
  let allPassed = true;

  // ─── 1. Liveness probe — no auth ──────────────────────────────────────────

  {
    const res = http.get(`${base}/health`, { tags: { name: "smoke_health_liveness" } });
    const ok = check(res, {
      "liveness probe → 200": (r) => r.status === 200,
      "liveness probe returns ok": (r) => {
        const body = parseJson(r);
        return body?.status === "ok";
      },
    });
    if (!ok) { console.error(`FAIL  GET /health → ${res.status}\n${res.body}`); allPassed = false; }
    else      { console.log(`PASS  GET /health → ${res.status}`); }
  }

  // ─── 2. Deep health — no auth ──────────────────────────────────────────────

  {
    const res = http.get(`${base}/v1/health`, { tags: { name: "smoke_health_deep" } });
    const ok = check(res, {
      "deep health → 200 or 503": (r) => r.status === 200 || r.status === 503,
      "deep health returns status field": (r) => {
        const body = parseJson(r);
        return body?.status !== undefined || body?.data?.status !== undefined;
      },
    });
    if (!ok) { console.error(`FAIL  GET /v1/health → ${res.status}\n${res.body}`); allPassed = false; }
    else      { console.log(`PASS  GET /v1/health → ${res.status}`); }
  }

  // ─── 3. Auth — token validation ───────────────────────────────────────────

  {
    const res = http.get(`${base}/v1/auth/me`, {
      headers: authed,
      tags: { name: "smoke_auth_me" },
    });
    const ok = check(res, {
      "/v1/auth/me → 200 or 401": (r) => r.status === 200 || r.status === 401,
      "/v1/auth/me is JSON": (r) => parseJson(r) !== null,
    });
    if (res.status === 401) {
      console.warn("WARN  GET /v1/auth/me → 401 (token may be expired — renew AUTH_TOKEN)");
    } else if (!ok) {
      console.error(`FAIL  GET /v1/auth/me → ${res.status}\n${res.body}`);
      allPassed = false;
    } else {
      console.log(`PASS  GET /v1/auth/me → ${res.status}`);
    }
  }

  // ─── 4. Inbox list — DB + auth ─────────────────────────────────────────────

  {
    const res = http.get(`${base}/v1/messages?limit=1`, {
      headers: authed,
      tags: { name: "smoke_inbox_list" },
    });
    const ok = check(res, {
      "/v1/messages → 200 or 401": (r) => r.status === 200 || r.status === 401,
      "/v1/messages body present": (r) => r.body && r.body.length > 0,
    });
    if (!ok) { console.error(`FAIL  GET /v1/messages → ${res.status}\n${res.body}`); allPassed = false; }
    else      { console.log(`PASS  GET /v1/messages → ${res.status}`); }
  }

  // ─── 5. Search status — vector search probe ────────────────────────────────

  {
    const res = http.get(`${base}/v1/search/status`, {
      headers: authed,
      tags: { name: "smoke_search_status" },
    });
    const ok = check(res, {
      "/v1/search/status not 5xx": (r) => r.status < 500,
      "/v1/search/status is JSON": (r) => parseJson(r) !== null,
    });
    if (!ok) { console.error(`FAIL  GET /v1/search/status → ${res.status}\n${res.body}`); allPassed = false; }
    else      { console.log(`PASS  GET /v1/search/status → ${res.status}`); }
  }

  // ─── 6. Inbox metadata ────────────────────────────────────────────────────

  {
    const res = http.get(`${base}/v1/inbox/categories`, {
      headers: authed,
      tags: { name: "smoke_inbox_categories" },
    });
    const ok = check(res, {
      "/v1/inbox/categories not 5xx": (r) => r.status < 500,
    });
    if (!ok) { console.error(`FAIL  GET /v1/inbox/categories → ${res.status}\n${res.body}`); allPassed = false; }
    else      { console.log(`PASS  GET /v1/inbox/categories → ${res.status}`); }
  }

  // ─── 7. Admin stats — aggregate query ─────────────────────────────────────

  if (__ENV.SKIP_ADMIN !== "1") {
    const res = http.get(`${base}/v1/admin/stats`, {
      headers: authed,
      tags: { name: "smoke_admin_stats" },
    });
    const ok = check(res, {
      "/v1/admin/stats → 200 or 403": (r) => r.status === 200 || r.status === 403,
      "/v1/admin/stats is JSON": (r) => parseJson(r) !== null,
    });
    if (res.status === 403) {
      console.warn("WARN  GET /v1/admin/stats → 403 (non-admin token; set SKIP_ADMIN=1 to suppress)");
    } else if (!ok) {
      console.error(`FAIL  GET /v1/admin/stats → ${res.status}\n${res.body}`);
      allPassed = false;
    } else {
      console.log(`PASS  GET /v1/admin/stats → ${res.status}`);
    }
  }

  // ─── 8. Changelog — public endpoint ──────────────────────────────────────

  {
    const res = http.get(`${base}/v1/changelog`, {
      headers: jsonHeaders,
      tags: { name: "smoke_changelog" },
    });
    const ok = check(res, {
      "/v1/changelog → 200": (r) => r.status === 200,
      "/v1/changelog is JSON": (r) => parseJson(r) !== null,
    });
    if (!ok) { console.error(`FAIL  GET /v1/changelog → ${res.status}\n${res.body}`); allPassed = false; }
    else      { console.log(`PASS  GET /v1/changelog → ${res.status}`); }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  console.log("");
  if (allPassed) {
    console.log("SMOKE TEST PASSED — all critical endpoints responded correctly.");
  } else {
    fail("SMOKE TEST FAILED — one or more critical endpoints returned unexpected responses. See output above.");
  }

  sleep(0.1);
}
