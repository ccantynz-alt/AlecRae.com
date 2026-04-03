import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Human-readable label */
    name: text("name").notNull(),
    /** Visible prefix, e.g. "em_live_abc..." */
    keyPrefix: text("key_prefix").notNull(),
    /** SHA-256 hash of the full API key for lookup */
    keyHash: text("key_hash").notNull(),
    /** Granular permissions */
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
    /** Restrict to specific domain IDs; empty array means all domains */
    allowedDomains: jsonb("allowed_domains")
      .notNull()
      .$type<string[]>()
      .default([]),
    /** Per-key rate limit override (emails/sec); null uses plan default */
    rateLimitOverride: integer("rate_limit_override"),
    /** Whether this key is "live" or "test" */
    environment: text("environment").notNull().default("live"),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastUsedIp: text("last_used_ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_idx").on(table.keyHash),
    index("api_keys_account_id_idx").on(table.accountId),
    index("api_keys_key_prefix_idx").on(table.keyPrefix),
  ],
);

// ---------------------------------------------------------------------------
// API Key usage log (for analytics and auditing)
// ---------------------------------------------------------------------------

export const apiKeyUsage = pgTable(
  "api_key_usage",
  {
    id: text("id").primaryKey(),
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Response time in milliseconds */
    responseTimeMs: integer("response_time_ms"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("api_key_usage_api_key_id_idx").on(table.apiKeyId),
    index("api_key_usage_timestamp_idx").on(table.timestamp),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  account: one(accounts, {
    fields: [apiKeys.accountId],
    references: [accounts.id],
  }),
  usage: many(apiKeyUsage),
}));

export const apiKeyUsageRelations = relations(apiKeyUsage, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [apiKeyUsage.apiKeyId],
    references: [apiKeys.id],
  }),
}));
