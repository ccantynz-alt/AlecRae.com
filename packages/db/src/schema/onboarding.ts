import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const onboardingStepEnum = pgEnum("onboarding_step", [
  "connect_account",
  "import_settings",
  "sync_contacts",
  "set_preferences",
  "explore_features",
  "complete",
]);

export const onboardingProviderEnum = pgEnum("onboarding_provider", [
  "gmail",
  "outlook",
  "imap",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingPreferences {
  density?: "compact" | "comfortable" | "spacious";
  theme?: "light" | "dark" | "system";
  aiLevel?: "off" | "minimal" | "standard" | "aggressive";
  notifications?: "all" | "important" | "none";
  defaultSignature?: string;
  keyboardShortcuts?: boolean;
}

// ---------------------------------------------------------------------------
// Onboarding Records
// ---------------------------------------------------------------------------

export const onboardingRecords = pgTable(
  "onboarding_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    currentStep: onboardingStepEnum("current_step")
      .notNull()
      .default("connect_account"),
    completedSteps: jsonb("completed_steps").$type<string[]>().default([]),
    importedFrom: onboardingProviderEnum("imported_from"),
    preferences: jsonb("preferences").$type<OnboardingPreferences>().default({}),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("onboarding_records_account_id_idx").on(table.accountId),
    index("onboarding_records_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const onboardingRecordsRelations = relations(onboardingRecords, ({ one }) => ({
  account: one(accounts, {
    fields: [onboardingRecords.accountId],
    references: [accounts.id],
  }),
}));
