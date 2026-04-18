/**
 * Stripe Billing Integration
 *
 * Manages subscriptions, checkout sessions, billing portal sessions,
 * webhook event processing, and usage metering against plan limits.
 */

import Stripe from "stripe";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDatabase, accounts, stripeEvents } from "@alecrae/db";

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

// ─── Price ID resolution ──────────────────────────────────────────────────
//
// In production we refuse to boot with placeholder price IDs — silently
// shipping a `price_starter` literal to Stripe is how real customers end up
// hitting "No such price" at checkout. In dev we keep fallbacks so the app
// still runs without a Stripe account, but we log a loud WARN.

const REQUIRED_PRICE_ENVS = [
  "STRIPE_PRICE_PERSONAL",
  "STRIPE_PRICE_PRO",
  "STRIPE_PRICE_TEAM",
] as const;

const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

if (IS_PRODUCTION) {
  const missing = REQUIRED_PRICE_ENVS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `FATAL: Stripe price IDs missing: ${missing.join(", ")}`,
    );
  }
}

function resolvePriceId(
  envKey: (typeof REQUIRED_PRICE_ENVS)[number] | "STRIPE_PRICE_ENTERPRISE",
  placeholder: string,
): string {
  const value = process.env[envKey];
  if (value) return value;

  // IS_PRODUCTION=true + required env missing throws above, so any path
  // reaching the fallback here is either dev, test, or the optional
  // enterprise tier (priced manually, webhook-only).
  if (!IS_PRODUCTION) {
    console.warn(
      `[billing] WARN: Using placeholder price ID for ${envKey}. ` +
        "Checkout will fail against real Stripe.",
    );
  }
  return placeholder;
}

// ─── Plan definitions ─────────────────────────────────────────────────────

export type PlanId = "free" | "personal" | "pro" | "team" | "enterprise";

export interface PlanDefinition {
  priceId: string | null;
  emailsPerMonth: number;
  domains: number;
  webhooks: number;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: { priceId: null, emailsPerMonth: 1_000, domains: 1, webhooks: 2 },
  personal: {
    priceId: resolvePriceId("STRIPE_PRICE_PERSONAL", "price_personal"),
    emailsPerMonth: 10_000,
    domains: 5,
    webhooks: 10,
  },
  pro: {
    priceId: resolvePriceId("STRIPE_PRICE_PRO", "price_pro"),
    emailsPerMonth: 100_000,
    domains: 25,
    webhooks: 50,
  },
  team: {
    priceId: resolvePriceId("STRIPE_PRICE_TEAM", "price_team"),
    emailsPerMonth: 250_000,
    domains: 50,
    webhooks: 100,
  },
  enterprise: {
    priceId: resolvePriceId("STRIPE_PRICE_ENTERPRISE", "price_enterprise"),
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

/**
 * Resolve a Stripe customer id off an invoice or subscription payload.
 */
function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
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
 * Apply a Stripe Subscription payload to the matching account row. Used by
 * both `customer.subscription.created` (plan selected in Stripe dashboard /
 * API) and `customer.subscription.updated` (plan change, renewal) — they
 * carry the same shape, so we don't branch.
 */
async function applySubscriptionUpdate(
  subscription: Stripe.Subscription,
): Promise<{ handled: boolean; action?: string }> {
  const db = getDatabase();
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
    const periodStart = new Date(subscription.current_period_start * 1000);
    updates["periodStartedAt"] = periodStart;
    updates["emailsSentThisPeriod"] = 0;
  }

  await db.update(accounts).set(updates).where(eq(accounts.id, accountId));

  return { handled: true, action: "subscription_updated" };
}

/**
 * Process a verified Stripe webhook event and update the database
 * accordingly.
 *
 * Idempotency: callers should gate invocation on the `stripe_events` table
 * via `wasEventProcessed` / `recordEventReceived` / `markEventProcessed` —
 * Stripe redelivers the same event on transient failures and retries after
 * 5xx, so this function itself must only run once per event id.
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

    // ── Subscription created (dashboard- or API-created subs) ───────
    // Shares logic with subscription.updated — both carry the full
    // Subscription payload and either may be the first signal we see
    // depending on whether the checkout flow or dashboard path was used.
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      return applySubscriptionUpdate(subscription);
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

    // ── Invoice paid — authoritative renewal signal ─────────────────
    // Stripe fires `invoice.paid` whenever a subscription invoice is
    // finalised and paid (initial and renewal). If we previously marked
    // the account past_due, this clears that flag. Usage reset is handled
    // by `customer.subscription.updated` (which carries the new
    // current_period_start) so we only need to clear dunning state here.
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = extractCustomerId(invoice.customer);

      if (!customerId) return { handled: false };

      const [account] = await db
        .select({ id: accounts.id, billingStatus: accounts.billingStatus })
        .from(accounts)
        .where(eq(accounts.stripeCustomerId, customerId))
        .limit(1);

      if (!account) {
        console.log(
          `[billing] invoice.paid for unknown Stripe customer ${customerId}`,
        );
        return { handled: false };
      }

      // Clear past_due / downgraded_unpaid if the payment catches them up.
      if (account.billingStatus !== "active") {
        await db
          .update(accounts)
          .set({
            billingStatus: "active",
            pastDueSince: null,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, account.id));
      }

      console.log(`[billing] invoice.paid for account ${account.id}`);
      return { handled: true, action: "invoice_paid" };
    }

    // ── Payment failed — enter dunning ──────────────────────────────
    // Flip the account to past_due and stamp the clock. The dunning
    // worker (apps/api/src/workers/dunning.ts) sweeps past_due rows
    // older than 7 days and downgrades them to free.
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = extractCustomerId(invoice.customer);

      if (!customerId) return { handled: false };

      const [account] = await db
        .select({ id: accounts.id, billingStatus: accounts.billingStatus })
        .from(accounts)
        .where(eq(accounts.stripeCustomerId, customerId))
        .limit(1);

      if (!account) {
        console.warn(
          `[billing] payment_failed for unknown Stripe customer ${customerId}`,
        );
        return { handled: false };
      }

      // Only stamp pastDueSince on the first failure — subsequent retries
      // shouldn't reset the 7-day grace clock.
      const updates: Record<string, unknown> = {
        billingStatus: "past_due",
        updatedAt: new Date(),
      };
      if (account.billingStatus !== "past_due") {
        updates["pastDueSince"] = new Date();
      }

      await db
        .update(accounts)
        .set(updates)
        .where(eq(accounts.id, account.id));

      console.warn(
        `[billing] payment_failed: account ${account.id} marked past_due`,
      );
      // TODO: fire "payment failed" email via transactional email queue
      return { handled: true, action: "payment_failed_past_due" };
    }

    default:
      return { handled: false };
  }
}

// ─── Webhook idempotency helpers ──────────────────────────────────────────
//
// Stripe guarantees at-least-once delivery. The route handler must run
// these in order:
//   1. wasEventProcessed(id)    — short-circuit if we already handled it
//   2. recordEventReceived(id, type) — INSERT before running logic
//   3. handleWebhookEvent(event)
//   4. markEventProcessed(id)   — only after success; a throw leaves
//                                  processedAt NULL so Stripe retries work

export interface StripeEventRecord {
  id: string;
  processedAt: Date | null;
}

export async function wasEventProcessed(
  eventId: string,
): Promise<StripeEventRecord | null> {
  const db = getDatabase();
  const [row] = await db
    .select({
      id: stripeEvents.id,
      processedAt: stripeEvents.processedAt,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.id, eventId))
    .limit(1);
  return row ?? null;
}

export async function recordEventReceived(
  eventId: string,
  eventType: string,
): Promise<void> {
  const db = getDatabase();
  // ON CONFLICT DO NOTHING handles the race where two webhook deliveries
  // are processed near-simultaneously — whichever INSERT loses still sees
  // the row afterwards and carries on.
  await db
    .insert(stripeEvents)
    .values({ id: eventId, type: eventType })
    .onConflictDoNothing({ target: stripeEvents.id });
}

export async function markEventProcessed(eventId: string): Promise<void> {
  const db = getDatabase();
  await db
    .update(stripeEvents)
    .set({ processedAt: new Date() })
    .where(eq(stripeEvents.id, eventId));
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

// ─── Dunning query (exposed for the worker) ───────────────────────────────

/**
 * Predicate clause: accounts whose dunning grace period has elapsed.
 * Exposed for the worker at apps/api/src/workers/dunning.ts.
 */
export const pastDueBeyondGraceClause = and(
  eq(accounts.billingStatus, "past_due"),
  isNotNull(accounts.pastDueSince),
  sql`${accounts.pastDueSince} < NOW() - INTERVAL '7 days'`,
);

export { getStripe, isPlanId };
