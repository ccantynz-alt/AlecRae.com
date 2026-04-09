import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { emails } from "./emails.js";

// ---------------------------------------------------------------------------
// Translation Records — cached per-email translations + language detection
// ---------------------------------------------------------------------------

export interface TranslationContent {
  subject: string;
  body: string;
}

export const emailTranslations = pgTable(
  "email_translations",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    /** Detected source language code (e.g. "es", "fr"). */
    sourceLanguage: text("source_language").notNull(),
    /** Human-readable name of the source language. */
    sourceLanguageName: text("source_language_name").notNull(),
    /** Target language code the content was translated to. */
    targetLanguage: text("target_language").notNull(),
    /** Human-readable name of the target language. */
    targetLanguageName: text("target_language_name").notNull(),
    /** Original content (subject + body) — cached for toggle-to-original. */
    originalContent: jsonb("original_content")
      .notNull()
      .$type<TranslationContent>(),
    /** Translated content (subject + body). */
    translatedContent: jsonb("translated_content")
      .notNull()
      .$type<TranslationContent>(),
    /** Whether auto-translation was applied (vs manual request). */
    autoTranslated: boolean("auto_translated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_translations_email_target_idx").on(
      table.emailId,
      table.targetLanguage,
    ),
    index("email_translations_account_id_idx").on(table.accountId),
    index("email_translations_email_id_idx").on(table.emailId),
    index("email_translations_source_lang_idx").on(table.sourceLanguage),
    index("email_translations_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailTranslationsRelations = relations(
  emailTranslations,
  ({ one }) => ({
    account: one(accounts, {
      fields: [emailTranslations.accountId],
      references: [accounts.id],
    }),
    email: one(emails, {
      fields: [emailTranslations.emailId],
      references: [emails.id],
    }),
  }),
);
