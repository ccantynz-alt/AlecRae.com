import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { domains } from "./domains.js";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const warmupStatusEnum = pgEnum("warmup_status", [
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const warmupScheduleTypeEnum = pgEnum("warmup_schedule_type", [
  "conservative",
  "moderate",
  "aggressive",
]);

// ---------------------------------------------------------------------------
// Warmup Sessions
// ---------------------------------------------------------------------------

/**
 * Tracks a warm-up session for a domain. Each domain can have at most one
 * active or paused warm-up session at a time. The schedule defines the daily
 * volume limits, and the orchestrator adjusts based on delivery signals.
 */
export const warmupSessions = pgTable(
  "warmup_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Which schedule template was selected */
    scheduleType: warmupScheduleTypeEnum("schedule_type").notNull(),

    status: warmupStatusEnum("status").notNull().default("active"),

    /** Day 1 of the warm-up */
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** When the warm-up was paused (null if not paused) */
    pausedAt: timestamp("paused_at", { withTimezone: true }),

    /** When the warm-up completed or was cancelled */
    completedAt: timestamp("completed_at", { withTimezone: true }),

    /**
     * The current warm-up day number (1-indexed).
     * This advances daily but can be frozen when paused or extended
     * when the schedule is slowed down due to bad signals.
     */
    currentDay: integer("current_day").notNull().default(1),

    /** Number of emails sent today (resets daily) */
    sentToday: integer("sent_today").notNull().default(0),

    /** Date string (YYYY-MM-DD) of when sentToday was last reset */
    sentTodayDate: text("sent_today_date"),

    /** Number of extra days added due to schedule adjustments */
    extensionDays: integer("extension_days").notNull().default(0),

    /**
     * Full schedule as JSON. Array of { day, dailyLimit }.
     * Stored so the schedule can be mutated (extended/compressed)
     * without losing the original template reference.
     */
    schedule: jsonb("schedule")
      .notNull()
      .$type<{ day: number; dailyLimit: number }[]>(),

    /** Aggregate metrics for the warm-up session */
    totalSent: integer("total_sent").notNull().default(0),
    totalDelivered: integer("total_delivered").notNull().default(0),
    totalBounced: integer("total_bounced").notNull().default(0),
    totalComplaints: integer("total_complaints").notNull().default(0),

    /** Rolling 24h bounce rate (0.0 - 1.0) */
    bounceRate24h: real("bounce_rate_24h").notNull().default(0),

    /** Rolling 24h complaint rate (0.0 - 1.0) */
    complaintRate24h: real("complaint_rate_24h").notNull().default(0),

    /** Number of consecutive healthy days (for acceleration) */
    consecutiveHealthyDays: integer("consecutive_healthy_days")
      .notNull()
      .default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("warmup_sessions_domain_id_idx").on(table.domainId),
    index("warmup_sessions_account_id_idx").on(table.accountId),
    index("warmup_sessions_status_idx").on(table.status),
    uniqueIndex("warmup_sessions_active_domain_idx")
      .on(table.domainId, table.status),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const warmupSessionsRelations = relations(
  warmupSessions,
  ({ one }) => ({
    domain: one(domains, {
      fields: [warmupSessions.domainId],
      references: [domains.id],
    }),
    account: one(accounts, {
      fields: [warmupSessions.accountId],
      references: [accounts.id],
    }),
  }),
);
