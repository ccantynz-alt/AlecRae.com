import {
  pgTable,
  text,
  timestamp,
  boolean,
  real,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const threatTypeEnum = pgEnum("threat_type", [
  "phishing",
  "malware",
  "spam",
  "impersonation",
  "business_email_compromise",
  "credential_harvesting",
]);

export const threatSeverityEnum = pgEnum("threat_severity", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const threatUserActionEnum = pgEnum("threat_user_action", [
  "reported",
  "dismissed",
  "quarantined",
]);

export const securityPolicyTypeEnum = pgEnum("security_policy_type", [
  "block_sender",
  "block_domain",
  "require_tls",
  "quarantine_attachments",
  "flag_external",
]);

export const securityEventTypeEnum = pgEnum("security_event_type", [
  "threat_detected",
  "policy_created",
  "policy_deleted",
  "sender_blocked",
  "email_quarantined",
  "settings_changed",
]);

// ---------------------------------------------------------------------------
// Types for JSONB columns
// ---------------------------------------------------------------------------

/** Signals detected during email threat analysis. */
export interface ThreatSignals {
  urlMismatch?: boolean;
  senderSpoofed?: boolean;
  urgentLanguage?: boolean;
  attachmentRisk?: boolean;
  newSender?: boolean;
  domainAge?: number;
  replyToMismatch?: boolean;
}

// ---------------------------------------------------------------------------
// Threat Detections — detected email threats
// ---------------------------------------------------------------------------

export const threatDetections = pgTable(
  "threat_detections",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The email this threat was detected in. */
    emailId: text("email_id").notNull(),

    /** Classification of the threat. */
    threatType: threatTypeEnum("threat_type").notNull(),

    /** How severe this threat is. */
    severity: threatSeverityEnum("severity").notNull(),

    /** Confidence score from 0.0 to 1.0. */
    confidence: real("confidence").notNull(),

    /** Structured signals that contributed to the detection. */
    signals: jsonb("signals")
      .notNull()
      .$type<ThreatSignals>()
      .default({}),

    /** AI-generated explanation of why this email is a threat. */
    aiExplanation: text("ai_explanation").notNull(),

    /** Action the user has taken on this threat (null if no action yet). */
    userAction: threatUserActionEnum("user_action"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("td_account_id_idx").on(table.accountId),
    uniqueIndex("td_email_id_idx").on(table.emailId),
    index("td_threat_type_idx").on(table.threatType),
    index("td_severity_idx").on(table.severity),
    index("td_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Security Policies — per-account email security policies
// ---------------------------------------------------------------------------

export const securityPolicies = pgTable(
  "security_policies",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Human-readable name for this policy. */
    name: text("name").notNull(),

    /** Type of policy being enforced. */
    type: securityPolicyTypeEnum("type").notNull(),

    /** The value this policy applies to (e.g. sender email, domain name). */
    value: text("value").notNull(),

    /** Whether this policy is currently active. */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sp_account_id_idx").on(table.accountId),
    index("sp_type_idx").on(table.type),
    index("sp_is_active_idx").on(table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Security Audit Log — audit trail of security events
// ---------------------------------------------------------------------------

export const securityAuditLog = pgTable(
  "security_audit_log",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Type of security event that occurred. */
    eventType: securityEventTypeEnum("event_type").notNull(),

    /** Structured details about the event. */
    details: jsonb("details")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),

    /** The user who triggered this event (null for system events). */
    userId: text("user_id"),

    /** IP address where the event originated (null for system events). */
    ipAddress: text("ip_address"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sal_account_id_idx").on(table.accountId),
    index("sal_event_type_idx").on(table.eventType),
    index("sal_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const threatDetectionsRelations = relations(
  threatDetections,
  ({ one }) => ({
    account: one(accounts, {
      fields: [threatDetections.accountId],
      references: [accounts.id],
    }),
  }),
);

export const securityPoliciesRelations = relations(
  securityPolicies,
  ({ one }) => ({
    account: one(accounts, {
      fields: [securityPolicies.accountId],
      references: [accounts.id],
    }),
  }),
);

export const securityAuditLogRelations = relations(
  securityAuditLog,
  ({ one }) => ({
    account: one(accounts, {
      fields: [securityAuditLog.accountId],
      references: [accounts.id],
    }),
  }),
);
