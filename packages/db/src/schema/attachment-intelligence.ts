import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const attachmentThreatLevelEnum = pgEnum("attachment_threat_level", [
  "safe",
  "suspicious",
  "dangerous",
]);

export const attachmentVirusScanStatusEnum = pgEnum(
  "attachment_virus_scan_status",
  ["pending", "clean", "infected", "error"],
);

export const fileImportanceEnum = pgEnum("file_importance", [
  "critical",
  "important",
  "normal",
  "low",
]);

// ---------------------------------------------------------------------------
// Attachment Analysis — AI analysis of email attachments
// ---------------------------------------------------------------------------

export const attachmentAnalysis = pgTable(
  "attachment_analysis",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The email this attachment belongs to. */
    emailId: text("email_id").notNull(),

    /** Original file name. */
    fileName: text("file_name").notNull(),

    /** High-level file type (e.g. "pdf", "image", "spreadsheet"). */
    fileType: text("file_type").notNull(),

    /** Size of the attachment in bytes. */
    fileSize: integer("file_size").notNull(),

    /** MIME type (e.g. "application/pdf"). */
    mimeType: text("mime_type").notNull(),

    /** Whether the attachment is considered safe. */
    isSafe: boolean("is_safe").notNull().default(true),

    /** AI-assessed threat level. */
    threatLevel: attachmentThreatLevelEnum("threat_level")
      .notNull()
      .default("safe"),

    /** AI-generated summary of the attachment contents. */
    aiSummary: text("ai_summary"),

    /** Text extracted from the attachment via OCR or parsing. */
    extractedText: text("extracted_text"),

    /** Whether the attachment contains personally identifiable information. */
    containsPII: boolean("contains_pii").notNull().default(false),

    /** Types of PII detected (e.g. ["email", "ssn", "phone"]). */
    piiTypes: jsonb("pii_types").$type<string[]>().default([]),

    /** Current virus scan status. */
    virusScanStatus: attachmentVirusScanStatusEnum("virus_scan_status")
      .notNull()
      .default("pending"),

    /** Detailed virus scan result or engine output. */
    virusScanResult: text("virus_scan_result"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("aa_account_id_idx").on(table.accountId),
    index("aa_email_id_idx").on(table.emailId),
    index("aa_threat_level_idx").on(table.threatLevel),
    index("aa_virus_scan_status_idx").on(table.virusScanStatus),
    index("aa_file_type_idx").on(table.fileType),
  ],
);

// ---------------------------------------------------------------------------
// Smart File Organization — AI-suggested file organization
// ---------------------------------------------------------------------------

export const smartFileOrganization = pgTable(
  "smart_file_organization",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Name of the file being organized. */
    fileName: text("file_name").notNull(),

    /** High-level file type. */
    fileType: text("file_type").notNull(),

    /** AI-suggested folder path for this file. */
    suggestedFolder: text("suggested_folder").notNull(),

    /** AI-suggested tags for categorization. */
    suggestedTags: jsonb("suggested_tags").$type<string[]>().default([]),

    /** Email IDs where this file appeared or is referenced. */
    relatedEmails: jsonb("related_emails").$type<string[]>().default([]),

    /** AI-assessed importance level. */
    importance: fileImportanceEnum("importance").notNull().default("normal"),

    /** Suggested expiration date for ephemeral files (null = no expiry). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /** Whether the user has acted on this suggestion. */
    isActioned: boolean("is_actioned").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sfo_account_id_idx").on(table.accountId),
    index("sfo_suggested_folder_idx").on(table.suggestedFolder),
    index("sfo_importance_idx").on(table.importance),
    index("sfo_is_actioned_idx").on(table.isActioned),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const attachmentAnalysisRelations = relations(
  attachmentAnalysis,
  ({ one }) => ({
    account: one(accounts, {
      fields: [attachmentAnalysis.accountId],
      references: [accounts.id],
    }),
  }),
);

export const smartFileOrganizationRelations = relations(
  smartFileOrganization,
  ({ one }) => ({
    account: one(accounts, {
      fields: [smartFileOrganization.accountId],
      references: [accounts.id],
    }),
  }),
);
