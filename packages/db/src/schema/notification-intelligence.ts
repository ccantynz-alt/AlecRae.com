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

export const notificationActionEnum = pgEnum("notification_action", [
  "notify_immediately",
  "batch_hourly",
  "batch_daily",
  "suppress",
  "summary_only",
]);

export const focusModeEnum = pgEnum("focus_mode", [
  "deep_work",
  "meeting",
  "break",
  "custom",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationRuleConditions {
  senderVip?: boolean;
  urgencyMin?: number;
  keywords?: string[];
  labels?: string[];
  timeRange?: { start: string; end: string };
}

// ---------------------------------------------------------------------------
// Notification Rules — per-account rules controlling how emails trigger alerts
// ---------------------------------------------------------------------------

export const notificationRules = pgTable(
  "notification_rules",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    conditions: jsonb("conditions")
      .notNull()
      .$type<NotificationRuleConditions>()
      .default({}),
    action: notificationActionEnum("action").notNull().default("notify_immediately"),
    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notification_rules_account_id_idx").on(table.accountId),
    index("notification_rules_active_idx").on(table.accountId, table.isActive),
    index("notification_rules_priority_idx").on(table.accountId, table.priority),
  ],
);

// ---------------------------------------------------------------------------
// Notification Batches — grouped notifications for hourly/daily delivery
// ---------------------------------------------------------------------------

export const notificationBatches = pgTable(
  "notification_batches",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailIds: jsonb("email_ids").$type<string[]>().notNull().default([]),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notification_batches_account_id_idx").on(table.accountId),
    index("notification_batches_scheduled_for_idx").on(table.scheduledFor),
    index("notification_batches_delivered_idx").on(table.deliveredAt),
  ],
);

// ---------------------------------------------------------------------------
// Focus Sessions — time-boxed focus modes that defer non-critical notifications
// ---------------------------------------------------------------------------

export const focusSessions = pgTable(
  "focus_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    mode: focusModeEnum("mode").notNull().default("deep_work"),
    allowedSenders: jsonb("allowed_senders").$type<string[]>().default([]),
    /** Minimum urgency score (0-100) required to break through focus mode. */
    breakThroughUrgency: integer("break_through_urgency").notNull().default(90),
    emailsDeferred: integer("emails_deferred").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    index("focus_sessions_account_id_idx").on(table.accountId),
    index("focus_sessions_active_idx").on(table.accountId, table.isActive),
    index("focus_sessions_ends_at_idx").on(table.endsAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const notificationRulesRelations = relations(notificationRules, ({ one }) => ({
  account: one(accounts, {
    fields: [notificationRules.accountId],
    references: [accounts.id],
  }),
}));

export const notificationBatchesRelations = relations(notificationBatches, ({ one }) => ({
  account: one(accounts, {
    fields: [notificationBatches.accountId],
    references: [accounts.id],
  }),
}));

export const focusSessionsRelations = relations(focusSessions, ({ one }) => ({
  account: one(accounts, {
    fields: [focusSessions.accountId],
    references: [accounts.id],
  }),
}));
