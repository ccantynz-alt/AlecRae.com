-- 0011_add_draft_to_email_status.sql
-- Adds 'draft' value to the email_status enum so drafts are no longer
-- conflated with 'queued' emails.

ALTER TYPE email_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'queued';
