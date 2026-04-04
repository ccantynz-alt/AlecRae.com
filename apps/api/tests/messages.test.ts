/**
 * Integration tests for the messages API routes.
 * Tests the request validation, response format, and error handling
 * without requiring actual database or Redis connections.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock the database module
vi.mock("@emailed/db", () => ({
  getDatabase: () => mockDb,
  emails: { id: "id", accountId: "account_id", status: "status" },
  deliveryResults: { id: "id", emailId: "email_id" },
  domains: { id: "id", domain: "domain", accountId: "account_id", dkimSelector: "dkim_selector" },
}));

// Mock BullMQ
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "job_1" }),
    close: vi.fn(),
  })),
}));

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([{ id: "domain_1", dkimSelector: "default" }]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue(undefined),
  orderBy: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

describe("POST /v1/messages/send", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-set up the mock db chain after clear
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([{ id: "domain_1", dkimSelector: "default" }]);
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue(undefined);

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
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([{ id: "domain_1", dkimSelector: "default" }]);
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue(undefined);

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
