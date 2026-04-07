-- Migration: Create draft_snapshots table for CRDT-based collaborative draft editing.
-- Stores encoded Y.Doc binary state so reconnecting clients can resume from the
-- latest persisted snapshot.

CREATE TABLE IF NOT EXISTS "draft_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "draft_id" text NOT NULL,
  "account_id" text NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "ydoc_state" bytea NOT NULL,
  "version" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "draft_snapshots_draft_id_idx" ON "draft_snapshots" ("draft_id");
CREATE INDEX IF NOT EXISTS "draft_snapshots_account_id_idx" ON "draft_snapshots" ("account_id");
