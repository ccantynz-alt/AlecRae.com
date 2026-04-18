import {
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Stripe Events — webhook idempotency guard
// ---------------------------------------------------------------------------
//
// Stripe can and will redeliver the same webhook event multiple times (on
// transient network errors, scheduled retries after 5xx, etc.). Handlers must
// therefore be idempotent. We enforce that at the DB layer: every incoming
// `event.id` is recorded here BEFORE the handler runs, and only marked
// `processedAt` once it succeeds. A second delivery of the same id hits the
// processed row and short-circuits with a 200 OK.
//
// If a handler throws, `processedAt` stays NULL so the next Stripe retry is
// allowed to run the logic again.

export const stripeEvents = pgTable(
  "stripe_events",
  {
    /** The Stripe event id (e.g. `evt_1Abc...`). */
    id: text("id").primaryKey(),
    /** The Stripe event type (e.g. `invoice.paid`). */
    type: text("type").notNull(),
    /** When we first received this event. */
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When the handler completed successfully. NULL = not yet processed. */
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("stripe_events_type_idx").on(table.type),
    index("stripe_events_processed_at_idx").on(table.processedAt),
  ],
);
