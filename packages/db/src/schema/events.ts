import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { emails } from "./emails.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const emailEventTypeEnum = pgEnum("email_event_type", [
  "email.queued",
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.deferred",
  "email.dropped",
  "email.failed",
  "email.opened",
  "email.clicked",
  "email.unsubscribed",
  "email.complained",
  "domain.verified",
  "domain.failed",
]);

export const bounceTypeEnum = pgEnum("bounce_type", ["hard", "soft"]);

export const bounceCategoryEnum = pgEnum("bounce_category", [
  "unknown_user",
  "mailbox_full",
  "domain_not_found",
  "policy_rejection",
  "spam_block",
  "rate_limited",
  "protocol_error",
  "content_rejected",
  "authentication_failed",
  "other",
]);

export const feedbackTypeEnum = pgEnum("feedback_type", [
  "abuse",
  "fraud",
  "virus",
  "other",
]);

// ---------------------------------------------------------------------------
// Events (append-only log)
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").references(() => emails.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id"),
    type: emailEventTypeEnum("type").notNull(),
    recipient: text("recipient"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Bounce details (populated for bounce events)
    bounceType: bounceTypeEnum("bounce_type"),
    bounceCategory: bounceCategoryEnum("bounce_category"),
    diagnosticCode: text("diagnostic_code"),
    remoteMta: text("remote_mta"),

    // Complaint details
    feedbackType: feedbackTypeEnum("feedback_type"),
    feedbackProvider: text("feedback_provider"),

    // Engagement details (clicks, opens)
    url: text("url"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),

    // SMTP details
    smtpResponse: text("smtp_response"),
    mxHost: text("mx_host"),

    // Tags and metadata from the original email
    tags: jsonb("tags").$type<string[]>(),
    metadata: jsonb("metadata").$type<Record<string, string>>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_account_id_idx").on(table.accountId),
    index("events_email_id_idx").on(table.emailId),
    index("events_type_idx").on(table.type),
    index("events_timestamp_idx").on(table.timestamp),
    index("events_account_type_timestamp_idx").on(
      table.accountId,
      table.type,
      table.timestamp,
    ),
    index("events_recipient_idx").on(table.recipient),
  ],
);

// ---------------------------------------------------------------------------
// Webhooks configuration
// ---------------------------------------------------------------------------

export const webhooks = pgTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** HMAC secret for signing payloads */
    secret: text("secret").notNull(),
    /** Event types this webhook subscribes to; null means all */
    eventTypes: jsonb("event_types").$type<string[]>(),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("webhooks_account_id_idx").on(table.accountId)],
);

// ---------------------------------------------------------------------------
// Webhook delivery log
// ---------------------------------------------------------------------------

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    statusCode: text("status_code"),
    responseBody: text("response_body"),
    attemptCount: integer("attempt_count").notNull().default(0),
    success: boolean("success").notNull().default(false),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("webhook_deliveries_webhook_id_idx").on(table.webhookId),
    index("webhook_deliveries_event_id_idx").on(table.eventId),
    index("webhook_deliveries_next_retry_idx").on(table.nextRetryAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const eventsRelations = relations(events, ({ one }) => ({
  account: one(accounts, {
    fields: [events.accountId],
    references: [accounts.id],
  }),
  email: one(emails, {
    fields: [events.emailId],
    references: [emails.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  account: one(accounts, {
    fields: [webhooks.accountId],
    references: [accounts.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(
  webhookDeliveries,
  ({ one }) => ({
    webhook: one(webhooks, {
      fields: [webhookDeliveries.webhookId],
      references: [webhooks.id],
    }),
    event: one(events, {
      fields: [webhookDeliveries.eventId],
      references: [events.id],
    }),
  }),
);
