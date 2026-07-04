import {
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts, users } from "./users.js";

// ---------------------------------------------------------------------------
// Refresh Tokens — JWT refresh token rotation with theft detection
// ---------------------------------------------------------------------------

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The workspace (account) this token pair is scoped to. A single
     * identity (userId) can hold separate refresh tokens per workspace once
     * it belongs to more than one — rotation must stay within that
     * workspace rather than reverting to the identity's home account.
     * Nullable for rows issued before this column existed; falls back to
     * `users.accountId` (home workspace) when absent.
     */
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull(),
    /** Family ID — tokens in the same rotation chain share this */
    family: text("family").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_token_hash_idx").on(table.tokenHash),
    index("refresh_tokens_family_idx").on(table.family),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [refreshTokens.accountId],
    references: [accounts.id],
  }),
}));
