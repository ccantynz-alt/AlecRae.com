-- 0013_rename_plan_tiers.sql
-- Align plan_tier enum with the CLAUDE.md pricing bible:
--   free / personal / pro / team / enterprise
--
-- Postgres cannot DROP an enum value inside a transaction, and cannot do so at
-- all while any row still references it. We therefore only ADD the new names
-- here; legacy values (`starter`, `professional`) stay orphaned until a future
-- migration renames existing rows + drops the unused values.
--
-- Each ADD VALUE runs in its own implicit statement and is idempotent thanks to
-- IF NOT EXISTS.

ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'personal';
ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'pro';
ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'team';
