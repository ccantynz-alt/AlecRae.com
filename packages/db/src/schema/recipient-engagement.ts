import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Hourly distribution type — maps hour (0-23) to count
// ---------------------------------------------------------------------------

export type HourlyDistribution = Record<string, number>;

// ---------------------------------------------------------------------------
// Daily distribution type — maps day-of-week (0-6, 0=Sun) to count
// ---------------------------------------------------------------------------

export type DailyDistribution = Record<string, number>;

// ---------------------------------------------------------------------------
// Recipient Engagement — per-account, per-recipient engagement tracking
// ---------------------------------------------------------------------------

export const recipientEngagement = pgTable(
  "recipient_engagement",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The recipient email address (lowercased, trimmed) */
    recipientEmail: text("recipient_email").notNull(),

    // ── Aggregate counters ───────────────────────────────────────────────
    totalSent: integer("total_sent").notNull().default(0),
    totalOpened: integer("total_opened").notNull().default(0),
    totalClicked: integer("total_clicked").notNull().default(0),
    totalReplied: integer("total_replied").notNull().default(0),

    // ── Rates (0.0–1.0) ─────────────────────────────────────────────────
    openRate: real("open_rate").notNull().default(0),
    clickRate: real("click_rate").notNull().default(0),
    replyRate: real("reply_rate").notNull().default(0),

    // ── Timing distributions ─────────────────────────────────────────────
    /** Counts of opens bucketed by UTC hour (0-23) */
    openHourDistribution: jsonb("open_hour_distribution")
      .notNull()
      .$type<HourlyDistribution>()
      .default({}),

    /** Counts of opens bucketed by day-of-week (0=Sun, 6=Sat) */
    openDayDistribution: jsonb("open_day_distribution")
      .notNull()
      .$type<DailyDistribution>()
      .default({}),

    /** Counts of clicks bucketed by UTC hour (0-23) */
    clickHourDistribution: jsonb("click_hour_distribution")
      .notNull()
      .$type<HourlyDistribution>()
      .default({}),

    /** Counts of clicks bucketed by day-of-week */
    clickDayDistribution: jsonb("click_day_distribution")
      .notNull()
      .$type<DailyDistribution>()
      .default({}),

    // ── Timing averages (in hours) ───────────────────────────────────────
    avgOpenDelayHours: real("avg_open_delay_hours"),
    avgClickDelayHours: real("avg_click_delay_hours"),
    avgReplyDelayHours: real("avg_reply_delay_hours"),

    // ── Peak engagement windows ──────────────────────────────────────────
    /** UTC hour with the highest open rate (0-23) */
    peakOpenHour: integer("peak_open_hour"),
    /** Day of week with the highest open rate (0-6) */
    peakOpenDay: integer("peak_open_day"),
    /** UTC hour with the highest click rate (0-23) */
    peakClickHour: integer("peak_click_hour"),
    /** Day of week with the highest click rate (0-6) */
    peakClickDay: integer("peak_click_day"),

    // ── Detected timezone (best-guess from open patterns) ────────────────
    inferredTimezone: text("inferred_timezone"),

    // ── Timestamps ───────────────────────────────────────────────────────
    firstInteractionAt: timestamp("first_interaction_at", {
      withTimezone: true,
    }),
    lastInteractionAt: timestamp("last_interaction_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("re_account_recipient_idx").on(
      table.accountId,
      table.recipientEmail,
    ),
    index("re_account_id_idx").on(table.accountId),
    index("re_recipient_email_idx").on(table.recipientEmail),
    index("re_peak_open_hour_idx").on(table.peakOpenHour),
    index("re_updated_at_idx").on(table.updatedAt),
  ],
);

// ---------------------------------------------------------------------------
// Engagement Events — individual open/click/reply events for fine-grained
// time-series analysis beyond the aggregate counters
// ---------------------------------------------------------------------------

export const engagementEvents = pgTable(
  "engagement_events",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    emailId: text("email_id").notNull(),

    /** "open" | "click" | "reply" */
    eventType: text("event_type").notNull(),

    /** When the original email was sent */
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),

    /** When the engagement event occurred */
    engagedAt: timestamp("engaged_at", { withTimezone: true }).notNull(),

    /** Delay in seconds from send to engagement */
    delaySeconds: integer("delay_seconds").notNull(),

    /** UTC hour of engagement (0-23), denormalized for fast aggregation */
    engagedHour: integer("engaged_hour").notNull(),

    /** Day of week of engagement (0=Sun, 6=Sat), denormalized */
    engagedDayOfWeek: integer("engaged_day_of_week").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ee_account_recipient_idx").on(
      table.accountId,
      table.recipientEmail,
    ),
    index("ee_recipient_email_idx").on(table.recipientEmail),
    index("ee_email_id_idx").on(table.emailId),
    index("ee_event_type_idx").on(table.eventType),
    index("ee_engaged_at_idx").on(table.engagedAt),
    index("ee_engaged_hour_idx").on(table.engagedHour),
    index("ee_engaged_dow_idx").on(table.engagedDayOfWeek),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const recipientEngagementRelations = relations(
  recipientEngagement,
  ({ one }) => ({
    account: one(accounts, {
      fields: [recipientEngagement.accountId],
      references: [accounts.id],
    }),
  }),
);

export const engagementEventsRelations = relations(
  engagementEvents,
  ({ one }) => ({
    account: one(accounts, {
      fields: [engagementEvents.accountId],
      references: [accounts.id],
    }),
  }),
);
