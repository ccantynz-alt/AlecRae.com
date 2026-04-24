import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Labels / Tags — shared across team, nested hierarchy
// ---------------------------------------------------------------------------

export const labels = pgTable(
  "labels",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6b7280"),
    parentId: text("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    isSystem: boolean("is_system").notNull().default(false),
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("labels_account_id_idx").on(table.accountId),
    uniqueIndex("labels_account_name_idx").on(table.accountId, table.name),
    index("labels_parent_id_idx").on(table.parentId),
  ],
);

export const emailLabels = pgTable(
  "email_labels",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id").notNull(),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_labels_email_idx").on(table.emailId),
    index("email_labels_label_idx").on(table.labelId),
    uniqueIndex("email_labels_unique_idx").on(table.emailId, table.labelId),
  ],
);

export const labelsRelations = relations(labels, ({ one, many }) => ({
  account: one(accounts, {
    fields: [labels.accountId],
    references: [accounts.id],
  }),
  emailLabels: many(emailLabels),
}));

export const emailLabelsRelations = relations(emailLabels, ({ one }) => ({
  label: one(labels, {
    fields: [emailLabels.labelId],
    references: [labels.id],
  }),
}));
