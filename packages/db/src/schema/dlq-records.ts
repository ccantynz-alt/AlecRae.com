import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const dlqStatusEnum = pgEnum("dlq_status", [
  "pending_retry",
  "permanently_failed",
]);

// ---------------------------------------------------------------------------
// DLQ Records — dead-letter queue entries for failed BullMQ jobs
//
// Persists the DLQ state so failed-job history survives API restarts. The
// in-process DLQ processor keeps a write-through in-memory cache for sync
// reads; this table is the durable source of truth.
// ---------------------------------------------------------------------------

export const dlqRecords = pgTable(
  "dlq_records",
  {
    /** BullMQ job id (also used for internal `dlq_retry:` marker rows). */
    jobId: text("job_id").primaryKey(),
    /** BullMQ job name. */
    jobName: text("job_name").notNull(),
    /** Original job payload. */
    data: jsonb("data").$type<unknown>(),
    /** Why the job failed. */
    failedReason: text("failed_reason").notNull(),
    /** How many attempts the job made before landing in the DLQ. */
    attemptsMade: integer("attempts_made").notNull().default(0),
    /** Whether the record is awaiting its one DLQ retry or is final. */
    status: dlqStatusEnum("status").notNull(),
    /** When the DLQ retry is scheduled to fire (null once final). */
    retryScheduledAt: timestamp("retry_scheduled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("dlq_records_status_idx").on(table.status)],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DlqRecordRow = typeof dlqRecords.$inferSelect;
export type NewDlqRecordRow = typeof dlqRecords.$inferInsert;
