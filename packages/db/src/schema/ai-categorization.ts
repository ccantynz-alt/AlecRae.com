import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const emailPrimaryCategoryEnum = pgEnum("email_primary_category", [
  "important",
  "newsletter",
  "social",
  "promotions",
  "updates",
  "forums",
  "receipts",
  "travel",
  "finance",
  "work",
  "personal",
]);

// ---------------------------------------------------------------------------
// Email Categories — AI-assigned categories for emails
// ---------------------------------------------------------------------------

export const emailCategories = pgTable(
  "email_categories",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    primaryCategory: emailPrimaryCategoryEnum("primary_category").notNull(),

    /** Additional categories that may apply (e.g. an email can be both "work" and "finance"). */
    secondaryCategories: jsonb("secondary_categories")
      .$type<string[]>()
      .default([]),

    /** AI confidence score (0.0 – 1.0). */
    confidence: real("confidence").notNull(),

    /** Which AI model produced this categorization. */
    aiModel: text("ai_model").notNull().default("haiku"),

    categorizedAt: timestamp("categorized_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_categories_account_id_idx").on(table.accountId),
    uniqueIndex("email_categories_email_id_idx").on(table.emailId),
    index("email_categories_primary_category_idx").on(table.primaryCategory),
    index("email_categories_confidence_idx").on(table.confidence),
  ],
);

// ---------------------------------------------------------------------------
// Smart Label Rules — user-trainable AI label rules
// ---------------------------------------------------------------------------

/** Shape of the conditions JSONB column on smartLabelRules. */
export interface SmartLabelConditions {
  senderPatterns?: string[];
  subjectPatterns?: string[];
  bodyKeywords?: string[];
  hasAttachment?: boolean;
  minImportance?: number;
}

export const smartLabelRules = pgTable(
  "smart_label_rules",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    labelId: text("label_id").notNull(),
    ruleName: text("rule_name").notNull(),

    /** JSON conditions that determine when this rule fires. */
    conditions: jsonb("conditions")
      .$type<SmartLabelConditions>()
      .notNull()
      .default({}),

    /** Whether AI assists in evaluating this rule (beyond simple pattern matching). */
    aiAssisted: boolean("ai_assisted").notNull().default(true),

    /** Running accuracy metric (corrected / total). */
    accuracy: real("accuracy").notNull().default(0.5),

    /** Total times this rule has been applied. */
    totalApplied: integer("total_applied").notNull().default(0),

    /** Total times a user corrected this rule's application. */
    totalCorrected: integer("total_corrected").notNull().default(0),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("smart_label_rules_account_id_idx").on(table.accountId),
    index("smart_label_rules_label_id_idx").on(table.labelId),
    index("smart_label_rules_is_active_idx").on(table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Category Feedback — user corrections to improve AI
// ---------------------------------------------------------------------------

export const categoryFeedback = pgTable(
  "category_feedback",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    predictedCategory: text("predicted_category").notNull(),
    correctedCategory: text("corrected_category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("category_feedback_account_id_idx").on(table.accountId),
    index("category_feedback_predicted_category_idx").on(
      table.predictedCategory,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailCategoriesRelations = relations(
  emailCategories,
  ({ one }) => ({
    account: one(accounts, {
      fields: [emailCategories.accountId],
      references: [accounts.id],
    }),
  }),
);

export const smartLabelRulesRelations = relations(
  smartLabelRules,
  ({ one }) => ({
    account: one(accounts, {
      fields: [smartLabelRules.accountId],
      references: [accounts.id],
    }),
  }),
);

export const categoryFeedbackRelations = relations(
  categoryFeedback,
  ({ one }) => ({
    account: one(accounts, {
      fields: [categoryFeedback.accountId],
      references: [accounts.id],
    }),
  }),
);
