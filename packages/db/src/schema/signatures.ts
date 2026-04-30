import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Email Signatures — multiple per account, auto-switch by context
// ---------------------------------------------------------------------------

export interface SignatureContext {
  accountEmails?: string[];
  recipientDomains?: string[];
  labels?: string[];
}

export const signatures = pgTable(
  "signatures",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    htmlContent: text("html_content").notNull(),
    textContent: text("text_content").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    context: jsonb("context").$type<SignatureContext>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("signatures_account_id_idx").on(table.accountId),
    index("signatures_default_idx").on(table.accountId, table.isDefault),
  ],
);

export const signaturesRelations = relations(signatures, ({ one }) => ({
  account: one(accounts, {
    fields: [signatures.accountId],
    references: [accounts.id],
  }),
}));
