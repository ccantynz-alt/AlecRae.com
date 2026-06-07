/**
 * load-tests/lib/helpers.js
 *
 * Shared utilities for all AlecRae k6 load-test scenarios.
 * No external dependencies — everything is from the k6 stdlib.
 */

import { check, fail } from "k6";
import http from "k6/http";

// ─── Environment ─────────────────────────────────────────────────────────────

/**
 * Return the resolved base URL (no trailing slash).
 * Override at runtime: k6 run -e BASE_URL=https://api.alecrae.com scenario.js
 */
export function baseUrl() {
  const raw = __ENV.BASE_URL || "http://localhost:3001";
  return raw.replace(/\/$/, "");
}

/**
 * Return a pre-issued Bearer token for authenticated scenarios.
 * Override at runtime: k6 run -e AUTH_TOKEN=ey... scenario.js
 *
 * NOTE: never hardcode a real token here — this is only a default
 * that deliberately fails so the caller is forced to supply one.
 */
export function authToken() {
  const t = __ENV.AUTH_TOKEN || "";
  if (!t) {
    fail(
      "AUTH_TOKEN env var is required. " +
        "Run: k6 run -e BASE_URL=<url> -e AUTH_TOKEN=<token> <scenario>.js"
    );
  }
  return t;
}

// ─── Request helpers ──────────────────────────────────────────────────────────

/** Common JSON headers for unauthenticated requests. */
export const jsonHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

/** JSON headers with Bearer token attached. */
export function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Perform a GET request and assert the response.
 *
 * @param {string}  url
 * @param {object}  params   k6 http params (headers, tags, etc.)
 * @param {number}  expectedStatus  defaults to 200
 * @returns {import("k6/http").RefinedResponse<"text">}
 */
export function getAndCheck(url, params, expectedStatus = 200) {
  const res = http.get(url, params);
  check(res, {
    [`GET ${url} → ${expectedStatus}`]: (r) => r.status === expectedStatus,
    "response body is not empty": (r) => r.body !== null && r.body.length > 0,
  });
  return res;
}

/**
 * Perform a POST request with a JSON body and assert the response.
 *
 * @param {string}  url
 * @param {object}  body
 * @param {object}  params   k6 http params (headers, tags, etc.)
 * @param {number}  expectedStatus  defaults to 200
 * @returns {import("k6/http").RefinedResponse<"text">}
 */
export function postAndCheck(url, body, params, expectedStatus = 200) {
  const res = http.post(url, JSON.stringify(body), params);
  check(res, {
    [`POST ${url} → ${expectedStatus}`]: (r) => r.status === expectedStatus,
    "response body is not empty": (r) => r.body !== null && r.body.length > 0,
  });
  return res;
}

/**
 * Parse a JSON response safely; return null if parsing fails so the
 * calling scenario can decide whether to abort.
 */
export function parseJson(res) {
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

/**
 * Lightweight UUID-style ID generator (no crypto dependency).
 * Good enough for unique fixture data inside tests.
 */
export function randomId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

/**
 * Pick a random element from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
