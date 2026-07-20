import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  jsonb,
  index,
  uniqueIndex,
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
    // Nullable: mail synced/imported from a connected EXTERNAL account
    // (Gmail/Outlook/MBOX/EML) is addressed to an external mailbox, not one of
    // our hosted sending domains, so it has no domainId. Mail sent or received
    // through a hosted domain still sets it.
    domainId: text("domain_id").references(() => domains.id, {
      onDelete: "restrict",
    }),

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

    /** Provenance of the message. "outbound" for mail we send, "inbound" for
     *  mail received via our MTA, or an import/sync source for connected
     *  external accounts ("gmail"/"outlook"/"mbox"/"eml"). Null on legacy rows. */
    source: text("source"),

    /** The connected provider's own internal message id (Gmail's `id`,
     *  Outlook's `id`) — distinct from `messageId` above, which is the
     *  RFC 822 `Message-ID:` header. Without this there was no way to
     *  correlate a provider-reported deletion back to a local row: Gmail's
     *  incremental-sync history API reports deletions by its own internal
     *  id, which the RFC 822 Message-ID can't be recovered from after the
     *  fact (the message is already gone server-side by the time the
     *  deletion event arrives). Null for outbound/inbound-MTA mail and for
     *  rows synced before this column existed. */
    providerMessageId: text("provider_message_id"),

    // Metadata
    tags: jsonb("tags").notNull().$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, string>>(),

    // User-facing mailbox state — deliberately separate from `status` above
    // (the send-pipeline enum: queued/sent/delivered/bounced/dropped/etc).
    // Archive/delete/star used to overload `status` + overwrite the whole
    // `tags` array, which meant the inbox query never actually excluded
    // archived/deleted mail (nothing filtered on it) and starring wiped
    // labels. These are real, independently-settable columns instead.
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    folder: text("folder").notNull().default("inbox"),

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
    index("emails_account_folder_idx").on(table.accountId, table.folder),
    index("emails_account_provider_message_id_idx").on(table.accountId, table.providerMessageId),
    // Dedup was previously a pure application-level SELECT-then-INSERT
    // check (lib/received-email-store.ts) with no DB-level guarantee — a
    // classic TOCTOU race: two overlapping syncs for the same account
    // (a user-triggered "sync now" racing the 5-minute background sweep)
    // could both pass the existence check and insert duplicate rows.
    // Synthetic ids for messages with no real Message-ID header are
    // always fresh UUIDs, so they never collide here; outbound sends
    // generate a fresh id per send and idempotent retries are deduped
    // upstream (Redis, before the DB write), so this is safe for both
    // paths, not just inbound sync.
    uniqueIndex("emails_account_message_id_idx").on(table.accountId, table.messageId),
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
