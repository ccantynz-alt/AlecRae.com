import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Permissions granted to a delegate for handling emails. */
export interface DelegationPermissions {
  canReply: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canForward: boolean;
}

/** A single comment on a shared draft. */
export interface SharedDraftComment {
  userId: string;
  text: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Email Delegations — delegate email handling to team members
// ---------------------------------------------------------------------------

export const emailDelegations = pgTable(
  "email_delegations",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** User ID of the person delegating their email. */
    delegatorUserId: text("delegator_user_id").notNull(),
    /** User ID of the person receiving delegation. */
    delegateUserId: text("delegate_user_id").notNull(),
    /** Scope of the delegation: all, label, sender, or thread. */
    scope: text("scope").notNull(),
    /** Optional scope value — label ID, sender email, or thread ID. */
    scopeValue: text("scope_value"),
    /** Permissions granted to the delegate. */
    permissions: jsonb("permissions")
      .notNull()
      .$type<DelegationPermissions>()
      .default({ canReply: true, canArchive: false, canDelete: false, canForward: false }),
    isActive: boolean("is_active").notNull().default(true),
    /** Optional expiration — delegation revokes automatically after this time. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_delegations_account_id_idx").on(table.accountId),
    index("email_delegations_delegator_user_id_idx").on(table.delegatorUserId),
    index("email_delegations_delegate_user_id_idx").on(table.delegateUserId),
    index("email_delegations_is_active_idx").on(table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Shared Drafts — collaborative draft emails shared with team
// ---------------------------------------------------------------------------

export const sharedDrafts = pgTable(
  "shared_drafts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** User who created this shared draft. */
    creatorUserId: text("creator_user_id").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** Array of recipient email addresses for To field. */
    toRecipients: jsonb("to_recipients")
      .notNull()
      .$type<string[]>()
      .default([]),
    /** Array of recipient email addresses for CC field. */
    ccRecipients: jsonb("cc_recipients")
      .notNull()
      .$type<string[]>()
      .default([]),
    /** Workflow status: draft → review → approved → sent. */
    status: text("status").notNull().default("draft"),
    /** User IDs of assigned reviewers. */
    reviewers: jsonb("reviewers")
      .notNull()
      .$type<string[]>()
      .default([]),
    /** Comments/feedback from reviewers. */
    comments: jsonb("comments")
      .notNull()
      .$type<SharedDraftComment[]>()
      .default([]),
    /** Optional thread ID this draft replies to. */
    threadId: text("thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shared_drafts_account_id_idx").on(table.accountId),
    index("shared_drafts_creator_user_id_idx").on(table.creatorUserId),
    index("shared_drafts_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailDelegationsRelations = relations(emailDelegations, ({ one }) => ({
  account: one(accounts, {
    fields: [emailDelegations.accountId],
    references: [accounts.id],
  }),
}));

export const sharedDraftsRelations = relations(sharedDrafts, ({ one }) => ({
  account: one(accounts, {
    fields: [sharedDrafts.accountId],
    references: [accounts.id],
  }),
}));
