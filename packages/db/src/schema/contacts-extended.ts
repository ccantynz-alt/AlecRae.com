import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { contacts } from "./contacts.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const contactInteractionTypeEnum = pgEnum("contact_interaction_type", [
  "email_sent",
  "email_received",
  "meeting",
  "call",
  "note",
]);

// ---------------------------------------------------------------------------
// Contact Interactions — full timeline of touchpoints with a contact
// ---------------------------------------------------------------------------

export const contactInteractions = pgTable(
  "contact_interactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: contactInteractionTypeEnum("type").notNull(),
    subject: text("subject"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("contact_interactions_account_id_idx").on(table.accountId),
    index("contact_interactions_contact_id_idx").on(table.contactId),
    index("contact_interactions_occurred_at_idx").on(
      table.contactId,
      table.occurredAt,
    ),
    index("contact_interactions_type_idx").on(table.contactId, table.type),
  ],
);

// ---------------------------------------------------------------------------
// Contact Reminders — follow-up reminders for contacts
// ---------------------------------------------------------------------------

export const contactReminders = pgTable(
  "contact_reminders",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    reminderAt: timestamp("reminder_at", { withTimezone: true }).notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contact_reminders_account_id_idx").on(table.accountId),
    index("contact_reminders_contact_id_idx").on(table.contactId),
    index("contact_reminders_reminder_at_idx").on(
      table.accountId,
      table.reminderAt,
    ),
    index("contact_reminders_completed_idx").on(
      table.accountId,
      table.isCompleted,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const contactInteractionsRelations = relations(
  contactInteractions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [contactInteractions.accountId],
      references: [accounts.id],
    }),
    contact: one(contacts, {
      fields: [contactInteractions.contactId],
      references: [contacts.id],
    }),
  }),
);

export const contactRemindersRelations = relations(
  contactReminders,
  ({ one }) => ({
    account: one(accounts, {
      fields: [contactReminders.accountId],
      references: [accounts.id],
    }),
    contact: one(contacts, {
      fields: [contactReminders.contactId],
      references: [contacts.id],
    }),
  }),
);
