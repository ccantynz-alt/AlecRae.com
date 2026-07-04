CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_user_account_idx" ON "workspace_members" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "workspace_members_account_id_idx" ON "workspace_members" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: every existing user's home (accountId, role) becomes their first
-- workspace membership row. Idempotent — safe to re-run.
INSERT INTO "workspace_members" ("id", "user_id", "account_id", "role", "permissions", "created_at", "updated_at")
SELECT
	'wm_' || substr(md5(u."id" || u."account_id"), 1, 24),
	u."id",
	u."account_id",
	u."role",
	u."permissions",
	u."created_at",
	u."updated_at"
FROM "users" u
ON CONFLICT ("user_id", "account_id") DO NOTHING;