ALTER TABLE "emails" ALTER COLUMN "domain_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "source" text;