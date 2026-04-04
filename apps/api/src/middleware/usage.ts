/**
 * Usage Enforcement Middleware
 *
 * Checks whether the authenticated account has exceeded their plan's
 * monthly email sending limit before allowing the send to proceed.
 * Returns 429 Too Many Requests with plan upgrade information when
 * the limit is exceeded.
 */

import { createMiddleware } from "hono/factory";
import { checkUsageLimit, PLANS } from "../lib/billing.js";
import type { PlanId } from "../lib/billing.js";

/**
 * Middleware that enforces email sending limits based on the account's plan.
 * Should be applied to email-sending routes (e.g., POST /v1/messages/send).
 *
 * If the account is over its limit, it returns a 429 response with details
 * about the current usage, the plan limit, and available upgrade options.
 */
export const usageEnforcement = createMiddleware(async (c, next) => {
  const auth = c.get("auth");

  // In development without a database, skip enforcement
  if (!process.env["DATABASE_URL"]) {
    await next();
    return;
  }

  try {
    const { allowed, usage } = await checkUsageLimit(auth.accountId);

    if (!allowed) {
      // Determine upgrade options
      const currentPlan = usage.planTier as PlanId;
      const planOrder: PlanId[] = [
        "free",
        "starter",
        "professional",
        "enterprise",
      ];
      const currentIndex = planOrder.indexOf(currentPlan);
      const upgradePlans = planOrder
        .slice(currentIndex + 1)
        .map((id) => ({
          planId: id,
          emailsPerMonth: PLANS[id].emailsPerMonth,
        }));

      return c.json(
        {
          error: {
            type: "rate_limit_exceeded",
            message: `Monthly email limit exceeded. Your ${usage.planTier} plan allows ${usage.emailsLimit.toLocaleString()} emails per month. You have sent ${usage.emailsSent.toLocaleString()}.`,
            code: "usage_limit_exceeded",
            details: {
              emailsSent: usage.emailsSent,
              emailsLimit: usage.emailsLimit,
              percentUsed: usage.percentUsed,
              planTier: usage.planTier,
              periodStartedAt: usage.periodStartedAt,
              upgradePlans:
                upgradePlans.length > 0 ? upgradePlans : undefined,
              upgradeUrl: "/v1/billing/checkout",
            },
          },
        },
        429,
      );
    }
  } catch (err) {
    // If billing check fails, log but allow the request through
    // to avoid blocking sends due to billing system outages.
    console.warn("[usage] Failed to check usage limit:", err);
  }

  await next();
});
