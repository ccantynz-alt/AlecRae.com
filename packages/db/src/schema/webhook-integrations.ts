import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Zapier/Make Integration — outbound webhook connectors
// ---------------------------------------------------------------------------

export const integrationPlatformEnum = pgEnum("integration_platform", [
  "zapier",
  "make",
  "n8n",
  "custom",
]);

export interface IntegrationTriggerConfig {
  events: string[];
  filters?: Record<string, unknown>;
}

export const webhookIntegrations = pgTable(
  "webhook_integrations",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    platform: integrationPlatformEnum("platform").notNull(),
    name: text("name").notNull(),
    webhookUrl: text("webhook_url").notNull(),
    secret: text("secret"),
    isActive: boolean("is_active").notNull().default(true),
    triggerConfig: jsonb("trigger_config")
      .notNull()
      .$type<IntegrationTriggerConfig>()
      .default({ events: [] }),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("webhook_integrations_account_idx").on(table.accountId),
    index("webhook_integrations_platform_idx").on(table.platform),
    index("webhook_integrations_active_idx").on(table.isActive),
  ],
);

export const webhookIntegrationsRelations = relations(webhookIntegrations, ({ one }) => ({
  account: one(accounts, {
    fields: [webhookIntegrations.accountId],
    references: [accounts.id],
  }),
}));
