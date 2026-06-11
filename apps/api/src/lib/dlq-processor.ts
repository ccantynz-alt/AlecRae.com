/**
 * Dead Letter Queue (DLQ) Processor
 *
 * Processes failed BullMQ jobs that exhausted all retries:
 *   1. Reads failed jobs from the queue
 *   2. Logs each to the `events` table as `job.failed`
 *   3. Auto-retries once after 1 hour (transient failure recovery)
 *   4. If still fails: marks as `permanently_failed`, alerts admin
 *   5. Exposes GET /v1/admin/dlq for admin inspection
 *
 * Registered as a BullMQ repeat job (every 15 minutes).
 */

import { Queue, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { getDatabase, dlqRecords, type DlqRecordEntry } from "@alecrae/db";
import { QUEUE_NAME, REDIS_URL } from "./queue.js";

// ─── DLQ record type ─────────────────────────────────────────────────────────

export interface DlqRecord {
  jobId: string;
  jobName: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  timestamp: string;
  status: "pending_retry" | "permanently_failed";
  retryScheduledAt?: string;
}

// In-memory write-through cache over the `dlq_records` table.
//
// The admin route reads the DLQ synchronously, so the Map stays as the read
// path; every mutation is also persisted to Postgres (best-effort) and the
// Map is re-hydrated from the DB at the start of each processDLQ() run so
// records survive API restarts. When DATABASE_URL is unset (dev no-DB mode)
// everything degrades to the previous in-memory-only behavior.
const dlqStore = new Map<string, DlqRecord>();

/** Map a DB row back into the in-memory record shape. Exported for tests. */
export function rowToDlqRecord(row: DlqRecordEntry): DlqRecord {
  return {
    jobId: row.jobId,
    jobName: row.jobName,
    data: row.data ?? null,
    failedReason: row.failedReason,
    attemptsMade: row.attemptsMade,
    timestamp: row.createdAt.toISOString(),
    status: row.status,
    ...(row.retryScheduledAt
      ? { retryScheduledAt: row.retryScheduledAt.toISOString() }
      : {}),
  };
}

/** Persist (upsert) a record — best-effort, no-op without a DB. */
function persistDlqRecord(record: DlqRecord): void {
  void (async (): Promise<void> => {
    try {
      const db = getDatabase();
      const values = {
        jobId: record.jobId,
        jobName: record.jobName,
        data: record.data,
        failedReason: record.failedReason,
        attemptsMade: record.attemptsMade,
        status: record.status,
        retryScheduledAt: record.retryScheduledAt
          ? new Date(record.retryScheduledAt)
          : null,
        createdAt: new Date(record.timestamp),
      };
      await db
        .insert(dlqRecords)
        .values(values)
        .onConflictDoUpdate({ target: dlqRecords.jobId, set: values });
    } catch {
      // No DB configured / DB unreachable — in-memory store still has the record.
    }
  })();
}

/** Delete a record from the DB — best-effort, no-op without a DB. */
function deleteDlqRecordFromDb(jobId: string): void {
  void (async (): Promise<void> => {
    try {
      const db = getDatabase();
      await db.delete(dlqRecords).where(eq(dlqRecords.jobId, jobId));
    } catch {
      // No DB configured / DB unreachable.
    }
  })();
}

/** Re-load all persisted records into the in-memory cache. */
async function hydrateDlqStore(): Promise<void> {
  try {
    const db = getDatabase();
    const rows = await db.select().from(dlqRecords);
    for (const row of rows) {
      // DB is the durable source of truth across restarts, but never
      // downgrade a permanently_failed record already known in-process.
      const existing = dlqStore.get(row.jobId);
      if (existing?.status === "permanently_failed") continue;
      dlqStore.set(row.jobId, rowToDlqRecord(row));
    }
  } catch {
    // No DB configured / DB unreachable — keep the in-memory view.
  }
}

// ─── DLQ processor ───────────────────────────────────────────────────────────

/**
 * Process all failed jobs in the BullMQ queue.
 * Returns the number of jobs processed.
 */
export async function processDLQ(): Promise<number> {
  let queue: Queue | null = null;

  // Recover persisted DLQ state (survives restarts; no-op without a DB).
  await hydrateDlqStore();

  try {
    queue = new Queue(QUEUE_NAME, {
      connection: { url: REDIS_URL },
    });

    // Get failed jobs (up to 100 at a time)
    const failedJobs = await queue.getFailed(0, 100);

    if (failedJobs.length === 0) {
      return 0;
    }

    let processed = 0;

    for (const job of failedJobs) {
      try {
        await processFailedJob(queue, job);
        processed++;
      } catch (err) {
        console.error(`[dlq] Error processing failed job ${job.id}:`, err);
      }
    }

    console.log(`[dlq] Processed ${processed}/${failedJobs.length} failed jobs`);
    return processed;
  } catch (err) {
    console.error("[dlq] Error reading failed jobs:", err);
    return 0;
  } finally {
    if (queue) {
      await queue.close().catch(() => {
        /* intentional no-op: best-effort cleanup */
      });
    }
  }
}

async function processFailedJob(queue: Queue, job: Job): Promise<void> {
  const jobId = job.id ?? "unknown";
  const failedReason = job.failedReason ?? "Unknown error";
  const attemptsMade = job.attemptsMade ?? 0;

  // Check if we already have this in the DLQ store
  const existing = dlqStore.get(jobId);

  if (existing && existing.status === "permanently_failed") {
    // Already permanently failed, skip
    return;
  }

  // Check if this is a DLQ retry that already happened
  const dlqRetryMarker = `dlq_retry:${jobId}`;
  const hasDlqRetry = dlqStore.has(dlqRetryMarker);

  if (!hasDlqRetry) {
    // First time seeing this failed job — schedule a retry after 1 hour
    const retryAt = new Date(Date.now() + 60 * 60 * 1000);

    const record: DlqRecord = {
      jobId,
      jobName: job.name,
      data: job.data,
      failedReason,
      attemptsMade,
      timestamp: new Date().toISOString(),
      status: "pending_retry",
      retryScheduledAt: retryAt.toISOString(),
    };

    dlqStore.set(jobId, record);
    persistDlqRecord(record);

    // Schedule retry: re-add the job to the queue with a delay
    try {
      await queue.add(job.name, job.data, {
        delay: 60 * 60 * 1000, // 1 hour
        jobId: `${jobId}_dlq_retry`,
        removeOnComplete: true,
        removeOnFail: false,
      });

      // Mark that we scheduled a DLQ retry for this job
      const marker: DlqRecord = {
        jobId: dlqRetryMarker,
        jobName: job.name,
        data: null,
        failedReason: "DLQ retry marker",
        attemptsMade: 0,
        timestamp: new Date().toISOString(),
        status: "pending_retry",
      };
      dlqStore.set(dlqRetryMarker, marker);
      persistDlqRecord(marker);

      // Remove the original failed job from the queue
      await job.remove().catch(() => {
        /* intentional no-op: best-effort cleanup */
      });

      console.log(`[dlq] Job ${jobId} scheduled for retry at ${retryAt.toISOString()}`);
    } catch (err) {
      console.error(`[dlq] Failed to schedule retry for job ${jobId}:`, err);
      // Mark as permanently failed if we can't even schedule a retry
      markPermanentlyFailed(jobId, job.name, job.data, failedReason, attemptsMade);
    }
  } else {
    // This is the DLQ retry that also failed — mark as permanently failed
    markPermanentlyFailed(jobId, job.name, job.data, failedReason, attemptsMade);

    // Remove from queue
    await job.remove().catch(() => {
        /* intentional no-op: best-effort cleanup */
      });
  }
}

function markPermanentlyFailed(
  jobId: string,
  jobName: string,
  data: unknown,
  failedReason: string,
  attemptsMade: number,
): void {
  const record: DlqRecord = {
    jobId,
    jobName,
    data,
    failedReason,
    attemptsMade,
    timestamp: new Date().toISOString(),
    status: "permanently_failed",
  };

  dlqStore.set(jobId, record);
  persistDlqRecord(record);

  console.error(
    `[dlq] Job ${jobId} (${jobName}) PERMANENTLY FAILED after DLQ retry. Reason: ${failedReason}`,
  );
}

// ─── DLQ inspection ──────────────────────────────────────────────────────────

/**
 * Get all DLQ records for admin inspection.
 * Filters out internal retry markers.
 */
export function getDlqRecords(): DlqRecord[] {
  return Array.from(dlqStore.values()).filter(
    (r) => !r.jobId.startsWith("dlq_retry:"),
  );
}

/**
 * Get DLQ summary stats.
 */
export function getDlqStats(): {
  total: number;
  pendingRetry: number;
  permanentlyFailed: number;
} {
  const records = getDlqRecords();
  return {
    total: records.length,
    pendingRetry: records.filter((r) => r.status === "pending_retry").length,
    permanentlyFailed: records.filter((r) => r.status === "permanently_failed").length,
  };
}

/**
 * Clear a DLQ record (admin action). Removes from the in-memory cache
 * immediately and from the DB best-effort.
 */
export function clearDlqRecord(jobId: string): boolean {
  const deleted = dlqStore.delete(jobId);
  if (deleted) deleteDlqRecordFromDb(jobId);
  return deleted;
}

/**
 * Clear all permanently failed records (in-memory + DB best-effort).
 */
export function clearPermanentlyFailed(): number {
  let cleared = 0;
  for (const [key, record] of dlqStore.entries()) {
    if (record.status === "permanently_failed") {
      dlqStore.delete(key);
      deleteDlqRecordFromDb(key);
      cleared++;
    }
  }
  return cleared;
}
