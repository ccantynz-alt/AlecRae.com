import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  pgEnum,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Email A/B Testing — send variants, track which performs better
// ---------------------------------------------------------------------------

export const abTestStatusEnum = pgEnum("ab_test_status", [
  "draft",
  "running",
  "completed",
  "cancelled",
]);

export interface ABTestVariant {
  id: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  percentage: number;
}

export interface ABTestResults {
  totalSent: number;
  variants: Record<string, {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    openRate: number;
    clickRate: number;
  }>;
  winner?: string;
  confidence?: number;
}

export const abTests = pgTable(
  "ab_tests",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: abTestStatusEnum("status").notNull().default("draft"),
    variants: jsonb("variants").notNull().$type<ABTestVariant[]>(),
    recipientCount: integer("recipient_count").notNull().default(0),
    winnerMetric: text("winner_metric").notNull().default("open_rate"),
    autoSelectWinner: real("auto_select_winner"),
    results: jsonb("results").$type<ABTestResults>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ab_tests_account_id_idx").on(table.accountId),
    index("ab_tests_status_idx").on(table.status),
  ],
);

export const abTestsRelations = relations(abTests, ({ one }) => ({
  account: one(accounts, {
    fields: [abTests.accountId],
    references: [accounts.id],
  }),
}));
