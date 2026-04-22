import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const searchTypeEnum = pgEnum("search_type", [
  "keyword",
  "natural_language",
  "semantic",
]);

export const searchSuggestionCategoryEnum = pgEnum(
  "search_suggestion_category",
  ["recent", "frequent", "trending", "ai_recommended"],
);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SearchBookmarkFilters {
  from?: string;
  to?: string;
  dateAfter?: string;
  dateBefore?: string;
  hasAttachment?: boolean;
  labels?: string[];
  folder?: string;
}

// ---------------------------------------------------------------------------
// Search History — user search history for smart suggestions
// ---------------------------------------------------------------------------

export const searchHistory = pgTable(
  "search_history",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull().default(0),
    clickedResults: jsonb("clicked_results")
      .notNull()
      .$type<string[]>()
      .default([]),
    searchType: searchTypeEnum("search_type").notNull().default("keyword"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("search_history_account_id_idx").on(table.accountId),
    index("search_history_created_at_idx").on(table.createdAt),
    index("search_history_search_type_idx").on(table.accountId, table.searchType),
  ],
);

// ---------------------------------------------------------------------------
// Search Bookmarks — saved search bookmarks
// ---------------------------------------------------------------------------

export const searchBookmarks = pgTable(
  "search_bookmarks",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: text("query").notNull(),
    searchType: searchTypeEnum("search_type").notNull().default("keyword"),
    filters: jsonb("filters").notNull().$type<SearchBookmarkFilters>().default({}),
    notifyOnNew: boolean("notify_on_new").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    newResultsSinceLastCheck: integer("new_results_since_last_check")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("search_bookmarks_account_id_idx").on(table.accountId),
    index("search_bookmarks_notify_on_new_idx").on(
      table.accountId,
      table.notifyOnNew,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Search Suggestions — AI-generated search suggestions
// ---------------------------------------------------------------------------

export const searchSuggestions = pgTable(
  "search_suggestions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    suggestion: text("suggestion").notNull(),
    reason: text("reason").notNull(),
    category: searchSuggestionCategoryEnum("category")
      .notNull()
      .default("recent"),
    relevanceScore: real("relevance_score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("search_suggestions_account_id_idx").on(table.accountId),
    index("search_suggestions_category_idx").on(table.accountId, table.category),
    index("search_suggestions_relevance_idx").on(
      table.accountId,
      table.relevanceScore,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  account: one(accounts, {
    fields: [searchHistory.accountId],
    references: [accounts.id],
  }),
}));

export const searchBookmarksRelations = relations(
  searchBookmarks,
  ({ one }) => ({
    account: one(accounts, {
      fields: [searchBookmarks.accountId],
      references: [accounts.id],
    }),
  }),
);

export const searchSuggestionsRelations = relations(
  searchSuggestions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [searchSuggestions.accountId],
      references: [accounts.id],
    }),
  }),
);
