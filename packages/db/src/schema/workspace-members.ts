import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts, users, userRoleEnum } from "./users.js";

// ---------------------------------------------------------------------------
// Workspace membership — which identities (users rows) can access which
// accounts (workspaces), and with what role in EACH one. `users.accountId` /
// `users.role` remain the identity's home workspace default; this table is
// the source of truth for authorization once an identity belongs to more
// than one workspace (multi-workspace: one login, several businesses).
// ---------------------------------------------------------------------------

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull().default("member"),
    permissions: jsonb("permissions").$type<{
      sendEmail: boolean;
      readEmail: boolean;
      manageDomains: boolean;
      manageApiKeys: boolean;
      manageWebhooks: boolean;
      viewAnalytics: boolean;
      manageAccount: boolean;
      manageTeamMembers: boolean;
    } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_members_user_account_idx").on(
      table.userId,
      table.accountId,
    ),
    index("workspace_members_account_id_idx").on(table.accountId),
    index("workspace_members_user_id_idx").on(table.userId),
  ],
);

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
    account: one(accounts, {
      fields: [workspaceMembers.accountId],
      references: [accounts.id],
    }),
  }),
);

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
