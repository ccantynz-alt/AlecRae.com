import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  real,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const suggestionTypeEnum = pgEnum("suggestion_type", [
  "grammar",
  "style",
  "tone",
  "clarity",
  "conciseness",
]);

// ---------------------------------------------------------------------------
// Writing Profiles — named style profiles for AI writing intelligence
// ---------------------------------------------------------------------------

export const writingProfiles = pgTable(
  "writing_profiles",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Profile name (e.g. "professional", "casual", "sales", "support"). */
    name: text("name").notNull(),

    /** Characteristic vocabulary words for this profile. */
    vocabulary: jsonb("vocabulary").$type<string[]>(),

    /** Average sentence length in words for this writing style. */
    avgSentenceLength: real("avg_sentence_length"),

    /** Formality score (0.0 = very casual, 1.0 = very formal). */
    formalityScore: real("formality_score"),

    /** Common phrases used in this writing style. */
    commonPhrases: jsonb("common_phrases").$type<string[]>(),

    /** Words the user prefers to avoid. */
    avoidWords: jsonb("avoid_words").$type<string[]>(),

    /** Number of email samples used to build this profile. */
    sampleCount: integer("sample_count").notNull().default(0),

    /** Last time the profile was trained from sample emails. */
    lastTrainedAt: timestamp("last_trained_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("writing_profiles_account_id_idx").on(table.accountId),
    uniqueIndex("writing_profiles_account_name_idx").on(
      table.accountId,
      table.name,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Writing Suggestions Log — tracks AI suggestions and acceptance rate
// ---------------------------------------------------------------------------

export const writingSuggestionsLog = pgTable(
  "writing_suggestions_log",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Reference to the email this suggestion was for (nullable). */
    emailId: text("email_id"),

    /** Original text before the suggestion. */
    originalText: text("original_text").notNull(),

    /** AI-suggested replacement text. */
    suggestedText: text("suggested_text").notNull(),

    /** Type of suggestion (grammar, style, tone, clarity, conciseness). */
    suggestionType: suggestionTypeEnum("suggestion_type").notNull(),

    /** Whether the user accepted this suggestion. */
    wasAccepted: boolean("was_accepted").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("writing_suggestions_log_account_id_idx").on(table.accountId),
    index("writing_suggestions_log_email_id_idx").on(table.emailId),
    index("writing_suggestions_log_type_idx").on(
      table.accountId,
      table.suggestionType,
    ),
    index("writing_suggestions_log_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const writingProfilesRelations = relations(
  writingProfiles,
  ({ one }) => ({
    account: one(accounts, {
      fields: [writingProfiles.accountId],
      references: [accounts.id],
    }),
  }),
);

export const writingSuggestionsLogRelations = relations(
  writingSuggestionsLog,
  ({ one }) => ({
    account: one(accounts, {
      fields: [writingSuggestionsLog.accountId],
      references: [accounts.id],
    }),
  }),
);
