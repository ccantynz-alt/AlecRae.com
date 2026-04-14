import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Custom Dictionaries — Per-user spell check word lists
// ---------------------------------------------------------------------------

export const customDictionaries = pgTable(
  "custom_dictionaries",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The word the user added to their dictionary */
    word: text("word").notNull(),
    /** ISO 639-1 language code — "en", "es", "fr", etc. Null means all languages. */
    language: text("language"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("custom_dict_account_id_idx").on(table.accountId),
    index("custom_dict_language_idx").on(table.accountId, table.language),
    uniqueIndex("custom_dict_account_word_lang_idx").on(
      table.accountId,
      table.word,
      table.language,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const customDictionariesRelations = relations(
  customDictionaries,
  ({ one }) => ({
    account: one(accounts, {
      fields: [customDictionaries.accountId],
      references: [accounts.id],
    }),
  }),
);
