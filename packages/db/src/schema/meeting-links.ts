import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  index,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const meetingProviderEnum = pgEnum("meeting_provider", [
  "zoom",
  "meet",
  "teams",
  "webex",
  "generic",
]);

export const meetingLinkStatusEnum = pgEnum("meeting_link_status", [
  "detected",
  "linked",
  "transcribed",
  "summarized",
]);

// ---------------------------------------------------------------------------
// Meeting Links — maps email threads to meeting recordings + transcripts (S9)
// ---------------------------------------------------------------------------

export const meetingLinks = pgTable(
  "meeting_links",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Thread identifier (Message-ID, email primary key, or inReplyTo value). */
    threadId: text("thread_id").notNull(),

    /** The specific email where the meeting was detected / scheduled. */
    emailId: text("email_id"),

    /** Meeting platform provider. */
    provider: meetingProviderEnum("provider").notNull().default("generic"),

    /** The meeting join/invite URL. */
    meetingUrl: text("meeting_url"),

    /** When the meeting was / is scheduled. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),

    /** URL to the meeting recording (video/audio). */
    recordingUrl: text("recording_url"),

    /** URL to an external transcript resource. */
    transcriptUrl: text("transcript_url"),

    /** Full transcript text (stored after transcription). */
    transcriptText: text("transcript_text"),

    /** AI-generated summary of the transcript. */
    aiSummary: text("ai_summary"),

    /** Meeting title (from calendar invite or subject line). */
    title: text("title"),

    /** AI detection confidence score (0.0 – 1.0). */
    confidence: real("confidence"),

    /** Lifecycle status. */
    status: meetingLinkStatusEnum("status").notNull().default("detected"),

    /** Participants extracted from the transcript or email thread. */
    participants: text("participants"),

    /** Duration in seconds (from transcript provider). */
    duration: text("duration"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("meeting_links_account_id_idx").on(table.accountId),
    index("meeting_links_thread_id_idx").on(table.accountId, table.threadId),
    index("meeting_links_status_idx").on(table.accountId, table.status),
    index("meeting_links_scheduled_at_idx").on(table.scheduledAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const meetingLinksRelations = relations(meetingLinks, ({ one }) => ({
  account: one(accounts, {
    fields: [meetingLinks.accountId],
    references: [accounts.id],
  }),
}));
