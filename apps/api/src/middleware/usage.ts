/**
 * Usage Enforcement Middleware
 *
 * Checks whether the authenticated account has exceeded their plan's
 * monthly email sending limit before allowing the send to proceed.
 * Returns 429 Too Many Requests with plan upgrade information when
 * the limit is exceeded.
 */

import { createMiddleware } from "hono/factory";
import { PLANS } from "../lib/billing.js";
import type { PlanId } from "../lib/billing.js";
import { checkQuota } from "../lib/quota.js";

/**
 * Middleware that enforces email sending limits based on the account's plan.
 * Should be applied to email-sending routes (e.g., POST /v1/messages/send).
 *
 * Uses the Redis-backed checkQuota() as the single source of truth for the
 * sent count. billing.ts had a parallel counter (accounts.emailsSentThisPeriod)
 * that was never incremented by the messages route, causing divergence.
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
    const quota = await checkQuota(auth.accountId);

    if (!quota.allowed) {
      // Determine upgrade options
      const currentPlan = quota.plan as PlanId;
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

      const percentUsed =
        quota.limit > 0
          ? Math.round((quota.sent / quota.limit) * 10000) / 100
          : 0;

      return c.json(
        {
          error: {
            type: "rate_limit_exceeded",
            message: `Monthly email limit exceeded. Your ${quota.plan} plan allows ${quota.limit.toLocaleString()} emails per month. You have sent ${quota.sent.toLocaleString()}.`,
            code: "usage_limit_exceeded",
            details: {
              emailsSent: quota.sent,
              emailsLimit: quota.limit,
              percentUsed,
              planTier: quota.plan,
              periodStartedAt: quota.resetsAt,
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
  return;
});
