import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts, users } from "./users.js";
import { domains } from "./domains.js";

// ---------------------------------------------------------------------------
// Native mailboxes — provisioned business-email addresses on a domain we host
// (e.g. info@bookaride.co.nz). Distinct from connected_accounts, which are
// EXTERNAL Gmail/Outlook/IMAP accounts linked over OAuth. A mailbox belongs to
// an account, lives on one of that account's verified domains, and optionally
// targets a specific user within the account. Inbound mail addressed to a
// mailbox is routed to the owning account's inbox; sending as the mailbox is
// permitted because the account owns the (verified) domain.
// ---------------------------------------------------------------------------

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    /** Local part, e.g. "info" for info@bookaride.co.nz */
    localPart: text("local_part").notNull(),
    /** Full lowercased address, e.g. "info@bookaride.co.nz" */
    address: text("address").notNull(),
    /** Display name used on outbound mail, e.g. "BookARide Support" */
    displayName: text("display_name"),
    /** Optional owning user within the account; null = shared/account-level */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Optional forwarding targets (addresses) */
    forwardTo: jsonb("forward_to").$type<string[]>(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("mailboxes_address_idx").on(table.address),
    index("mailboxes_account_id_idx").on(table.accountId),
    index("mailboxes_domain_id_idx").on(table.domainId),
  ],
);

export const mailboxesRelations = relations(mailboxes, ({ one }) => ({
  account: one(accounts, {
    fields: [mailboxes.accountId],
    references: [accounts.id],
  }),
  domain: one(domains, {
    fields: [mailboxes.domainId],
    references: [domains.id],
  }),
  user: one(users, {
    fields: [mailboxes.userId],
    references: [users.id],
  }),
}));

export type Mailbox = typeof mailboxes.$inferSelect;
export type NewMailbox = typeof mailboxes.$inferInsert;
