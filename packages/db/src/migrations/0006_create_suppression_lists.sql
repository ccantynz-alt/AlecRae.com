-- 0006_create_suppression_lists.sql
-- Creates the suppression_lists table for bounce/complaint/unsubscribe management

DO $$ BEGIN
  CREATE TYPE suppression_reason AS ENUM ('bounce', 'complaint', 'unsubscribe', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS suppression_lists (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  domain_id TEXT NOT NULL REFERENCES domains (id) ON DELETE CASCADE,
  reason suppression_reason NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS suppression_lists_email_domain_idx ON suppression_lists (email, domain_id);
CREATE INDEX IF NOT EXISTS suppression_lists_domain_id_idx ON suppression_lists (domain_id);
CREATE INDEX IF NOT EXISTS suppression_lists_reason_idx ON suppression_lists (reason);
