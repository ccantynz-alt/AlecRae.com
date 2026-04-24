import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const calendarEventStatusEnum = pgEnum("calendar_event_status", [
  "confirmed",
  "tentative",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// JSON column types
// ---------------------------------------------------------------------------

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  until?: string;
  count?: number;
}

export interface EventAttendee {
  email: string;
  name?: string;
  status: "accepted" | "declined" | "tentative" | "pending";
}

export interface EventReminder {
  minutes: number;
  type: "email" | "push";
}

// ---------------------------------------------------------------------------
// Calendar Events
// ---------------------------------------------------------------------------

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    recurrence: jsonb("recurrence").$type<RecurrenceRule | null>().default(null),
    attendees: jsonb("attendees").$type<EventAttendee[]>().default([]),
    reminders: jsonb("reminders").$type<EventReminder[]>().default([]),
    color: text("color"),
    calendarId: text("calendar_id"),
    externalId: text("external_id"),
    videoLink: text("video_link"),
    isPrivate: boolean("is_private").notNull().default(false),
    status: calendarEventStatusEnum("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("calendar_events_account_id_idx").on(table.accountId),
    index("calendar_events_start_at_idx").on(table.accountId, table.startAt),
    index("calendar_events_end_at_idx").on(table.accountId, table.endAt),
    index("calendar_events_calendar_id_idx").on(table.accountId, table.calendarId),
    uniqueIndex("calendar_events_external_id_idx").on(table.accountId, table.externalId),
  ],
);

// ---------------------------------------------------------------------------
// Calendar Availability — user working-hours per day-of-week
// ---------------------------------------------------------------------------

export const calendarAvailability = pgTable(
  "calendar_availability",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Day of week: 0 = Sunday, 6 = Saturday */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Start time in HH:MM format, e.g. "09:00" */
    startTime: text("start_time").notNull(),
    /** End time in HH:MM format, e.g. "17:00" */
    endTime: text("end_time").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    isAvailable: boolean("is_available").notNull().default(true),
  },
  (table) => [
    index("calendar_availability_account_id_idx").on(table.accountId),
    uniqueIndex("calendar_availability_account_day_idx").on(
      table.accountId,
      table.dayOfWeek,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  account: one(accounts, {
    fields: [calendarEvents.accountId],
    references: [accounts.id],
  }),
}));

export const calendarAvailabilityRelations = relations(
  calendarAvailability,
  ({ one }) => ({
    account: one(accounts, {
      fields: [calendarAvailability.accountId],
      references: [accounts.id],
    }),
  }),
);
