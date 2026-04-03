-- 0007_create_webhooks.sql
-- Creates the webhooks and webhook_deliveries tables

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  event_types JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhooks_account_id_idx ON webhooks (account_id);

-- Webhook Deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  status_code TEXT,
  response_body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_id_idx ON webhook_deliveries (webhook_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_event_id_idx ON webhook_deliveries (event_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_next_retry_idx ON webhook_deliveries (next_retry_at);
