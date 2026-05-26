import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  jsonb,
  index,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const taskProviderEnum = pgEnum("task_provider", [
  "builtin",
  "todoist",
  "linear",
  "notion",
  "things3",
  "apple_reminders",
  "microsoft_todo",
]);

// ---------------------------------------------------------------------------
// Tasks — built-in task list for users who don't use external providers
// ---------------------------------------------------------------------------

export interface TaskSource {
  threadId: string;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  extractedAt: string;
}

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Task title (imperative verb phrase). */
    title: text("title").notNull(),
    /** Longer description / context. */
    description: text("description"),
    /** Due date (optional). */
    dueDate: timestamp("due_date", { withTimezone: true }),
    /** Assignee email or name (from extraction). */
    assignee: text("assignee"),
    /** Priority level. */
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    /** Current status. */
    status: taskStatusEnum("status").notNull().default("pending"),

    /** Where the task was sent (builtin or external provider). */
    provider: taskProviderEnum("provider").notNull().default("builtin"),
    /** External task ID (from provider API). */
    externalTaskId: text("external_task_id"),
    /** External task URL (link to open in provider). */
    externalTaskUrl: text("external_task_url"),

    /** AI confidence score (0.0 – 1.0) for extracted items. */
    confidence: real("confidence"),

    /** Source email thread metadata. */
    source: jsonb("source").$type<TaskSource>(),

    /** User-defined tags. */
    tags: jsonb("tags").notNull().$type<string[]>().default([]),

    /** Whether this task was manually created (vs AI-extracted). */
    isManual: boolean("is_manual").notNull().default(false),

    /** Soft delete support. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tasks_account_id_idx").on(table.accountId),
    index("tasks_account_status_idx").on(table.accountId, table.status),
    index("tasks_account_priority_idx").on(table.accountId, table.priority),
    index("tasks_due_date_idx").on(table.dueDate),
    index("tasks_provider_idx").on(table.provider),
    index("tasks_deleted_at_idx").on(table.deletedAt),
  ],
);

// ---------------------------------------------------------------------------
// Task Provider Configs — stores API keys / OAuth tokens per provider
// ---------------------------------------------------------------------------

export interface ProviderCredentials {
  kind: "none" | "api_key" | "oauth" | "notion" | "microsoft";
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  databaseId?: string;
  listId?: string;
  teamId?: string;
}

export const taskProviderConfigs = pgTable(
  "task_provider_configs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Which provider this config is for. */
    provider: taskProviderEnum("provider").notNull(),
    /** Whether this is the user's default provider. */
    isDefault: boolean("is_default").notNull().default(false),
    /** Encrypted credentials blob. */
    credentials: jsonb("credentials").notNull().$type<ProviderCredentials>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("task_provider_configs_account_idx").on(table.accountId),
    index("task_provider_configs_account_provider_idx").on(
      table.accountId,
      table.provider,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const tasksRelations = relations(tasks, ({ one }) => ({
  account: one(accounts, {
    fields: [tasks.accountId],
    references: [accounts.id],
  }),
}));

export const taskProviderConfigsRelations = relations(
  taskProviderConfigs,
  ({ one }) => ({
    account: one(accounts, {
      fields: [taskProviderConfigs.accountId],
      references: [accounts.id],
    }),
  }),
);
