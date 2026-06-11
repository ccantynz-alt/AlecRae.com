-- 0012_fix_schema_drift.sql
-- Reconciles drift between the Drizzle schema and the migrations folder.
-- Two tables declared columns (and their enums) in the schema that were never
-- migrated, which broke `db:seed` on a fresh database with:
--   PostgresError 42703: column "storage_used_bytes" of relation "accounts" does not exist
--
-- accounts:    storage_used_bytes, status (+ account_status enum), scheduled_deletion_at
-- attachments: virus_scan_status (+ virus_scan_status enum), virus_scan_result
--
-- All statements are idempotent (IF NOT EXISTS / duplicate_object guard) so this
-- is safe to re-run and safe on databases that were partially patched by hand.

-- Enums ----------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'suspended', 'scheduled_for_deletion');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE virus_scan_status AS ENUM ('pending', 'clean', 'infected', 'skipped', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- accounts -------------------------------------------------------------------
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status account_status NOT NULL DEFAULT 'active';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMPTZ;

-- attachments ----------------------------------------------------------------
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS virus_scan_status virus_scan_status NOT NULL DEFAULT 'pending';
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS virus_scan_result JSONB;
