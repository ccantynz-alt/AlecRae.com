import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  real,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const vocabularyLevelEnum = pgEnum("vocabulary_level", [
  "simple",
  "moderate",
  "advanced",
]);

// ---------------------------------------------------------------------------
// Voice Profiles — lightweight per-account writing style analysis
//
// One row per account (the simple /v1/voice profile). The richer multi-profile
// style fingerprints for voice cloning live in voice-clone.ts.
// ---------------------------------------------------------------------------

export const voiceProfiles = pgTable(
  "voice_profiles",
  {
    /** One profile per account — accountId is the primary key. */
    accountId: text("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Average sentence length in words (1 decimal place). */
    averageSentenceLength: real("average_sentence_length").notNull(),
    /** Estimated vocabulary level. */
    vocabularyLevel: vocabularyLevelEnum("vocabulary_level").notNull(),
    /** Number of sent emails sampled to build this profile. */
    sampleCount: integer("sample_count").notNull().default(0),
    /** When the analysis last ran. */
    analyzedAt: timestamp("analyzed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("voice_profiles_analyzed_at_idx").on(table.analyzedAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const voiceProfilesRelations = relations(voiceProfiles, ({ one }) => ({
  account: one(accounts, {
    fields: [voiceProfiles.accountId],
    references: [accounts.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type VoiceProfileRecord = typeof voiceProfiles.$inferSelect;
export type NewVoiceProfileRecord = typeof voiceProfiles.$inferInsert;
