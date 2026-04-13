-- AlecRae (AlecRae) — Neon PostgreSQL Setup
-- Run this ONCE on your Neon database to create all tables.
--
-- Steps:
--   1. Go to https://console.neon.tech
--   2. Create a new project (name: "alecrae")
--   3. Copy the connection string to .env.production as DATABASE_URL
--   4. Open the SQL editor and paste this entire file
--   5. Run it
--
-- Alternatively, use the Drizzle migration:
--   DATABASE_URL=your_neon_url bun run db:migrate

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE plan_tier AS ENUM ('free', 'starter', 'professional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('queued', 'processing', 'sent', 'delivered', 'bounced', 'deferred', 'dropped', 'failed', 'complained');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_verification_status AS ENUM ('pending', 'verified', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE suppression_reason AS ENUM ('bounce', 'complaint', 'unsubscribe', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE email_event_type AS ENUM ('email.queued', 'email.sent', 'email.delivered', 'email.bounced', 'email.deferred', 'email.dropped', 'email.complained', 'email.opened', 'email.clicked', 'email.unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Accounts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  name text NOT NULL,
  plan_tier plan_tier NOT NULL DEFAULT 'free',
  emails_sent_this_period integer NOT NULL DEFAULT 0,
  period_started_at timestamptz NOT NULL DEFAULT now(),
  billing_email text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  name text,
  role user_role NOT NULL DEFAULT 'member',
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_account_id_idx ON users(account_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- ─── Domains ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS domains (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  domain text NOT NULL,
  status domain_verification_status NOT NULL DEFAULT 'pending',
  dkim_selector text DEFAULT 'default',
  dkim_private_key text,
  dkim_public_key text,
  spf_record text,
  dmarc_policy text,
  mx_verified boolean NOT NULL DEFAULT false,
  spf_verified boolean NOT NULL DEFAULT false,
  dkim_verified boolean NOT NULL DEFAULT false,
  dmarc_verified boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, domain)
);

CREATE INDEX IF NOT EXISTS domains_account_id_idx ON domains(account_id);

-- ─── DNS Records ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dns_records (
  id text PRIMARY KEY,
  domain_id text NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  type text NOT NULL,
  host text NOT NULL,
  value text NOT NULL,
  priority integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dns_records_domain_id_idx ON dns_records(domain_id);

-- ─── Emails ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS emails (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  domain_id text REFERENCES domains(id),
  message_id text,
  from_address text NOT NULL,
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]',
  cc_addresses jsonb,
  bcc_addresses jsonb,
  reply_to_address text,
  reply_to_name text,
  subject text NOT NULL DEFAULT '',
  text_body text,
  html_body text,
  custom_headers jsonb,
  status email_status NOT NULL DEFAULT 'queued',
  tags jsonb NOT NULL DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emails_account_id_idx ON emails(account_id);
CREATE INDEX IF NOT EXISTS emails_status_idx ON emails(status);
CREATE INDEX IF NOT EXISTS emails_created_at_idx ON emails(created_at);
CREATE INDEX IF NOT EXISTS emails_domain_id_idx ON emails(domain_id);

-- ─── Delivery Results ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delivery_results (
  id text PRIMARY KEY,
  email_id text NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  recipient_address text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  mx_host text,
  remote_response text,
  remote_response_code integer,
  attempt_count integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  bounce_reason text
);

CREATE INDEX IF NOT EXISTS delivery_results_email_id_idx ON delivery_results(email_id);
CREATE INDEX IF NOT EXISTS delivery_results_status_idx ON delivery_results(status);

-- ─── Attachments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attachments (
  id text PRIMARY KEY,
  email_id text NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size integer NOT NULL,
  storage_key text NOT NULL,
  disposition text DEFAULT 'attachment',
  content_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_email_id_idx ON attachments(email_id);

-- ─── API Keys ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]',
  rate_limit integer DEFAULT 1000,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON api_keys(account_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);

-- ─── Events ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  email_id text,
  message_id text,
  type email_event_type NOT NULL,
  payload jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_account_id_idx ON events(account_id);
CREATE INDEX IF NOT EXISTS events_email_id_idx ON events(email_id);
CREATE INDEX IF NOT EXISTS events_type_idx ON events(type);

-- ─── Webhooks ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhooks (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text,
  event_types jsonb DEFAULT '[]',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhooks_account_id_idx ON webhooks(account_id);

-- ─── Webhook Deliveries ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id text PRIMARY KEY,
  webhook_id text NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response_code integer,
  response_body text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_id_idx ON webhook_deliveries(webhook_id);

-- ─── Suppression Lists ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppression_lists (
  id text PRIMARY KEY,
  email text NOT NULL,
  domain_id text NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  reason suppression_reason NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email, domain_id)
);

CREATE INDEX IF NOT EXISTS suppression_lists_domain_id_idx ON suppression_lists(domain_id);

-- ─── Warmup Sessions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warmup_sessions (
  id text PRIMARY KEY,
  domain_id text NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  schedule_type text NOT NULL DEFAULT 'moderate',
  current_day integer NOT NULL DEFAULT 1,
  daily_limit integer NOT NULL DEFAULT 50,
  total_sent integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warmup_sessions_domain_id_idx ON warmup_sessions(domain_id);

-- ─── Templates ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS templates (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text,
  text_body text,
  variables jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_account_id_idx ON templates(account_id);

-- ─── Done ────────────────────────────────────────────────────────────────────

SELECT 'AlecRae database setup complete! All tables created.' AS status;
