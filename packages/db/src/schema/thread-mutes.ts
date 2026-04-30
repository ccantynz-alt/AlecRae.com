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
// Thread Mutes — silence a thread without unsubscribing
// ---------------------------------------------------------------------------

export const threadMutes = pgTable(
  "thread_mutes",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("thread_mutes_account_id_idx").on(table.accountId),
    uniqueIndex("thread_mutes_account_thread_idx").on(table.accountId, table.threadId),
  ],
);

export const threadMutesRelations = relations(threadMutes, ({ one }) => ({
  account: one(accounts, {
    fields: [threadMutes.accountId],
    references: [accounts.id],
  }),
}));
