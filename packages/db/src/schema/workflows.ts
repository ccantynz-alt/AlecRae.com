import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const workflowTriggerTypeEnum = pgEnum("workflow_trigger_type", [
  "email_received",
  "email_sent",
  "schedule",
  "manual",
]);

export const workflowActionTypeEnum = pgEnum("workflow_action_type", [
  "reply",
  "forward",
  "label",
  "archive",
  "move",
  "notify",
  "webhook",
  "ai_classify",
]);

export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "success",
  "failed",
  "skipped",
]);

export const workflowTemplateCategoryEnum = pgEnum(
  "workflow_template_category",
  ["productivity", "communication", "organization", "security"],
);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface WorkflowTriggerConditions {
  from?: string;
  subject?: string;
  labels?: string[];
  hasAttachment?: boolean;
}

export interface WorkflowTrigger {
  type: "email_received" | "email_sent" | "schedule" | "manual";
  conditions: WorkflowTriggerConditions;
}

export interface WorkflowAction {
  type:
    | "reply"
    | "forward"
    | "label"
    | "archive"
    | "move"
    | "notify"
    | "webhook"
    | "ai_classify";
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Workflows — automated email workflows
// ---------------------------------------------------------------------------

export const workflows = pgTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Human-readable name for the workflow. */
    name: text("name").notNull(),
    /** Optional description of what the workflow does. */
    description: text("description"),
    /** Trigger configuration — when this workflow fires. */
    trigger: jsonb("trigger").notNull().$type<WorkflowTrigger>(),
    /** Ordered list of actions to execute when triggered. */
    actions: jsonb("actions").notNull().$type<WorkflowAction[]>().default([]),
    /** Whether the workflow is currently active. */
    isActive: boolean("is_active").notNull().default(true),
    /** Total number of times this workflow has run. */
    runCount: integer("run_count").notNull().default(0),
    /** Last time this workflow was executed. */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workflows_account_id_idx").on(table.accountId),
    index("workflows_is_active_idx").on(table.isActive),
    index("workflows_last_run_at_idx").on(table.lastRunAt),
  ],
);

// ---------------------------------------------------------------------------
// Workflow Runs — execution log for workflows
// ---------------------------------------------------------------------------

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    /** The email that triggered this run (nullable for manual/scheduled). */
    emailId: text("email_id"),
    /** Outcome of the run. */
    status: workflowRunStatusEnum("status").notNull(),
    /** Number of actions that were successfully executed. */
    actionsExecuted: integer("actions_executed").notNull().default(0),
    /** Error message if the run failed. */
    error: text("error"),
    /** How long the workflow took to execute in milliseconds. */
    duration: integer("duration").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workflow_runs_workflow_id_idx").on(table.workflowId),
    index("workflow_runs_status_idx").on(table.status),
    index("workflow_runs_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Workflow Templates — pre-built workflow templates
// ---------------------------------------------------------------------------

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: text("id").primaryKey(),
    /** Human-readable name for the template. */
    name: text("name").notNull(),
    /** Description of what the template does. */
    description: text("description").notNull(),
    /** Category for grouping and filtering. */
    category: workflowTemplateCategoryEnum("category").notNull(),
    /** Trigger configuration — pre-filled when creating from template. */
    trigger: jsonb("trigger").notNull().$type<WorkflowTrigger>(),
    /** Ordered list of actions — pre-filled when creating from template. */
    actions: jsonb("actions").notNull().$type<WorkflowAction[]>().default([]),
    /** Whether this template ships with AlecRae (vs user-created). */
    isBuiltIn: boolean("is_built_in").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("workflow_templates_category_idx").on(table.category)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  account: one(accounts, {
    fields: [workflows.accountId],
    references: [accounts.id],
  }),
  runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
}));
