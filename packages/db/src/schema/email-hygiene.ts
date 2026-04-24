import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Email Habits — per-day email productivity metrics
// ---------------------------------------------------------------------------

export const emailHabits = pgTable(
  "email_habits",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Date in YYYY-MM-DD format. */
    date: text("date").notNull(),
    emailsSent: integer("emails_sent").notNull().default(0),
    emailsReceived: integer("emails_received").notNull().default(0),
    emailsArchived: integer("emails_archived").notNull().default(0),
    /** Average response time in minutes for replies sent that day. */
    avgResponseTimeMinutes: real("avg_response_time_minutes"),
    /** Most active hour (0-23). */
    peakHour: integer("peak_hour"),
    /** Productivity score from 0.0 to 100.0. */
    productivityScore: real("productivity_score"),
    inboxZeroAchieved: boolean("inbox_zero_achieved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_habits_account_date_idx").on(table.accountId, table.date),
    index("email_habits_account_id_idx").on(table.accountId),
    index("email_habits_date_idx").on(table.date),
  ],
);

// ---------------------------------------------------------------------------
// Subscription Tracker — track newsletter/marketing subscriptions per account
// ---------------------------------------------------------------------------

export const subscriptionTracker = pgTable(
  "subscription_tracker",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    senderEmail: text("sender_email").notNull(),
    senderName: text("sender_name"),
    /** Estimated frequency: daily, weekly, monthly, or irregular. */
    frequency: text("frequency"),
    lastReceived: timestamp("last_received", { withTimezone: true }),
    totalReceived: integer("total_received").notNull().default(0),
    totalOpened: integer("total_opened").notNull().default(0),
    /** Open rate as a decimal 0.0 to 1.0. */
    openRate: real("open_rate"),
    /** Whether user considers this subscription wanted (true) or noise (false). */
    isWanted: boolean("is_wanted").notNull().default(true),
    /** Category label (e.g. "tech", "finance", "news"). */
    category: text("category"),
    unsubscribeUrl: text("unsubscribe_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_tracker_account_sender_idx").on(
      table.accountId,
      table.senderEmail,
    ),
    index("subscription_tracker_account_id_idx").on(table.accountId),
    index("subscription_tracker_is_wanted_idx").on(table.accountId, table.isWanted),
    index("subscription_tracker_category_idx").on(table.accountId, table.category),
  ],
);

// ---------------------------------------------------------------------------
// Email Productivity Goals — user-set targets for email behavior
// ---------------------------------------------------------------------------

export interface ProductivityGoals {
  maxDailyChecks?: number;
  targetResponseTimeMinutes?: number;
  inboxZeroGoal?: boolean;
}

export const emailProductivityGoals = pgTable(
  "email_productivity_goals",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    goals: jsonb("goals")
      .notNull()
      .$type<ProductivityGoals>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_productivity_goals_account_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailHabitsRelations = relations(emailHabits, ({ one }) => ({
  account: one(accounts, {
    fields: [emailHabits.accountId],
    references: [accounts.id],
  }),
}));

export const subscriptionTrackerRelations = relations(subscriptionTracker, ({ one }) => ({
  account: one(accounts, {
    fields: [subscriptionTracker.accountId],
    references: [accounts.id],
  }),
}));

export const emailProductivityGoalsRelations = relations(emailProductivityGoals, ({ one }) => ({
  account: one(accounts, {
    fields: [emailProductivityGoals.accountId],
    references: [accounts.id],
  }),
}));
