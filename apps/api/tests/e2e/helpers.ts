/**
 * E2E Test Helpers
 *
 * Shared utilities for integration tests that hit the live API via fetch().
 * Tests run against a real (or locally running) instance of the API server.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

export const BASE_URL =
  process.env["E2E_API_URL"] ?? "http://localhost:3001";

export const TEST_API_KEY =
  process.env["E2E_API_KEY"] ?? "em_test_e2e_key_1234567890abcdef";

// ─── Request helper ───────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * Generic helper to make HTTP requests to the API under test.
 * Returns the raw Response so tests can assert on status, headers, and body.
 */
export async function apiRequest(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const { body, headers = {}, query } = options;

  let url = `${BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }

  const fetchHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  if (body !== undefined) {
    fetchHeaders["Content-Type"] = "application/json";
  }

  return fetch(url, {
    method,
    headers: fetchHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Convenience: inject the test API key into headers via X-API-Key.
 */
export function withAuth(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { "X-API-Key": TEST_API_KEY, ...extra };
}

/**
 * Shorthand for an authenticated API request.
 */
export async function authRequest(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  return apiRequest(method, path, {
    ...options,
    headers: withAuth(options.headers),
  });
}

// ─── Session (bearer) auth ────────────────────────────────────────────────────
//
// API keys can only ever carry the eight permission-flag scopes
// (messages:send/read, domains:manage, api_keys:manage, webhooks:manage,
// analytics:read, account:manage, team:manage — see permissionsToScopes in
// apps/api/src/middleware/auth.ts). The templates routes require
// templates:read / templates:write, which only session JWTs carry
// (scopesForRole in apps/api/src/lib/jwt.ts) — so the templates suite must
// authenticate as a real user via POST /v1/auth/login. The user is created by
// apps/api/scripts/seed-e2e.ts.

export const E2E_USER_EMAIL =
  process.env["E2E_USER_EMAIL"] ?? "e2e-user@e2e-test.example.com";

export const E2E_USER_PASSWORD =
  process.env["E2E_USER_PASSWORD"] ?? "e2e-test-password-1234";

let sessionTokenPromise: Promise<string> | null = null;

/**
 * Log in once per test file (memoized) and return the session access token.
 * Throws with a pointed message if the seed user does not exist.
 */
export function getSessionToken(): Promise<string> {
  sessionTokenPromise ??= (async () => {
    const res = await apiRequest("POST", "/v1/auth/login", {
      body: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD },
    });
    if (res.status !== 200) {
      const text = await res.text();
      throw new Error(
        `E2E login failed (HTTP ${res.status}): ${text} — ` +
          "did apps/api/scripts/seed-e2e.ts run against this API's database?",
      );
    }
    const body = (await res.json()) as { data: { token: string } };
    return body.data.token;
  })();
  return sessionTokenPromise;
}

/**
 * Authenticated request using a session bearer token instead of an API key.
 * Needed for surfaces (templates) whose scopes API keys cannot carry.
 */
export async function sessionAuthRequest(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const token = await getSessionToken();
  return apiRequest(method, path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}

// ─── Test data constants ──────────────────────────────────────────────────────

export const TEST_DOMAIN = "e2e-test.example.com";

export const TEST_SEND_PAYLOAD = {
  from: { email: `sender@${TEST_DOMAIN}`, name: "E2E Sender" },
  to: [{ email: "recipient@example.com", name: "E2E Recipient" }],
  subject: "E2E test email",
  text: "This is an end-to-end test email.",
  html: "<p>This is an <b>end-to-end</b> test email.</p>",
  tags: ["e2e", "test"],
};

export const TEST_TEMPLATE = {
  name: "E2E Welcome Template",
  subject: "Welcome, {{name}}!",
  htmlBody: "<h1>Hello {{name}}</h1><p>Welcome to {{company}}.</p>",
  textBody: "Hello {{name}}, welcome to {{company}}.",
  metadata: { category: "onboarding" },
};

export const TEST_WEBHOOK = {
  url: "https://webhook.e2e-test.example.com/events",
  // Dotted names — the API's WebhookEventType enum mirrors the DB's
  // email_event_type enum ("email.delivered", not "delivered"); bare names
  // were the pre-issue-#70 convention and now fail validation with 422.
  events: ["email.delivered", "email.bounced"] as const,
  description: "E2E test webhook",
  active: true,
};

export const TEST_SUPPRESSION = {
  email: "suppressed@example.com",
  domain: TEST_DOMAIN,
  reason: "manual" as const,
};

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Parse JSON body from a Response. Throws if parsing fails.
 */
export async function jsonBody<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Assert that a response is an API error with the expected shape.
 */
export interface ApiError {
  error: {
    type: string;
    message: string;
    code: string;
  };
}

/**
 * Generate a unique string for test isolation (e.g., domain names).
 */
export function uniqueId(): string {
  return Math.random().toString(36).slice(2, 10);
}
