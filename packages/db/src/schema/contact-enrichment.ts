import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { contacts } from "./contacts.js";

// ---------------------------------------------------------------------------
// Contact Enrichment — auto-pulled company info, social profiles, etc.
// ---------------------------------------------------------------------------

export interface EnrichmentData {
  fullName?: string;
  title?: string;
  company?: string;
  companyDomain?: string;
  companySize?: string;
  industry?: string;
  location?: string;
  timezone?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
  githubHandle?: string;
  avatarUrl?: string;
  bio?: string;
  seniorityLevel?: string;
  department?: string;
}

export const contactEnrichments = pgTable(
  "contact_enrichments",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    data: jsonb("data").notNull().$type<EnrichmentData>().default({}),
    confidence: real("confidence").notNull().default(0),
    source: text("source").notNull().default("ai"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("contact_enrichments_contact_idx").on(table.contactId),
    index("contact_enrichments_email_idx").on(table.email),
  ],
);

export const contactEnrichmentsRelations = relations(contactEnrichments, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactEnrichments.contactId],
    references: [contacts.id],
  }),
}));
