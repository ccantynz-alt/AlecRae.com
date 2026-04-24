import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// AlecRae Notes — email-linked notes (like Notion meets email)
// ---------------------------------------------------------------------------

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    htmlContent: text("html_content"),
    emailId: text("email_id"),
    threadId: text("thread_id"),
    contactId: text("contact_id"),
    tags: jsonb("tags").notNull().$type<string[]>().default([]),
    isPinned: text("is_pinned").notNull().default("false"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_account_id_idx").on(table.accountId),
    index("notes_email_id_idx").on(table.emailId),
    index("notes_thread_id_idx").on(table.threadId),
    index("notes_contact_id_idx").on(table.contactId),
  ],
);

export const notesRelations = relations(notes, ({ one }) => ({
  account: one(accounts, {
    fields: [notes.accountId],
    references: [accounts.id],
  }),
}));
