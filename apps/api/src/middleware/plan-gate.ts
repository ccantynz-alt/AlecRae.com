/**
 * Server-side plan-tier enforcement.
 *
 * apps/web/lib/plan.ts's FEATURE_PLANS map gates AI-heavy features (agent,
 * semantic search, knowledge graph, context/commitments extraction, etc.) at
 * "pro" — but until this file, that gate existed ONLY in the Next.js client.
 * No route in apps/api checked a caller's plan tier, so any Free-tier session
 * could reach every Pro-gated Claude-backed endpoint with a direct API call,
 * with no ceiling on AI spend per account.
 *
 * The DB's `plan_tier` enum (packages/db/src/schema/users.ts) only has
 * free/starter/professional/enterprise — the consumer pricing table's
 * Personal/Pro/Team/Business/Business Plus names (CLAUDE.md) don't fully
 * exist as billable tiers yet. FEATURE_TIER_TO_DB_TIER below maps the
 * frontend's feature-plan labels onto what's actually enforceable today:
 * "personal" → the DB's "starter", and "team"/"business"/"business_plus" →
 * "pro" (the highest real paid tier below enterprise) rather than
 * "enterprise" — those tiers have no billing yet, and gating them at
 * enterprise would newly lock out paying Pro customers from features that
 * were previously unenforced.
 */

import { createMiddleware } from "hono/factory";
import type { PlanTier } from "../types.js";

const FEATURE_TIER_TO_DB_TIER: Record<string, PlanTier> = {
  free: "free",
  personal: "starter",
  pro: "pro",
  team: "pro",
  business: "pro",
  business_plus: "pro",
  enterprise: "enterprise",
};

const PLAN_TIER_ORDER: PlanTier[] = ["free", "starter", "pro", "enterprise"];

/**
 * Require the caller's plan to be at least `featureTier` — pass one of the
 * labels from apps/web/lib/plan.ts's FEATURE_PLANS (e.g. "pro", "personal").
 * Mount alongside authMiddleware; reads `auth.tier` set by it.
 */
export function requirePlan(featureTier: string) {
  const minDbTier = FEATURE_TIER_TO_DB_TIER[featureTier] ?? "enterprise";
  return createMiddleware(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      return c.json(
        { error: { type: "authentication_error", message: "Not authenticated", code: "unauthenticated" } },
        401,
      );
    }

    const have = PLAN_TIER_ORDER.indexOf(auth.tier);
    const need = PLAN_TIER_ORDER.indexOf(minDbTier);
    if (have === -1 || have < need) {
      return c.json(
        {
          error: {
            type: "plan_required",
            message: "This feature isn't included in your current plan. Upgrade to unlock it.",
            code: "plan_upgrade_required",
            requiredTier: featureTier,
            currentTier: auth.tier,
          },
        },
        403,
      );
    }

    await next();
    return;
  });
}
