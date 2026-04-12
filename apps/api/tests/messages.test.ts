/**
 * Integration tests for the messages API routes.
 * Tests the request validation, response format, and error handling
 * without requiring actual database or Redis connections.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock the quota module — always allow
vi.mock("../src/lib/quota.js", () => ({
  checkQuota: vi.fn().mockResolvedValue({
    allowed: true,
    plan: "professional",
    limit: 100_000,
    sent: 0,
    resetsAt: "2026-05-01T00:00:00.000Z",
  }),
  incrementQuota: vi.fn().mockResolvedValue(undefined),
}));

// Track which table the mock DB is querying
let currentTable: string | null = null;

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockImplementation(function (this: typeof mockDb, table: unknown) {
    if (table && typeof table === "object" && "reason" in (table as Record<string, unknown>)) {
      currentTable = "suppressionLists";
    } else if (table && typeof table === "object" && "domain" in (table as Record<string, unknown>)) {
      currentTable = "domains";
    } else {
      currentTable = "other";
    }
    return this;
  }),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => {
    if (currentTable === "domains") {
      return Promise.resolve([
        { id: "domain_1", dkimSelector: "default", verificationStatus: "verified", isActive: true },
      ]);
    }
    if (currentTable === "suppressionLists") {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue(undefined),
  orderBy: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        catch: vi.fn(),
      }),
    }),
  }),
  set: vi.fn().mockReturnThis(),
};

// Mock the database module
vi.mock("@emailed/db", () => ({
  getDatabase: () => mockDb,
  emails: { id: "id", accountId: "account_id", status: "status" },
  deliveryResults: { id: "id", emailId: "email_id" },
  domains: {
    id: "id",
    domain: "domain",
    accountId: "account_id",
    dkimSelector: "dkim_selector",
    verificationStatus: "verification_status",
    isActive: "is_active",
  },
  accounts: { id: "id", emailsSentThisPeriod: "emails_sent_this_period", updatedAt: "updated_at" },
  suppressionLists: { email: "email", domainId: "domain_id", reason: "reason" },
}));

// Mock BullMQ
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "job_1" }),
    close: vi.fn(),
  })),
}));

// Mock reputation module
vi.mock("@emailed/reputation", () => ({
  getWarmupOrchestrator: () => ({
    ensureWarmupAndCheck: vi.fn().mockResolvedValue({ allowed: true }),
    recordSend: vi.fn().mockResolvedValue(undefined),
  }),
  WARMUP_LIMIT_EXCEEDED: "WARMUP_LIMIT_EXCEEDED",
}));

// Mock MTA header validation
vi.mock("@emailed/mta/lib", () => ({
  validateCustomHeaders: vi.fn().mockReturnValue({ ok: true, sanitized: {} }),
  HEADER_INJECTION_REJECTED: "HEADER_INJECTION_REJECTED",
}));

// Mock shared module
vi.mock("@emailed/shared", () => ({
  indexEmail: vi.fn().mockResolvedValue(undefined),
  searchEmails: vi.fn().mockResolvedValue({ hits: [], totalHits: 0, processingTimeMs: 0, query: "" }),
}));

describe("POST /v1/messages/send", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentTable = null;

    // Re-setup mock db chain
    mockDb.select.mockReturnThis();
    mockDb.from.mockImplementation(function (this: typeof mockDb, table: unknown) {
      if (table && typeof table === "object" && "reason" in (table as Record<string, unknown>)) {
        currentTable = "suppressionLists";
      } else if (table && typeof table === "object" && "domain" in (table as Record<string, unknown>)) {
        currentTable = "domains";
      } else {
        currentTable = "other";
      }
      return this;
    });
    mockDb.where.mockReturnThis();
    mockDb.limit.mockImplementation(() => {
      if (currentTable === "domains") {
        return Promise.resolve([
          { id: "domain_1", dkimSelector: "default", verificationStatus: "verified", isActive: true },
        ]);
      }
      if (currentTable === "suppressionLists") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue(undefined);
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          catch: vi.fn(),
        }),
      }),
    });

    // Create a test app with auth mock
    app = new Hono();

    // Mock auth middleware
    app.use("*", async (c, next) => {
      c.set("auth" as never, {
        accountId: "acct_test_123",
        keyId: "key_test_123",
        tier: "pro",
        scopes: ["messages:send", "messages:read"],
      } as never);
      await next();
    });

    // Import and mount messages routes
    const { messages } = await import("../src/routes/messages.js");
    app.route("/v1/messages", messages);
  });

  it("should accept a valid send request", async () => {
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com", name: "Test Sender" },
        to: [{ email: "recipient@example.com" }],
        subject: "Test email",
        text: "Hello world",
      }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("messageId");
    expect(body.status).toBe("queued");
  });

  it("should reject request without body content", async () => {
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        subject: "Test email",
        // No text or html
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.type).toBe("validation_error");
  });

  it("should reject request without recipients", async () => {
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com" },
        to: [],
        subject: "Test email",
        text: "Hello",
      }),
    });

    expect(res.status).toBe(422);
  });

  it("should reject invalid email addresses", async () => {
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "not-an-email" },
        to: [{ email: "recipient@example.com" }],
        subject: "Test",
        text: "Hello",
      }),
    });

    expect(res.status).toBe(422);
  });

  it("should accept HTML-only emails", async () => {
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        subject: "HTML Test",
        html: "<h1>Hello</h1>",
      }),
    });

    expect(res.status).toBe(202);
  });

  it("should accept multipart emails with both text and html", async () => {
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        subject: "Multipart Test",
        text: "Hello",
        html: "<h1>Hello</h1>",
      }),
    });

    expect(res.status).toBe(202);
  });

  it("should accept scheduled sends", async () => {
    const futureDate = new Date(Date.now() + 3600_000).toISOString();

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        subject: "Scheduled Test",
        text: "Hello from the future",
        scheduledAt: futureDate,
      }),
    });

    expect(res.status).toBe(202);
  });

  it("should accept messages with tags", async () => {
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        subject: "Tagged Test",
        text: "Hello",
        tags: ["welcome", "onboarding"],
      }),
    });

    expect(res.status).toBe(202);
  });
});

describe("POST /v1/messages (alias)", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentTable = null;

    mockDb.select.mockReturnThis();
    mockDb.from.mockImplementation(function (this: typeof mockDb, table: unknown) {
      if (table && typeof table === "object" && "reason" in (table as Record<string, unknown>)) {
        currentTable = "suppressionLists";
      } else if (table && typeof table === "object" && "domain" in (table as Record<string, unknown>)) {
        currentTable = "domains";
      } else {
        currentTable = "other";
      }
      return this;
    });
    mockDb.where.mockReturnThis();
    mockDb.limit.mockImplementation(() => {
      if (currentTable === "domains") {
        return Promise.resolve([
          { id: "domain_1", dkimSelector: "default", verificationStatus: "verified", isActive: true },
        ]);
      }
      if (currentTable === "suppressionLists") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue(undefined);
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          catch: vi.fn(),
        }),
      }),
    });

    app = new Hono();
    app.use("*", async (c, next) => {
      c.set("auth" as never, {
        accountId: "acct_test_123",
        keyId: "key_test_123",
        tier: "pro",
        scopes: ["messages:send", "messages:read"],
      } as never);
      await next();
    });

    const { messages } = await import("../src/routes/messages.js");
    app.route("/v1/messages", messages);
  });

  it("should work identically to /send", async () => {
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        subject: "Alias test",
        text: "Hello via alias",
      }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("queued");
  });
});
