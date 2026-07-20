ALTER TABLE "emails" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
CREATE INDEX "emails_account_provider_message_id_idx" ON "emails" USING btree ("account_id","provider_message_id");