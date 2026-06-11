import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "open",
  "in_progress",
  "done",
  "snoozed",
]);

export const assignmentPriorityEnum = pgEnum("assignment_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

// ---------------------------------------------------------------------------
// JSON column types
// ---------------------------------------------------------------------------

/** A member of a shared inbox. */
export interface SharedInboxMemberEntry {
  userId: string;
  role: "owner" | "admin" | "member";
  addedAt: string;
}

// ---------------------------------------------------------------------------
// Shared Inboxes — team inboxes with role-based membership
// ---------------------------------------------------------------------------

export const sharedInboxes = pgTable(
  "shared_inboxes",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Display name for the shared inbox. */
    name: text("name").notNull(),
    /** The email address this shared inbox serves. */
    email: text("email").notNull(),
    /** Membership list with roles. */
    members: jsonb("members")
      .notNull()
      .$type<SharedInboxMemberEntry[]>()
      .default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("shared_inboxes_account_id_idx").on(table.accountId)],
);

// ---------------------------------------------------------------------------
// Email Comments — internal team comments on an email
// ---------------------------------------------------------------------------

export const emailComments = pgTable(
  "email_comments",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The email this comment is attached to. */
    emailId: text("email_id").notNull(),
    /** Who wrote the comment. */
    authorId: text("author_id").notNull(),
    /** Display name of the author at write time. */
    authorName: text("author_name").notNull(),
    /** Comment body. */
    body: text("body").notNull(),
    /** Mentioned user ids. */
    mentions: jsonb("mentions").notNull().$type<string[]>().default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_comments_email_id_idx").on(table.emailId),
    index("email_comments_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Email Assignments — assign an email to a team member
// ---------------------------------------------------------------------------

export const emailAssignments = pgTable(
  "email_assignments",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The email being assigned. */
    emailId: text("email_id").notNull(),
    /** Who the email is assigned to. */
    assignedTo: text("assigned_to").notNull(),
    /** Who made the assignment. */
    assignedBy: text("assigned_by").notNull(),
    /** Workflow state. */
    status: assignmentStatusEnum("status").notNull().default("open"),
    /** Priority of the assignment. */
    priority: assignmentPriorityEnum("priority").notNull().default("medium"),
    /** Optional due date. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** Optional note attached to the assignment. */
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_assignments_account_id_idx").on(table.accountId),
    index("email_assignments_email_id_idx").on(table.emailId),
    index("email_assignments_assigned_to_idx").on(table.assignedTo),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const sharedInboxesRelations = relations(sharedInboxes, ({ one }) => ({
  account: one(accounts, {
    fields: [sharedInboxes.accountId],
    references: [accounts.id],
  }),
}));

export const emailCommentsRelations = relations(emailComments, ({ one }) => ({
  account: one(accounts, {
    fields: [emailComments.accountId],
    references: [accounts.id],
  }),
}));

export const emailAssignmentsRelations = relations(
  emailAssignments,
  ({ one }) => ({
    account: one(accounts, {
      fields: [emailAssignments.accountId],
      references: [accounts.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SharedInboxRecord = typeof sharedInboxes.$inferSelect;
export type NewSharedInboxRecord = typeof sharedInboxes.$inferInsert;
export type EmailCommentRecord = typeof emailComments.$inferSelect;
export type NewEmailCommentRecord = typeof emailComments.$inferInsert;
export type EmailAssignmentRecord = typeof emailAssignments.$inferSelect;
export type NewEmailAssignmentRecord = typeof emailAssignments.$inferInsert;
