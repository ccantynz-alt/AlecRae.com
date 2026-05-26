import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { domains } from "./domains.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const emailStatusEnum = pgEnum("email_status", [
  "draft",
  "queued",
  "processing",
  "sent",
  "delivered",
  "bounced",
  "deferred",
  "dropped",
  "failed",
  "complained",
]);

export const attachmentDispositionEnum = pgEnum("attachment_disposition", [
  "attachment",
  "inline",
]);

export const virusScanStatusEnum = pgEnum("virus_scan_status", [
  "pending",
  "clean",
  "infected",
  "skipped",
  "error",
]);

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export const emails = pgTable(
  "emails",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "restrict" }),

    // Envelope
    messageId: text("message_id").notNull(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddresses: jsonb("to_addresses")
      .notNull()
      .$type<{ name?: string; address: string }[]>(),
    ccAddresses: jsonb("cc_addresses").$type<
      { name?: string; address: string }[]
    >(),
    bccAddresses: jsonb("bcc_addresses").$type<
      { name?: string; address: string }[]
    >(),
    replyToAddress: text("reply_to_address"),
    replyToName: text("reply_to_name"),

    // Content
    subject: text("subject").notNull(),
    textBody: text("text_body"),
    htmlBody: text("html_body"),

    // Headers
    inReplyTo: text("in_reply_to"),
    references: jsonb("references").$type<string[]>(),
    customHeaders: jsonb("custom_headers").$type<Record<string, string>>(),

    // Status
    status: emailStatusEnum("status").notNull().default("queued"),

    // Metadata
    tags: jsonb("tags").notNull().$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, string>>(),

    // Scheduling
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),

    // Encryption
    encrypted: boolean("encrypted").notNull().default(false),
    encryptionKeyId: text("encryption_key_id"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("emails_account_id_idx").on(table.accountId),
    index("emails_domain_id_idx").on(table.domainId),
    index("emails_status_idx").on(table.status),
    index("emails_message_id_idx").on(table.messageId),
    index("emails_created_at_idx").on(table.createdAt),
    index("emails_account_status_idx").on(table.accountId, table.status),
    index("emails_scheduled_at_idx").on(table.scheduledAt),
  ],
);

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    /** Size in bytes */
    size: integer("size").notNull(),
    /** S3/R2 storage key */
    storageKey: text("storage_key").notNull(),
    contentId: text("content_id"),
    disposition: attachmentDispositionEnum("disposition")
      .notNull()
      .default("attachment"),
    /** Virus scan status from VirusTotal */
    virusScanStatus: virusScanStatusEnum("virus_scan_status")
      .notNull()
      .default("pending"),
    /** VirusTotal scan result details */
    virusScanResult: jsonb("virus_scan_result").$type<{
      detections: number;
      totalEngines: number;
      threats: string[];
      scannedAt: string;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("attachments_email_id_idx").on(table.emailId)],
);

// ---------------------------------------------------------------------------
// Delivery results (one per recipient per email)
// ---------------------------------------------------------------------------

export const deliveryResults = pgTable(
  "delivery_results",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    recipientAddress: text("recipient_address").notNull(),
    status: emailStatusEnum("status").notNull().default("queued"),
    remoteResponseCode: integer("remote_response_code"),
    remoteResponse: text("remote_response"),
    mxHost: text("mx_host"),
    attemptCount: integer("attempt_count").notNull().default(0),
    firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  },
  (table) => [
    index("delivery_results_email_id_idx").on(table.emailId),
    index("delivery_results_status_idx").on(table.status),
    index("delivery_results_next_retry_idx").on(table.nextRetryAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailsRelations = relations(emails, ({ one, many }) => ({
  account: one(accounts, {
    fields: [emails.accountId],
    references: [accounts.id],
  }),
  domain: one(domains, {
    fields: [emails.domainId],
    references: [domains.id],
  }),
  attachments: many(attachments),
  deliveryResults: many(deliveryResults),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  email: one(emails, {
    fields: [attachments.emailId],
    references: [emails.id],
  }),
}));

export const deliveryResultsRelations = relations(
  deliveryResults,
  ({ one }) => ({
    email: one(emails, {
      fields: [deliveryResults.emailId],
      references: [emails.id],
    }),
  }),
);
