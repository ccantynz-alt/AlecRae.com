import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ruleMatchModeEnum = pgEnum("rule_match_mode", ["all", "any"]);

// ---------------------------------------------------------------------------
// JSON column types
// ---------------------------------------------------------------------------

/** A single condition an email must satisfy for the rule to match. */
export interface EmailRuleCondition {
  field:
    | "from"
    | "to"
    | "cc"
    | "subject"
    | "body"
    | "has_attachment"
    | "size"
    | "label"
    | "is_newsletter"
    | "is_transactional";
  operator:
    | "contains"
    | "not_contains"
    | "equals"
    | "starts_with"
    | "ends_with"
    | "matches_regex"
    | "greater_than"
    | "less_than"
    | "is_true"
    | "is_false";
  value: string;
}

/** An action to take when a rule matches. */
export interface EmailRuleAction {
  type:
    | "label"
    | "move"
    | "archive"
    | "star"
    | "mark_read"
    | "mark_important"
    | "delete"
    | "forward"
    | "snooze"
    | "auto_reply"
    | "categorize";
  value?: string;
}

// ---------------------------------------------------------------------------
// Email Rules — AI/NL-generated + manual email filtering rules
// ---------------------------------------------------------------------------

export const emailRules = pgTable(
  "email_rules",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Human-readable rule name. */
    name: text("name").notNull(),
    /** The original natural-language description (if AI-generated). */
    description: text("description").notNull().default(""),
    /** Conditions that must match. */
    conditions: jsonb("conditions")
      .notNull()
      .$type<EmailRuleCondition[]>()
      .default([]),
    /** Whether all conditions must match, or any. */
    matchMode: ruleMatchModeEnum("match_mode").notNull().default("all"),
    /** Actions to take when matched. */
    actions: jsonb("actions").notNull().$type<EmailRuleAction[]>().default([]),
    /** Whether this rule is active. */
    enabled: boolean("enabled").notNull().default(true),
    /** Lifetime number of emails this rule has matched. */
    matchCount: integer("match_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_rules_account_id_idx").on(table.accountId),
    index("email_rules_account_enabled_idx").on(table.accountId, table.enabled),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailRulesRelations = relations(emailRules, ({ one }) => ({
  account: one(accounts, {
    fields: [emailRules.accountId],
    references: [accounts.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EmailRuleRecord = typeof emailRules.$inferSelect;
export type NewEmailRuleRecord = typeof emailRules.$inferInsert;
