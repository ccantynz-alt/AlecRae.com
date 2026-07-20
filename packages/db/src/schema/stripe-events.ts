import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Stripe webhook event dedup
// ---------------------------------------------------------------------------

/**
 * Idempotency ledger for Stripe webhook events.
 *
 * Stripe's own docs guarantee at-least-once delivery — a webhook can and
 * will be redelivered (network blips, slow responses, manual resends from
 * the dashboard). Before this table, POST /v1/billing/webhook had no
 * dedup at all: most handler branches are idempotent by virtue of a blind
 * `UPDATE ... SET`, but recordPaymentFailure() increments
 * failedAttemptCount on every delivery of the same failed-invoice event,
 * which can inflate/trigger dunning state prematurely on a redelivery.
 *
 * `id` is Stripe's own event.id (evt_...) — globally unique per Stripe,
 * so it's used directly as the primary key rather than generating our own.
 */
export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    /** Stripe's event.id (e.g. "evt_1AbC..."). */
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("stripe_webhook_events_type_idx").on(table.type)],
);
