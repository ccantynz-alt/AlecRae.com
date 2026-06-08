/**
 * Tests for the Stripe dunning (failed-payment recovery) state machine
 * in apps/api/src/lib/billing.ts (Gap G2).
 *
 * State machine:
 *   active     → past_due    (invoice.payment_failed, paid account)
 *   past_due   → past_due    (subsequent invoice.payment_failed — attempt++)
 *   past_due   → active      (invoice.paid / payment_succeeded)
 *   past_due   → downgraded  (grace expired, or subscription deleted)
 *   downgraded → active      (late payment recovers + restores plan)
 *
 * The DB layer is mocked so these are pure logic tests with no infra.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mutable mock state ─────────────────────────────────────────────────────

interface MockAccount {
  id: string;
  planTier: string;
  stripeCustomerId: string;
}

interface MockDunning {
  state: "active" | "past_due" | "downgraded";
  planAtRisk: string | null;
  failedAttemptCount: number;
  graceExpiresAt: Date | null;
}

let mockAccount: MockAccount | null = null;
let mockDunning: MockDunning | null = null;

/** Records of what was written, for assertions. */
let accountUpdates: Record<string, unknown>[] = [];
let dunningInserts: Record<string, unknown>[] = [];
let dunningUpdates: Record<string, unknown>[] = [];

// Sentinels so the code under test can tell which table it is querying.
const ACCOUNTS = { __table: "accounts" } as const;
const DUNNING = { __table: "dunning" } as const;

function selectFrom(table: unknown): Promise<Record<string, unknown>[]> {
  if (table === ACCOUNTS) {
    return Promise.resolve(
      mockAccount
        ? [{ id: mockAccount.id, planTier: mockAccount.planTier }]
        : [],
    );
  }
  if (table === DUNNING) {
    return Promise.resolve(
      mockDunning
        ? [
            {
              state: mockDunning.state,
              planAtRisk: mockDunning.planAtRisk,
              accountId: mockAccount?.id,
              graceExpiresAt: mockDunning.graceExpiresAt,
            },
          ]
        : [],
    );
  }
  return Promise.resolve([]);
}

vi.mock("@alecrae/db", () => {
  return {
    getDatabase: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: unknown) => ({
          // Supports both `.where(...).limit(...)` and bare `.where(...)`
          // (awaited directly, as processExpiredGrace does).
          where: vi.fn().mockImplementation(() => {
            const promise = selectFrom(table) as Promise<
              Record<string, unknown>[]
            > & { limit: (n: number) => Promise<Record<string, unknown>[]> };
            promise.limit = () => selectFrom(table);
            return promise;
          }),
        })),
      }),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
          if (table === DUNNING) dunningInserts.push(vals);
          return {
            onConflictDoUpdate: vi
              .fn()
              .mockImplementation((cfg: { set: Record<string, unknown> }) => {
                // Emulate upsert: apply the resulting state to the mock.
                applyDunningWrite(cfg.set);
                return Promise.resolve(undefined);
              }),
          };
        }),
      })),
      update: vi.fn().mockImplementation((table: unknown) => ({
        set: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
          if (table === ACCOUNTS) {
            accountUpdates.push(vals);
            applyAccountWrite(vals);
          } else if (table === DUNNING) {
            dunningUpdates.push(vals);
            applyDunningWrite(vals);
          }
          const chain = {
            where: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockImplementation(() =>
                  Promise.resolve([
                    { attempt: mockDunning?.failedAttemptCount ?? 0 },
                  ]),
                ),
            }),
          };
          return chain;
        }),
      })),
    }),
    accounts: ACCOUNTS,
    dunningRecords: DUNNING,
    eq: vi.fn(),
    sql: (..._args: unknown[]) => "__sql__",
  };
});

// Helpers that emulate persistence of the mocked writes.
function applyDunningWrite(vals: Record<string, unknown>): void {
  if (!mockDunning) {
    mockDunning = {
      state: "active",
      planAtRisk: null,
      failedAttemptCount: 0,
      graceExpiresAt: null,
    };
  }
  if (typeof vals["state"] === "string") {
    mockDunning.state = vals["state"] as MockDunning["state"];
  }
  if ("planAtRisk" in vals) {
    mockDunning.planAtRisk = (vals["planAtRisk"] as string | null) ?? null;
  }
  if (typeof vals["failedAttemptCount"] === "number") {
    mockDunning.failedAttemptCount = vals["failedAttemptCount"];
  } else if (
    vals["failedAttemptCount"] !== undefined &&
    vals["failedAttemptCount"] !== null
  ) {
    // A drizzle SQL fragment, i.e. sql`count + 1` — emulate the increment.
    mockDunning.failedAttemptCount += 1;
  }
  if ("graceExpiresAt" in vals) {
    mockDunning.graceExpiresAt = (vals["graceExpiresAt"] as Date | null) ?? null;
  }
}

function applyAccountWrite(vals: Record<string, unknown>): void {
  if (mockAccount && typeof vals["planTier"] === "string") {
    mockAccount.planTier = vals["planTier"];
  }
}

beforeEach(() => {
  mockAccount = {
    id: "acct_001",
    planTier: "professional",
    stripeCustomerId: "cus_123",
  };
  mockDunning = null;
  accountUpdates = [];
  dunningInserts = [];
  dunningUpdates = [];
  vi.clearAllMocks();
});

describe("Dunning state machine", () => {
  describe("recordPaymentFailure", () => {
    it("moves a paid account from active → past_due on first failure", async () => {
      const { recordPaymentFailure, DUNNING_GRACE_DAYS } = await import(
        "../src/lib/billing.js"
      );

      const result = await recordPaymentFailure("cus_123", "in_1");

      expect(result).not.toBeNull();
      expect(result?.state).toBe("past_due");
      expect(result?.attempt).toBe(1);

      // It inserted a dunning row with a grace window and the plan snapshot.
      expect(dunningInserts).toHaveLength(1);
      const inserted = dunningInserts[0]!;
      expect(inserted["state"]).toBe("past_due");
      expect(inserted["planAtRisk"]).toBe("professional");
      expect(inserted["graceExpiresAt"]).toBeInstanceOf(Date);

      // Grace window is ~DUNNING_GRACE_DAYS out.
      const grace = inserted["graceExpiresAt"] as Date;
      const started = inserted["dunningStartedAt"] as Date;
      const days =
        (grace.getTime() - started.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(DUNNING_GRACE_DAYS);

      // Crucially: the account was NOT downgraded.
      expect(accountUpdates).toHaveLength(0);
      expect(mockAccount?.planTier).toBe("professional");
    });

    it("increments attempt count on a subsequent failure while past_due", async () => {
      mockDunning = {
        state: "past_due",
        planAtRisk: "professional",
        failedAttemptCount: 1,
        graceExpiresAt: new Date(Date.now() + 10 * 86_400_000),
      };

      const { recordPaymentFailure } = await import("../src/lib/billing.js");
      const result = await recordPaymentFailure("cus_123", "in_2");

      expect(result?.state).toBe("past_due");
      expect(result?.attempt).toBe(2);
      // No new insert — it updated the existing row.
      expect(dunningInserts).toHaveLength(0);
      expect(dunningUpdates).toHaveLength(1);
      // Still not downgraded.
      expect(mockAccount?.planTier).toBe("professional");
    });

    it("does not dun a free account (nothing to protect)", async () => {
      mockAccount = {
        id: "acct_free",
        planTier: "free",
        stripeCustomerId: "cus_free",
      };

      const { recordPaymentFailure } = await import("../src/lib/billing.js");
      const result = await recordPaymentFailure("cus_free", "in_x");

      expect(result?.state).toBe("active");
      expect(dunningInserts).toHaveLength(0);
    });

    it("returns null when the customer maps to no account", async () => {
      mockAccount = null;

      const { recordPaymentFailure } = await import("../src/lib/billing.js");
      const result = await recordPaymentFailure("cus_unknown", "in_y");

      expect(result).toBeNull();
    });
  });

  describe("recordPaymentRecovery", () => {
    it("clears past_due → active on a successful payment (no downgrade had happened)", async () => {
      mockDunning = {
        state: "past_due",
        planAtRisk: "professional",
        failedAttemptCount: 2,
        graceExpiresAt: new Date(Date.now() + 5 * 86_400_000),
      };

      const { recordPaymentRecovery } = await import("../src/lib/billing.js");
      const result = await recordPaymentRecovery("cus_123");

      expect(result).not.toBeNull();
      expect(result?.state).toBe("active");
      expect(result?.restoredPlan).toBeNull();
      expect(mockDunning?.state).toBe("active");
      expect(mockDunning?.failedAttemptCount).toBe(0);
    });

    it("restores the plan when recovering from a downgrade", async () => {
      // Account was downgraded to free, dunning record remembers the plan.
      mockAccount = {
        id: "acct_001",
        planTier: "free",
        stripeCustomerId: "cus_123",
      };
      mockDunning = {
        state: "downgraded",
        planAtRisk: "professional",
        failedAttemptCount: 3,
        graceExpiresAt: null,
      };

      const { recordPaymentRecovery } = await import("../src/lib/billing.js");
      const result = await recordPaymentRecovery("cus_123");

      expect(result?.state).toBe("active");
      expect(result?.restoredPlan).toBe("professional");
      // Account plan was restored.
      expect(mockAccount?.planTier).toBe("professional");
    });

    it("returns null for a normal renewal with no outstanding dunning", async () => {
      mockDunning = null; // active / no record

      const { recordPaymentRecovery } = await import("../src/lib/billing.js");
      const result = await recordPaymentRecovery("cus_123");

      expect(result).toBeNull();
    });
  });

  describe("processExpiredGrace", () => {
    it("downgrades accounts whose grace window has expired", async () => {
      mockDunning = {
        state: "past_due",
        planAtRisk: "professional",
        failedAttemptCount: 4,
        graceExpiresAt: new Date(Date.now() - 86_400_000), // yesterday
      };

      const { processExpiredGrace } = await import("../src/lib/billing.js");
      const downgraded = await processExpiredGrace();

      expect(downgraded).toContain("acct_001");
      expect(mockAccount?.planTier).toBe("free");
      expect(mockDunning?.state).toBe("downgraded");
    });

    it("does NOT downgrade accounts still within the grace window", async () => {
      mockDunning = {
        state: "past_due",
        planAtRisk: "professional",
        failedAttemptCount: 1,
        graceExpiresAt: new Date(Date.now() + 86_400_000), // tomorrow
      };

      const { processExpiredGrace } = await import("../src/lib/billing.js");
      const downgraded = await processExpiredGrace();

      expect(downgraded).toHaveLength(0);
      expect(mockAccount?.planTier).toBe("professional");
      expect(mockDunning?.state).toBe("past_due");
    });
  });

  describe("handleWebhookEvent — dunning wiring", () => {
    it("invoice.payment_failed enters past_due without downgrading", async () => {
      const { handleWebhookEvent } = await import("../src/lib/billing.js");

      const result = await handleWebhookEvent({
        type: "invoice.payment_failed",
        data: { object: { id: "in_1", customer: "cus_123" } },
      } as never);

      expect(result.handled).toBe(true);
      expect(result.action).toBe("dunning_past_due_attempt_1");
      expect(mockAccount?.planTier).toBe("professional");
    });

    it("invoice.paid recovers a past_due account", async () => {
      mockDunning = {
        state: "past_due",
        planAtRisk: "professional",
        failedAttemptCount: 1,
        graceExpiresAt: new Date(Date.now() + 5 * 86_400_000),
      };

      const { handleWebhookEvent } = await import("../src/lib/billing.js");
      const result = await handleWebhookEvent({
        type: "invoice.paid",
        data: { object: { id: "in_1", customer: "cus_123" } },
      } as never);

      expect(result.handled).toBe(true);
      expect(result.action).toBe("dunning_recovered");
      expect(mockDunning?.state).toBe("active");
    });

    it("customer.subscription.deleted marks a past_due cycle as downgraded", async () => {
      mockDunning = {
        state: "past_due",
        planAtRisk: "professional",
        failedAttemptCount: 2,
        graceExpiresAt: new Date(Date.now() + 5 * 86_400_000),
      };

      const { handleWebhookEvent } = await import("../src/lib/billing.js");
      const result = await handleWebhookEvent({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_1", metadata: { accountId: "acct_001" } } },
      } as never);

      expect(result.handled).toBe(true);
      expect(result.action).toBe("downgraded_to_free");
      expect(mockAccount?.planTier).toBe("free");
      expect(mockDunning?.state).toBe("downgraded");
    });
  });
});
