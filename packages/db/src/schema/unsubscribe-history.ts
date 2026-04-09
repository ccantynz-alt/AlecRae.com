import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  jsonb,
  index,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { emails } from "./emails.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const unsubscribeMethodEnum = pgEnum("unsubscribe_method", [
  "one_click_post",
  "http",
  "mailto",
  "none",
]);

export const unsubscribeStatusEnum = pgEnum("unsubscribe_status", [
  "pending",
  "success",
  "failed",
  "no_option",
]);

// ---------------------------------------------------------------------------
// Unsubscribe History — tracks every unsubscribe attempt
// ---------------------------------------------------------------------------

export const unsubscribeHistory = pgTable(
  "unsubscribe_history",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    /** Sender address that was unsubscribed from. */
    fromAddress: text("from_address").notNull(),
    /** Which mechanism was used. */
    method: unsubscribeMethodEnum("method").notNull(),
    /** The URL or mailto: target. */
    target: text("target").notNull().default(""),
    /** Outcome. */
    status: unsubscribeStatusEnum("status").notNull().default("pending"),
    /** Confidence score of the chosen option (0..1). */
    confidence: real("confidence"),
    /** Source of the unsubscribe option. */
    source: text("source"),
    /** Human-readable log of every agent step. */
    steps: jsonb("steps").$type<string[]>(),
    /** Final URL the browser agent landed on (http method only). */
    finalUrl: text("final_url"),
    /** Confirmation text scraped from the page. */
    confirmationText: text("confirmation_text"),
    /** Error message if the attempt failed. */
    error: text("error"),
    /** When the attempt started. */
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When the attempt finished. */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("unsubscribe_history_account_id_idx").on(table.accountId),
    index("unsubscribe_history_email_id_idx").on(table.emailId),
    index("unsubscribe_history_from_idx").on(table.fromAddress),
    index("unsubscribe_history_status_idx").on(table.status),
    index("unsubscribe_history_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const unsubscribeHistoryRelations = relations(
  unsubscribeHistory,
  ({ one }) => ({
    account: one(accounts, {
      fields: [unsubscribeHistory.accountId],
      references: [accounts.id],
    }),
    email: one(emails, {
      fields: [unsubscribeHistory.emailId],
      references: [emails.id],
    }),
  }),
);
