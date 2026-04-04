import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateVariable {
  name: string;
  defaultValue?: string;
  required: boolean;
}

export const templates = pgTable(
  "templates",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    // Template metadata
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),

    // Content
    subject: text("subject").notNull(),
    htmlBody: text("html_body"),
    textBody: text("text_body"),

    // Variable definitions extracted from template content
    variables: jsonb("variables")
      .notNull()
      .$type<TemplateVariable[]>()
      .default([]),

    // Versioning and lifecycle
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("templates_account_id_idx").on(table.accountId),
    index("templates_category_idx").on(table.accountId, table.category),
    index("templates_is_active_idx").on(table.accountId, table.isActive),
    uniqueIndex("templates_account_name_idx").on(table.accountId, table.name),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const templatesRelations = relations(templates, ({ one }) => ({
  account: one(accounts, {
    fields: [templates.accountId],
    references: [accounts.id],
  }),
}));
