ALTER TABLE "dunning_records" ADD COLUMN "payment_failed_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dunning_records" ADD COLUMN "downgrade_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dunning_records" ADD COLUMN "recovery_email_sent_at" timestamp with time zone;