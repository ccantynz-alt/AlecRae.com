/**
 * End-to-end integration tests for the Suppressions API routes.
 *
 * Tests cover:
 *   POST   /v1/suppressions        — add suppression (single or batch)
 *   POST   /v1/suppressions/check  — check if addresses are suppressed
 *   POST   /v1/suppressions/import — bulk import
 *   GET    /v1/suppressions        — list suppressions
 *   GET    /v1/suppressions/:id    — get single suppression
 *   DELETE /v1/suppressions/:id    — remove suppression
 */

import { describe, it, expect, vi } from "vitest";
import {
  createTestApp,
  jsonRequest,
  mockDb,
  DEFAULT_AUTH,
  TEST_ACCOUNT_ID,
} from "./setup.js";
import { suppressions } from "../src/routes/suppressions.js";

function buildApp(auth = DEFAULT_AUTH) {
  const app = createTestApp(auth);
  app.route("/v1/suppressions", suppressions);
  return app;
}

// ─── POST /v1/suppressions — Single add ─────────────────────────────────────

describe("POST /v1/suppressions (single)", () => {
  it("should add a single suppression and return 201", async () => {
    // Domain lookup
    mockDb.limit.mockResolvedValueOnce([
      { id: "dom_1", domain: "example.com" },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions", {
      method: "POST",
      body: {
        email: "bounce@test.com",
        domain: "example.com",
        reason: "bounce",
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe("bounce@test.com");
    expect(body.data[0].reason).toBe("bounce");
    expect(body.data[0].domain).toBe("example.com");
  });

  it("should default reason to manual", async () => {
    mockDb.limit.mockResolvedValueOnce([
      { id: "dom_1", domain: "example.com" },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions", {
      method: "POST",
      body: {
        email: "manual@test.com",
        domain: "example.com",
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data[0].reason).toBe("manual");
  });

  it("should reject invalid email", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions", {
      method: "POST",
      body: {
        email: "not-an-email",
        domain: "example.com",
        reason: "bounce",
      },
    });

    expect(res.status).toBe(422);
  });

  it("should reject when domain not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]); // No domain found

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions", {
      method: "POST",
      body: {
        email: "test@test.com",
        domain: "unknown.com",
        reason: "bounce",
      },
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("domain_not_found");
  });
});

// ─── POST /v1/suppressions — Batch add ──────────────────────────────────────

describe("POST /v1/suppressions (batch)", () => {
  it("should add multiple suppressions in batch", async () => {
    // Domain lookup
    mockDb.limit.mockResolvedValueOnce([
      { id: "dom_1", domain: "example.com" },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions", {
      method: "POST",
      body: {
        suppressions: [
          { email: "a@test.com", domain: "example.com", reason: "bounce" },
          { email: "b@test.com", domain: "example.com", reason: "complaint" },
          { email: "c@test.com", domain: "example.com", reason: "unsubscribe" },
        ],
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.data[0].email).toBe("a@test.com");
    expect(body.data[1].email).toBe("b@test.com");
    expect(body.data[2].email).toBe("c@test.com");
  });
});

// ─── POST /v1/suppressions/check ────────────────────────────────────────────

describe("POST /v1/suppressions/check", () => {
  it("should check which addresses are suppressed", async () => {
    const now = new Date();
    // Domain lookup
    mockDb.limit.mockResolvedValueOnce([
      { id: "dom_1", domain: "example.com" },
    ]);
    // Suppression query result
    mockDb.where.mockResolvedValueOnce([
      {
        email: "bounced@test.com",
        reason: "bounce",
        createdAt: now,
      },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/check", {
      method: "POST",
      body: {
        emails: ["bounced@test.com", "clean@test.com"],
        domain: "example.com",
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].email).toBe("bounced@test.com");
    expect(body.data[0].suppressed).toBe(true);
    expect(body.data[0].reason).toBe("bounce");
    expect(body.data[1].email).toBe("clean@test.com");
    expect(body.data[1].suppressed).toBe(false);
    expect(body.data[1].reason).toBeNull();
  });

  it("should reject when domain not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]); // No domain

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/check", {
      method: "POST",
      body: {
        emails: ["test@test.com"],
        domain: "unknown.com",
      },
    });

    expect(res.status).toBe(422);
  });

  it("should reject empty emails array", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/check", {
      method: "POST",
      body: {
        emails: [],
        domain: "example.com",
      },
    });

    expect(res.status).toBe(422);
  });
});

// ─── POST /v1/suppressions/import ───────────────────────────────────────────

describe("POST /v1/suppressions/import", () => {
  it("should bulk import suppressions", async () => {
    // Domain lookup
    mockDb.limit.mockResolvedValueOnce([
      { id: "dom_1", domain: "example.com" },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/import", {
      method: "POST",
      body: {
        domain: "example.com",
        reason: "bounce",
        entries: [
          { email: "a@test.com" },
          { email: "b@test.com" },
          { email: "c@test.com", reason: "complaint" },
        ],
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.requested).toBe(3);
    expect(body.data.imported).toBe(3);
    expect(body.data.domain).toBe("example.com");
    expect(body.data.reason).toBe("bounce");
  });

  it("should reject when domain not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/import", {
      method: "POST",
      body: {
        domain: "unknown.com",
        reason: "manual",
        entries: [{ email: "test@test.com" }],
      },
    });

    expect(res.status).toBe(422);
  });

  it("should reject empty entries", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/import", {
      method: "POST",
      body: {
        domain: "example.com",
        reason: "bounce",
        entries: [],
      },
    });

    expect(res.status).toBe(422);
  });
});

// ─── GET /v1/suppressions ───────────────────────────────────────────────────

describe("GET /v1/suppressions", () => {
  it("should return empty list when no domains exist", async () => {
    // getAccountDomains returns no domains
    mockDb.where.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it("should return paginated suppression list", async () => {
    const now = new Date();
    // getAccountDomains
    mockDb.where.mockResolvedValueOnce([
      { id: "dom_1", domain: "example.com" },
    ]);
    // Suppression rows (query returns from .limit)
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "sup_1",
        email: "bounced@test.com",
        domainId: "dom_1",
        reason: "bounce",
        createdAt: now,
      },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe("bounced@test.com");
    expect(body.data[0].domain).toBe("example.com");
  });
});

// ─── GET /v1/suppressions/:id ───────────────────────────────────────────────

describe("GET /v1/suppressions/:id", () => {
  it("should return a single suppression", async () => {
    const now = new Date();
    // Suppression record
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "sup_1",
        email: "bounced@test.com",
        domainId: "dom_1",
        reason: "bounce",
        createdAt: now,
      },
    ]);
    // Domain ownership check
    mockDb.limit.mockResolvedValueOnce([
      { id: "dom_1", domain: "example.com" },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/sup_1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("sup_1");
    expect(body.data.email).toBe("bounced@test.com");
    expect(body.data.domain).toBe("example.com");
  });

  it("should return 404 for non-existent suppression", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("suppression_not_found");
  });

  it("should return 404 when suppression belongs to another account", async () => {
    const now = new Date();
    // Suppression exists
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "sup_1",
        email: "bounced@test.com",
        domainId: "dom_other",
        reason: "bounce",
        createdAt: now,
      },
    ]);
    // But domain does not belong to this account
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/sup_1");

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /v1/suppressions/:id ────────────────────────────────────────────

describe("DELETE /v1/suppressions/:id", () => {
  it("should remove a suppression", async () => {
    // Suppression exists
    mockDb.limit.mockResolvedValueOnce([
      { id: "sup_1", domainId: "dom_1" },
    ]);
    // Domain ownership check
    mockDb.limit.mockResolvedValueOnce([{ id: "dom_1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/sup_1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.id).toBe("sup_1");
  });

  it("should return 404 when suppression does not exist", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/nonexistent", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });

  it("should return 404 when domain does not belong to account", async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ id: "sup_1", domainId: "dom_other" }])
      .mockResolvedValueOnce([]); // domain not owned

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/suppressions/sup_1", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });
});

// ─── Scope enforcement ──────────────────────────────────────────────────────

describe("Suppressions scope enforcement", () => {
  it("should reject when missing suppressions:manage scope", async () => {
    const app = buildApp({
      ...DEFAULT_AUTH,
      scopes: ["messages:send"],
    });

    const res = await jsonRequest(app, "/v1/suppressions");
    expect(res.status).toBe(403);
  });
});
