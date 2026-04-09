import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const screenerDecisionEnum = pgEnum("screener_decision", [
  "allow",
  "block",
  "pending",
]);

export const commitmentActorEnum = pgEnum("commitment_actor", [
  "sender",
  "recipient",
  "third_party",
]);

export const commitmentStatusEnum = pgEnum("commitment_status", [
  "pending",
  "completed",
  "overdue",
  "unclear",
]);

export const inboxCategorySourceEnum = pgEnum("inbox_category_source", [
  "system",
  "ai",
  "user_rule",
  "user_manual",
]);

// ---------------------------------------------------------------------------
// Screener Decisions — Track known/blocked senders
// ---------------------------------------------------------------------------

export const screenerDecisions = pgTable(
  "screener_decisions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    senderEmail: text("sender_email").notNull(),
    decision: screenerDecisionEnum("decision").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("screener_decisions_account_sender_idx").on(
      table.accountId,
      table.senderEmail,
    ),
    index("screener_decisions_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Screener Queue — Emails awaiting sender approval
// ---------------------------------------------------------------------------

export interface ScreenerAiAssessment {
  isLikelySpam: boolean;
  isLikelyNewsletter: boolean;
  isLikelyImportant: boolean;
  reasoning: string;
}

export const screenerQueue = pgTable(
  "screener_queue",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    senderEmail: text("sender_email").notNull(),
    senderName: text("sender_name").notNull(),
    firstEmailId: text("first_email_id").notNull(),
    firstEmailSubject: text("first_email_subject").notNull(),
    firstEmailSnippet: text("first_email_snippet").notNull(),
    aiAssessment: jsonb("ai_assessment")
      .notNull()
      .$type<ScreenerAiAssessment>(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("screener_queue_account_id_idx").on(table.accountId),
    index("screener_queue_sender_email_idx").on(
      table.accountId,
      table.senderEmail,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Commitments — AI-extracted action items from emails
// ---------------------------------------------------------------------------

export const commitments = pgTable(
  "commitments",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    actor: commitmentActorEnum("actor").notNull(),
    actorName: text("actor_name").notNull(),
    description: text("description").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }),
    status: commitmentStatusEnum("status").notNull().default("pending"),
    sourceEmailId: text("source_email_id").notNull(),
    sourceQuote: text("source_quote").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("commitments_account_id_idx").on(table.accountId),
    index("commitments_status_idx").on(table.accountId, table.status),
    index("commitments_source_email_idx").on(table.sourceEmailId),
  ],
);

// ---------------------------------------------------------------------------
// Custom Inbox Categories
// ---------------------------------------------------------------------------

export const inboxCategories = pgTable(
  "inbox_categories",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📁"),
    rule: text("rule"),
    source: inboxCategorySourceEnum("source").notNull().default("user_rule"),
    priority: integer("priority").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inbox_categories_account_id_idx").on(table.accountId),
    index("inbox_categories_priority_idx").on(table.accountId, table.priority),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const screenerDecisionsRelations = relations(
  screenerDecisions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [screenerDecisions.accountId],
      references: [accounts.id],
    }),
  }),
);

export const screenerQueueRelations = relations(
  screenerQueue,
  ({ one }) => ({
    account: one(accounts, {
      fields: [screenerQueue.accountId],
      references: [accounts.id],
    }),
  }),
);

export const commitmentsRelations = relations(commitments, ({ one }) => ({
  account: one(accounts, {
    fields: [commitments.accountId],
    references: [accounts.id],
  }),
}));

export const inboxCategoriesRelations = relations(
  inboxCategories,
  ({ one }) => ({
    account: one(accounts, {
      fields: [inboxCategories.accountId],
      references: [accounts.id],
    }),
  }),
);
