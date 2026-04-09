import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  date,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const achievementKeyEnum = pgEnum("achievement_key", [
  "first_zero",
  "week_warrior",
  "monthly_master",
  "speed_demon",
  "early_bird",
  "night_owl",
  "unsubscribe_champion",
  "focus_master",
  "ai_native",
  "zero_hero",
]);

// ---------------------------------------------------------------------------
// User Streaks — tracks consecutive inbox-zero days per account
// ---------------------------------------------------------------------------

export const userStreaks = pgTable(
  "user_streaks",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Current consecutive inbox-zero day count. */
    currentStreak: integer("current_streak").notNull().default(0),

    /** Longest ever streak. */
    longestStreak: integer("longest_streak").notNull().default(0),

    /** Total number of inbox-zero events recorded (all time). */
    totalZeros: integer("total_zeros").notNull().default(0),

    /** Date of last inbox-zero achievement (YYYY-MM-DD in user local). */
    lastZeroDate: date("last_zero_date"),

    /** ISO timestamp of last inbox-zero check. */
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),

    /** Whether gamification is enabled for this user. */
    enabled: boolean("enabled").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_streaks_account_id_idx").on(table.accountId),
    index("user_streaks_current_streak_idx").on(table.currentStreak),
    index("user_streaks_longest_streak_idx").on(table.longestStreak),
  ],
);

// ---------------------------------------------------------------------------
// User Achievements — unlockable badges
// ---------------------------------------------------------------------------

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The achievement type identifier. */
    achievementKey: achievementKeyEnum("achievement_key").notNull(),

    /** When the achievement was unlocked. */
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Current progress towards the achievement (e.g. 45/100 for zero_hero). */
    progress: integer("progress").notNull().default(0),

    /** Target value needed to unlock. */
    target: integer("target").notNull().default(1),

    /** Extra context data (e.g. specific email count for speed_demon). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_achievements_account_key_idx").on(
      table.accountId,
      table.achievementKey,
    ),
    index("user_achievements_account_id_idx").on(table.accountId),
    index("user_achievements_unlocked_at_idx").on(table.unlockedAt),
  ],
);

// ---------------------------------------------------------------------------
// Daily Stats — per-account email productivity statistics per day
// ---------------------------------------------------------------------------

export const dailyStats = pgTable(
  "daily_stats",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The date these stats are for (YYYY-MM-DD). */
    statDate: date("stat_date").notNull(),

    /** Total emails processed (archived, replied, deleted, etc). */
    emailsProcessed: integer("emails_processed").notNull().default(0),

    /** Emails received during this day. */
    emailsReceived: integer("emails_received").notNull().default(0),

    /** Emails sent during this day. */
    emailsSent: integer("emails_sent").notNull().default(0),

    /** Average response time in seconds for replies sent that day. */
    avgResponseTimeSec: real("avg_response_time_sec"),

    /** Number of focus mode sessions completed. */
    focusSessions: integer("focus_sessions").notNull().default(0),

    /** Number of AI compose uses. */
    aiComposeUses: integer("ai_compose_uses").notNull().default(0),

    /** Number of unsubscribe actions. */
    unsubscribeCount: integer("unsubscribe_count").notNull().default(0),

    /** Whether user reached inbox zero on this date. */
    reachedZero: boolean("reached_zero").notNull().default(false),

    /** Timestamp when inbox zero was first reached on this day. */
    zeroReachedAt: timestamp("zero_reached_at", { withTimezone: true }),

    /** Most productive hour (0-23 UTC). */
    mostProductiveHour: integer("most_productive_hour"),

    /** Hourly breakdown of emails processed: { "0": 2, "9": 15, ... } */
    hourlyBreakdown: jsonb("hourly_breakdown")
      .$type<Record<string, number>>()
      .default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("daily_stats_account_date_idx").on(
      table.accountId,
      table.statDate,
    ),
    index("daily_stats_account_id_idx").on(table.accountId),
    index("daily_stats_stat_date_idx").on(table.statDate),
    index("daily_stats_reached_zero_idx").on(table.reachedZero),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const userStreaksRelations = relations(userStreaks, ({ one }) => ({
  account: one(accounts, {
    fields: [userStreaks.accountId],
    references: [accounts.id],
  }),
}));

export const userAchievementsRelations = relations(
  userAchievements,
  ({ one }) => ({
    account: one(accounts, {
      fields: [userAchievements.accountId],
      references: [accounts.id],
    }),
  }),
);

export const dailyStatsRelations = relations(dailyStats, ({ one }) => ({
  account: one(accounts, {
    fields: [dailyStats.accountId],
    references: [accounts.id],
  }),
}));
