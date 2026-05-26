/**
 * Billing Routes
 *
 * POST /v1/billing/checkout  — Create Stripe Checkout session for plan upgrade
 * POST /v1/billing/portal    — Create Stripe Billing Portal session
 * GET  /v1/billing/usage     — Get current usage stats
 * GET  /v1/billing/plan      — Get current plan details and limits
 * POST /v1/billing/webhook   — Stripe webhook endpoint (no auth — signature verified)
 */

import { Hono } from "hono";
import { z } from "zod";
import type Stripe from "stripe";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import {
  createCheckoutSession,
  createPortalSession,
  getUsage,
  constructWebhookEvent,
  handleWebhookEvent,
  PLANS,
  isPlanId,
} from "../lib/billing.js";
import type { PlanId } from "../lib/billing.js";

const billing = new Hono();

// ─── Schemas ──────────────────────────────────────────────────────────────

const CheckoutSchema = z.object({
  planId: z.enum(["starter", "professional", "enterprise"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const PortalSchema = z.object({
  returnUrl: z.string().url(),
});

// ─── POST /v1/billing/checkout ────────────────────────────────────────────

billing.post(
  "/checkout",
  requireScope("account:manage"),
  validateBody(CheckoutSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<z.infer<typeof CheckoutSchema>>(c);

    try {
      const session = await createCheckoutSession(
        auth.accountId,
        body.planId,
        body.successUrl,
        body.cancelUrl,
      );

      return c.json({
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create checkout session";
      return c.json(
        {
          error: {
            type: "billing_error",
            message,
            code: "checkout_failed",
          },
        },
        400,
      );
    }
  },
);

// ─── POST /v1/billing/portal ──────────────────────────────────────────────

billing.post(
  "/portal",
  requireScope("account:manage"),
  validateBody(PortalSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<z.infer<typeof PortalSchema>>(c);

    try {
      const session = await createPortalSession(
        auth.accountId,
        body.returnUrl,
      );

      return c.json({
        data: {
          url: session.url,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create portal session";
      return c.json(
        {
          error: {
            type: "billing_error",
            message,
            code: "portal_failed",
          },
        },
        400,
      );
    }
  },
);

// ─── GET /v1/billing/usage ────────────────────────────────────────────────

billing.get("/usage", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");

  try {
    const usage = await getUsage(auth.accountId);
    return c.json({ data: usage });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to retrieve usage";
    return c.json(
      {
        error: {
          type: "billing_error",
          message,
          code: "usage_fetch_failed",
        },
      },
      500,
    );
  }
});

// ─── GET /v1/billing/plan ─────────────────────────────────────────────────

billing.get("/plan", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");

  try {
    const usage = await getUsage(auth.accountId);
    const planId = usage.planTier as PlanId;
    const plan = isPlanId(planId) ? PLANS[planId] : PLANS.free;

    return c.json({
      data: {
        planId: usage.planTier,
        name: usage.planTier.charAt(0).toUpperCase() + usage.planTier.slice(1),
        limits: {
          emailsPerMonth: plan.emailsPerMonth,
          domains: plan.domains,
          webhooks: plan.webhooks,
        },
        usage: {
          emailsSent: usage.emailsSent,
          percentUsed: usage.percentUsed,
        },
        periodStartedAt: usage.periodStartedAt,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to retrieve plan";
    return c.json(
      {
        error: {
          type: "billing_error",
          message,
          code: "plan_fetch_failed",
        },
      },
      500,
    );
  }
});

// ─── POST /v1/billing/webhook ─────────────────────────────────────────────
//
// This endpoint does NOT use the standard auth middleware. Stripe sends
// webhook events with a signature header that we verify directly.

billing.post("/webhook", async (c) => {
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message: "Missing stripe-signature header",
          code: "missing_signature",
        },
      },
      400,
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await c.req.text();
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Webhook signature verification failed";
    console.warn("[billing/webhook] Signature verification failed:", message);
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Invalid webhook signature",
          code: "invalid_signature",
        },
      },
      400,
    );
  }

  try {
    const result = await handleWebhookEvent(event);

    if (result.handled) {
      console.log(
        `[billing/webhook] Processed ${event.type}: ${result.action}`,
      );
    } else {
      console.log(
        `[billing/webhook] Ignored unhandled event type: ${event.type}`,
      );
    }

    return c.json({ received: true });
  } catch (err) {
    console.error("[billing/webhook] Error processing event:", err);
    return c.json(
      {
        error: {
          type: "server_error",
          message: "Failed to process webhook event",
          code: "webhook_processing_failed",
        },
      },
      500,
    );
  }
});

export { billing };
