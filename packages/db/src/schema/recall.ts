import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { emails } from "./emails.js";

// ---------------------------------------------------------------------------
// Recall Records — Link-based email viewing with revocation
// ---------------------------------------------------------------------------

export const recallRecords = pgTable(
  "recall_records",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    revoked: boolean("revoked").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    selfDestructAt: timestamp("self_destruct_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recall_records_token_idx").on(table.token),
    uniqueIndex("recall_records_email_id_idx").on(table.emailId),
    index("recall_records_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const recallRecordsRelations = relations(recallRecords, ({ one }) => ({
  account: one(accounts, {
    fields: [recallRecords.accountId],
    references: [accounts.id],
  }),
  email: one(emails, {
    fields: [recallRecords.emailId],
    references: [emails.id],
  }),
}));
