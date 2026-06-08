// DPA Signatures — tamper-evident records of self-serve Data Processing
// Agreement acceptance for enterprise/business customers (GDPR Art. 28).
//
// Each row captures WHO signed, WHICH version of the DPA text, and a SHA-256
// hash of the exact document text that was presented at signing time, plus
// the IP address and user agent for legal audit. The hash + version + timestamp
// together make the record tamper-evident: if the stored DPA text ever changes,
// the recomputed hash will no longer match what the signer agreed to.
import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";
import { organizations } from "./sso-config.js";

// ---------------------------------------------------------------------------
// DPA Signatures
// ---------------------------------------------------------------------------

export const dpaSignatures = pgTable(
  "dpa_signatures",
  {
    id: text("id").primaryKey(),
    // The account whose authorized signer accepted the DPA.
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // Optional link to the organization this signature covers (enterprise tenants).
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    // Identity of the natural person who signed.
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email").notNull(),
    signerTitle: text("signer_title").notNull(),
    // Legal entity (Controller) on whose behalf the DPA is signed.
    companyName: text("company_name").notNull(),
    // The DPA version identifier (e.g. effective date / semantic version) that
    // was presented and accepted. Used together with documentHash for audit.
    dpaVersion: text("dpa_version").notNull(),
    // SHA-256 hash (hex) of the exact DPA document text the signer agreed to.
    documentHash: text("document_hash").notNull(),
    // Tamper-evidence + legal audit metadata.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("dpa_signatures_account_id_idx").on(table.accountId),
    index("dpa_signatures_organization_id_idx").on(table.organizationId),
    // One signature per account per DPA version keeps audit clean and prevents
    // accidental duplicate acceptances of the same version.
    uniqueIndex("dpa_signatures_account_version_idx").on(
      table.accountId,
      table.dpaVersion,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const dpaSignaturesRelations = relations(dpaSignatures, ({ one }) => ({
  account: one(accounts, {
    fields: [dpaSignatures.accountId],
    references: [accounts.id],
  }),
  organization: one(organizations, {
    fields: [dpaSignatures.organizationId],
    references: [organizations.id],
  }),
}));
