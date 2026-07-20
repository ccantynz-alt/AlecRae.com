/**
 * Account deletion sweep — the other half of the 30-day soft-delete grace
 * window (CLAUDE.md Forbidden List rule #13).
 *
 * DELETE /v1/account (routes/account.ts) only marks an account
 * status="scheduled_for_deletion" with a scheduledDeletionAt 30 days out —
 * it never deletes anything itself. This sweep, run daily, is what
 * actually performs the deletion once the grace window has elapsed, and
 * only then. `onDelete: "cascade"` on every table referencing accounts.id
 * (users, emails, domains, etc.) means one DELETE FROM accounts removes
 * everything belonging to it.
 */

import { and, eq, lte } from "drizzle-orm";
import { getDatabase, accounts } from "@alecrae/db";

/**
 * Hard-delete every account whose grace window has elapsed. Never throws —
 * a failure for one account is logged and the sweep continues with the
 * rest, matching the fail-safe pattern of the other periodic sweeps in
 * this codebase (billing.ts's processExpiredGrace, snooze.ts's
 * resurfaceSnoozedEmails).
 */
export async function processScheduledAccountDeletions(): Promise<{ deleted: number }> {
  const db = getDatabase();
  const now = new Date();

  const due = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.status, "scheduled_for_deletion"), lte(accounts.scheduledDeletionAt, now)));

  let deleted = 0;
  for (const account of due) {
    try {
      await db.delete(accounts).where(eq(accounts.id, account.id));
      deleted++;
      console.log(`[account-deletion] Permanently deleted account ${account.id} (grace window elapsed)`);
    } catch (err) {
      console.error(
        `[account-deletion] Failed to delete account ${account.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { deleted };
}
