CREATE TABLE "mailboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"local_part" text NOT NULL,
	"address" text NOT NULL,
	"display_name" text,
	"user_id" text,
	"forward_to" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mailboxes_address_idx" ON "mailboxes" USING btree ("address");--> statement-breakpoint
CREATE INDEX "mailboxes_account_id_idx" ON "mailboxes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "mailboxes_domain_id_idx" ON "mailboxes" USING btree ("domain_id");