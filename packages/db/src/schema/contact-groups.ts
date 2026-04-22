import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { contacts } from "./contacts.js";

// ---------------------------------------------------------------------------
// Contact Groups / Distribution Lists
// ---------------------------------------------------------------------------

export const contactGroups = pgTable(
  "contact_groups",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contact_groups_account_id_idx").on(table.accountId),
    uniqueIndex("contact_groups_account_name_idx").on(table.accountId, table.name),
  ],
);

export const contactGroupMembers = pgTable(
  "contact_group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => contactGroups.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contact_group_members_group_idx").on(table.groupId),
    uniqueIndex("contact_group_members_unique_idx").on(table.groupId, table.contactId),
  ],
);

export const contactGroupsRelations = relations(contactGroups, ({ one, many }) => ({
  account: one(accounts, {
    fields: [contactGroups.accountId],
    references: [accounts.id],
  }),
  members: many(contactGroupMembers),
}));

export const contactGroupMembersRelations = relations(contactGroupMembers, ({ one }) => ({
  group: one(contactGroups, {
    fields: [contactGroupMembers.groupId],
    references: [contactGroups.id],
  }),
  contact: one(contacts, {
    fields: [contactGroupMembers.contactId],
    references: [contacts.id],
  }),
}));
