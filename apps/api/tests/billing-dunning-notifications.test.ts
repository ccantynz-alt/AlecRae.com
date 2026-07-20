/**
 * Regression test for issue #116(c): the dunning state machine in
 * lib/billing.ts previously transitioned state (past_due / downgraded /
 * active) correctly but never notified the customer at any stage. This
 * verifies the WIRING — that each real state transition triggers the right
 * dunning-email call exactly once, and that transitions which should stay
 * silent (a retry within the same cycle, a plain successful renewal with no
 * prior dunning, a voluntary subscription cancel) do not send anything.
 *
 * Uses a small thenable/chainable fake query builder because billing.ts's
 * different call sites terminate a drizzle chain at different points
 * (.limit(), .returning(), or a bare .where()) — all three must be awaitable.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeAccount {
  id: string;
  planTier: string;
  billingEmail: string;
  name: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

interface FakeDunningRecord {
  state: "active" | "past_due" | "downgraded";
  planAtRisk: string | null;
  failedAttemptCount?: number;
  accountId?: string;
  graceExpiresAt?: Date | null;
}

let mockAccount: FakeAccount | null = null;
let mockDunningRecord: FakeDunningRecord | null = null;

const sendPaymentFailedEmailMock = vi.fn().mockResolvedValue(undefined);
const sendDowngradedEmailMock = vi.fn().mockResolvedValue(undefined);
const sendPaymentRecoveredEmailMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/lib/dunning-emails.js", () => ({
  sendPaymentFailedEmail: sendPaymentFailedEmailMock,
  sendDowngradedEmail: sendDowngradedEmailMock,
  sendPaymentRecoveredEmail: sendPaymentRecoveredEmailMock,
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({})),
}));

let dbDunningTable: unknown;

function makeChain(mode: "select" | "update" | "insert", table: unknown) {
  const chain: Record<string, unknown> = {
    from: vi.fn((t: unknown) => {
      table = t;
      return chain;
    }),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    onConflictDoUpdate: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(() => chain),
    returning: vi.fn(() => chain),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve(resolveChain(mode, table));
      } catch (err) {
        if (reject) reject(err);
      }
    },
  };
  return chain;
}

function resolveChain(mode: "select" | "update" | "insert", table: unknown): unknown[] {
  if (mode === "select") {
    if (table === dbDunningTable) {
      return mockDunningRecord ? [mockDunningRecord] : [];
    }
    return mockAccount ? [mockAccount] : [];
  }
  if (mode === "update" && table === dbDunningTable) {
    return [{ attempt: (mockDunningRecord?.failedAttemptCount ?? 0) + 1 }];
  }
  return [];
}

const mockDb = {
  select: vi.fn(() => makeChain("select", null)),
  update: vi.fn((table: unknown) => makeChain("update", table)),
  insert: vi.fn((table: unknown) => makeChain("insert", table)),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  dbDunningTable = actual["dunningRecords"];
  return { ...actual, getDatabase: () => mockDb };
});

describe("billing.ts dunning notification wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccount = null;
    mockDunningRecord = null;
  });

  it("recordPaymentFailure sends the payment-failed email on a NEW dunning cycle", async () => {
    mockAccount = {
      id: "acct_1",
      planTier: "starter",
      billingEmail: "billing@acme.com",
      name: "Acme Corp",
    };
    mockDunningRecord = null; // no existing cycle

    const { recordPaymentFailure } = await import("../src/lib/billing.js");
    const result = await recordPaymentFailure("cus_1", "in_1");

    expect(result?.state).toBe("past_due");
    expect(sendPaymentFailedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPaymentFailedEmailMock).toHaveBeenCalledWith(
      { email: "billing@acme.com", name: "Acme Corp" },
      "starter",
      expect.any(Date),
    );
  });

  it("recordPaymentFailure does NOT re-send on a retry within the same cycle", async () => {
    mockAccount = {
      id: "acct_1",
      planTier: "starter",
      billingEmail: "billing@acme.com",
      name: "Acme Corp",
    };
    mockDunningRecord = { state: "past_due", planAtRisk: "starter", failedAttemptCount: 1 };

    const { recordPaymentFailure } = await import("../src/lib/billing.js");
    const result = await recordPaymentFailure("cus_1", "in_2");

    expect(result?.state).toBe("past_due");
    expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
  });

  it("recordPaymentFailure sends nothing for a free-tier account (nothing to dun)", async () => {
    mockAccount = {
      id: "acct_1",
      planTier: "free",
      billingEmail: "billing@acme.com",
      name: "Acme Corp",
    };

    const { recordPaymentFailure } = await import("../src/lib/billing.js");
    await recordPaymentFailure("cus_1", "in_1");

    expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
  });

  it("recordPaymentRecovery sends nothing on a plain renewal with no prior dunning", async () => {
    mockAccount = {
      id: "acct_1",
      planTier: "starter",
      billingEmail: "billing@acme.com",
      name: "Acme Corp",
    };
    mockDunningRecord = null;

    const { recordPaymentRecovery } = await import("../src/lib/billing.js");
    const result = await recordPaymentRecovery("cus_1");

    expect(result).toBeNull();
    expect(sendPaymentRecoveredEmailMock).not.toHaveBeenCalled();
  });

  it("recordPaymentRecovery sends the recovery email when clearing a past_due state", async () => {
    mockAccount = {
      id: "acct_1",
      planTier: "starter",
      billingEmail: "billing@acme.com",
      name: "Acme Corp",
    };
    mockDunningRecord = { state: "past_due", planAtRisk: "starter" };

    const { recordPaymentRecovery } = await import("../src/lib/billing.js");
    const result = await recordPaymentRecovery("cus_1");

    expect(result?.state).toBe("active");
    expect(sendPaymentRecoveredEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPaymentRecoveredEmailMock).toHaveBeenCalledWith(
      { email: "billing@acme.com", name: "Acme Corp" },
      null,
    );
  });

  it("handleWebhookEvent(customer.subscription.deleted) sends downgrade email only when dunning-driven", async () => {
    mockAccount = {
      id: "acct_1",
      planTier: "professional",
      billingEmail: "billing@acme.com",
      name: "Acme Corp",
    };
    mockDunningRecord = { state: "past_due", planAtRisk: "professional" };

    const { handleWebhookEvent } = await import("../src/lib/billing.js");
    const event = {
      type: "customer.subscription.deleted",
      data: { object: { metadata: { accountId: "acct_1" } } },
    } as never;

    const result = await handleWebhookEvent(event);

    expect(result.action).toBe("downgraded_to_free");
    expect(sendDowngradedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendDowngradedEmailMock).toHaveBeenCalledWith(
      { email: "billing@acme.com", name: "Acme Corp" },
      "professional",
    );
  });

  it("handleWebhookEvent(customer.subscription.deleted) stays silent for a voluntary cancel (no dunning)", async () => {
    mockAccount = {
      id: "acct_1",
      planTier: "professional",
      billingEmail: "billing@acme.com",
      name: "Acme Corp",
    };
    mockDunningRecord = null; // never past_due — this is a normal cancellation

    const { handleWebhookEvent } = await import("../src/lib/billing.js");
    const event = {
      type: "customer.subscription.deleted",
      data: { object: { metadata: { accountId: "acct_1" } } },
    } as never;

    await handleWebhookEvent(event);

    expect(sendDowngradedEmailMock).not.toHaveBeenCalled();
  });
});
