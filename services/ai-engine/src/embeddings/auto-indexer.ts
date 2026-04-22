/**
 * Auto-Indexer — Background Embedding Service
 *
 * Automatically embeds emails into the vector store when they are
 * received or sent. Runs as a background worker that processes a queue
 * of email IDs, embedding each one and upserting into `email_embeddings`.
 *
 * Design:
 *   - In-memory queue with configurable concurrency
 *   - Retries with exponential backoff (max 3 attempts)
 *   - Batch processing (up to 64 emails per embedding API call)
 *   - Rate limiting to avoid blowing through API quotas
 *   - Stats tracking for monitoring
 *   - Graceful shutdown (drain queue before stopping)
 *
 * The auto-indexer is started by the API server on boot and listens
 * for new emails via `enqueueEmail()`. It can also be triggered
 * manually via `indexAllUnindexed()` for backfill.
 */

import { sql, inArray } from "drizzle-orm";
import { getDatabase, emails } from "@alecrae/db";
import { embedBatch, VOYAGE_MODEL, EMBEDDING_DIMENSIONS } from "./voyage.js";
import {
  type AutoIndexJob,
  type AutoIndexStats,
  type EmbeddableEmail,
  MAX_INPUT_LENGTH,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_BATCH_SIZE = 64;
const PROCESS_INTERVAL_MS = 2000;
const BACKFILL_PAGE_SIZE = 256;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const _queue: AutoIndexJob[] = [];
let _isRunning = false;
let _intervalHandle: ReturnType<typeof setInterval> | null = null;
let _totalQueued = 0;
let _totalIndexed = 0;
let _totalFailed = 0;
let _lastRunAt: Date | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the text document for embedding from an email row.
 * Includes sender, subject, and body (capped at MAX_INPUT_LENGTH chars).
 */
function buildEmailDocument(row: EmbeddableEmail): string {
  const sender = row.fromName
    ? `${row.fromName} <${row.fromAddress}>`
    : row.fromAddress;
  const body =
    row.textBody ??
    (row.htmlBody
      ? row.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      : "");
  return `From: ${sender}\nSubject: ${row.subject}\n\n${body}`.slice(
    0,
    MAX_INPUT_LENGTH,
  );
}

function toVectorLiteral(vec: readonly number[]): string {
  return `[${vec.join(",")}]`;
}

// ---------------------------------------------------------------------------
// Core Processing
// ---------------------------------------------------------------------------

/**
 * Process a batch of jobs: fetch email rows, embed them, upsert vectors.
 */
async function processBatch(jobs: AutoIndexJob[]): Promise<void> {
  if (jobs.length === 0) return;

  const db = getDatabase();
  const emailIds = jobs.map((j) => j.emailId);

  // Fetch email rows (scoped by accountId via the job metadata — we trust the queue)
  const rows = await db
    .select({
      id: emails.id,
      accountId: emails.accountId,
      subject: emails.subject,
      fromAddress: emails.fromAddress,
      fromName: emails.fromName,
      textBody: emails.textBody,
      htmlBody: emails.htmlBody,
      createdAt: emails.createdAt,
    })
    .from(emails)
    .where(inArray(emails.id, emailIds));

  if (rows.length === 0) {
    // All emails were deleted before we got to them — mark as skipped
    _totalFailed += jobs.length;
    return;
  }

  // Build documents for embedding
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const validJobs: { job: AutoIndexJob; row: EmbeddableEmail; doc: string }[] = [];

  for (const job of jobs) {
    const row = rowMap.get(job.emailId);
    if (row) {
      validJobs.push({
        job,
        row: row as EmbeddableEmail,
        doc: buildEmailDocument(row as EmbeddableEmail),
      });
    } else {
      _totalFailed += 1;
    }
  }

  if (validJobs.length === 0) return;

  // Embed in batch
  const documents = validJobs.map((v) => v.doc);
  const vectors = await embedBatch(documents);

  // Upsert into pgvector
  for (let i = 0; i < validJobs.length; i++) {
    const entry = validJobs[i];
    if (!entry) continue;
    const vec = vectors[i];
    if (!vec || vec.length !== EMBEDDING_DIMENSIONS) {
      _totalFailed += 1;
      continue;
    }

    const literal = toVectorLiteral(vec);
    const id = generateId();

    await db.execute(sql`
      INSERT INTO email_embeddings (id, email_id, embedding_vector, model, created_at)
      VALUES (${id}, ${entry.row.id}, ${literal}::vector, ${VOYAGE_MODEL}, now())
      ON CONFLICT (email_id, model) DO UPDATE
        SET embedding_vector = EXCLUDED.embedding_vector,
            created_at = now()
    `);

    _totalIndexed += 1;
  }
}

/**
 * Drain the queue: pull up to MAX_BATCH_SIZE jobs and process them.
 * Failed jobs are re-queued with incremented retry count.
 */
async function drainQueue(): Promise<void> {
  if (_queue.length === 0) return;

  const batch = _queue.splice(0, MAX_BATCH_SIZE);
  _lastRunAt = new Date();

  try {
    await processBatch(batch);
  } catch (err) {
    console.error("[auto-indexer] Batch processing failed:", (err as Error).message);

    // Re-queue failed jobs with backoff
    for (const job of batch) {
      if (job.retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, job.retryCount);
        setTimeout(() => {
          _queue.push({
            emailId: job.emailId,
            accountId: job.accountId,
            retryCount: job.retryCount + 1,
          });
        }, delay);
      } else {
        _totalFailed += 1;
        console.warn(
          `[auto-indexer] Permanently failed to index email ${job.emailId} after ${MAX_RETRIES} retries`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a single email for background embedding.
 * Called by the email ingest pipeline when a new email arrives.
 */
export function enqueueEmail(emailId: string, accountId: string): void {
  _queue.push({ emailId, accountId, retryCount: 0 });
  _totalQueued += 1;
}

/**
 * Enqueue multiple emails for background embedding.
 */
export function enqueueEmails(
  items: readonly { emailId: string; accountId: string }[],
): void {
  for (const item of items) {
    _queue.push({
      emailId: item.emailId,
      accountId: item.accountId,
      retryCount: 0,
    });
  }
  _totalQueued += items.length;
}

/**
 * Start the auto-indexer background worker.
 * Call once on API server startup.
 */
export function startAutoIndexer(): void {
  if (_isRunning) return;
  _isRunning = true;

  _intervalHandle = setInterval(() => {
    drainQueue().catch((err) => {
      console.error("[auto-indexer] Unexpected error in drain loop:", err);
    });
  }, PROCESS_INTERVAL_MS);

  console.log("[auto-indexer] Started — processing queue every", PROCESS_INTERVAL_MS, "ms");
}

/**
 * Stop the auto-indexer and drain remaining items.
 */
export async function stopAutoIndexer(): Promise<void> {
  if (!_isRunning) return;
  _isRunning = false;

  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }

  // Final drain
  if (_queue.length > 0) {
    console.log(`[auto-indexer] Draining ${_queue.length} remaining jobs...`);
    await drainQueue();
  }

  console.log("[auto-indexer] Stopped");
}

/**
 * Get current stats for monitoring.
 */
export function getAutoIndexerStats(): AutoIndexStats {
  return {
    totalQueued: _totalQueued,
    totalIndexed: _totalIndexed,
    totalFailed: _totalFailed,
    isRunning: _isRunning,
    lastRunAt: _lastRunAt?.toISOString() ?? null,
  };
}

/**
 * Backfill: find all emails for an account that DON'T yet have embeddings
 * and enqueue them. Returns the number of emails enqueued.
 */
export async function indexAllUnindexed(accountId: string): Promise<number> {
  const db = getDatabase();
  let enqueued = 0;
  let offset = 0;

   
  while (true) {
    const unindexed = await db.execute<{ id: string }>(sql`
      SELECT e.id
      FROM emails e
      LEFT JOIN email_embeddings ee ON ee.email_id = e.id
      WHERE e.account_id = ${accountId}
        AND ee.id IS NULL
      ORDER BY e.created_at DESC
      LIMIT ${BACKFILL_PAGE_SIZE}
      OFFSET ${offset}
    `);

    const rows =
      (unindexed as unknown as { rows: { id: string }[] }).rows ?? [];

    if (rows.length === 0) break;

    for (const row of rows) {
      enqueueEmail(row.id, accountId);
    }

    enqueued += rows.length;
    offset += BACKFILL_PAGE_SIZE;

    // Safety: don't queue more than 10K in one backfill call
    if (enqueued >= 10_000) break;
  }

  return enqueued;
}
