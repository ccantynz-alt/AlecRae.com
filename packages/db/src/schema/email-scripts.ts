import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  integer,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const scriptTriggerEnum = pgEnum("script_trigger", [
  "on_receive",
  "on_send",
  "manual",
  "scheduled",
]);

export const scriptRunStatusEnum = pgEnum("script_run_status", [
  "success",
  "error",
  "timeout",
]);

// ---------------------------------------------------------------------------
// Email Scripts — user-authored TypeScript snippets that run on emails
// ---------------------------------------------------------------------------

export const emailScripts = pgTable(
  "email_scripts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Human-readable name for the script. */
    name: text("name").notNull(),
    /** Optional description of what the script does. */
    description: text("description"),
    /** The TypeScript snippet source code. */
    code: text("code").notNull(),
    /** When the script should be triggered. */
    trigger: scriptTriggerEnum("trigger").notNull().default("on_receive"),
    /** Cron expression for scheduled triggers (nullable). */
    schedule: text("schedule"),
    /** Whether the script is currently active. */
    isActive: boolean("is_active").notNull().default(true),

    /** Last time this script was executed. */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Total number of successful + failed runs. */
    runCount: integer("run_count").notNull().default(0),
    /** Total number of failed runs. */
    errorCount: integer("error_count").notNull().default(0),
    /** Last error message (if any). */
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_scripts_account_id_idx").on(table.accountId),
    index("email_scripts_account_trigger_idx").on(
      table.accountId,
      table.trigger,
    ),
    index("email_scripts_account_active_idx").on(
      table.accountId,
      table.isActive,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Script Runs — execution history for each script invocation
// ---------------------------------------------------------------------------

/** JSON-serializable action record produced by a snippet run. */
export interface ScriptAction {
  type: string;
  params: Record<string, unknown>;
}

export const scriptRuns = pgTable(
  "script_runs",
  {
    id: text("id").primaryKey(),
    scriptId: text("script_id")
      .notNull()
      .references(() => emailScripts.id, { onDelete: "cascade" }),
    /** The email that triggered this run (nullable for scheduled/manual). */
    emailId: text("email_id"),
    /** Outcome of the run. */
    status: scriptRunStatusEnum("status").notNull(),
    /** How long the snippet took to execute in milliseconds. */
    executionTimeMs: integer("execution_time_ms").notNull(),
    /** Actions the snippet requested (jsonb array). */
    actionsExecuted: jsonb("actions_executed")
      .notNull()
      .$type<ScriptAction[]>()
      .default([]),
    /** Console-style log lines emitted by the snippet. */
    logs: jsonb("logs").notNull().$type<string[]>().default([]),
    /** Error message if the run failed. */
    error: text("error"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("script_runs_script_id_idx").on(table.scriptId),
    index("script_runs_script_created_idx").on(
      table.scriptId,
      table.createdAt,
    ),
    index("script_runs_email_id_idx").on(table.emailId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailScriptsRelations = relations(emailScripts, ({ one, many }) => ({
  account: one(accounts, {
    fields: [emailScripts.accountId],
    references: [accounts.id],
  }),
  runs: many(scriptRuns),
}));

export const scriptRunsRelations = relations(scriptRuns, ({ one }) => ({
  script: one(emailScripts, {
    fields: [scriptRuns.scriptId],
    references: [emailScripts.id],
  }),
}));
