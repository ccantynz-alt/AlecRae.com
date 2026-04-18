/**
 * Dunning Worker — MVP
 *
 * Sweeps accounts that have been `past_due` for longer than the grace
 * window and downgrades them to `free` with `billingStatus =
 * 'downgraded_unpaid'`. Keeps an audit trail via the distinct status so
 * support can identify involuntary downgrades vs user-initiated
 * cancellations.
 *
 * Pure function, no scheduling — this file intentionally does NOT import
 * any cron or BullMQ runtime. Wire it up from whichever scheduler owns
 * background jobs (expected: BullMQ in a future change) by calling
 * `processDunning()` on a cadence. Running it more than once per minute
 * is safe; the WHERE clause scopes to the 7-day window.
 *
 * When a card actually succeeds after downgrade, `invoice.paid` in
 * billing.ts resets `billingStatus` back to `active` — but that handler
 * does NOT restore the previous plan tier. The user goes through
 * checkout again, which is the correct behavior for an involuntarily
 * cancelled subscription.
 */

import { getDatabase, accounts } from "@alecrae/db";
import { pastDueBeyondGraceClause } from "../lib/billing.js";

export interface DunningResult {
  downgraded: number;
}

export async function processDunning(): Promise<DunningResult> {
  const db = getDatabase();

  const downgraded = await db
    .update(accounts)
    .set({
      planTier: "free",
      billingStatus: "downgraded_unpaid",
      updatedAt: new Date(),
    })
    .where(pastDueBeyondGraceClause)
    .returning({ id: accounts.id });

  if (downgraded.length > 0) {
    console.warn(
      `[dunning] downgraded ${downgraded.length} account(s) to free after 7-day past_due`,
    );
  }

  return { downgraded: downgraded.length };
}
