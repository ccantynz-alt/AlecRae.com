import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  bigint,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const planTierEnum = pgEnum("plan_tier", [
  "free",
  "starter",
  "professional",
  "enterprise",
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "suspended",
  "scheduled_for_deletion",
]);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(), // CUID or ULID
    name: text("name").notNull(),
    planTier: planTierEnum("plan_tier").notNull().default("free"),
    emailsSentThisPeriod: integer("emails_sent_this_period")
      .notNull()
      .default(0),
    periodStartedAt: timestamp("period_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    billingEmail: text("billing_email").notNull(),
    /** Total storage used in R2 (bytes) for this account */
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).notNull().default(0),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: accountStatusEnum("status").notNull().default("active"),
    scheduledDeletionAt: timestamp("scheduled_deletion_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_stripe_customer_idx").on(table.stripeCustomerId),
  ],
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("member"),
    permissions: jsonb("permissions")
      .notNull()
      .$type<{
        sendEmail: boolean;
        readEmail: boolean;
        manageDomains: boolean;
        manageApiKeys: boolean;
        manageWebhooks: boolean;
        viewAnalytics: boolean;
        manageAccount: boolean;
        manageTeamMembers: boolean;
      }>(),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerificationToken: text("email_verification_token"),
    avatarUrl: text("avatar_url"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const accountsRelations = relations(accounts, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  account: one(accounts, {
    fields: [users.accountId],
    references: [accounts.id],
  }),
}));
