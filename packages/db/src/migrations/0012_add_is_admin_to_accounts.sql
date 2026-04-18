-- 0012_add_is_admin_to_accounts.sql
-- Adds an `is_admin` flag to the accounts table so /v1/admin/* can enforce
-- an explicit admin check at the middleware layer.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
