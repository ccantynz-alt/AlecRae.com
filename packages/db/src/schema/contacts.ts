import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Contact Stats — JSON column type
// ---------------------------------------------------------------------------

export interface ContactStats {
  totalEmails: number;
  lastContactedAt: string | null;
  firstContactedAt: string | null;
  avgResponseTimeHours: number | null;
  sentCount: number;
  receivedCount: number;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    company: text("company"),
    tags: jsonb("tags").notNull().$type<string[]>().default([]),
    notes: text("notes").notNull().default(""),
    stats: jsonb("stats")
      .notNull()
      .$type<ContactStats>()
      .default({
        totalEmails: 0,
        lastContactedAt: null,
        firstContactedAt: null,
        avgResponseTimeHours: null,
        sentCount: 0,
        receivedCount: 0,
      }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contacts_account_id_idx").on(table.accountId),
    uniqueIndex("contacts_account_email_idx").on(table.accountId, table.email),
    index("contacts_email_idx").on(table.email),
    index("contacts_name_idx").on(table.name),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const contactsRelations = relations(contacts, ({ one }) => ({
  account: one(accounts, {
    fields: [contacts.accountId],
    references: [accounts.id],
  }),
}));
