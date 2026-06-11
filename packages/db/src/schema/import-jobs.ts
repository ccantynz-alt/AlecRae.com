import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const importSourceEnum = pgEnum("import_source", [
  "gmail",
  "outlook",
  "mbox",
  "eml",
  "thunderbird",
  "apple_mail",
]);

export const importJobStatusEnum = pgEnum("import_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

// ---------------------------------------------------------------------------
// JSON column types
// ---------------------------------------------------------------------------

/** Progress counters for an import job. */
export interface ImportJobProgress {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Import Jobs — one-click email migration job state
// ---------------------------------------------------------------------------

export const importJobs = pgTable(
  "import_jobs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Where the emails are being imported from. */
    source: importSourceEnum("source").notNull(),
    /** Current job state. */
    status: importJobStatusEnum("status").notNull().default("pending"),
    /** Progress counters (total / processed / failed / skipped). */
    progress: jsonb("progress")
      .notNull()
      .$type<ImportJobProgress>()
      .default({ total: 0, processed: 0, failed: 0, skipped: 0 }),
    /** Error message if the job failed. */
    error: text("error"),

    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("import_jobs_account_id_idx").on(table.accountId),
    index("import_jobs_account_started_idx").on(
      table.accountId,
      table.startedAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  account: one(accounts, {
    fields: [importJobs.accountId],
    references: [accounts.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ImportJobRecord = typeof importJobs.$inferSelect;
export type NewImportJobRecord = typeof importJobs.$inferInsert;
