/**
 * Tests for hard quota enforcement in the send pipeline.
 *
 * Verifies that:
 *  - Quota check blocks sends when the monthly limit is reached
 *  - Quota check allows sends when under limit
 *  - Correct error shape is returned on 429 responses
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ─────────────────────────────────────────────────────────────────

// Mock the quota module
vi.mock("../src/lib/quota.js", () => ({
  checkQuota: vi.fn(),
  incrementQuota: vi.fn().mockResolvedValue(undefined),
}));

// Track which table the mock DB is querying
let currentTable: string | null = null;

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockImplementation(function (this: typeof mockDb, table: unknown) {
    // Track which table is being queried for intelligent response routing
    if (table && typeof table === "object" && "domain" in (table as Record<string, unknown>)) {
      // Check if this looks like suppressionLists (has 'email' and 'reason' fields)
      if ("reason" in (table as Record<string, unknown>)) {
        currentTable = "suppressionLists";
      } else {
        currentTable = "domains";
      }
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
      // Not suppressed
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

function validSendBody(): Record<string, unknown> {
  return {
    from: { email: "sender@example.com", name: "Test Sender" },
    to: [{ email: "recipient@example.com" }],
    subject: "Test email",
    text: "Hello world",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Hard quota enforcement at send time", () => {
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

  it("should return 429 when quota is exceeded", async () => {
    const { checkQuota } = await import("../src/lib/quota.js");
    vi.mocked(checkQuota).mockResolvedValue({
      allowed: false,
      plan: "starter",
      limit: 10_000,
      sent: 10_000,
      resetsAt: "2026-05-01T00:00:00.000Z",
    });

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSendBody()),
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("QUOTA_EXCEEDED");
    expect(body.plan).toBe("starter");
    expect(body.limit).toBe(10_000);
    expect(body.sent).toBe(10_000);
    expect(body.resetsAt).toBe("2026-05-01T00:00:00.000Z");
  });

  it("should allow sends when under quota", async () => {
    const { checkQuota } = await import("../src/lib/quota.js");
    vi.mocked(checkQuota).mockResolvedValue({
      allowed: true,
      plan: "starter",
      limit: 10_000,
      sent: 5_000,
      resetsAt: "2026-05-01T00:00:00.000Z",
    });

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSendBody()),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("queued");
  });

  it("should include upgrade path information in quota error", async () => {
    const { checkQuota } = await import("../src/lib/quota.js");
    vi.mocked(checkQuota).mockResolvedValue({
      allowed: false,
      plan: "free",
      limit: 1_000,
      sent: 1_000,
      resetsAt: "2026-05-01T00:00:00.000Z",
    });

    const res = await app.request("/v1/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSendBody()),
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("QUOTA_EXCEEDED");
    expect(body.message).toContain("1000/1000");
    expect(body.message).toContain("Upgrade your plan");
  });
});
