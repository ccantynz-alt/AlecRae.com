import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// AlecRae Meet — Video Meeting Rooms
// ---------------------------------------------------------------------------

export const meetingRooms = pgTable(
  "meeting_rooms",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Human-readable room name (e.g. "Standup", "Design Review"). */
    name: text("name").notNull(),

    /** Unique slug for the meeting URL (e.g. meet.alecrae.com/slug). */
    slug: text("slug").notNull().unique(),

    /** Whether this is the user's personal meeting room. */
    isPersonal: boolean("is_personal").notNull().default(false),

    /** Maximum concurrent participants allowed. */
    maxParticipants: integer("max_participants").notNull().default(100),

    /** Whether a waiting room is enabled before joining. */
    waitingRoomEnabled: boolean("waiting_room_enabled").notNull().default(false),

    /** Whether cloud recording is enabled for this room. */
    recordingEnabled: boolean("recording_enabled").notNull().default(false),

    /** Whether AI transcription is enabled for recordings. */
    transcriptionEnabled: boolean("transcription_enabled").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("meeting_rooms_account_id_idx").on(table.accountId),
    uniqueIndex("meeting_rooms_slug_idx").on(table.slug),
    index("meeting_rooms_is_personal_idx").on(table.accountId, table.isPersonal),
  ],
);

// ---------------------------------------------------------------------------
// AlecRae Meet — Meeting Recordings
// ---------------------------------------------------------------------------

export const meetingRecordings = pgTable(
  "meeting_recordings",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => meetingRooms.id, { onDelete: "cascade" }),

    /** Title of the recorded meeting session. */
    title: text("title"),

    /** Duration of the recording in seconds. */
    duration: integer("duration"),

    /** R2 storage key for the recording file. */
    storageKey: text("storage_key"),

    /** R2 storage key for the transcript file. */
    transcriptKey: text("transcript_key"),

    /** AI-generated summary of the recording. */
    aiSummary: text("ai_summary"),

    /** AI-extracted action items from the recording. */
    aiActionItems: jsonb("ai_action_items").$type<string[]>(),

    /** Size of the recording file in bytes. */
    size: bigint("size", { mode: "number" }),

    /** Timestamp when the meeting was recorded. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("meeting_recordings_room_id_idx").on(table.roomId),
    index("meeting_recordings_recorded_at_idx").on(table.recordedAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const meetingRoomsRelations = relations(meetingRooms, ({ one, many }) => ({
  account: one(accounts, {
    fields: [meetingRooms.accountId],
    references: [accounts.id],
  }),
  recordings: many(meetingRecordings),
}));

export const meetingRecordingsRelations = relations(
  meetingRecordings,
  ({ one }) => ({
    room: one(meetingRooms, {
      fields: [meetingRecordings.roomId],
      references: [meetingRooms.id],
    }),
  }),
);
