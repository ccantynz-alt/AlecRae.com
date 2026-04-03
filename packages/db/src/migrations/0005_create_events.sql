-- 0005_create_events.sql
-- Creates the events table with enums for tracking email lifecycle

-- Enums
DO $$ BEGIN
  CREATE TYPE email_event_type AS ENUM (
    'email.queued',
    'email.sent',
    'email.delivered',
    'email.bounced',
    'email.deferred',
    'email.dropped',
    'email.failed',
    'email.opened',
    'email.clicked',
    'email.unsubscribed',
    'email.complained',
    'domain.verified',
    'domain.failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bounce_type AS ENUM ('hard', 'soft');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bounce_category AS ENUM (
    'unknown_user',
    'mailbox_full',
    'domain_not_found',
    'policy_rejection',
    'spam_block',
    'rate_limited',
    'protocol_error',
    'content_rejected',
    'authentication_failed',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE feedback_type AS ENUM ('abuse', 'fraud', 'virus', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  email_id TEXT REFERENCES emails (id) ON DELETE SET NULL,
  message_id TEXT,
  type email_event_type NOT NULL,
  recipient TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Bounce details
  bounce_type bounce_type,
  bounce_category bounce_category,
  diagnostic_code TEXT,
  remote_mta TEXT,

  -- Complaint details
  feedback_type feedback_type,
  feedback_provider TEXT,

  -- Engagement details
  url TEXT,
  user_agent TEXT,
  ip_address TEXT,

  -- SMTP details
  smtp_response TEXT,
  mx_host TEXT,

  -- Tags and metadata from the original email
  tags JSONB,
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_account_id_idx ON events (account_id);
CREATE INDEX IF NOT EXISTS events_email_id_idx ON events (email_id);
CREATE INDEX IF NOT EXISTS events_type_idx ON events (type);
CREATE INDEX IF NOT EXISTS events_timestamp_idx ON events ("timestamp");
CREATE INDEX IF NOT EXISTS events_account_type_timestamp_idx ON events (account_id, type, "timestamp");
CREATE INDEX IF NOT EXISTS events_recipient_idx ON events (recipient);
