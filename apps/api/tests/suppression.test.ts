/**
 * Tests for suppression list enforcement in the send pipeline.
 *
 * Verifies that:
 *  - Suppressed recipients are rejected before enqueue
 *  - The correct error shape and reason are returned
 *  - Non-suppressed recipients pass through
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ─────────────────────────────────────────────────────────────────

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

// Track which table the mock DB is querying + suppression result
let currentTable: string | null = null;
let suppressionResult: Array<{ email: string; reason: string }> = [];

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
      return Promise.resolve(suppressionResult);
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
vi.mock("@alecrae/db", () => ({
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
vi.mock("@alecrae/reputation", () => ({
  getWarmupOrchestrator: () => ({
    ensureWarmupAndCheck: vi.fn().mockResolvedValue({ allowed: true }),
    recordSend: vi.fn().mockResolvedValue(undefined),
  }),
  WARMUP_LIMIT_EXCEEDED: "WARMUP_LIMIT_EXCEEDED",
}));

// Mock MTA header validation
vi.mock("@alecrae/mta/lib", () => ({
  validateCustomHeaders: vi.fn().mockReturnValue({ ok: true, sanitized: {} }),
  HEADER_INJECTION_REJECTED: "HEADER_INJECTION_REJECTED",
}));

// Mock shared module
vi.mock("@alecrae/shared", () => ({
  indexEmail: vi.fn().mockResolvedValue(undefined),
  searchEmails: vi.fn().mockResolvedValue({ hits: [], totalHits: 0, processingTimeMs: 0, query: "" }),
}));

// ── Test helpers ──────────────────────────────────────────────────────────

function validSendBody(
  toEmail = "recipient@example.com",
): Record<string, unknown> {
  return {
    from: { email: "sender@example.com", name: "Test Sender" },
    to: [{ email: toEmail }],
    subject: "Test email",
    text: "Hello world",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Suppression list enforcement at send time", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentTable = null;
    suppressionResult = [];

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
        return Promise.resolve(suppressionResult);
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

    const { messages } = await import("../src/routes/messages.js");
    app.route("/v1/messages", messages);
  });

  it("should reject sends to a hard-bounced address", async () => {
    suppressionResult = [{ email: "bounced@example.com", reason: "bounce" }];

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSendBody("bounced@example.com")),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("RECIPIENT_SUPPRESSED");
    expect(body.reason).toBe("hard_bounce");
    expect(body.address).toBe("bounced@example.com");
  });

  it("should reject sends to a complained address", async () => {
    suppressionResult = [{ email: "complained@example.com", reason: "complaint" }];

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSendBody("complained@example.com")),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("RECIPIENT_SUPPRESSED");
    expect(body.reason).toBe("complaint");
  });

  it("should reject sends to an unsubscribed address", async () => {
    suppressionResult = [{ email: "unsub@example.com", reason: "unsubscribe" }];

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSendBody("unsub@example.com")),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("RECIPIENT_SUPPRESSED");
    expect(body.reason).toBe("manual_unsubscribe");
  });

  it("should allow sends to non-suppressed addresses", async () => {
    suppressionResult = [];

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSendBody("good@example.com")),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("queued");
  });
});
