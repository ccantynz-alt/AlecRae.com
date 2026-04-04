/**
 * End-to-end integration tests for authentication and authorization.
 *
 * Tests cover:
 *   - Valid API key authentication (dev mode)
 *   - Invalid API key
 *   - Missing credentials
 *   - Wrong scope enforcement
 *   - Bearer token auth
 *   - X-API-Key header support
 */

import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { jsonRequest, DEFAULT_AUTH } from "./setup.js";

// We need to test the real auth middleware, but the setup.ts mocks
// are module-level. For auth tests, we build apps that use the real
// auth middleware (which falls back to dev mode when no DATABASE_URL).

// Since setup.ts does not mock the auth middleware itself, we can
// import it directly.
import { authMiddleware, requireScope } from "../src/middleware/auth.js";

function buildAuthApp() {
  const app = new Hono();

  // Use the real auth middleware
  app.use("/v1/*", authMiddleware);

  // Test endpoint with scope check
  app.get(
    "/v1/test",
    requireScope("messages:read"),
    (c) => {
      const auth = c.get("auth");
      return c.json({ ok: true, accountId: auth.accountId, scopes: auth.scopes });
    },
  );

  // Test endpoint requiring send scope
  app.post(
    "/v1/test/send",
    requireScope("messages:send"),
    (c) => {
      return c.json({ ok: true });
    },
  );

  // Test endpoint requiring multiple scopes
  app.post(
    "/v1/test/admin",
    requireScope("domains:manage", "webhooks:manage"),
    (c) => {
      return c.json({ ok: true });
    },
  );

  return app;
}

// ─── Valid API key ──────────────────────────────────────────────────────────

describe("Valid API key authentication", () => {
  it("should authenticate with X-API-Key header", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { "X-API-Key": "em_test_key_1234567890" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.accountId).toBeDefined();
    expect(body.scopes).toContain("messages:read");
  });

  it("should authenticate with Authorization: Bearer em_... header", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { Authorization: "Bearer em_test_key_1234567890" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("should authenticate with Authorization: em_... header (direct)", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { Authorization: "em_test_key_1234567890" },
    });

    expect(res.status).toBe(200);
  });
});

// ─── Invalid API key ────────────────────────────────────────────────────────

describe("Invalid API key", () => {
  it("should reject API key that is too short", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { "X-API-Key": "em_short" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("should reject API key without em_ prefix", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { "X-API-Key": "wrong_prefix_key_1234567890" },
    });

    // Without em_ prefix, it's treated as invalid
    expect(res.status).toBe(401);
  });
});

// ─── Missing credentials ───────────────────────────────────────────────────

describe("Missing credentials", () => {
  it("should return 401 with no auth headers", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("missing_credentials");
    expect(body.error.message).toContain("Missing API key");
  });

  it("should return 401 with empty Authorization header", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { Authorization: "" },
    });

    expect(res.status).toBe(401);
  });
});

// ─── Scope enforcement ──────────────────────────────────────────────────────

describe("Scope enforcement", () => {
  it("should allow access when scope matches", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { "X-API-Key": "em_test_key_1234567890" },
    });

    expect(res.status).toBe(200);
  });

  it("should allow POST when send scope is present", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test/send", {
      method: "POST",
      headers: {
        "X-API-Key": "em_test_key_1234567890",
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(200);
  });

  it("should enforce multiple required scopes", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test/admin", {
      method: "POST",
      headers: {
        "X-API-Key": "em_test_key_1234567890",
        "Content-Type": "application/json",
      },
    });

    // Dev mode gives all scopes, so this should pass
    expect(res.status).toBe(200);
  });

  it("should return 403 when scope is missing (via injected auth)", async () => {
    // Build a custom app with limited scopes
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("auth" as never, {
        accountId: "acct_limited",
        keyId: "key_limited",
        tier: "free",
        scopes: ["messages:read"], // Only read scope
      } as never);
      await next();
    });
    app.post(
      "/v1/send",
      requireScope("messages:send"),
      (c) => c.json({ ok: true }),
    );

    const res = await app.request("/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("insufficient_scope");
    expect(body.error.message).toContain("messages:send");
  });
});

// ─── Bearer token (JWT) ────────────────────────────────────────────────────

describe("Bearer token authentication", () => {
  it("should authenticate with valid JWT-like bearer token", async () => {
    // Create a minimal JWT-like token (not cryptographically verified in dev)
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        sub: "acct_jwt_user",
        jti: "tok_123",
        tier: "pro",
        scope: "messages:read messages:send domains:manage webhooks:manage",
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      }),
    );
    const signature = btoa("fake-signature");
    const token = `${header}.${payload}.${signature}`;

    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accountId).toBe("acct_jwt_user");
  });

  it("should reject expired bearer token", async () => {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        sub: "acct_expired",
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        scope: "messages:read",
      }),
    );
    const signature = btoa("fake-signature");
    const token = `${header}.${payload}.${signature}`;

    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_token");
  });

  it("should reject malformed bearer token", async () => {
    const app = buildAuthApp();
    const res = await app.request("/v1/test", {
      headers: { Authorization: "Bearer not.a.valid-jwt" },
    });

    expect(res.status).toBe(401);
  });
});
