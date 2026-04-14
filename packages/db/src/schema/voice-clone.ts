import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Style Fingerprint JSON type — stored in `styleFingerprint` JSONB column
// ---------------------------------------------------------------------------

export interface RhythmFingerprintData {
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  paragraphStructure: {
    avgParagraphsPerEmail: number;
    avgSentencesPerParagraph: number;
  };
}

export interface VocabularyFingerprintData {
  uniqueWordsPerEmail: number;
  wordFrequencyDistribution: Record<string, number>;
  characteristicWords: string[];
}

export interface PunctuationStyleData {
  dashUsage: number;
  ellipsisUsage: number;
  exclamationFrequency: number;
  questionFrequency: number;
}

export interface StyleFingerprintData {
  signaturePhrases: string[];
  idioms: string[];
  openingPatterns: string[];
  closingPatterns: string[];
  rhythmFingerprint: RhythmFingerprintData;
  vocabularyFingerprint: VocabularyFingerprintData;
  punctuationStyle: PunctuationStyleData;
  exampleSentences: string[];
  formalityLevel: "very_casual" | "casual" | "neutral" | "formal" | "very_formal";
  emojiUsage: number;
  avgEmailLength: number;
}

// ---------------------------------------------------------------------------
// Extracted Features JSON type — stored in training samples
// ---------------------------------------------------------------------------

export interface ExtractedFeaturesData {
  sentenceCount: number;
  wordCount: number;
  avgSentenceLength: number;
  emojiCount: number;
  exclamationCount: number;
  questionCount: number;
  formalityScore: number;
  characteristicWords: string[];
}

// ---------------------------------------------------------------------------
// Voice Style Profiles — multiple named profiles per account
// ---------------------------------------------------------------------------

export const voiceStyleProfiles = pgTable(
  "voice_style_profiles",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Human-readable profile name, e.g. "Professional", "Casual", "Marketing". */
    name: text("name").notNull(),

    /** The full style fingerprint built from training samples. */
    styleFingerprint: jsonb("style_fingerprint").$type<StyleFingerprintData>(),

    /** Number of email samples used to build this profile. */
    sampleCount: integer("sample_count").notNull().default(0),

    /** Confidence score (0.0-1.0) for how well the clone matches the user. */
    confidenceScore: real("confidence_score").notNull().default(0),

    /** Whether this is the default profile for composing. */
    isDefault: boolean("is_default").notNull().default(false),

    /** Whether training is currently in progress. */
    isTraining: boolean("is_training").notNull().default(false),

    /** Last time training was run. */
    lastTrainedAt: timestamp("last_trained_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("voice_style_profiles_account_id_idx").on(table.accountId),
    uniqueIndex("voice_style_profiles_account_name_idx").on(
      table.accountId,
      table.name,
    ),
    index("voice_style_profiles_is_default_idx").on(
      table.accountId,
      table.isDefault,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Voice Training Samples — individual emails used to train a profile
// ---------------------------------------------------------------------------

export const voiceTrainingSamples = pgTable(
  "voice_training_samples",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => voiceStyleProfiles.id, { onDelete: "cascade" }),

    /** Reference to the source email (nullable if email is deleted). */
    emailId: text("email_id"),

    /** Extracted style features from this individual email. */
    extractedFeatures: jsonb("extracted_features").$type<ExtractedFeaturesData>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("voice_training_samples_profile_id_idx").on(table.profileId),
    index("voice_training_samples_email_id_idx").on(table.emailId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const voiceStyleProfilesRelations = relations(
  voiceStyleProfiles,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [voiceStyleProfiles.accountId],
      references: [accounts.id],
    }),
    trainingSamples: many(voiceTrainingSamples),
  }),
);

export const voiceTrainingSamplesRelations = relations(
  voiceTrainingSamples,
  ({ one }) => ({
    profile: one(voiceStyleProfiles, {
      fields: [voiceTrainingSamples.profileId],
      references: [voiceStyleProfiles.id],
    }),
  }),
);
