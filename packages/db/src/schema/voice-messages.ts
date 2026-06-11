import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Voice Messages — voice-to-voice replies metadata + transcripts (B8)
// ---------------------------------------------------------------------------

export const voiceMessages = pgTable(
  "voice_messages",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Where the audio blob lives (R2 / API-served URL). */
    audioUrl: text("audio_url").notNull(),
    /** MIME type of the uploaded audio. */
    mimeType: text("mime_type").notNull(),
    /** Original filename of the upload. */
    filename: text("filename").notNull(),
    /** Audio size in bytes. */
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Whisper transcription of the audio. */
    transcriptText: text("transcript_text").notNull().default(""),
    /** Detected language of the transcription. */
    language: text("language").notNull().default("en"),
    /** Audio duration in seconds. */
    duration: real("duration").notNull().default(0),
    /** Inline HTML player embed for email bodies. */
    htmlEmbed: text("html_embed").notNull().default(""),
    /** Parent voice message when this is a reply. */
    replyToId: text("reply_to_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("voice_messages_account_id_idx").on(table.accountId),
    index("voice_messages_reply_to_idx").on(table.replyToId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const voiceMessagesRelations = relations(voiceMessages, ({ one }) => ({
  account: one(accounts, {
    fields: [voiceMessages.accountId],
    references: [accounts.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type VoiceMessageRecord = typeof voiceMessages.$inferSelect;
export type NewVoiceMessageRecord = typeof voiceMessages.$inferInsert;
