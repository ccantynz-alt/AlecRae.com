/**
 * Per-Account R2 Storage Quota Enforcement
 *
 * Tracks storage usage per account and enforces plan-based limits:
 *   - Free: 100 MB
 *   - Starter: 1 GB
 *   - Pro: 10 GB
 *   - Enterprise: 100 GB
 *
 * Provides increment/decrement on upload/delete and a weekly reconciliation job.
 */

import { eq, sql, sum } from "drizzle-orm";
import { getDatabase, accounts, attachments, emails } from "@emailed/db";
import type { PlanId } from "./billing.js";

// ─── Storage limits per plan (in bytes) ──────────────────────────────────────

export const STORAGE_LIMITS: Record<string, number> = {
  free: 100 * 1024 * 1024,           // 100 MB
  starter: 1 * 1024 * 1024 * 1024,   // 1 GB
  professional: 10 * 1024 * 1024 * 1024, // 10 GB
  pro: 10 * 1024 * 1024 * 1024,      // 10 GB (alias)
  enterprise: 100 * 1024 * 1024 * 1024,  // 100 GB
};

function getStorageLimit(planTier: string): number {
  return STORAGE_LIMITS[planTier] ?? STORAGE_LIMITS["free"]!;
}

// ─── Quota check result ──────────────────────────────────────────────────────

export interface StorageQuotaResult {
  allowed: boolean;
  currentUsageBytes: number;
  limitBytes: number;
  planTier: string;
}

/**
 * Check whether an account can upload a file of the given size.
 * Returns the current usage and limit regardless of outcome.
 */
export async function checkStorageQuota(
  accountId: string,
  newFileSize: number,
): Promise<StorageQuotaResult> {
  const db = getDatabase();

  const [account] = await db
    .select({
      planTier: accounts.planTier,
      storageUsedBytes: accounts.storageUsedBytes,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    // If no account found (dev mode), allow with free limits
    return {
      allowed: newFileSize <= STORAGE_LIMITS["free"]!,
      currentUsageBytes: 0,
      limitBytes: STORAGE_LIMITS["free"]!,
      planTier: "free",
    };
  }

  const planTier = account.planTier ?? "free";
  const limitBytes = getStorageLimit(planTier);
  const currentUsage = Number(account.storageUsedBytes ?? 0);

  return {
    allowed: currentUsage + newFileSize <= limitBytes,
    currentUsageBytes: currentUsage,
    limitBytes,
    planTier,
  };
}

/**
 * Increment the storage counter after a successful upload.
 */
export async function incrementStorageUsage(
  accountId: string,
  fileSize: number,
): Promise<void> {
  const db = getDatabase();

  await db
    .update(accounts)
    .set({
      storageUsedBytes: sql`${accounts.storageUsedBytes} + ${fileSize}`,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
}

/**
 * Decrement the storage counter after a file is deleted.
 * Clamps at 0 (never goes negative).
 */
export async function decrementStorageUsage(
  accountId: string,
  fileSize: number,
): Promise<void> {
  const db = getDatabase();

  await db
    .update(accounts)
    .set({
      storageUsedBytes: sql`GREATEST(0, ${accounts.storageUsedBytes} - ${fileSize})`,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
}

/**
 * Reconcile actual R2 usage by summing attachment sizes from the DB.
 * Called weekly via BullMQ repeat job to fix any drift.
 *
 * Returns the number of accounts that had their usage corrected.
 */
export async function reconcileStorageUsage(): Promise<number> {
  const db = getDatabase();
  let corrected = 0;

  // Get all accounts
  const allAccounts = await db
    .select({
      id: accounts.id,
      storageUsedBytes: accounts.storageUsedBytes,
    })
    .from(accounts);

  for (const acct of allAccounts) {
    // Sum attachment sizes for this account by joining emails -> attachments
    const [result] = await db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${attachments.size}), 0)`,
      })
      .from(attachments)
      .innerJoin(emails, eq(attachments.emailId, emails.id))
      .where(eq(emails.accountId, acct.id));

    const actualSize = Number(result?.totalSize ?? 0);
    const recorded = Number(acct.storageUsedBytes ?? 0);

    if (actualSize !== recorded) {
      await db
        .update(accounts)
        .set({
          storageUsedBytes: actualSize,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, acct.id));
      corrected++;
      console.log(
        `[storage-quota] Reconciled account ${acct.id}: ${recorded} -> ${actualSize} bytes`,
      );
    }
  }

  if (corrected > 0) {
    console.log(`[storage-quota] Reconciliation complete: ${corrected} accounts corrected`);
  }

  return corrected;
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
