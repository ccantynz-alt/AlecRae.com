/**
 * Owner allowlist — founder / staff accounts that get full product access
 * without paying.
 *
 * The platform owner should never be plan-gated on his own product. Any email
 * in `OWNER_EMAILS` (comma-separated env var) is treated as an enterprise-tier
 * account: granted on first account creation AND reconciled on every login, so
 * a pre-existing `free` account is upgraded the next time the owner signs in.
 *
 * This is intentionally env-driven (not hard-coded) so the allowlist can change
 * without a deploy, and so it's empty/safe by default in any environment that
 * doesn't set it.
 */

import { getDatabase, accounts } from "@alecrae/db";
import { eq } from "drizzle-orm";

/** The plan tier owner accounts are pinned to (highest tier = full access). */
export const OWNER_PLAN_TIER = "enterprise" as const;

/**
 * Built-in owner(s). The founder is always an owner so the product works with
 * zero env configuration on a fresh box. Additional owners (staff, co-founders)
 * are added via the `OWNER_EMAILS` env var without touching code.
 */
const DEFAULT_OWNER_EMAILS = ["ccantynz@gmail.com"] as const;

/** Parse the allowlist once: built-in defaults + OWNER_EMAILS, normalised. */
function parseOwnerEmails(): ReadonlySet<string> {
  const fromEnv = (process.env["OWNER_EMAILS"] ?? "").split(",");
  return new Set(
    [...DEFAULT_OWNER_EMAILS, ...fromEnv]
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/** True when `email` is on the owner allowlist. */
export function isOwnerEmail(email: string): boolean {
  return parseOwnerEmails().has(email.trim().toLowerCase());
}

/**
 * If `email` is an owner, ensure its account is pinned to the owner plan tier.
 * Returns the tier the caller should use for the session token: the owner tier
 * for owners, otherwise the `currentTier` passed in (unchanged).
 *
 * Safe to call on every login — it only issues a DB write when the stored tier
 * is actually behind, so returning non-owners and already-correct owners cost
 * nothing extra.
 */
export async function reconcileOwnerPlan(
  accountId: string,
  email: string,
  currentTier: string,
): Promise<string> {
  if (!isOwnerEmail(email)) return currentTier;
  if (currentTier !== OWNER_PLAN_TIER) {
    const db = getDatabase();
    await db
      .update(accounts)
      .set({ planTier: OWNER_PLAN_TIER })
      .where(eq(accounts.id, accountId));
  }
  return OWNER_PLAN_TIER;
}
