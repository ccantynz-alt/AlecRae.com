import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// JSON column types
// ---------------------------------------------------------------------------

/** Triggers a program subscribes to. */
export type ProgramTriggerValue = "email.received" | "email.sent";

/** A single action requested by a program run (mirrors ai-engine ProgramAction). */
export interface ProgramRunAction {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Programs — user-authored TypeScript snippets that run on emails (B1-style)
// ---------------------------------------------------------------------------

export const programs = pgTable(
  "programs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Human-readable program name. */
    name: text("name").notNull(),
    /** Optional description of what the program does. */
    description: text("description").notNull().default(""),
    /** The TypeScript snippet source code. */
    code: text("code").notNull(),
    /** Events that trigger this program. */
    triggers: jsonb("triggers")
      .notNull()
      .$type<ProgramTriggerValue[]>()
      .default(["email.received"]),
    /** Whether the program is currently active. */
    enabled: boolean("enabled").notNull().default(true),
    /** Lifetime invocation counter. */
    runCount: integer("run_count").notNull().default(0),
    /** Lifetime error counter. */
    errorCount: integer("error_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("programs_account_id_idx").on(table.accountId),
    index("programs_account_enabled_idx").on(table.accountId, table.enabled),
  ],
);

// ---------------------------------------------------------------------------
// Program Runs — execution history for each program invocation
// ---------------------------------------------------------------------------

export const programRuns = pgTable(
  "program_runs",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),

    /** The email this run executed against (null for dry runs without one). */
    emailId: text("email_id"),
    /** When the run started. */
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Snippet execution time in milliseconds. */
    durationMs: integer("duration_ms").notNull().default(0),
    /** Actions the snippet requested (jsonb array). */
    actions: jsonb("actions").notNull().$type<ProgramRunAction[]>().default([]),
    /** Console-style log lines emitted by the snippet. */
    logs: jsonb("logs").notNull().$type<string[]>().default([]),
    /** Error message if the run failed. */
    error: text("error"),
  },
  (table) => [
    index("program_runs_program_id_idx").on(table.programId),
    index("program_runs_program_started_idx").on(
      table.programId,
      table.startedAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const programsRelations = relations(programs, ({ one, many }) => ({
  account: one(accounts, {
    fields: [programs.accountId],
    references: [accounts.id],
  }),
  runs: many(programRuns),
}));

export const programRunsRelations = relations(programRuns, ({ one }) => ({
  program: one(programs, {
    fields: [programRuns.programId],
    references: [programs.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ProgramRecord = typeof programs.$inferSelect;
export type NewProgramRecord = typeof programs.$inferInsert;
export type ProgramRunRecord = typeof programRuns.$inferSelect;
export type NewProgramRunRecord = typeof programRuns.$inferInsert;
