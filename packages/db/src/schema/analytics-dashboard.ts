import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Analytics Snapshots — periodic snapshots of email metrics
// ---------------------------------------------------------------------------

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Aggregation period: daily, weekly, or monthly. */
    period: text("period").notNull(), // "daily" | "weekly" | "monthly"
    /** Date in YYYY-MM-DD format. */
    date: text("date").notNull(),
    emailsSent: integer("emails_sent").notNull().default(0),
    emailsReceived: integer("emails_received").notNull().default(0),
    emailsOpened: integer("emails_opened").notNull().default(0),
    emailsClicked: integer("emails_clicked").notNull().default(0),
    emailsBounced: integer("emails_bounced").notNull().default(0),
    emailsReplied: integer("emails_replied").notNull().default(0),
    /** Average response time in minutes for replies sent during this period. */
    avgResponseTimeMinutes: real("avg_response_time_minutes"),
    /** Top senders by volume during this period. */
    topSenders: jsonb("top_senders").$type<string[]>().default([]),
    /** Top recipients by volume during this period. */
    topRecipients: jsonb("top_recipients").$type<string[]>().default([]),
    /** Top subjects by volume during this period. */
    topSubjects: jsonb("top_subjects").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("analytics_snapshots_account_id_idx").on(table.accountId),
    index("analytics_snapshots_account_period_idx").on(table.accountId, table.period),
    index("analytics_snapshots_date_idx").on(table.date),
  ],
);

// ---------------------------------------------------------------------------
// Analytics Goals — user-set analytics targets
// ---------------------------------------------------------------------------

export const analyticsGoals = pgTable(
  "analytics_goals",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Metric being tracked: response_time, open_rate, inbox_zero_days, emails_sent. */
    metric: text("metric").notNull(), // "response_time" | "open_rate" | "inbox_zero_days" | "emails_sent"
    targetValue: real("target_value").notNull(),
    currentValue: real("current_value").notNull().default(0),
    /** Start date in YYYY-MM-DD format. */
    startDate: text("start_date").notNull(),
    /** End date in YYYY-MM-DD format. */
    endDate: text("end_date").notNull(),
    isAchieved: boolean("is_achieved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("analytics_goals_account_id_idx").on(table.accountId),
    index("analytics_goals_account_metric_idx").on(table.accountId, table.metric),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const analyticsSnapshotsRelations = relations(analyticsSnapshots, ({ one }) => ({
  account: one(accounts, {
    fields: [analyticsSnapshots.accountId],
    references: [accounts.id],
  }),
}));

export const analyticsGoalsRelations = relations(analyticsGoals, ({ one }) => ({
  account: one(accounts, {
    fields: [analyticsGoals.accountId],
    references: [accounts.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;
export type AnalyticsGoal = typeof analyticsGoals.$inferSelect;
export type NewAnalyticsGoal = typeof analyticsGoals.$inferInsert;
