import {
  pgTable,
  pgEnum,
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
// Enums
// ---------------------------------------------------------------------------

export const meetingTypeEnum = pgEnum("meeting_type", [
  "one_on_one",
  "group",
  "standup",
  "interview",
  "demo",
  "social",
]);

export const meetingProposalStatusEnum = pgEnum("meeting_proposal_status", [
  "proposed",
  "accepted",
  "declined",
  "expired",
]);

// ---------------------------------------------------------------------------
// JSON column types
// ---------------------------------------------------------------------------

/** A proposed time slot with AI confidence score. */
export interface ProposedTimeSlot {
  start: string;
  end: string;
  confidence: number;
}

/** User meeting preferences for a given day. */
export interface MeetingPreferences {
  maxMeetingsPerDay?: number;
  minBreakMinutes?: number;
  preferMorning?: boolean;
  noMeetingDays?: number[];
}

/** A recurring or one-off busy block on a user's calendar. */
export interface BusyBlock {
  start: string;
  end: string;
  recurring: boolean;
}

// ---------------------------------------------------------------------------
// Meeting Proposals — AI-generated meeting proposals from email context
// ---------------------------------------------------------------------------

export const meetingProposals = pgTable(
  "meeting_proposals",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The email that triggered this proposal. */
    emailId: text("email_id").notNull(),

    /** The thread this proposal belongs to. */
    threadId: text("thread_id").notNull(),

    /** AI-suggested time slots ranked by confidence. */
    proposedTimes: jsonb("proposed_times")
      .notNull()
      .$type<ProposedTimeSlot[]>()
      .default([]),

    /** Email addresses of all meeting participants. */
    participants: jsonb("participants")
      .notNull()
      .$type<string[]>()
      .default([]),

    /** Meeting subject / title. */
    subject: text("subject").notNull(),

    /** Duration in minutes. */
    duration: integer("duration").notNull(),

    /** Optional meeting location (office, room, URL). */
    location: text("location"),

    /** Type of meeting. */
    meetingType: meetingTypeEnum("meeting_type").notNull().default("one_on_one"),

    /** Current status of this proposal. */
    status: meetingProposalStatusEnum("status").notNull().default("proposed"),

    /** The time slot the user selected (ISO string), null until accepted. */
    selectedTime: text("selected_time"),

    /** AI explanation of why it proposed this meeting. */
    aiReasoning: text("ai_reasoning").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mp_account_id_idx").on(table.accountId),
    index("mp_email_id_idx").on(table.emailId),
    index("mp_thread_id_idx").on(table.threadId),
    index("mp_status_idx").on(table.status),
    index("mp_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Availability Patterns — learned availability patterns per user
// ---------------------------------------------------------------------------

export const availabilityPatterns = pgTable(
  "availability_patterns",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Day of week: 0 = Sunday, 6 = Saturday. */
    dayOfWeek: integer("day_of_week").notNull(),

    /** Preferred start hour (0-23). */
    preferredStartHour: integer("preferred_start_hour").notNull(),

    /** Preferred end hour (0-23). */
    preferredEndHour: integer("preferred_end_hour").notNull(),

    /** Known busy blocks for this day. */
    busyBlocks: jsonb("busy_blocks")
      .notNull()
      .$type<BusyBlock[]>()
      .default([]),

    /** User preferences for meetings on this day. */
    meetingPreferences: jsonb("meeting_preferences")
      .notNull()
      .$type<MeetingPreferences>()
      .default({}),

    /** IANA timezone string, e.g. "America/New_York". */
    timezone: text("timezone").notNull().default("UTC"),

    /** AI confidence in these learned patterns (0.0-1.0). */
    confidence: real("confidence").notNull().default(0.5),

    /** When patterns were last synced from an external calendar. */
    lastUpdatedFromCalendar: timestamp("last_updated_from_calendar", {
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
    uniqueIndex("ap_account_day_idx").on(table.accountId, table.dayOfWeek),
    index("ap_day_of_week_idx").on(table.dayOfWeek),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const meetingProposalsRelations = relations(
  meetingProposals,
  ({ one }) => ({
    account: one(accounts, {
      fields: [meetingProposals.accountId],
      references: [accounts.id],
    }),
  }),
);

export const availabilityPatternsRelations = relations(
  availabilityPatterns,
  ({ one }) => ({
    account: one(accounts, {
      fields: [availabilityPatterns.accountId],
      references: [accounts.id],
    }),
  }),
);
