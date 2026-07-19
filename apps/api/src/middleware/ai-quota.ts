/**
 * AI Usage Quota Middleware
 *
 * Mirrors middleware/usage.ts's email-quota enforcement, for AI-calling
 * routes. Checks before the handler runs and increments after it completes
 * successfully — mount alongside authMiddleware on any route that spends a
 * Claude/Whisper call.
 */

import { createMiddleware } from "hono/factory";
import { checkAiQuota, incrementAiQuota } from "../lib/ai-quota.js";

export const requireAiQuota = createMiddleware(async (c, next) => {
  const auth = c.get("auth");

  if (!process.env["DATABASE_URL"]) {
    await next();
    return;
  }

  try {
    const quota = await checkAiQuota(auth.accountId);
    if (quota.enforced && !quota.allowed) {
      return c.json(
        {
          error: {
            type: "rate_limit_exceeded",
            message: `Monthly AI usage limit exceeded. Your ${quota.plan} plan allows ${quota.limit.toLocaleString()} AI calls per month. You've used ${quota.used.toLocaleString()}.`,
            code: "ai_quota_exceeded",
            details: {
              used: quota.used,
              limit: quota.limit,
              planTier: quota.plan,
              resetsAt: quota.resetsAt,
              upgradeUrl: "/v1/billing/checkout",
            },
          },
        },
        429,
      );
    }
  } catch (err) {
    console.warn("[ai-quota] Failed to check AI usage limit:", err);
  }

  await next();

  // Only count calls that actually succeeded — a 4xx/5xx from the handler
  // shouldn't burn the account's quota.
  if (c.res.status < 400) {
    incrementAiQuota(auth.accountId).catch(() => { /* fire-and-forget */ });
  }
  return;
});
