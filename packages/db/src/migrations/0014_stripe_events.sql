-- 0014_stripe_events.sql
-- Adds infrastructure to close the remaining Stripe webhook gaps for launch:
--
--   1. `stripe_events` — idempotency guard. Stripe can redeliver the same
--      event many times (on transient network errors, scheduled retries after
--      5xx, etc.). We record every incoming event.id BEFORE the handler runs
--      and only stamp processed_at once it succeeds. A second delivery of the
--      same id hits the processed row and short-circuits with 200 OK. If a
--      handler throws, processed_at stays NULL so the next Stripe retry is
--      allowed to run the logic again.
--
--   2. `accounts.billing_status` / `accounts.past_due_since` — MVP dunning.
--      `invoice.payment_failed` flips the account to `past_due` and stamps
--      `past_due_since`. A worker sweeps rows older than 7 days and
--      downgrades them to `free` with status `downgraded_unpaid`.

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS stripe_events_type_idx
  ON stripe_events (type);

CREATE INDEX IF NOT EXISTS stripe_events_processed_at_idx
  ON stripe_events (processed_at);

-- Dunning fields on accounts. Default `active` keeps every existing row
-- untouched. `past_due_since` is only set when a payment actually fails.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS accounts_billing_status_idx
  ON accounts (billing_status)
  WHERE billing_status <> 'active';
