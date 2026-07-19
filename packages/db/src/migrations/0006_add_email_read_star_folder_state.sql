ALTER TABLE "emails" ADD COLUMN "is_read" boolean DEFAULT false NOT NULL;
ALTER TABLE "emails" ADD COLUMN "is_starred" boolean DEFAULT false NOT NULL;
ALTER TABLE "emails" ADD COLUMN "folder" text DEFAULT 'inbox' NOT NULL;
--> statement-breakpoint
-- Backfill: preserve today's displayed read-state (previously derived as
-- status IN ('sent','delivered')) so existing mail doesn't appear to
-- suddenly go unread the moment this ships.
UPDATE "emails" SET "is_read" = true WHERE "status" IN ('sent', 'delivered');
--> statement-breakpoint
-- Backfill: rows previously marked "dropped" by the old archive/delete
-- overload are ambiguous (archive and delete both set status="dropped"),
-- but tags still distinguishes them from before this migration — use it to
-- seed the new folder column, then leave `status` as the send-pipeline
-- signal it was always meant to be (this migration doesn't rewrite it).
UPDATE "emails" SET "folder" = 'archive' WHERE "status" = 'dropped' AND "tags" @> '["archived"]'::jsonb;
UPDATE "emails" SET "folder" = 'trash' WHERE "status" = 'dropped' AND NOT ("tags" @> '["archived"]'::jsonb);
--> statement-breakpoint
CREATE INDEX "emails_account_folder_idx" ON "emails" USING btree ("account_id","folder");
