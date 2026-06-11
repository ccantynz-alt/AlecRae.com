CREATE TYPE "public"."dlq_status" AS ENUM('pending_retry', 'permanently_failed');--> statement-breakpoint
CREATE TYPE "public"."rule_match_mode" AS ENUM('all', 'any');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('gmail', 'outlook', 'mbox', 'eml', 'thunderbird', 'apple_mail');--> statement-breakpoint
CREATE TYPE "public"."assignment_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('open', 'in_progress', 'done', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_level" AS ENUM('simple', 'moderate', 'advanced');--> statement-breakpoint
CREATE TABLE "scheduling_links" (
	"token" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"date_from" timestamp with time zone NOT NULL,
	"date_to" timestamp with time zone NOT NULL,
	"location" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dlq_records" (
	"job_id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"data" jsonb,
	"failed_reason" text NOT NULL,
	"attempts_made" integer DEFAULT 0 NOT NULL,
	"status" "dlq_status" NOT NULL,
	"retry_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_mode" "rule_match_mode" DEFAULT 'all' NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"source" "import_source" NOT NULL,
	"status" "import_job_status" DEFAULT 'pending' NOT NULL,
	"progress" jsonb DEFAULT '{"total":0,"processed":0,"failed":0,"skipped":0}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "phishing_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text,
	"from_address" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"reason" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"email_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"triggers" jsonb DEFAULT '["email.received"]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"assigned_to" text NOT NULL,
	"assigned_by" text NOT NULL,
	"status" "assignment_status" DEFAULT 'open' NOT NULL,
	"priority" "assignment_priority" DEFAULT 'medium' NOT NULL,
	"due_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_inboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"audio_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"transcript_text" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"duration" real DEFAULT 0 NOT NULL,
	"html_embed" text DEFAULT '' NOT NULL,
	"reply_to_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"account_id" text PRIMARY KEY NOT NULL,
	"average_sentence_length" real NOT NULL,
	"vocabulary_level" "vocabulary_level" NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduling_links" ADD CONSTRAINT "scheduling_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_rules" ADD CONSTRAINT "email_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phishing_reports" ADD CONSTRAINT "phishing_reports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_assignments" ADD CONSTRAINT "email_assignments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_comments" ADD CONSTRAINT "email_comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_inboxes" ADD CONSTRAINT "shared_inboxes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_messages" ADD CONSTRAINT "voice_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_links_account_id_idx" ON "scheduling_links" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "dlq_records_status_idx" ON "dlq_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_rules_account_id_idx" ON "email_rules" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_rules_account_enabled_idx" ON "email_rules" USING btree ("account_id","enabled");--> statement-breakpoint
CREATE INDEX "import_jobs_account_id_idx" ON "import_jobs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "import_jobs_account_started_idx" ON "import_jobs" USING btree ("account_id","started_at");--> statement-breakpoint
CREATE INDEX "phishing_reports_account_id_idx" ON "phishing_reports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "phishing_reports_from_address_idx" ON "phishing_reports" USING btree ("from_address");--> statement-breakpoint
CREATE INDEX "phishing_reports_email_id_idx" ON "phishing_reports" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "program_runs_program_id_idx" ON "program_runs" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "program_runs_program_started_idx" ON "program_runs" USING btree ("program_id","started_at");--> statement-breakpoint
CREATE INDEX "programs_account_id_idx" ON "programs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "programs_account_enabled_idx" ON "programs" USING btree ("account_id","enabled");--> statement-breakpoint
CREATE INDEX "email_assignments_account_id_idx" ON "email_assignments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_assignments_email_id_idx" ON "email_assignments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_assignments_assigned_to_idx" ON "email_assignments" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "email_comments_email_id_idx" ON "email_comments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_comments_account_id_idx" ON "email_comments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "shared_inboxes_account_id_idx" ON "shared_inboxes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "voice_messages_account_id_idx" ON "voice_messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "voice_messages_reply_to_idx" ON "voice_messages" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "voice_profiles_analyzed_at_idx" ON "voice_profiles" USING btree ("analyzed_at");