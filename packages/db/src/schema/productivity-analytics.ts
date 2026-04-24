import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const emailActivityTypeEnum = pgEnum("email_activity_type", [
  "reading",
  "composing",
  "replying",
  "forwarding",
]);

export const insightTypeEnum = pgEnum("insight_type", [
  "email_overload",
  "response_time",
  "peak_hours",
  "meeting_vs_email",
  "focus_time",
  "batch_opportunity",
  "delegation_suggestion",
]);

export const insightSeverityEnum = pgEnum("insight_severity", [
  "info",
  "warning",
  "critical",
]);

// ---------------------------------------------------------------------------
// Email Time Tracking — time spent reading/composing emails
// ---------------------------------------------------------------------------

export const emailTimeTracking = pgTable(
  "email_time_tracking",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    activityType: emailActivityTypeEnum("activity_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull(),
    wordCount: integer("word_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_time_tracking_account_id_idx").on(table.accountId),
    index("email_time_tracking_email_id_idx").on(table.emailId),
    index("email_time_tracking_activity_type_idx").on(table.activityType),
    index("email_time_tracking_started_at_idx").on(table.startedAt),
  ],
);

// ---------------------------------------------------------------------------
// Productivity Insights — AI-generated productivity insights
// ---------------------------------------------------------------------------

export const productivityInsights = pgTable(
  "productivity_insights",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    insightType: insightTypeEnum("insight_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: insightSeverityEnum("severity").notNull(),
    metric: text("metric").notNull(),
    currentValue: real("current_value").notNull(),
    targetValue: real("target_value"),
    recommendation: text("recommendation").notNull(),
    isActioned: boolean("is_actioned").notNull().default(false),
    isDismissed: boolean("is_dismissed").notNull().default(false),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("productivity_insights_account_id_idx").on(table.accountId),
    index("productivity_insights_insight_type_idx").on(table.insightType),
    index("productivity_insights_severity_idx").on(table.severity),
    index("productivity_insights_is_actioned_idx").on(table.isActioned),
    index("productivity_insights_is_dismissed_idx").on(table.isDismissed),
    index("productivity_insights_valid_until_idx").on(table.validUntil),
  ],
);

// ---------------------------------------------------------------------------
// Email Behavior Patterns — learned email behavior patterns
// ---------------------------------------------------------------------------

export const emailBehaviorPatterns = pgTable(
  "email_behavior_patterns",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Pattern type: response_speed, compose_time, check_frequency, batch_size. */
    patternType: text("pattern_type").notNull(),
    /** Day of week (0=Sunday, 6=Saturday). Null for overall patterns. */
    dayOfWeek: integer("day_of_week"),
    /** Hour of day (0-23). Null for day-level patterns. */
    hourOfDay: integer("hour_of_day"),
    avgValue: real("avg_value").notNull(),
    sampleCount: integer("sample_count").notNull(),
    /** Trend direction: improving, stable, or declining. */
    trendDirection: text("trend_direction").notNull(),
    lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_behavior_patterns_account_id_idx").on(table.accountId),
    index("email_behavior_patterns_pattern_type_idx").on(table.patternType),
    index("email_behavior_patterns_day_of_week_idx").on(table.dayOfWeek),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailTimeTrackingRelations = relations(emailTimeTracking, ({ one }) => ({
  account: one(accounts, {
    fields: [emailTimeTracking.accountId],
    references: [accounts.id],
  }),
}));

export const productivityInsightsRelations = relations(productivityInsights, ({ one }) => ({
  account: one(accounts, {
    fields: [productivityInsights.accountId],
    references: [accounts.id],
  }),
}));

export const emailBehaviorPatternsRelations = relations(emailBehaviorPatterns, ({ one }) => ({
  account: one(accounts, {
    fields: [emailBehaviorPatterns.accountId],
    references: [accounts.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EmailTimeTracking = typeof emailTimeTracking.$inferSelect;
export type NewEmailTimeTracking = typeof emailTimeTracking.$inferInsert;
export type ProductivityInsight = typeof productivityInsights.$inferSelect;
export type NewProductivityInsight = typeof productivityInsights.$inferInsert;
export type EmailBehaviorPattern = typeof emailBehaviorPatterns.$inferSelect;
export type NewEmailBehaviorPattern = typeof emailBehaviorPatterns.$inferInsert;
