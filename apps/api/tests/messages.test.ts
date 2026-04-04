/**
 * End-to-end integration tests for the Messages API routes.
 *
 * Tests cover:
 *   POST /v1/messages/send  — send email (valid, missing fields, invalid domain)
 *   POST /v1/messages       — alias for /send
 *   GET  /v1/messages       — list with pagination
 *   GET  /v1/messages/:id   — get single message
 *   GET  /v1/messages/search — search by query
 */

import { describe, it, expect } from "vitest";
import {
  createTestApp,
  jsonRequest,
  mockQuery,
  DEFAULT_AUTH,
} from "./setup.js";
import { messages } from "../src/routes/messages.js";

function buildApp(auth = DEFAULT_AUTH) {
  const app = createTestApp(auth);
  app.route("/v1/messages", messages);
  return app;
}

// ─── POST /v1/messages/send ──────────────────────────────────────────────────

describe("POST /v1/messages/send", () => {
  it("should accept a valid send request and return 202", async () => {
    // Query 1: domain lookup
    mockQuery([{ id: "dom_1", dkimSelector: "emailed1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com", name: "Sender" },
        to: [{ email: "recipient@test.com" }],
        subject: "Hello",
        text: "Hello world",
      },
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("messageId");
    expect(body.status).toBe("queued");
  });

  it("should accept HTML-only emails", async () => {
    mockQuery([{ id: "dom_1", dkimSelector: "emailed1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@test.com" }],
        subject: "HTML Test",
        html: "<h1>Hello</h1>",
      },
    });

    expect(res.status).toBe(202);
  });

  it("should accept multipart (text + html) emails", async () => {
    mockQuery([{ id: "dom_1", dkimSelector: "emailed1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@test.com" }],
        subject: "Multipart",
        text: "Hello",
        html: "<p>Hello</p>",
      },
    });

    expect(res.status).toBe(202);
  });

  it("should reject when neither text nor html is provided", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@test.com" }],
        subject: "No body",
      },
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.type).toBe("validation_error");
  });

  it("should reject when recipients array is empty", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [],
        subject: "Empty recipients",
        text: "Hello",
      },
    });

    expect(res.status).toBe(422);
  });

  it("should reject invalid from email address", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "not-an-email" },
        to: [{ email: "recipient@test.com" }],
        subject: "Bad from",
        text: "Hello",
      },
    });

    expect(res.status).toBe(422);
  });

  it("should reject when missing subject", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@test.com" }],
        text: "Hello",
      },
    });

    expect(res.status).toBe(422);
  });

  it("should return 422 when sender domain is not registered", async () => {
    mockQuery([]); // domain lookup returns nothing

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@unregistered.com" },
        to: [{ email: "recipient@test.com" }],
        subject: "Unknown domain",
        text: "Hello",
      },
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("domain_not_found");
  });

  it("should accept scheduled sends with future date", async () => {
    mockQuery([{ id: "dom_1", dkimSelector: "emailed1" }]);

    const app = buildApp();
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@test.com" }],
        subject: "Scheduled",
        text: "Future message",
        scheduledAt: futureDate,
      },
    });

    expect(res.status).toBe(202);
  });

  it("should accept messages with tags", async () => {
    mockQuery([{ id: "dom_1", dkimSelector: "emailed1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@test.com" }],
        subject: "Tagged",
        text: "Hello",
        tags: ["welcome", "onboarding"],
      },
    });

    expect(res.status).toBe(202);
  });

  it("should reject invalid JSON body", async () => {
    const app = buildApp();
    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_json");
  });
});

// ─── POST /v1/messages (alias) ──────────────────────────────────────────────

describe("POST /v1/messages (alias for /send)", () => {
  it("should work identically to /send", async () => {
    mockQuery([{ id: "dom_1", dkimSelector: "emailed1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@test.com" }],
        subject: "Alias test",
        text: "Hello via alias",
      },
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("queued");
  });
});

// ─── GET /v1/messages ────────────────────────────────────────────────────────

describe("GET /v1/messages", () => {
  it("should return an empty list when no messages exist", async () => {
    mockQuery([]); // no messages

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.hasMore).toBe(false);
    expect(body.cursor).toBeNull();
  });

  it("should return paginated message list", async () => {
    const now = new Date();
    mockQuery([
      {
        id: "msg_1",
        messageId: "<msg1@example.com>",
        fromAddress: "sender@example.com",
        fromName: "Sender",
        toAddresses: [{ address: "rcpt@test.com" }],
        ccAddresses: null,
        subject: "Test 1",
        textBody: "Hello 1",
        htmlBody: null,
        status: "delivered",
        tags: [],
        createdAt: now,
        updatedAt: now,
        sentAt: now,
      },
      {
        id: "msg_2",
        messageId: "<msg2@example.com>",
        fromAddress: "sender@example.com",
        fromName: null,
        toAddresses: [{ address: "rcpt2@test.com" }],
        ccAddresses: null,
        subject: "Test 2",
        textBody: "Hello 2",
        htmlBody: null,
        status: "queued",
        tags: ["welcome"],
        createdAt: now,
        updatedAt: now,
        sentAt: null,
      },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages", {
      query: { limit: "10" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe("msg_1");
    expect(body.data[0].from.email).toBe("sender@example.com");
    expect(body.hasMore).toBe(false);
  });

  it("should support status filter", async () => {
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages", {
      query: { status: "bounced" },
    });

    expect(res.status).toBe(200);
  });
});

// ─── GET /v1/messages/:id ───────────────────────────────────────────────────

describe("GET /v1/messages/:id", () => {
  it("should return a single message with delivery results", async () => {
    const now = new Date();

    // Query 1: email record
    mockQuery([
      {
        id: "msg_1",
        messageId: "<msg1@example.com>",
        fromAddress: "sender@example.com",
        fromName: "Sender",
        toAddresses: [{ address: "rcpt@test.com", name: "Recipient" }],
        ccAddresses: null,
        subject: "Test message",
        textBody: "Hello",
        htmlBody: null,
        status: "delivered",
        tags: ["tag1"],
        createdAt: now,
        updatedAt: now,
        sentAt: now,
      },
    ]);
    // Query 2: delivery results
    mockQuery([
      {
        recipientAddress: "rcpt@test.com",
        status: "delivered",
        mxHost: "mx.test.com",
        remoteResponseCode: "250",
        remoteResponse: "OK",
        attemptCount: 1,
        deliveredAt: now,
        nextRetryAt: null,
      },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/msg_1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("msg_1");
    expect(body.data.subject).toBe("Test message");
    expect(body.data.from.email).toBe("sender@example.com");
    expect(body.data.deliveryResults).toHaveLength(1);
    expect(body.data.deliveryResults[0].status).toBe("delivered");
  });

  it("should return 404 for non-existent message", async () => {
    mockQuery([]); // no email found

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("message_not_found");
  });
});

// ─── GET /v1/messages/search ────────────────────────────────────────────────

describe("GET /v1/messages/search", () => {
  it("should return search results from Meilisearch", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/search", {
      query: { q: "hello" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("totalHits");
    expect(body).toHaveProperty("query");
  });

  it("should reject empty query parameter", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/search", {
      query: { q: "" },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("missing_query");
  });

  it("should reject missing query parameter", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/messages/search");

    expect(res.status).toBe(400);
  });
});

// ─── Scope enforcement ──────────────────────────────────────────────────────

describe("Messages scope enforcement", () => {
  it("should reject send when missing messages:send scope", async () => {
    const app = buildApp({
      ...DEFAULT_AUTH,
      scopes: ["messages:read"],
    });

    const res = await jsonRequest(app, "/v1/messages/send", {
      method: "POST",
      body: {
        from: { email: "sender@example.com" },
        to: [{ email: "rcpt@test.com" }],
        subject: "Test",
        text: "Hello",
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("insufficient_scope");
  });

  it("should reject list when missing messages:read scope", async () => {
    const app = buildApp({
      ...DEFAULT_AUTH,
      scopes: ["messages:send"],
    });

    const res = await jsonRequest(app, "/v1/messages");

    expect(res.status).toBe(403);
  });
});
