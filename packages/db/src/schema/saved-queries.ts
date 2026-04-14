import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const queryTypeEnum = pgEnum("query_type", ["natural", "sql"]);

// ---------------------------------------------------------------------------
// Saved Queries — user-bookmarked email database queries
// ---------------------------------------------------------------------------

export const savedQueries = pgTable(
  "saved_queries",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** User-given name for this saved query. */
    name: text("name").notNull(),

    /** The original query text (natural language or SQL-like). */
    queryText: text("query_text").notNull(),

    /** Whether the query was entered as natural language or SQL-like syntax. */
    queryType: queryTypeEnum("query_type").notNull().default("natural"),

    /** The parsed/translated structured query (cached for fast re-execution). */
    parsedQuery: jsonb("parsed_query").$type<Record<string, unknown>>(),

    /** When this query was last executed. */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),

    /** Number of times this query has been executed. */
    runCount: integer("run_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("saved_queries_account_id_idx").on(table.accountId),
    index("saved_queries_last_run_at_idx").on(table.lastRunAt),
    index("saved_queries_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Query History — recent query executions (auto-saved, not user-created)
// ---------------------------------------------------------------------------

export const queryHistory = pgTable(
  "query_history",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The original query text. */
    queryText: text("query_text").notNull(),

    /** Whether the query was entered as natural language or SQL-like syntax. */
    queryType: queryTypeEnum("query_type").notNull().default("natural"),

    /** The parsed/translated structured query. */
    parsedQuery: jsonb("parsed_query").$type<Record<string, unknown>>(),

    /** Number of rows returned. */
    resultCount: integer("result_count"),

    /** Execution time in milliseconds. */
    executionTimeMs: integer("execution_time_ms"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("query_history_account_id_idx").on(table.accountId),
    index("query_history_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const savedQueriesRelations = relations(savedQueries, ({ one }) => ({
  account: one(accounts, {
    fields: [savedQueries.accountId],
    references: [accounts.id],
  }),
}));

export const queryHistoryRelations = relations(queryHistory, ({ one }) => ({
  account: one(accounts, {
    fields: [queryHistory.accountId],
    references: [accounts.id],
  }),
}));
