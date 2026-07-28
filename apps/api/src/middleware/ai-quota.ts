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

  // Reads never spend an AI call, so they must never spend quota.
  //
  // This middleware is mounted on path WILDCARDS (`/v1/ai/categorize/*`,
  // `/v1/sentiment/*`, `/v1/agent/*`, ...), which sweep in every endpoint
  // beneath them — including plain database reads. On /v1/ai/categorize alone
  // that meant 10 of 12 endpoints charged quota while only 2 call Claude:
  // merely LISTING your smart rules, or opening the stats tab, drew down the
  // monthly allowance. Enough of those and a user is locked out of the AI they
  // are paying for without ever having used it.
  //
  // Verified before relying on it: no GET endpoint in apps/api/src/routes
  // makes an AI call — every AI-calling route is a POST. So skipping GET is a
  // safe blanket correction rather than a guess, and it fixes every affected
  // router at once instead of re-auditing ~20 wildcard mounts by hand.
  //
  // Deliberately keyed on the HTTP method, not a path list: a new read
  // endpoint added under an existing wildcard inherits the right behaviour
  // instead of quietly inheriting the bug.
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    await next();
    return;
  }

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
