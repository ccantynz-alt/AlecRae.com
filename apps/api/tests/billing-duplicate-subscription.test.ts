/**
 * Regression test for issue #116(a): createCheckoutSession() previously
 * created a brand-new Stripe Checkout Session unconditionally, with no
 * check for an existing active subscription — an "Upgrade to Pro" button
 * that doesn't check current plan risked a second, concurrent Stripe
 * subscription (double billing) for an already-subscribed customer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

let mockAccount: {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingEmail: string;
  name: string;
} | null = null;

let mockSubscriptionStatus: string | null = null;
let checkoutSessionCreateCalled = false;

const mockStripeInstance = {
  subscriptions: {
    retrieve: vi.fn().mockImplementation(() => {
      if (mockSubscriptionStatus === null) return Promise.reject(new Error("not found"));
      return Promise.resolve({ status: mockSubscriptionStatus });
    }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockImplementation(() => {
        checkoutSessionCreateCalled = true;
        return Promise.resolve({ id: "cs_test_123", url: "https://checkout.stripe.com/test" });
      }),
    },
  },
  customers: {
    create: vi.fn().mockResolvedValue({ id: "cus_test_new" }),
  },
};

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => mockStripeInstance),
}));

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => Promise.resolve(mockAccount ? [mockAccount] : [])),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

describe("createCheckoutSession — duplicate subscription prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkoutSessionCreateCalled = false;
    process.env["STRIPE_SECRET_KEY"] = "sk_test_123";
  });

  it("rejects creating a checkout session when an active subscription already exists", async () => {
    mockAccount = {
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_existing",
      billingEmail: "test@example.com",
      name: "Test Account",
    };
    mockSubscriptionStatus = "active";

    const { createCheckoutSession } = await import("../src/lib/billing.js");
    await expect(
      createCheckoutSession("acct_1", "starter", "https://example.com/ok", "https://example.com/cancel"),
    ).rejects.toThrow(/already has an active subscription/i);

    expect(checkoutSessionCreateCalled).toBe(false);
  });

  it("allows creating a checkout session when the existing subscription is canceled", async () => {
    mockAccount = {
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_old_canceled",
      billingEmail: "test@example.com",
      name: "Test Account",
    };
    mockSubscriptionStatus = "canceled";

    const { createCheckoutSession } = await import("../src/lib/billing.js");
    await createCheckoutSession("acct_1", "starter", "https://example.com/ok", "https://example.com/cancel");

    expect(checkoutSessionCreateCalled).toBe(true);
  });

  it("allows creating a checkout session for an account with no existing subscription", async () => {
    mockAccount = {
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      billingEmail: "test@example.com",
      name: "Test Account",
    };
    mockSubscriptionStatus = null;

    const { createCheckoutSession } = await import("../src/lib/billing.js");
    await createCheckoutSession("acct_1", "starter", "https://example.com/ok", "https://example.com/cancel");

    expect(checkoutSessionCreateCalled).toBe(true);
  });
});
