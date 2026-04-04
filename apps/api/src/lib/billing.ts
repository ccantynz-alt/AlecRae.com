/**
 * Stripe Billing Integration
 *
 * Manages subscriptions, checkout sessions, billing portal sessions,
 * webhook event processing, and usage metering against plan limits.
 */

import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDatabase, accounts } from "@emailed/db";

// ─── Stripe client ────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!STRIPE_SECRET_KEY) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Billing features are unavailable.",
      );
    }
    stripeInstance = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return stripeInstance;
}

// ─── Plan definitions ─────────────────────────────────────────────────────

export type PlanId = "free" | "starter" | "professional" | "enterprise";

export interface PlanDefinition {
  priceId: string | null;
  emailsPerMonth: number;
  domains: number;
  webhooks: number;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: { priceId: null, emailsPerMonth: 1_000, domains: 1, webhooks: 2 },
  starter: {
    priceId: process.env["STRIPE_PRICE_STARTER"] ?? "price_starter",
    emailsPerMonth: 10_000,
    domains: 5,
    webhooks: 10,
  },
  professional: {
    priceId:
      process.env["STRIPE_PRICE_PROFESSIONAL"] ?? "price_professional",
    emailsPerMonth: 100_000,
    domains: 25,
    webhooks: 50,
  },
  enterprise: {
    priceId: process.env["STRIPE_PRICE_ENTERPRISE"] ?? "price_enterprise",
    emailsPerMonth: 1_000_000,
    domains: 100,
    webhooks: 200,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

/**
 * Map a Stripe price ID back to a plan tier.
 */
function planFromPriceId(priceId: string): PlanId | null {
  for (const [plan, def] of Object.entries(PLANS)) {
    if (def.priceId === priceId) return plan as PlanId;
  }
  return null;
}

// ─── Customer management ──────────────────────────────────────────────────

/**
 * Create a Stripe customer and store the customer ID on the account.
 */
export async function createCustomer(
  accountId: string,
  email: string,
  name: string,
): Promise<Stripe.Customer> {
  const stripe = getStripe();
  const db = getDatabase();

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { accountId },
  });

  await db
    .update(accounts)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));

  return customer;
}

// ─── Checkout session ─────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for upgrading to a paid plan.
 */
export async function createCheckoutSession(
  accountId: string,
  planId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<Stripe.Checkout.Session> {
  if (!isPlanId(planId)) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  const plan = PLANS[planId];
  if (!plan.priceId) {
    throw new Error("Cannot create a checkout session for the free plan.");
  }

  const stripe = getStripe();
  const db = getDatabase();

  // Look up (or create) the Stripe customer
  const [account] = await db
    .select({
      stripeCustomerId: accounts.stripeCustomerId,
      billingEmail: accounts.billingEmail,
      name: accounts.name,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await createCustomer(
      accountId,
      account.billingEmail,
      account.name,
    );
    customerId = customer.id;
  }

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { accountId, planId },
    },
    metadata: { accountId, planId },
  });
}

// ─── Billing portal ───────────────────────────────────────────────────────

/**
 * Create a Stripe Billing Portal session so the customer can manage
 * their subscription, payment methods, and invoices.
 */
export async function createPortalSession(
  accountId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  const db = getDatabase();

  const [account] = await db
    .select({ stripeCustomerId: accounts.stripeCustomerId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account?.stripeCustomerId) {
    throw new Error(
      "No Stripe customer associated with this account. Subscribe to a plan first.",
    );
  }

  return stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: returnUrl,
  });
}

// ─── Webhook event processing ─────────────────────────────────────────────

/**
 * Process a verified Stripe webhook event and update the database
 * accordingly.
 */
export async function handleWebhookEvent(
  event: Stripe.Event,
): Promise<{ handled: boolean; action?: string }> {
  const db = getDatabase();

  switch (event.type) {
    // ── Checkout completed — activate the subscription ──────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const accountId = session.metadata?.["accountId"];
      const planId = session.metadata?.["planId"];

      if (!accountId || !planId || !isPlanId(planId)) {
        return { handled: false };
      }

      await db
        .update(accounts)
        .set({
          planTier: planId,
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : (session.subscription as Stripe.Subscription | null)?.id ??
                null,
          emailsSentThisPeriod: 0,
          periodStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

      return { handled: true, action: `upgraded_to_${planId}` };
    }

    // ── Subscription updated (plan change, renewal) ─────────────────
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const accountId = subscription.metadata?.["accountId"];

      if (!accountId) return { handled: false };

      const priceId = subscription.items.data[0]?.price?.id;
      const newPlan = priceId ? planFromPriceId(priceId) : null;

      const updates: Record<string, unknown> = {
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      };

      if (newPlan) {
        updates["planTier"] = newPlan;
      }

      // If the subscription just renewed (current_period_start changed),
      // reset usage counters.
      if (subscription.current_period_start) {
        const periodStart = new Date(
          subscription.current_period_start * 1000,
        );
        updates["periodStartedAt"] = periodStart;
        updates["emailsSentThisPeriod"] = 0;
      }

      await db
        .update(accounts)
        .set(updates)
        .where(eq(accounts.id, accountId));

      return { handled: true, action: "subscription_updated" };
    }

    // ── Subscription deleted (cancelled / expired) ──────────────────
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const accountId = subscription.metadata?.["accountId"];

      if (!accountId) return { handled: false };

      await db
        .update(accounts)
        .set({
          planTier: "free",
          stripeSubscriptionId: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

      return { handled: true, action: "downgraded_to_free" };
    }

    // ── Payment failed ──────────────────────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id;

      if (!customerId) return { handled: false };

      // Log for now — in production this would trigger a dunning flow
      console.warn(
        `[billing] Payment failed for Stripe customer ${customerId}`,
      );

      return { handled: true, action: "payment_failed_logged" };
    }

    default:
      return { handled: false };
  }
}

// ─── Usage tracking & enforcement ─────────────────────────────────────────

export interface UsageInfo {
  emailsSent: number;
  emailsLimit: number;
  percentUsed: number;
  periodStartedAt: string;
  planTier: string;
  limitExceeded: boolean;
}

/**
 * Check whether the account has exceeded their plan's monthly email limit.
 * Returns `true` if the account may still send, `false` if over the limit.
 */
export async function checkUsageLimit(
  accountId: string,
): Promise<{ allowed: boolean; usage: UsageInfo }> {
  const db = getDatabase();

  const [account] = await db
    .select({
      planTier: accounts.planTier,
      emailsSentThisPeriod: accounts.emailsSentThisPeriod,
      periodStartedAt: accounts.periodStartedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    // If account doesn't exist in DB (dev mode), allow with default limits
    return {
      allowed: true,
      usage: {
        emailsSent: 0,
        emailsLimit: PLANS.free.emailsPerMonth,
        percentUsed: 0,
        periodStartedAt: new Date().toISOString(),
        planTier: "free",
        limitExceeded: false,
      },
    };
  }

  const planId = (account.planTier ?? "free") as PlanId;
  const plan = PLANS[planId] ?? PLANS.free;

  // Auto-reset if the billing period has expired (>30 days)
  const periodAge =
    Date.now() - new Date(account.periodStartedAt).getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  let emailsSent = account.emailsSentThisPeriod;

  if (periodAge >= thirtyDays) {
    // Reset the counter
    await db
      .update(accounts)
      .set({
        emailsSentThisPeriod: 0,
        periodStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId));
    emailsSent = 0;
  }

  const limitExceeded = emailsSent >= plan.emailsPerMonth;

  return {
    allowed: !limitExceeded,
    usage: {
      emailsSent,
      emailsLimit: plan.emailsPerMonth,
      percentUsed:
        plan.emailsPerMonth > 0
          ? Math.round((emailsSent / plan.emailsPerMonth) * 10000) / 100
          : 0,
      periodStartedAt: account.periodStartedAt.toISOString(),
      planTier: planId,
      limitExceeded,
    },
  };
}

/**
 * Increment the monthly email counter for an account.
 */
export async function recordUsage(accountId: string): Promise<void> {
  const db = getDatabase();

  await db
    .update(accounts)
    .set({
      emailsSentThisPeriod: sql`${accounts.emailsSentThisPeriod} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
}

/**
 * Get the current billing period's usage stats for an account.
 */
export async function getUsage(accountId: string): Promise<UsageInfo> {
  const { usage } = await checkUsageLimit(accountId);
  return usage;
}

// ─── Webhook signature verification ───────────────────────────────────────

/**
 * Verify and construct a Stripe webhook event from the raw request body
 * and signature header.
 */
export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

export { getStripe, isPlanId };
