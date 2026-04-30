import {
  pgTable,
  text,
  timestamp,
  bigint,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// AlecRae Files — attachment management + cloud storage
// ---------------------------------------------------------------------------

export const fileSourceEnum = pgEnum("file_source", [
  "attachment",
  "upload",
  "drive",
]);

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    source: fileSourceEnum("source").notNull().default("upload"),
    emailId: text("email_id"),
    threadId: text("thread_id"),
    thumbnailKey: text("thumbnail_key"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("files_account_id_idx").on(table.accountId),
    index("files_email_id_idx").on(table.emailId),
    index("files_mime_type_idx").on(table.mimeType),
    index("files_uploaded_at_idx").on(table.uploadedAt),
  ],
);

export const filesRelations = relations(files, ({ one }) => ({
  account: one(accounts, {
    fields: [files.accountId],
    references: [accounts.id],
  }),
}));
