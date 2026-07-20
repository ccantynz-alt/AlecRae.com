/**
 * Regression test for Stripe webhook idempotency (lib/billing.ts's
 * isDuplicateWebhookEvent). Stripe guarantees at-least-once delivery —
 * before this fix, nothing deduped redelivered events; recordPaymentFailure
 * increments a counter on every delivery of the same failed-invoice event,
 * which can prematurely trigger dunning state on a redelivery.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const seenEventIds = new Set<string>();

const mockDb = {
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockImplementation(function (this: typeof mockDb, row: { id: string }) {
    return {
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          if (seenEventIds.has(row.id)) {
            return Promise.resolve([]); // conflict — already recorded
          }
          seenEventIds.add(row.id);
          return Promise.resolve([{ id: row.id }]);
        }),
      }),
    };
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

function fakeEvent(id: string, type = "invoice.payment_failed"): Stripe.Event {
  return { id, type } as Stripe.Event;
}

describe("isDuplicateWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seenEventIds.clear();
  });

  it("returns false the first time an event is seen", async () => {
    const { isDuplicateWebhookEvent } = await import("../src/lib/billing.js");
    const result = await isDuplicateWebhookEvent(fakeEvent("evt_1"));
    expect(result).toBe(false);
  });

  it("returns true on a redelivery of the same event id", async () => {
    const { isDuplicateWebhookEvent } = await import("../src/lib/billing.js");
    await isDuplicateWebhookEvent(fakeEvent("evt_2"));
    const secondDelivery = await isDuplicateWebhookEvent(fakeEvent("evt_2"));
    expect(secondDelivery).toBe(true);
  });

  it("treats different event ids independently", async () => {
    const { isDuplicateWebhookEvent } = await import("../src/lib/billing.js");
    expect(await isDuplicateWebhookEvent(fakeEvent("evt_a"))).toBe(false);
    expect(await isDuplicateWebhookEvent(fakeEvent("evt_b"))).toBe(false);
    expect(await isDuplicateWebhookEvent(fakeEvent("evt_a"))).toBe(true);
  });
});
