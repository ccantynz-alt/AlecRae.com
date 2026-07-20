/**
 * Stripe Billing Integration
 *
 * Manages subscriptions, checkout sessions, billing portal sessions,
 * webhook event processing, and usage metering against plan limits.
 */

import Stripe from "stripe";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDatabase, accounts, dunningRecords, stripeWebhookEvents } from "@alecrae/db";

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
  /** Ceiling on Claude/Whisper API calls per month. Previously no such limit
   *  existed anywhere in code — a single session had unbounded AI spend. */
  aiCallsPerMonth: number;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: { priceId: null, emailsPerMonth: 1_000, domains: 1, webhooks: 2, aiCallsPerMonth: 300 },
  starter: {
    priceId: process.env["STRIPE_PRICE_STARTER"] ?? "price_starter",
    emailsPerMonth: 10_000,
    domains: 5,
    webhooks: 10,
    aiCallsPerMonth: 3_000,
  },
  professional: {
    priceId:
      process.env["STRIPE_PRICE_PROFESSIONAL"] ?? "price_professional",
    emailsPerMonth: 100_000,
    domains: 25,
    webhooks: 50,
    aiCallsPerMonth: 30_000,
  },
  enterprise: {
    priceId: process.env["STRIPE_PRICE_ENTERPRISE"] ?? "price_enterprise",
    emailsPerMonth: 1_000_000,
    domains: 100,
    webhooks: 200,
    aiCallsPerMonth: 300_000,
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

// ─── Dunning (failed-payment recovery) ─────────────────────────────────────

/**
 * Grace window, in days, after the FIRST failed payment before we downgrade
 * the account to free. Stripe Smart Retries drive the actual retry cadence
 * within this window; this is the hard cutoff on our side.
 */
export const DUNNING_GRACE_DAYS = 14;

/** Dunning state machine states. Mirrors `dunningStateEnum`. */
export type DunningState = "active" | "past_due" | "downgraded";

/**
 * Minimal shape we need from a Stripe invoice. The `customer` field on a
 * webhook payload may be a string ID or an expanded object, so it is parsed
 * defensively at the boundary.
 */
const invoiceCustomerSchema = z.object({
  id: z.string().optional(),
  customer: z
    .union([z.string(), z.object({ id: z.string() }), z.null()])
    .optional(),
});

/**
 * Extract the Stripe customer ID from an invoice payload regardless of
 * whether the `customer` field is a string or an expanded object.
 */
function extractCustomerId(invoice: Stripe.Invoice): string | null {
  const parsed = invoiceCustomerSchema.safeParse(invoice);
  if (!parsed.success) return null;
  const { customer } = parsed.data;
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

interface DunningAccount {
  id: string;
  planTier: PlanId;
}

/**
 * Resolve an account from a Stripe customer ID.
 */
async function findAccountByCustomerId(
  customerId: string,
): Promise<DunningAccount | null> {
  const db = getDatabase();
  const [account] = await db
    .select({ id: accounts.id, planTier: accounts.planTier })
    .from(accounts)
    .where(eq(accounts.stripeCustomerId, customerId))
    .limit(1);

  if (!account) return null;
  return { id: account.id, planTier: account.planTier as PlanId };
}

/**
 * Read the current dunning record for an account, if any.
 */
async function getDunningRecord(
  accountId: string,
): Promise<{ state: DunningState; planAtRisk: PlanId | null } | null> {
  const db = getDatabase();
  const [record] = await db
    .select({
      state: dunningRecords.state,
      planAtRisk: dunningRecords.planAtRisk,
    })
    .from(dunningRecords)
    .where(eq(dunningRecords.accountId, accountId))
    .limit(1);

  if (!record) return null;
  return {
    state: record.state as DunningState,
    planAtRisk: (record.planAtRisk as PlanId | null) ?? null,
  };
}

/**
 * Record a failed invoice payment and move the account into the `past_due`
 * grace state. Increments the attempt count on repeat failures. The paid
 * plan is RETAINED — we do not downgrade until the grace window expires
 * (handled by `processExpiredGrace`) or the subscription is deleted.
 *
 * Returns the resulting state and attempt count, or `null` if the account
 * cannot be resolved.
 */
export async function recordPaymentFailure(
  customerId: string,
  invoiceId: string | null,
): Promise<{ state: DunningState; attempt: number } | null> {
  const db = getDatabase();
  const account = await findAccountByCustomerId(customerId);
  if (!account) return null;

  // Free accounts have no paid plan to protect — nothing to dun.
  if (account.planTier === "free") {
    return { state: "active", attempt: 0 };
  }

  const now = new Date();
  const existing = await getDunningRecord(account.id);

  if (existing && existing.state === "past_due") {
    // Subsequent failure within the same cycle — bump the attempt count.
    const [updated] = await db
      .update(dunningRecords)
      .set({
        failedAttemptCount: sql`${dunningRecords.failedAttemptCount} + 1`,
        lastFailedInvoiceId: invoiceId,
        lastFailedAt: now,
        updatedAt: now,
      })
      .where(eq(dunningRecords.accountId, account.id))
      .returning({ attempt: dunningRecords.failedAttemptCount });

    return { state: "past_due", attempt: updated?.attempt ?? 1 };
  }

  // First failure of a new cycle — open the grace window and snapshot the
  // plan so it can be restored on recovery.
  const graceExpiresAt = new Date(
    now.getTime() + DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  await db
    .insert(dunningRecords)
    .values({
      id: crypto.randomUUID(),
      accountId: account.id,
      state: "past_due",
      failedAttemptCount: 1,
      planAtRisk: account.planTier,
      lastFailedInvoiceId: invoiceId,
      dunningStartedAt: now,
      lastFailedAt: now,
      graceExpiresAt,
      recoveredAt: null,
      downgradedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dunningRecords.accountId,
      set: {
        state: "past_due",
        failedAttemptCount: 1,
        planAtRisk: account.planTier,
        lastFailedInvoiceId: invoiceId,
        dunningStartedAt: now,
        lastFailedAt: now,
        graceExpiresAt,
        recoveredAt: null,
        downgradedAt: null,
        updatedAt: now,
      },
    });

  return { state: "past_due", attempt: 1 };
}

/**
 * Clear the `past_due` state after a successful payment. If the account was
 * downgraded while past due, the snapshotted plan is restored.
 *
 * Returns the action taken, or `null` if there was nothing to recover.
 */
export async function recordPaymentRecovery(
  customerId: string,
): Promise<{ state: DunningState; restoredPlan: PlanId | null } | null> {
  const db = getDatabase();
  const account = await findAccountByCustomerId(customerId);
  if (!account) return null;

  const existing = await getDunningRecord(account.id);
  if (!existing || existing.state === "active") {
    // Nothing outstanding — a normal successful renewal.
    return null;
  }

  const now = new Date();
  let restoredPlan: PlanId | null = null;

  // If we had downgraded the account, restore the plan it held at risk.
  if (
    existing.state === "downgraded" &&
    existing.planAtRisk &&
    account.planTier === "free"
  ) {
    restoredPlan = existing.planAtRisk;
    await db
      .update(accounts)
      .set({ planTier: restoredPlan, updatedAt: now })
      .where(eq(accounts.id, account.id));
  }

  await db
    .update(dunningRecords)
    .set({
      state: "active",
      failedAttemptCount: 0,
      planAtRisk: null,
      graceExpiresAt: null,
      recoveredAt: now,
      updatedAt: now,
    })
    .where(eq(dunningRecords.accountId, account.id));

  return { state: "active", restoredPlan };
}

/**
 * Mark an account as definitively downgraded due to dunning failure and
 * drop it to the free plan. Called when the grace window expires or the
 * subscription is deleted while past due.
 */
async function applyDunningDowngrade(accountId: string): Promise<void> {
  const db = getDatabase();
  const now = new Date();

  await db
    .update(accounts)
    .set({ planTier: "free", stripeSubscriptionId: null, updatedAt: now })
    .where(eq(accounts.id, accountId));

  await db
    .update(dunningRecords)
    .set({ state: "downgraded", downgradedAt: now, updatedAt: now })
    .where(eq(dunningRecords.accountId, accountId));
}

/**
 * Sweep for accounts whose grace window has expired while still `past_due`
 * and downgrade them to free. Intended to be invoked by a scheduled job.
 *
 * Returns the list of downgraded account IDs.
 */
export async function processExpiredGrace(): Promise<string[]> {
  const db = getDatabase();
  const now = new Date();

  const expired = await db
    .select({
      accountId: dunningRecords.accountId,
      graceExpiresAt: dunningRecords.graceExpiresAt,
    })
    .from(dunningRecords)
    .where(eq(dunningRecords.state, "past_due"));

  const downgraded: string[] = [];
  for (const record of expired) {
    if (record.graceExpiresAt && record.graceExpiresAt.getTime() <= now.getTime()) {
      await applyDunningDowngrade(record.accountId);
      downgraded.push(record.accountId);
    }
  }

  return downgraded;
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
      stripeSubscriptionId: accounts.stripeSubscriptionId,
      billingEmail: accounts.billingEmail,
      name: accounts.name,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  // Previously created a brand-new Checkout Session unconditionally, with
  // no check for an existing active subscription first — an "Upgrade to
  // Pro" button that doesn't check current plan risked a second, CONCURRENT
  // Stripe subscription for an already-subscribed customer (double
  // billing) rather than an upgrade of the existing one (issue #116a).
  // Plan changes on an existing subscription belong in the billing portal
  // (createPortalSession below), which Stripe handles correctly with
  // proration; Checkout Sessions are for a customer's FIRST subscription.
  if (account.stripeSubscriptionId) {
    const existingSub = await stripe.subscriptions
      .retrieve(account.stripeSubscriptionId)
      .catch(() => null);
    const activeStatuses: Stripe.Subscription.Status[] = ["active", "trialing", "past_due"];
    if (existingSub && activeStatuses.includes(existingSub.status)) {
      throw new Error(
        "This account already has an active subscription. Use the billing portal to change plans instead of creating a new checkout session.",
      );
    }
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
 * Record a Stripe webhook event as processed. Returns true if this event
 * was ALREADY processed (a duplicate delivery — Stripe guarantees
 * at-least-once delivery, so redeliveries are expected and normal, not an
 * error). Callers must check this before calling handleWebhookEvent() —
 * most of that function's branches are idempotent by virtue of a blind
 * UPDATE, but recordPaymentFailure() increments failedAttemptCount on
 * every delivery of the same event, which can prematurely trigger
 * dunning state on a redelivery of the same failure.
 */
export async function isDuplicateWebhookEvent(event: Stripe.Event): Promise<boolean> {
  const db = getDatabase();
  try {
    const inserted = await db
      .insert(stripeWebhookEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeWebhookEvents.id });
    return inserted.length === 0;
  } catch (err) {
    // If the dedup table itself is unreachable, fail open (process the
    // event) rather than silently dropping real billing events — the
    // worst case is an occasional double-processed redelivery, which is
    // the status quo this fix improves on, not a new risk introduced by it.
    console.error("[billing] Failed to check webhook event dedup, processing anyway:", err);
    return false;
  }
}

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

      // Close out any open dunning cycle — the subscription is gone, so the
      // grace window no longer applies. Mark as downgraded if it was past_due.
      const dunning = await getDunningRecord(accountId);
      if (dunning && dunning.state === "past_due") {
        const now = new Date();
        await db
          .update(dunningRecords)
          .set({ state: "downgraded", downgradedAt: now, updatedAt: now })
          .where(eq(dunningRecords.accountId, accountId));
      }

      return { handled: true, action: "downgraded_to_free" };
    }

    // ── Payment succeeded — clear any past_due / restore plan ───────
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = extractCustomerId(invoice);

      if (!customerId) return { handled: false };

      const recovery = await recordPaymentRecovery(customerId);
      if (!recovery) {
        // No outstanding dunning — a normal successful renewal.
        return { handled: true, action: "payment_succeeded" };
      }

      return {
        handled: true,
        action: recovery.restoredPlan
          ? `dunning_recovered_restored_${recovery.restoredPlan}`
          : "dunning_recovered",
      };
    }

    // ── Payment failed — enter dunning / grace state ────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = extractCustomerId(invoice);

      if (!customerId) return { handled: false };

      const invoiceId = invoice.id ?? null;
      const result = await recordPaymentFailure(customerId, invoiceId);

      if (!result) {
        // Account not found for this customer — log and acknowledge.
        console.warn(
          `[billing] Payment failed for unknown Stripe customer ${customerId}`,
        );
        return { handled: true, action: "payment_failed_unmatched" };
      }

      if (result.state === "active") {
        // Free account or nothing to dun.
        return { handled: true, action: "payment_failed_no_dunning" };
      }

      return {
        handled: true,
        action: `dunning_past_due_attempt_${result.attempt}`,
      };
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
 * Check usage info for display (billing page, usage endpoint).
 * NOT used for enforcement — real-time enforcement goes through checkQuota()
 * in lib/quota.ts which uses the Redis counter kept in sync by the messages
 * route. This function reads accounts.emailsSentThisPeriod which diverges
 * from the Redis counter and is kept only for billing-period reset logic.
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
