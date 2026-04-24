import {
  pgTable,
  text,
  timestamp,
  boolean,
  real,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const actionItemPriorityEnum = pgEnum("action_item_priority", [
  "urgent",
  "high",
  "medium",
  "low",
]);

export const actionItemStatusEnum = pgEnum("action_item_status", [
  "pending",
  "in_progress",
  "completed",
  "dismissed",
]);

export const actionItemSourceEnum = pgEnum("action_item_source", [
  "ai_detected",
  "user_created",
  "forwarded",
]);

export const promiseStatusEnum = pgEnum("promise_status", [
  "active",
  "fulfilled",
  "broken",
  "expired",
]);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Extracted action item from an email. */
export interface ActionItemData {
  actionText: string;
  assignedTo: string | null;
  dueDate: string | null;
  priority: "urgent" | "high" | "medium" | "low";
  confidence: number;
}

/** Extracted deadline from an email. */
export interface DeadlineData {
  deadlineDate: string;
  description: string;
  isExplicit: boolean;
  confidence: number;
}

/** Extracted promise/commitment from an email. */
export interface PromiseData {
  promiseText: string;
  promisor: string;
  promisee: string;
  dueDate: string | null;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Email Action Items — detected action items from emails
// ---------------------------------------------------------------------------

export const emailActionItems = pgTable(
  "email_action_items",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    threadId: text("thread_id").notNull(),
    /** The action item text describing what needs to be done. */
    actionText: text("action_text").notNull(),
    /** Email address of the person responsible for this action item. */
    assignedTo: text("assigned_to"),
    /** When this action item is due. */
    dueDate: timestamp("due_date", { withTimezone: true }),
    /** Priority level of the action item. */
    priority: actionItemPriorityEnum("priority").notNull(),
    /** Current status of the action item. */
    status: actionItemStatusEnum("status").notNull().default("pending"),
    /** AI confidence score (0.0 – 1.0). */
    confidence: real("confidence").notNull(),
    /** How this action item was created. */
    source: actionItemSourceEnum("source").notNull().default("ai_detected"),
    /** When this action item was completed. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_action_items_account_id_idx").on(table.accountId),
    index("email_action_items_email_id_idx").on(table.emailId),
    index("email_action_items_thread_id_idx").on(table.threadId),
    index("email_action_items_status_idx").on(table.status),
    index("email_action_items_priority_idx").on(table.priority),
    index("email_action_items_due_date_idx").on(table.dueDate),
    index("email_action_items_assigned_to_idx").on(table.assignedTo),
  ],
);

// ---------------------------------------------------------------------------
// Email Deadlines — deadlines mentioned in emails
// ---------------------------------------------------------------------------

export const emailDeadlines = pgTable(
  "email_deadlines",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    threadId: text("thread_id").notNull(),
    /** The deadline date/time. */
    deadlineDate: timestamp("deadline_date", { withTimezone: true }).notNull(),
    /** Description of what the deadline is for. */
    description: text("description").notNull(),
    /** Whether the deadline was explicitly stated (true) or inferred by AI (false). */
    isExplicit: boolean("is_explicit").notNull(),
    /** AI confidence score (0.0 – 1.0). */
    confidence: real("confidence").notNull(),
    /** Whether a reminder has been sent for this deadline. */
    reminderSent: boolean("reminder_sent").notNull().default(false),
    /** When to send a reminder for this deadline. */
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_deadlines_account_id_idx").on(table.accountId),
    index("email_deadlines_email_id_idx").on(table.emailId),
    index("email_deadlines_deadline_date_idx").on(table.deadlineDate),
    index("email_deadlines_reminder_sent_idx").on(table.reminderSent),
  ],
);

// ---------------------------------------------------------------------------
// Email Promises — promises/commitments detected in emails
// ---------------------------------------------------------------------------

export const emailPromises = pgTable(
  "email_promises",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    threadId: text("thread_id").notNull(),
    /** The promise/commitment text. */
    promiseText: text("promise_text").notNull(),
    /** Email address of who made the promise. */
    promisor: text("promisor").notNull(),
    /** Email address of who the promise was made to. */
    promisee: text("promisee").notNull(),
    /** Optional due date for the promise. */
    dueDate: timestamp("due_date", { withTimezone: true }),
    /** Current status of the promise. */
    status: promiseStatusEnum("status").notNull().default("active"),
    /** AI confidence score (0.0 – 1.0). */
    confidence: real("confidence").notNull(),
    /** Whether a follow-up has been sent for this promise. */
    followUpSent: boolean("follow_up_sent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_promises_account_id_idx").on(table.accountId),
    index("email_promises_email_id_idx").on(table.emailId),
    index("email_promises_promisor_idx").on(table.promisor),
    index("email_promises_promisee_idx").on(table.promisee),
    index("email_promises_status_idx").on(table.status),
    index("email_promises_due_date_idx").on(table.dueDate),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailActionItemsRelations = relations(
  emailActionItems,
  ({ one }) => ({
    account: one(accounts, {
      fields: [emailActionItems.accountId],
      references: [accounts.id],
    }),
  }),
);

export const emailDeadlinesRelations = relations(
  emailDeadlines,
  ({ one }) => ({
    account: one(accounts, {
      fields: [emailDeadlines.accountId],
      references: [accounts.id],
    }),
  }),
);

export const emailPromisesRelations = relations(
  emailPromises,
  ({ one }) => ({
    account: one(accounts, {
      fields: [emailPromises.accountId],
      references: [accounts.id],
    }),
  }),
);
