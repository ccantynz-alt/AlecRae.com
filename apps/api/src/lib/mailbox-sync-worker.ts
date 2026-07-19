/**
 * Mailbox sync persistence + background re-sync worker.
 *
 * `syncAccount()` in sync/engine.ts fetches mail and returns a `SyncResult`
 * describing what happened (new historyId/deltaLink cursor, refreshed OAuth
 * tokens, errors) — but returning that result is useless if nobody writes it
 * back. Previously every call site (initial connect, manual "sync now",
 * bulk import) discarded it, so:
 *   - incremental sync never worked (the cursor was never saved, so every
 *     sync re-fetched the same first page of messages)
 *   - refreshed OAuth tokens were thrown away, so a mid-sync token refresh
 *     didn't prevent the next sync/send from hitting an expired token
 *   - sync failures were invisible — the account stayed "active" with no
 *     record anything had gone wrong
 *   - nothing ever synced again after the first connect, because nothing
 *     called syncAccount() on a schedule
 *
 * `syncAndPersist()` fixes the first three by always writing the result back
 * to `connected_accounts`. `startMailboxResyncWorker()` fixes the fourth with
 * a simple interval sweep (matching the existing DLQ-processor pattern in
 * server.ts) rather than introducing a new BullMQ queue for what is, for now,
 * a straightforward "re-sync everything active" loop.
 */

import { eq, and, lt, or, isNull } from "drizzle-orm";
import { getDatabase, connectedAccounts } from "@alecrae/db";
import { syncAccount, type EmailAccount, type SyncResult } from "../sync/engine.js";
import { isRedisConfigured } from "./queue.js";

type ConnectedAccountRow = typeof connectedAccounts.$inferSelect;

const RESYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
/** Skip an account if it was synced more recently than this — avoids re-syncing
 *  an account the interval sweep just picked up seconds after a manual sync. */
const MIN_RESYNC_GAP_MS = 4 * 60 * 1000;

function rowToEmailAccount(row: ConnectedAccountRow): EmailAccount {
  return {
    id: row.id,
    userId: row.accountId,
    provider: row.provider,
    email: row.email,
    displayName: row.displayName ?? row.email,
    ...(row.accessToken ? { accessToken: row.accessToken } : {}),
    ...(row.refreshToken ? { refreshToken: row.refreshToken } : {}),
    ...(row.tokenExpiresAt ? { tokenExpiresAt: row.tokenExpiresAt } : {}),
    ...(row.syncCursor ? { syncState: row.syncCursor } : {}),
    status: row.status === "error" ? "error" : "active",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Run a sync for one connected-account row and persist everything the sync
 * produced: cursor, refreshed tokens, last-synced timestamp, and error state.
 * Safe to call from a request handler (manual "sync now") or from the
 * background sweep — always writes back regardless of caller.
 */
export async function syncAndPersist(row: ConnectedAccountRow): Promise<SyncResult> {
  const account = rowToEmailAccount(row);
  const result = await syncAccount(account);

  const db = getDatabase();
  const now = new Date();

  // A "hard" failure is one where the sync produced nothing and reported an
  // error — as opposed to a partial failure (some messages synced, one
  // individual message failed to fetch) which still counts as a successful
  // sync overall.
  const hardFailure = result.errors.length > 0 && result.messagesAdded === 0 && result.messagesUpdated === 0;

  await db
    .update(connectedAccounts)
    .set({
      lastSyncAt: now,
      updatedAt: now,
      ...(result.newSyncState !== undefined ? { syncCursor: result.newSyncState } : {}),
      ...(result.newAccessToken !== undefined ? { accessToken: result.newAccessToken } : {}),
      ...(result.newRefreshToken !== undefined ? { refreshToken: result.newRefreshToken } : {}),
      ...(result.newTokenExpiresAt !== undefined ? { tokenExpiresAt: result.newTokenExpiresAt } : {}),
      lastError: result.errors.length > 0 ? result.errors.slice(0, 3).join("; ").slice(0, 500) : null,
      status: hardFailure ? "error" : "active",
    })
    .where(eq(connectedAccounts.id, row.id));

  return result;
}

/**
 * Sweep every account eligible for background re-sync: status "active" or
 * "error" (a previously-failed account gets retried, not abandoned), Gmail or
 * Outlook (generic IMAP has no polling sync implementation yet — see
 * syncAccount()'s "imap" branch), and not synced within the last few minutes.
 */
export async function resyncEligibleAccounts(): Promise<{ attempted: number; failed: number }> {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - MIN_RESYNC_GAP_MS);

  const rows = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        or(eq(connectedAccounts.status, "active"), eq(connectedAccounts.status, "error")),
        or(isNull(connectedAccounts.lastSyncAt), lt(connectedAccounts.lastSyncAt, cutoff)),
      ),
    );

  let attempted = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.provider !== "gmail" && row.provider !== "outlook") continue;
    attempted++;
    try {
      const result = await syncAndPersist(row);
      if (result.errors.length > 0 && result.messagesAdded === 0 && result.messagesUpdated === 0) {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`[mailbox-resync] sync threw for ${row.email}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return { attempted, failed };
}

let resyncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background re-sync sweep. No-ops when Redis isn't configured —
 * not because the sweep needs Redis itself, but because an unconfigured
 * Redis is this codebase's signal for "not a real deployment" (matches the
 * DLQ-processor gate a few lines above this one's call site in server.ts).
 */
export function startMailboxResyncWorker(): void {
  if (resyncTimer) return;
  if (!isRedisConfigured()) {
    console.warn("[mailbox-resync] Redis not configured — background mailbox sync disabled");
    return;
  }
  resyncTimer = setInterval(() => {
    resyncEligibleAccounts()
      .then(({ attempted, failed }) => {
        if (attempted > 0) {
          console.log(`[mailbox-resync] cycle complete: ${attempted} synced, ${failed} failed`);
        }
      })
      .catch((err) => {
        console.warn("[mailbox-resync] cycle error:", err instanceof Error ? err.message : String(err));
      });
  }, RESYNC_INTERVAL_MS);
}

export function stopMailboxResyncWorker(): void {
  if (resyncTimer) {
    clearInterval(resyncTimer);
    resyncTimer = null;
  }
}
