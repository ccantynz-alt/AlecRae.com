import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Phishing Reports — user-submitted "this email is phishing" reports (B6)
// ---------------------------------------------------------------------------

export const phishingReports = pgTable(
  "phishing_reports",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** The email being reported (null when reported from raw headers/preview). */
    emailId: text("email_id"),
    /** Sender address of the reported email (lowercased). */
    fromAddress: text("from_address").notNull(),
    /** Subject of the reported email. */
    subject: text("subject").notNull().default(""),
    /** Optional free-text reason supplied by the user. */
    reason: text("reason"),

    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("phishing_reports_account_id_idx").on(table.accountId),
    index("phishing_reports_from_address_idx").on(table.fromAddress),
    index("phishing_reports_email_id_idx").on(table.emailId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const phishingReportsRelations = relations(
  phishingReports,
  ({ one }) => ({
    account: one(accounts, {
      fields: [phishingReports.accountId],
      references: [accounts.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PhishingReportRecord = typeof phishingReports.$inferSelect;
export type NewPhishingReportRecord = typeof phishingReports.$inferInsert;
