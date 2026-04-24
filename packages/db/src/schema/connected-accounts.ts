import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

export const emailProviderEnum = pgEnum("email_provider", [
  "gmail",
  "outlook",
  "imap",
]);

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    provider: emailProviderEnum("provider").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    imapHost: text("imap_host"),
    imapPort: text("imap_port"),
    imapUsername: text("imap_username"),
    imapPassword: text("imap_password"),
    smtpHost: text("smtp_host"),
    smtpPort: text("smtp_port"),
    smtpUsername: text("smtp_username"),
    smtpPassword: text("smtp_password"),
    status: text("status").notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncCursor: text("sync_cursor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connected_accounts_account_idx").on(table.accountId),
    index("connected_accounts_email_idx").on(table.email),
  ],
);

export const connectedAccountsRelations = relations(connectedAccounts, ({ one }) => ({
  account: one(accounts, {
    fields: [connectedAccounts.accountId],
    references: [accounts.id],
  }),
}));
