import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Push Notification Subscriptions — Web Push + mobile tokens
// ---------------------------------------------------------------------------

export const pushPlatformEnum = pgEnum("push_platform", [
  "web",
  "ios",
  "android",
  "desktop",
]);

export interface WebPushKeys {
  p256dh: string;
  auth: string;
}

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: pushPlatformEnum("platform").notNull(),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<WebPushKeys>(),
    deviceName: text("device_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("push_subscriptions_user_idx").on(table.userId),
    uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
  ],
);

export const pushNotificationPreferences = pgTable(
  "push_notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    newEmail: text("new_email").notNull().default("important"),
    mentions: text("mentions").notNull().default("all"),
    calendarReminders: text("calendar_reminders").notNull().default("all"),
    securityAlerts: text("security_alerts").notNull().default("all"),
    deliverabilityAlerts: text("deliverability_alerts").notNull().default("all"),
    quietHoursStart: text("quiet_hours_start"),
    quietHoursEnd: text("quiet_hours_end"),
    quietHoursTimezone: text("quiet_hours_timezone"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("push_prefs_user_idx").on(table.userId),
  ],
);

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const pushNotificationPreferencesRelations = relations(pushNotificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [pushNotificationPreferences.userId],
    references: [users.id],
  }),
}));
