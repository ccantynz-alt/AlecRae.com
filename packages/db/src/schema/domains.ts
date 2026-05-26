import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const domainVerificationStatusEnum = pgEnum(
  "domain_verification_status",
  ["pending", "verifying", "verified", "failed", "expired"],
);

export const dnsRecordTypeEnum = pgEnum("dns_record_type", [
  "TXT",
  "CNAME",
  "MX",
  "A",
  "AAAA",
]);

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const domains = pgTable(
  "domains",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    subdomain: text("subdomain"),
    verificationStatus: domainVerificationStatusEnum("verification_status")
      .notNull()
      .default("pending"),
    verificationAttempts: integer("verification_attempts")
      .notNull()
      .default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastVerificationAttempt: timestamp("last_verification_attempt", {
      withTimezone: true,
    }),

    // Authentication status
    spfVerified: boolean("spf_verified").notNull().default(false),
    spfRecord: text("spf_record"),
    dkimVerified: boolean("dkim_verified").notNull().default(false),
    dkimSelector: text("dkim_selector"),
    dkimPublicKey: text("dkim_public_key"),
    dkimPrivateKey: text("dkim_private_key"), // Encrypted at rest
    dmarcVerified: boolean("dmarc_verified").notNull().default(false),
    dmarcPolicy: text("dmarc_policy"),
    dmarcRecord: text("dmarc_record"),
    returnPathVerified: boolean("return_path_verified")
      .notNull()
      .default(false),
    returnPathDomain: text("return_path_domain"),

    isActive: boolean("is_active").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("domains_domain_idx").on(table.domain),
    index("domains_account_id_idx").on(table.accountId),
    index("domains_verification_status_idx").on(table.verificationStatus),
  ],
);

// ---------------------------------------------------------------------------
// DNS Records (required records for domain verification)
// ---------------------------------------------------------------------------

export const dnsRecords = pgTable(
  "dns_records",
  {
    id: text("id").primaryKey(),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    type: dnsRecordTypeEnum("type").notNull(),
    name: text("name").notNull(),
    value: text("value").notNull(),
    ttl: integer("ttl").notNull().default(3600),
    priority: integer("priority"),
    verified: boolean("verified").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("dns_records_domain_id_idx").on(table.domainId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const domainsRelations = relations(domains, ({ one, many }) => ({
  account: one(accounts, {
    fields: [domains.accountId],
    references: [accounts.id],
  }),
  dnsRecords: many(dnsRecords),
}));

export const dnsRecordsRelations = relations(dnsRecords, ({ one }) => ({
  domain: one(domains, {
    fields: [dnsRecords.domainId],
    references: [domains.id],
  }),
}));
