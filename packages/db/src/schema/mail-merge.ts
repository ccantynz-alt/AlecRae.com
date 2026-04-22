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
// Mail Merge — personalized mass emails from CSV/contacts
// ---------------------------------------------------------------------------

export const mailMergeStatusEnum = pgEnum("mail_merge_status", [
  "draft",
  "validating",
  "ready",
  "sending",
  "completed",
  "failed",
  "cancelled",
]);

export interface MailMergeRecipient {
  email: string;
  variables: Record<string, string>;
  status: "pending" | "sent" | "failed" | "skipped";
  sentAt?: string;
  error?: string;
}

export const mailMerges = pgTable(
  "mail_merges",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateId: text("template_id"),
    subject: text("subject").notNull(),
    htmlBody: text("html_body"),
    textBody: text("text_body"),
    status: mailMergeStatusEnum("status").notNull().default("draft"),
    recipients: jsonb("recipients").notNull().$type<MailMergeRecipient[]>().default([]),
    totalRecipients: integer("total_recipients").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mail_merges_account_id_idx").on(table.accountId),
    index("mail_merges_status_idx").on(table.status),
  ],
);

export const mailMergesRelations = relations(mailMerges, ({ one }) => ({
  account: one(accounts, {
    fields: [mailMerges.accountId],
    references: [accounts.id],
  }),
}));
