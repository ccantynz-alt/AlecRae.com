/**
 * Regression tests for the quota DB fallback.
 *
 * The bug: `getCountFromDb()` counts `events` rows of type `"email.queued"`,
 * but NOTHING in the codebase ever inserted one — the only reference to that
 * string anywhere was quota.ts's own SELECT. So whenever Redis was unavailable,
 * the fallback counted 0, `checkQuota()` returned `allowed: true`
 * unconditionally, and plan limits were silently unenforced. That path is not
 * exotic: `getRedis()` returns null until ioredis's async "ready" event lands,
 * so the first send after every API restart took it, and the box ran with no
 * Redis installed at all for weeks.
 *
 * The existing tests/quota.test.ts mocks the whole quota module, so it could
 * never catch this — it only ever asserted how the route reacts to a
 * `checkQuota` result someone else made up. These tests exercise quota.ts
 * itself with Redis forced unavailable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock state ───────────────────────────────────────────────────────────────

/** Every `eq(column, value)` the module under test builds, in order. */
const eqCalls: { column: unknown; value: unknown }[] = [];

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    eq: vi.fn((column: unknown, value: unknown) => {
      eqCalls.push({ column, value });
      return { __eq: [column, value] };
    }),
  };
});

let mockPlanTier = "free";
/** Rows the mocked `events` SELECT should report as already queued this month. */
let mockQueuedCount = 0;
/** Every `insert(events).values(...)` payload captured, in order. */
const insertedEvents: Record<string, unknown>[] = [];
/** Table identity of the most recent `.from()` call. */
let lastFrom: string | null = null;

vi.mock("@alecrae/db", () => {
  const accounts = { id: "id", planTier: "plan_tier", __table: "accounts" };
  const events = {
    id: "id",
    accountId: "account_id",
    emailId: "email_id",
    messageId: "message_id",
    type: "type",
    recipient: "recipient",
    timestamp: "timestamp",
    __table: "events",
  };

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation(function (this: unknown, table: { __table?: string }) {
      lastFrom = table?.__table ?? null;
      return this;
    }),
    where: vi.fn().mockImplementation(function (this: unknown) {
      // The accounts lookup ends in .limit(); the events count ends here.
      if (lastFrom === "events") return Promise.resolve([{ count: mockQueuedCount }]);
      return this;
    }),
    limit: vi.fn().mockImplementation(() => Promise.resolve([{ planTier: mockPlanTier }])),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
      insertedEvents.push(v);
      return Promise.resolve(undefined);
    }),
  };

  return { getDatabase: () => db, accounts, events };
});

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Point Redis at a closed port so getRedis() never becomes ready and every
  // call takes the DB fallback path — the exact scenario the bug hid in.
  process.env["REDIS_URL"] = "redis://127.0.0.1:1";
  mockPlanTier = "free";
  mockQueuedCount = 0;
  insertedEvents.length = 0;
  eqCalls.length = 0;
  lastFrom = null;
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env["REDIS_URL"];
});

describe("quota.ts — durable email.queued counter", () => {
  it("incrementQuota writes an email.queued event row", async () => {
    const { incrementQuota } = await import("../src/lib/quota.js");

    await incrementQuota("acct_1", {
      emailId: "em_1",
      messageId: "<abc@alecrae.com>",
      recipient: "to@example.com",
    });

    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]).toMatchObject({
      accountId: "acct_1",
      emailId: "em_1",
      messageId: "<abc@alecrae.com>",
      type: "email.queued",
      recipient: "to@example.com",
    });
    // Id must be present and follow the codebase's bare-32-hex convention.
    expect(insertedEvents[0]?.["id"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("writes the event row even with no provenance supplied", async () => {
    const { incrementQuota } = await import("../src/lib/quota.js");

    await incrementQuota("acct_1");

    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]).toMatchObject({
      accountId: "acct_1",
      type: "email.queued",
      emailId: null,
      messageId: null,
      recipient: null,
    });
  });

  /**
   * THE test for this bug. The defect was never "the SELECT is wrong" or "the
   * INSERT is wrong" in isolation — it was that the writer and the reader
   * disagreed, because there was no writer at all. Asserting the two sides
   * agree on the exact same event-type string is what stops the pair drifting
   * apart again (e.g. someone renaming the enum value on one side only).
   */
  it("writes exactly the event type that the DB fallback filters on", async () => {
    const { incrementQuota, checkQuota } = await import("../src/lib/quota.js");

    await incrementQuota("acct_1", { emailId: "em_1" });
    const writtenType = insertedEvents[0]?.["type"];

    eqCalls.length = 0;
    await checkQuota("acct_1");

    // getCountFromDb() filters events by type; find that comparison's value.
    const filteredTypes = eqCalls
      .map((c) => c.value)
      .filter((v): v is string => typeof v === "string" && v.startsWith("email."));

    expect(writtenType).toBe("email.queued");
    expect(filteredTypes).toContain(writtenType);
  });

  it("never throws when the event insert fails (fire-and-forget contract)", async () => {
    const { getDatabase } = await import("@alecrae/db");
    const db = getDatabase() as unknown as { values: ReturnType<typeof vi.fn> };
    db.values.mockRejectedValueOnce(new Error("postgres down"));

    const { incrementQuota } = await import("../src/lib/quota.js");

    await expect(incrementQuota("acct_1", { emailId: "em_1" })).resolves.toBeUndefined();
  });
});

describe("quota.ts — checkQuota DB fallback with Redis unavailable", () => {
  it("counts the email.queued rows instead of always reporting 0", async () => {
    mockPlanTier = "free";
    mockQueuedCount = 7;

    const { checkQuota } = await import("../src/lib/quota.js");
    const result = await checkQuota("acct_1");

    // The bug's signature was `sent: 0` no matter how much had been sent.
    expect(result.sent).toBe(7);
    expect(result.plan).toBe("free");
    expect(result.allowed).toBe(true);
  });

  it("BLOCKS the send once the DB count reaches the plan limit", async () => {
    const { PLANS } = await import("../src/lib/billing.js");
    mockPlanTier = "free";
    mockQueuedCount = PLANS.free.emailsPerMonth;

    const { checkQuota } = await import("../src/lib/quota.js");
    const result = await checkQuota("acct_1");

    // Before the fix this was unconditionally `true` with `sent: 0`, i.e. the
    // plan limit could never be enforced without Redis.
    expect(result.allowed).toBe(false);
    expect(result.sent).toBe(PLANS.free.emailsPerMonth);
    expect(result.limit).toBe(PLANS.free.emailsPerMonth);
  });

  it("still allows a send one under the limit", async () => {
    const { PLANS } = await import("../src/lib/billing.js");
    mockPlanTier = "free";
    mockQueuedCount = PLANS.free.emailsPerMonth - 1;

    const { checkQuota } = await import("../src/lib/quota.js");
    const result = await checkQuota("acct_1");

    expect(result.allowed).toBe(true);
  });

  it("uses the account's real plan limit, not the free default", async () => {
    const { PLANS } = await import("../src/lib/billing.js");
    mockPlanTier = "professional";
    mockQueuedCount = PLANS.free.emailsPerMonth + 1;

    const { checkQuota } = await import("../src/lib/quota.js");
    const result = await checkQuota("acct_1");

    // Over the FREE limit but comfortably under professional's.
    expect(result.limit).toBe(PLANS["professional"]?.emailsPerMonth);
    expect(result.allowed).toBe(true);
  });
});
