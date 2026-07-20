import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts, planTierEnum } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Dunning state machine.
 *
 *   active      — billing healthy, no failed payments outstanding.
 *   past_due    — at least one payment failed; account is in the grace
 *                 window. The paid plan is retained while Stripe Smart
 *                 Retries attempt to recover the payment.
 *   downgraded  — the grace window expired (or the subscription was
 *                 deleted) and the account has been downgraded to free.
 */
export const dunningStateEnum = pgEnum("dunning_state", [
  "active",
  "past_due",
  "downgraded",
]);

// ---------------------------------------------------------------------------
// Dunning Records
// ---------------------------------------------------------------------------

/**
 * Tracks the dunning (failed-payment recovery) lifecycle for an account.
 *
 * We rely on Stripe Smart Retries for the actual retry cadence — this table
 * records OUR side of the state so we can enforce a grace window, surface
 * "past due" banners, and downgrade once recovery has definitively failed.
 *
 * Exactly one row per account (upserted on first payment failure).
 */
export const dunningRecords = pgTable(
  "dunning_records",
  {
    id: text("id").primaryKey(),

    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    state: dunningStateEnum("state").notNull().default("active"),

    /** Number of failed payment attempts in the current dunning cycle. */
    failedAttemptCount: integer("failed_attempt_count").notNull().default(0),

    /**
     * The paid plan the account held when dunning began, so it can be
     * restored on recovery. Null while active or once downgraded.
     */
    planAtRisk: planTierEnum("plan_at_risk"),

    /** Stripe invoice ID of the most recent failed payment. */
    lastFailedInvoiceId: text("last_failed_invoice_id"),

    /** When the current dunning cycle started (first failure). */
    dunningStartedAt: timestamp("dunning_started_at", { withTimezone: true }),

    /** When the most recent payment failure was recorded. */
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),

    /**
     * Deadline after which the account is downgraded to free if payment
     * has not recovered. Defines the grace window.
     */
    graceExpiresAt: timestamp("grace_expires_at", { withTimezone: true }),

    /** When the account recovered (payment succeeded). */
    recoveredAt: timestamp("recovered_at", { withTimezone: true }),

    /** When the account was downgraded due to dunning failure. */
    downgradedAt: timestamp("downgraded_at", { withTimezone: true }),

    /**
     * Notification tracking (issue #116c) — dunning previously updated this
     * table's state machine correctly but never told the customer anything;
     * a card failure was discoverable only by a Pro feature suddenly
     * breaking. Each column below is set once the corresponding email has
     * been sent for the CURRENT cycle, so the sweep/webhook handlers don't
     * re-send on every retry or interval tick.
     */
    paymentFailedEmailSentAt: timestamp("payment_failed_email_sent_at", {
      withTimezone: true,
    }),
    downgradeEmailSentAt: timestamp("downgrade_email_sent_at", {
      withTimezone: true,
    }),
    recoveryEmailSentAt: timestamp("recovery_email_sent_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dunning_records_account_id_idx").on(table.accountId),
    index("dunning_records_state_idx").on(table.state),
    index("dunning_records_grace_expires_idx").on(table.graceExpiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const dunningRecordsRelations = relations(dunningRecords, ({ one }) => ({
  account: one(accounts, {
    fields: [dunningRecords.accountId],
    references: [accounts.id],
  }),
}));
