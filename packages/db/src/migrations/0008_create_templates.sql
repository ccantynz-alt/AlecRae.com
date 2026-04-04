-- 0008_create_templates.sql
-- Email templates with variable substitution support

CREATE TABLE IF NOT EXISTS templates (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Template metadata
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT,

  -- Content
  subject         TEXT NOT NULL,
  html_body       TEXT,
  text_body       TEXT,

  -- Variable definitions (JSONB array of {name, defaultValue, required})
  variables       JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Versioning and lifecycle
  version         INTEGER NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX templates_account_id_idx ON templates(account_id);
CREATE INDEX templates_category_idx ON templates(account_id, category);
CREATE INDEX templates_is_active_idx ON templates(account_id, is_active);
CREATE UNIQUE INDEX templates_account_name_idx ON templates(account_id, name);
