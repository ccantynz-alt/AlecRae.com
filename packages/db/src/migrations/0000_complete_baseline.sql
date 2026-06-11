-- pgvector extension required by email_embeddings.embedding_vector (vector(1024)).
-- Must exist before the table is created. Superuser-only on first create;
-- IF NOT EXISTS makes it a safe no-op once present.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."ab_test_status" AS ENUM('draft', 'running', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_draft_status" AS ENUM('pending', 'approved', 'rejected', 'edited', 'sent', 'expired');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."triage_action" AS ENUM('draft_reply', 'schedule_reply', 'flag_for_review', 'archive', 'mark_read', 'snooze', 'quarantine', 'ignore');--> statement-breakpoint
CREATE TYPE "public"."triage_category" AS ENUM('urgent', 'important', 'personal', 'work', 'newsletter', 'transactional', 'promotional', 'social', 'spam', 'suspicious', 'other');--> statement-breakpoint
CREATE TYPE "public"."triage_priority" AS ENUM('now', 'today', 'this_week', 'whenever', 'never');--> statement-breakpoint
CREATE TYPE "public"."email_primary_category" AS ENUM('important', 'newsletter', 'social', 'promotions', 'updates', 'forums', 'receipts', 'travel', 'finance', 'work', 'personal');--> statement-breakpoint
CREATE TYPE "public"."email_sentiment" AS ENUM('positive', 'negative', 'neutral', 'urgent', 'angry', 'grateful', 'confused');--> statement-breakpoint
CREATE TYPE "public"."urgency_level" AS ENUM('critical', 'high', 'medium', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('grammar', 'style', 'tone', 'clarity', 'conciseness');--> statement-breakpoint
CREATE TYPE "public"."attachment_threat_level" AS ENUM('safe', 'suspicious', 'dangerous');--> statement-breakpoint
CREATE TYPE "public"."attachment_virus_scan_status" AS ENUM('pending', 'clean', 'infected', 'error');--> statement-breakpoint
CREATE TYPE "public"."file_importance" AS ENUM('critical', 'important', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."auto_responder_mode" AS ENUM('off', 'vacation', 'busy', 'custom');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_status" AS ENUM('confirmed', 'tentative', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."changelog_category" AS ENUM('feature', 'improvement', 'fix', 'security', 'breaking');--> statement-breakpoint
CREATE TYPE "public"."chat_channel_type" AS ENUM('direct', 'group', 'thread');--> statement-breakpoint
CREATE TYPE "public"."collab_invite_status" AS ENUM('pending', 'accepted', 'declined', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."collab_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."collab_session_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('gmail', 'outlook', 'imap');--> statement-breakpoint
CREATE TYPE "public"."contact_interaction_type" AS ENUM('email_sent', 'email_received', 'meeting', 'call', 'note');--> statement-breakpoint
CREATE TYPE "public"."action_item_priority" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."action_item_source" AS ENUM('ai_detected', 'user_created', 'forwarded');--> statement-breakpoint
CREATE TYPE "public"."action_item_status" AS ENUM('pending', 'in_progress', 'completed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."promise_status" AS ENUM('active', 'fulfilled', 'broken', 'expired');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('doc', 'spreadsheet', 'presentation', 'form');--> statement-breakpoint
CREATE TYPE "public"."dns_record_type" AS ENUM('TXT', 'CNAME', 'MX', 'A', 'AAAA');--> statement-breakpoint
CREATE TYPE "public"."domain_verification_status" AS ENUM('pending', 'verifying', 'verified', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."dunning_state" AS ENUM('active', 'past_due', 'downgraded');--> statement-breakpoint
CREATE TYPE "public"."script_run_status" AS ENUM('success', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."script_trigger" AS ENUM('on_receive', 'on_send', 'manual', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."attachment_disposition" AS ENUM('attachment', 'inline');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('draft', 'queued', 'processing', 'sent', 'delivered', 'bounced', 'deferred', 'dropped', 'failed', 'complained');--> statement-breakpoint
CREATE TYPE "public"."virus_scan_status" AS ENUM('pending', 'clean', 'infected', 'skipped', 'error');--> statement-breakpoint
CREATE TYPE "public"."bounce_category" AS ENUM('unknown_user', 'mailbox_full', 'domain_not_found', 'policy_rejection', 'spam_block', 'rate_limited', 'protocol_error', 'content_rejected', 'authentication_failed', 'other');--> statement-breakpoint
CREATE TYPE "public"."bounce_type" AS ENUM('hard', 'soft');--> statement-breakpoint
CREATE TYPE "public"."email_event_type" AS ENUM('email.queued', 'email.sent', 'email.delivered', 'email.bounced', 'email.deferred', 'email.dropped', 'email.failed', 'email.opened', 'email.clicked', 'email.unsubscribed', 'email.complained', 'domain.verified', 'domain.failed');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('abuse', 'fraud', 'virus', 'other');--> statement-breakpoint
CREATE TYPE "public"."file_source" AS ENUM('attachment', 'upload', 'drive');--> statement-breakpoint
CREATE TYPE "public"."achievement_key" AS ENUM('first_zero', 'week_warrior', 'monthly_master', 'speed_demon', 'early_bird', 'night_owl', 'unsubscribe_champion', 'focus_master', 'ai_native', 'zero_hero');--> statement-breakpoint
CREATE TYPE "public"."knowledge_entity_type" AS ENUM('person', 'company', 'project', 'topic', 'product', 'event', 'location');--> statement-breakpoint
CREATE TYPE "public"."mail_merge_status" AS ENUM('draft', 'validating', 'ready', 'sending', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_link_status" AS ENUM('detected', 'linked', 'transcribed', 'summarized');--> statement-breakpoint
CREATE TYPE "public"."meeting_provider" AS ENUM('zoom', 'meet', 'teams', 'webex', 'generic');--> statement-breakpoint
CREATE TYPE "public"."transcript_provider" AS ENUM('zoom', 'otter', 'fathom', 'granola', 'read.ai');--> statement-breakpoint
CREATE TYPE "public"."focus_mode" AS ENUM('deep_work', 'meeting', 'break', 'custom');--> statement-breakpoint
CREATE TYPE "public"."notification_action" AS ENUM('notify_immediately', 'batch_hourly', 'batch_daily', 'suppress', 'summary_only');--> statement-breakpoint
CREATE TYPE "public"."onboarding_provider" AS ENUM('gmail', 'outlook', 'imap');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('connect_account', 'import_settings', 'sync_contacts', 'set_preferences', 'explore_features', 'complete');--> statement-breakpoint
CREATE TYPE "public"."email_activity_type" AS ENUM('reading', 'composing', 'replying', 'forwarding');--> statement-breakpoint
CREATE TYPE "public"."insight_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('email_overload', 'response_time', 'peak_hours', 'meeting_vs_email', 'focus_time', 'batch_opportunity', 'delegation_suggestion');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('web', 'ios', 'android', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."query_type" AS ENUM('natural', 'sql');--> statement-breakpoint
CREATE TYPE "public"."meeting_proposal_status" AS ENUM('proposed', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."meeting_type" AS ENUM('one_on_one', 'group', 'standup', 'interview', 'demo', 'social');--> statement-breakpoint
CREATE TYPE "public"."commitment_actor" AS ENUM('sender', 'recipient', 'third_party');--> statement-breakpoint
CREATE TYPE "public"."commitment_status" AS ENUM('pending', 'completed', 'overdue', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."inbox_category_source" AS ENUM('system', 'ai', 'user_rule', 'user_manual');--> statement-breakpoint
CREATE TYPE "public"."screener_decision" AS ENUM('allow', 'block', 'pending');--> statement-breakpoint
CREATE TYPE "public"."search_suggestion_category" AS ENUM('recent', 'frequent', 'trending', 'ai_recommended');--> statement-breakpoint
CREATE TYPE "public"."search_type" AS ENUM('keyword', 'natural_language', 'semantic');--> statement-breakpoint
CREATE TYPE "public"."security_event_type" AS ENUM('threat_detected', 'policy_created', 'policy_deleted', 'sender_blocked', 'email_quarantined', 'settings_changed');--> statement-breakpoint
CREATE TYPE "public"."security_policy_type" AS ENUM('block_sender', 'block_domain', 'require_tls', 'quarantine_attachments', 'flag_external');--> statement-breakpoint
CREATE TYPE "public"."threat_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."threat_type" AS ENUM('phishing', 'malware', 'spam', 'impersonation', 'business_email_compromise', 'credential_harvesting');--> statement-breakpoint
CREATE TYPE "public"."threat_user_action" AS ENUM('reported', 'dismissed', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."sentiment_level" AS ENUM('very_positive', 'positive', 'neutral', 'negative', 'very_negative');--> statement-breakpoint
CREATE TYPE "public"."smart_folder_type" AS ENUM('smart', 'saved_search');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('bounce', 'complaint', 'unsubscribe', 'manual');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_provider" AS ENUM('builtin', 'todoist', 'linear', 'notion', 'things3', 'apple_reminders', 'microsoft_todo');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."unsubscribe_method" AS ENUM('one_click_post', 'http', 'mailto', 'none');--> statement-breakpoint
CREATE TYPE "public"."unsubscribe_status" AS ENUM('pending', 'success', 'failed', 'no_option');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'scheduled_for_deletion');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('free', 'starter', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."warmup_schedule_type" AS ENUM('conservative', 'moderate', 'aggressive');--> statement-breakpoint
CREATE TYPE "public"."warmup_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."integration_platform" AS ENUM('zapier', 'make', 'n8n', 'custom');--> statement-breakpoint
CREATE TYPE "public"."workflow_action_type" AS ENUM('reply', 'forward', 'label', 'archive', 'move', 'notify', 'webhook', 'ai_classify');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('success', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."workflow_template_category" AS ENUM('productivity', 'communication', 'organization', 'security');--> statement-breakpoint
CREATE TYPE "public"."workflow_trigger_type" AS ENUM('email_received', 'email_sent', 'schedule', 'manual');--> statement-breakpoint
CREATE TABLE "ab_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "ab_test_status" DEFAULT 'draft' NOT NULL,
	"variants" jsonb NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"winner_metric" text DEFAULT 'open_rate' NOT NULL,
	"auto_select_winner" real,
	"results" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"schedule" jsonb,
	"morning_hour" integer DEFAULT 8 NOT NULL,
	"max_emails_per_run" integer DEFAULT 200 NOT NULL,
	"min_draft_confidence" real DEFAULT 0.5 NOT NULL,
	"category_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_draft_categories" jsonb DEFAULT '["work","personal","important"]'::jsonb NOT NULL,
	"skip_categories" jsonb DEFAULT '["spam","promotional"]'::jsonb NOT NULL,
	"enable_cleanup_suggestions" boolean DEFAULT true NOT NULL,
	"enable_commitments" boolean DEFAULT true NOT NULL,
	"enable_security_scan" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_configs_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "agent_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"run_id" text NOT NULL,
	"email_id" text NOT NULL,
	"thread_id" text,
	"to_addresses" jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"edited_body" text,
	"tone" text DEFAULT 'friendly' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"reasoning" text DEFAULT '' NOT NULL,
	"category" "triage_category",
	"priority" "triage_priority",
	"action" "triage_action",
	"status" "agent_draft_status" DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'pending' NOT NULL,
	"total_processed" integer DEFAULT 0 NOT NULL,
	"stats" jsonb,
	"triage_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commitments_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flagged_suspicious" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"briefing_markdown" text DEFAULT '' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"predicted_category" text NOT NULL,
	"corrected_category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"primary_category" "email_primary_category" NOT NULL,
	"secondary_categories" jsonb DEFAULT '[]'::jsonb,
	"confidence" real NOT NULL,
	"ai_model" text DEFAULT 'haiku' NOT NULL,
	"categorized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_label_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"label_id" text NOT NULL,
	"rule_name" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_assisted" boolean DEFAULT true NOT NULL,
	"accuracy" real DEFAULT 0.5 NOT NULL,
	"total_applied" integer DEFAULT 0 NOT NULL,
	"total_corrected" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_priority_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"score" real NOT NULL,
	"urgency_level" "urgency_level" DEFAULT 'none' NOT NULL,
	"reasoning" text NOT NULL,
	"sender_importance" real DEFAULT 50 NOT NULL,
	"content_signals" jsonb DEFAULT '{"hasDeadline":false,"hasQuestion":false,"hasMoneyConcern":false,"hasActionRequired":false,"mentionsAttachment":false,"isReplyChain":false,"threadLength":1}'::jsonb NOT NULL,
	"predicted_action" text,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_priority_scores_email_id_unique" UNIQUE("email_id")
);
--> statement-breakpoint
CREATE TABLE "email_sentiments" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"account_id" text NOT NULL,
	"sentiment" "email_sentiment" DEFAULT 'neutral' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictive_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"predicted_action" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"reasoning" text NOT NULL,
	"user_action" text,
	"was_accurate" boolean,
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"relationship_score" real DEFAULT 50 NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"avg_response_time_hours" real,
	"email_frequency" text DEFAULT 'rare' NOT NULL,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"top_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fading_alert" boolean DEFAULT false NOT NULL,
	"suggested_action" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"replies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"selected_reply" text,
	"was_used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_coach_results" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text,
	"clarity_score" real NOT NULL,
	"tone_score" real NOT NULL,
	"persuasiveness_score" real NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overall_grade" text NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"vocabulary" jsonb,
	"avg_sentence_length" real,
	"formality_score" real,
	"common_phrases" jsonb,
	"avoid_words" jsonb,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"last_trained_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_suggestions_log" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text,
	"original_text" text NOT NULL,
	"suggested_text" text NOT NULL,
	"suggestion_type" "suggestion_type" NOT NULL,
	"was_accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"metric" text NOT NULL,
	"target_value" real NOT NULL,
	"current_value" real DEFAULT 0 NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"is_achieved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"period" text NOT NULL,
	"date" text NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"emails_received" integer DEFAULT 0 NOT NULL,
	"emails_opened" integer DEFAULT 0 NOT NULL,
	"emails_clicked" integer DEFAULT 0 NOT NULL,
	"emails_bounced" integer DEFAULT 0 NOT NULL,
	"emails_replied" integer DEFAULT 0 NOT NULL,
	"avg_response_time_minutes" real,
	"top_senders" jsonb DEFAULT '[]'::jsonb,
	"top_recipients" jsonb DEFAULT '[]'::jsonb,
	"top_subjects" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"response_time_ms" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rate_limit_override" integer,
	"environment" text DEFAULT 'live' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attachment_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"is_safe" boolean DEFAULT true NOT NULL,
	"threat_level" "attachment_threat_level" DEFAULT 'safe' NOT NULL,
	"ai_summary" text,
	"extracted_text" text,
	"contains_pii" boolean DEFAULT false NOT NULL,
	"pii_types" jsonb DEFAULT '[]'::jsonb,
	"virus_scan_status" "attachment_virus_scan_status" DEFAULT 'pending' NOT NULL,
	"virus_scan_result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_file_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"suggested_folder" text NOT NULL,
	"suggested_tags" jsonb DEFAULT '[]'::jsonb,
	"related_emails" jsonb DEFAULT '[]'::jsonb,
	"importance" "file_importance" DEFAULT 'normal' NOT NULL,
	"expires_at" timestamp with time zone,
	"is_actioned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_responder_log" (
	"id" text PRIMARY KEY NOT NULL,
	"auto_responder_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"email_id" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_responders" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"mode" "auto_responder_mode" DEFAULT 'off' NOT NULL,
	"subject" text DEFAULT 'Out of Office' NOT NULL,
	"html_body" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"schedule" jsonb,
	"rules" jsonb DEFAULT '{"respondToContacts":true,"respondToUnknown":false,"maxResponsesPerSender":1,"aiSmartReply":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"recurrence" jsonb DEFAULT 'null'::jsonb,
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"reminders" jsonb DEFAULT '[]'::jsonb,
	"color" text,
	"calendar_id" text,
	"external_id" text,
	"video_link" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"status" "calendar_event_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changelog_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" "changelog_category" NOT NULL,
	"published_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL,
	"author_name" text DEFAULT 'AlecRae Team' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"type" "chat_channel_type" DEFAULT 'direct' NOT NULL,
	"name" text,
	"topic" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"email_thread_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_read_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"reply_to_id" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"is_edited" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaboration_history" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"version" integer NOT NULL,
	"edited_by" text,
	"ydoc_update" "bytea" NOT NULL,
	"update_size" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaboration_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"invited_by" text NOT NULL,
	"invitee_email" text NOT NULL,
	"invitee_user_id" text,
	"role" "collab_role" DEFAULT 'editor' NOT NULL,
	"status" "collab_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaboration_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "collab_role" DEFAULT 'editor' NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"cursor_color" text DEFAULT '#3b82f6' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaboration_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"account_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text DEFAULT 'Untitled Draft' NOT NULL,
	"status" "collab_session_status" DEFAULT 'active' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"latest_snapshot" "bytea",
	"max_collaborators" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider" "email_provider" NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"imap_host" text,
	"imap_port" text,
	"imap_username" text,
	"imap_password" text,
	"smtp_host" text,
	"smtp_port" text,
	"smtp_username" text,
	"smtp_password" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"sync_cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_enrichments" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"email" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"enriched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"type" "contact_interaction_type" NOT NULL,
	"subject" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "contact_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"title" text NOT NULL,
	"reminder_at" timestamp with time zone NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"company" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"stats" jsonb DEFAULT '{"totalEmails":0,"lastContactedAt":null,"firstContactedAt":null,"avgResponseTimeHours":null,"sentCount":0,"receivedCount":0}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_action_items" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"action_text" text NOT NULL,
	"assigned_to" text,
	"due_date" timestamp with time zone,
	"priority" "action_item_priority" NOT NULL,
	"status" "action_item_status" DEFAULT 'pending' NOT NULL,
	"confidence" real NOT NULL,
	"source" "action_item_source" DEFAULT 'ai_detected' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_deadlines" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"deadline_date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"is_explicit" boolean NOT NULL,
	"confidence" real NOT NULL,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_promises" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"promise_text" text NOT NULL,
	"promisor" text NOT NULL,
	"promisee" text NOT NULL,
	"due_date" timestamp with time zone,
	"status" "promise_status" DEFAULT 'active' NOT NULL,
	"confidence" real NOT NULL,
	"follow_up_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_dictionaries" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"word" text NOT NULL,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_delegations" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"delegator_user_id" text NOT NULL,
	"delegate_user_id" text NOT NULL,
	"scope" text NOT NULL,
	"scope_value" text,
	"permissions" jsonb DEFAULT '{"canReply":true,"canArchive":false,"canDelete":false,"canForward":false}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"creator_user_id" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"to_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thread_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"edited_by" text,
	"change_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"type" "document_type" DEFAULT 'doc' NOT NULL,
	"folder_id" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"collaborators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"last_edited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dns_records" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"type" "dns_record_type" NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"ttl" integer DEFAULT 3600 NOT NULL,
	"priority" integer,
	"verified" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"domain" text NOT NULL,
	"subdomain" text,
	"verification_status" "domain_verification_status" DEFAULT 'pending' NOT NULL,
	"verification_attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"last_verification_attempt" timestamp with time zone,
	"spf_verified" boolean DEFAULT false NOT NULL,
	"spf_record" text,
	"dkim_verified" boolean DEFAULT false NOT NULL,
	"dkim_selector" text,
	"dkim_public_key" text,
	"dkim_private_key" text,
	"dmarc_verified" boolean DEFAULT false NOT NULL,
	"dmarc_policy" text,
	"dmarc_record" text,
	"return_path_verified" boolean DEFAULT false NOT NULL,
	"return_path_domain" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpa_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"organization_id" text,
	"signer_name" text NOT NULL,
	"signer_email" text NOT NULL,
	"signer_title" text NOT NULL,
	"company_name" text NOT NULL,
	"dpa_version" text NOT NULL,
	"document_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"account_id" text NOT NULL,
	"ydoc_state" "bytea" NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunning_records" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"state" "dunning_state" DEFAULT 'active' NOT NULL,
	"failed_attempt_count" integer DEFAULT 0 NOT NULL,
	"plan_at_risk" "plan_tier",
	"last_failed_invoice_id" text,
	"dunning_started_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"grace_expires_at" timestamp with time zone,
	"recovered_at" timestamp with time zone,
	"downgraded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"embedding_vector" vector(1024) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_habits" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" text NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"emails_received" integer DEFAULT 0 NOT NULL,
	"emails_archived" integer DEFAULT 0 NOT NULL,
	"avg_response_time_minutes" real,
	"peak_hour" integer,
	"productivity_score" real,
	"inbox_zero_achieved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_productivity_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"goals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_tracker" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"sender_email" text NOT NULL,
	"sender_name" text,
	"frequency" text,
	"last_received" timestamp with time zone,
	"total_received" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"open_rate" real,
	"is_wanted" boolean DEFAULT true NOT NULL,
	"category" text,
	"unsubscribe_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"code" text NOT NULL,
	"trigger" "script_trigger" DEFAULT 'on_receive' NOT NULL,
	"schedule" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"script_id" text NOT NULL,
	"email_id" text,
	"status" "script_run_status" NOT NULL,
	"execution_time_ms" integer NOT NULL,
	"actions_executed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"content_id" text,
	"disposition" "attachment_disposition" DEFAULT 'attachment' NOT NULL,
	"virus_scan_status" "virus_scan_status" DEFAULT 'pending' NOT NULL,
	"virus_scan_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_results" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"recipient_address" text NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"remote_response_code" integer,
	"remote_response" text,
	"mx_host" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"message_id" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"to_addresses" jsonb NOT NULL,
	"cc_addresses" jsonb,
	"bcc_addresses" jsonb,
	"reply_to_address" text,
	"reply_to_name" text,
	"subject" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"in_reply_to" text,
	"references" jsonb,
	"custom_headers" jsonb,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"scheduled_at" timestamp with time zone,
	"encrypted" boolean DEFAULT false NOT NULL,
	"encryption_key_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "encryption_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"public_key" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"algorithm" text DEFAULT 'RSA-OAEP-4096 + AES-256-GCM' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text,
	"message_id" text,
	"type" "email_event_type" NOT NULL,
	"recipient" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"bounce_type" "bounce_type",
	"bounce_category" "bounce_category",
	"diagnostic_code" text,
	"remote_mta" text,
	"feedback_type" "feedback_type",
	"feedback_provider" text,
	"url" text,
	"user_agent" text,
	"ip_address" text,
	"smtp_response" text,
	"mx_host" text,
	"tags" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status_code" text,
	"response_body" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"event_types" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"source" "file_source" DEFAULT 'upload' NOT NULL,
	"email_id" text,
	"thread_id" text,
	"thumbnail_key" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"stat_date" date NOT NULL,
	"emails_processed" integer DEFAULT 0 NOT NULL,
	"emails_received" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"avg_response_time_sec" real,
	"focus_sessions" integer DEFAULT 0 NOT NULL,
	"ai_compose_uses" integer DEFAULT 0 NOT NULL,
	"unsubscribe_count" integer DEFAULT 0 NOT NULL,
	"reached_zero" boolean DEFAULT false NOT NULL,
	"zero_reached_at" timestamp with time zone,
	"most_productive_hour" integer,
	"hourly_breakdown" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"achievement_key" "achievement_key" NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"total_zeros" integer DEFAULT 0 NOT NULL,
	"last_zero_date" date,
	"last_checked_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"entity_type" "knowledge_entity_type" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"entities_extracted" integer DEFAULT 0 NOT NULL,
	"relationships_extracted" integer DEFAULT 0 NOT NULL,
	"processing_time_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"source_entity_id" text NOT NULL,
	"target_entity_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"strength" real DEFAULT 0.5 NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"label_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mail_merges" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"template_id" text,
	"subject" text NOT NULL,
	"html_body" text,
	"text_body" text,
	"status" "mail_merge_status" DEFAULT 'draft' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_links" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"email_id" text,
	"provider" "meeting_provider" DEFAULT 'generic' NOT NULL,
	"meeting_url" text,
	"scheduled_at" timestamp with time zone,
	"recording_url" text,
	"transcript_url" text,
	"transcript_text" text,
	"ai_summary" text,
	"title" text,
	"confidence" real,
	"status" "meeting_link_status" DEFAULT 'detected' NOT NULL,
	"participants" text,
	"duration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_provider_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider" "transcript_provider" NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"html_content" text,
	"email_id" text,
	"thread_id" text,
	"contact_id" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_pinned" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"mode" "focus_mode" DEFAULT 'deep_work' NOT NULL,
	"allowed_senders" jsonb DEFAULT '[]'::jsonb,
	"break_through_urgency" integer DEFAULT 90 NOT NULL,
	"emails_deferred" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" "notification_action" DEFAULT 'notify_immediately' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"current_step" "onboarding_step" DEFAULT 'connect_account' NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb,
	"imported_from" "onboarding_provider",
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text DEFAULT 'single_device' NOT NULL,
	"backed_up" integer DEFAULT 0 NOT NULL,
	"transports" text,
	"aaguid" text,
	"friendly_name" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "email_behavior_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"pattern_type" text NOT NULL,
	"day_of_week" integer,
	"hour_of_day" integer,
	"avg_value" real NOT NULL,
	"sample_count" integer NOT NULL,
	"trend_direction" text NOT NULL,
	"last_calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_time_tracking" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"activity_type" "email_activity_type" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer NOT NULL,
	"word_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productivity_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"insight_type" "insight_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "insight_severity" NOT NULL,
	"metric" text NOT NULL,
	"current_value" real NOT NULL,
	"target_value" real,
	"recommendation" text NOT NULL,
	"is_actioned" boolean DEFAULT false NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"new_email" text DEFAULT 'important' NOT NULL,
	"mentions" text DEFAULT 'all' NOT NULL,
	"calendar_reminders" text DEFAULT 'all' NOT NULL,
	"security_alerts" text DEFAULT 'all' NOT NULL,
	"deliverability_alerts" text DEFAULT 'all' NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"quiet_hours_timezone" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" "push_platform" NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb,
	"device_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recall_records" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"account_id" text NOT NULL,
	"token" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"self_destruct_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_events" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"email_id" text NOT NULL,
	"event_type" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"engaged_at" timestamp with time zone NOT NULL,
	"delay_seconds" integer NOT NULL,
	"engaged_hour" integer NOT NULL,
	"engaged_day_of_week" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipient_engagement" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"total_replied" integer DEFAULT 0 NOT NULL,
	"open_rate" real DEFAULT 0 NOT NULL,
	"click_rate" real DEFAULT 0 NOT NULL,
	"reply_rate" real DEFAULT 0 NOT NULL,
	"open_hour_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"open_day_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"click_hour_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"click_day_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avg_open_delay_hours" real,
	"avg_click_delay_hours" real,
	"avg_reply_delay_hours" real,
	"peak_open_hour" integer,
	"peak_open_day" integer,
	"peak_click_hour" integer,
	"peak_click_day" integer,
	"inferred_timezone" text,
	"first_interaction_at" timestamp with time zone,
	"last_interaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"family" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_history" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"query_text" text NOT NULL,
	"query_type" "query_type" DEFAULT 'natural' NOT NULL,
	"parsed_query" jsonb,
	"result_count" integer,
	"execution_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_queries" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"query_text" text NOT NULL,
	"query_type" "query_type" DEFAULT 'natural' NOT NULL,
	"parsed_query" jsonb,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"preferred_start_hour" integer NOT NULL,
	"preferred_end_hour" integer NOT NULL,
	"busy_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meeting_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"last_updated_from_calendar" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"proposed_times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"duration" integer NOT NULL,
	"location" text,
	"meeting_type" "meeting_type" DEFAULT 'one_on_one' NOT NULL,
	"status" "meeting_proposal_status" DEFAULT 'proposed' NOT NULL,
	"selected_time" text,
	"ai_reasoning" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"actor" "commitment_actor" NOT NULL,
	"actor_name" text NOT NULL,
	"description" text NOT NULL,
	"deadline" timestamp with time zone,
	"status" "commitment_status" DEFAULT 'pending' NOT NULL,
	"source_email_id" text NOT NULL,
	"source_quote" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '📁' NOT NULL,
	"rule" text,
	"source" "inbox_category_source" DEFAULT 'user_rule' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screener_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"sender_email" text NOT NULL,
	"decision" "screener_decision" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screener_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"sender_email" text NOT NULL,
	"sender_name" text NOT NULL,
	"first_email_id" text NOT NULL,
	"first_email_subject" text NOT NULL,
	"first_email_snippet" text NOT NULL,
	"ai_assessment" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"search_type" "search_type" DEFAULT 'keyword' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notify_on_new" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"new_results_since_last_check" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_history" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"query" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"clicked_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_type" "search_type" DEFAULT 'keyword' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"suggestion" text NOT NULL,
	"reason" text NOT NULL,
	"category" "search_suggestion_category" DEFAULT 'recent' NOT NULL,
	"relevance_score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"event_type" "security_event_type" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "security_policy_type" NOT NULL,
	"value" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threat_detections" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"threat_type" "threat_type" NOT NULL,
	"severity" "threat_severity" NOT NULL,
	"confidence" real NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_explanation" text NOT NULL,
	"user_action" "threat_user_action",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_health" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"health_score" real DEFAULT 50 NOT NULL,
	"trend_direction" text DEFAULT 'stable' NOT NULL,
	"avg_sentiment" real DEFAULT 0.5 NOT NULL,
	"total_interactions" integer DEFAULT 0 NOT NULL,
	"last_positive_at" timestamp with time zone,
	"last_negative_at" timestamp with time zone,
	"risk_level" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_timeline" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_email" text NOT NULL,
	"email_id" text NOT NULL,
	"sentiment" "sentiment_level" NOT NULL,
	"score" real NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb,
	"emotional_tone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"html_content" text NOT NULL,
	"text_content" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"type" "smart_folder_type" DEFAULT 'smart' NOT NULL,
	"filters" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_account_id" text NOT NULL,
	"domain" text,
	"logo_url" text,
	"settings" jsonb DEFAULT '{"ssoRequired":false,"allowedEmailDomains":[],"defaultUserRole":"member","maxUsers":null}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sso_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"sso_url" text NOT NULL,
	"slo_url" text NOT NULL,
	"certificate" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allowed_domains" jsonb DEFAULT '[]'::jsonb,
	"enforced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_configs_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"invited_by" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'member',
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "suppression_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"domain_id" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider" "task_provider" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"credentials" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"assignee" text,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"provider" "task_provider" DEFAULT 'builtin' NOT NULL,
	"external_task_id" text,
	"external_task_url" text,
	"confidence" real,
	"source" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"html_body" text,
	"text_body" text,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_mutes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"source_language" text NOT NULL,
	"source_language_name" text NOT NULL,
	"target_language" text NOT NULL,
	"target_language_name" text NOT NULL,
	"original_content" jsonb NOT NULL,
	"translated_content" jsonb NOT NULL,
	"auto_translated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_history" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email_id" text NOT NULL,
	"from_address" text NOT NULL,
	"method" "unsubscribe_method" NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"status" "unsubscribe_status" DEFAULT 'pending' NOT NULL,
	"confidence" real,
	"source" text,
	"steps" jsonb,
	"final_url" text,
	"confirmation_text" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan_tier" "plan_tier" DEFAULT 'free' NOT NULL,
	"emails_sent_this_period" integer DEFAULT 0 NOT NULL,
	"period_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"billing_email" text NOT NULL,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"scheduled_deletion_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"permissions" jsonb NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token" text,
	"avatar_url" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_recordings" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"title" text,
	"duration" integer,
	"storage_key" text,
	"transcript_key" text,
	"ai_summary" text,
	"ai_action_items" jsonb,
	"size" bigint,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_personal" boolean DEFAULT false NOT NULL,
	"max_participants" integer DEFAULT 100 NOT NULL,
	"waiting_room_enabled" boolean DEFAULT false NOT NULL,
	"recording_enabled" boolean DEFAULT false NOT NULL,
	"transcription_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_rooms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "voice_style_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"style_fingerprint" jsonb,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_training" boolean DEFAULT false NOT NULL,
	"last_trained_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_training_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"email_id" text,
	"extracted_features" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"schedule_type" "warmup_schedule_type" NOT NULL,
	"status" "warmup_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"current_day" integer DEFAULT 1 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"sent_today_date" text,
	"extension_days" integer DEFAULT 0 NOT NULL,
	"schedule" jsonb NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_bounced" integer DEFAULT 0 NOT NULL,
	"total_complaints" integer DEFAULT 0 NOT NULL,
	"bounce_rate_24h" real DEFAULT 0 NOT NULL,
	"complaint_rate_24h" real DEFAULT 0 NOT NULL,
	"consecutive_healthy_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"platform" "integration_platform" NOT NULL,
	"name" text NOT NULL,
	"webhook_url" text NOT NULL,
	"secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"trigger_config" jsonb DEFAULT '{"events":[]}'::jsonb NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"email_id" text,
	"status" "workflow_run_status" NOT NULL,
	"actions_executed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"duration" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" "workflow_template_category" NOT NULL,
	"trigger" jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_built_in" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_feedback" ADD CONSTRAINT "category_feedback_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_categories" ADD CONSTRAINT "email_categories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_label_rules" ADD CONSTRAINT "smart_label_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_priority_scores" ADD CONSTRAINT "email_priority_scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sentiments" ADD CONSTRAINT "email_sentiments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictive_actions" ADD CONSTRAINT "predictive_actions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_insights" ADD CONSTRAINT "relationship_insights_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_replies" ADD CONSTRAINT "smart_replies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_coach_results" ADD CONSTRAINT "writing_coach_results_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_profiles" ADD CONSTRAINT "writing_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_suggestions_log" ADD CONSTRAINT "writing_suggestions_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_analysis" ADD CONSTRAINT "attachment_analysis_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_file_organization" ADD CONSTRAINT "smart_file_organization_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_responder_log" ADD CONSTRAINT "auto_responder_log_auto_responder_id_auto_responders_id_fk" FOREIGN KEY ("auto_responder_id") REFERENCES "public"."auto_responders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_responders" ADD CONSTRAINT "auto_responders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_availability" ADD CONSTRAINT "calendar_availability_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_history" ADD CONSTRAINT "collaboration_history_session_id_collaboration_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."collaboration_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_history" ADD CONSTRAINT "collaboration_history_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_invites" ADD CONSTRAINT "collaboration_invites_session_id_collaboration_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."collaboration_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_invites" ADD CONSTRAINT "collaboration_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_invites" ADD CONSTRAINT "collaboration_invites_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_participants" ADD CONSTRAINT "collaboration_participants_session_id_collaboration_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."collaboration_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_participants" ADD CONSTRAINT "collaboration_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_sessions" ADD CONSTRAINT "collaboration_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_sessions" ADD CONSTRAINT "collaboration_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_enrichments" ADD CONSTRAINT "contact_enrichments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_group_id_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reminders" ADD CONSTRAINT "contact_reminders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reminders" ADD CONSTRAINT "contact_reminders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_action_items" ADD CONSTRAINT "email_action_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deadlines" ADD CONSTRAINT "email_deadlines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_promises" ADD CONSTRAINT "email_promises_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_dictionaries" ADD CONSTRAINT "custom_dictionaries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delegations" ADD CONSTRAINT "email_delegations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_drafts" ADD CONSTRAINT "shared_drafts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpa_signatures" ADD CONSTRAINT "dpa_signatures_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpa_signatures" ADD CONSTRAINT "dpa_signatures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_snapshots" ADD CONSTRAINT "draft_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_records" ADD CONSTRAINT "dunning_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_embeddings" ADD CONSTRAINT "email_embeddings_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_habits" ADD CONSTRAINT "email_habits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_productivity_goals" ADD CONSTRAINT "email_productivity_goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_tracker" ADD CONSTRAINT "subscription_tracker_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_scripts" ADD CONSTRAINT "email_scripts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_runs" ADD CONSTRAINT "script_runs_script_id_email_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."email_scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_results" ADD CONSTRAINT "delivery_results_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encryption_keys" ADD CONSTRAINT "encryption_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extractions" ADD CONSTRAINT "knowledge_extractions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_source_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_target_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_labels" ADD CONSTRAINT "email_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_merges" ADD CONSTRAINT "mail_merges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_links" ADD CONSTRAINT "meeting_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_provider_connections" ADD CONSTRAINT "meeting_provider_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_batches" ADD CONSTRAINT "notification_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_records" ADD CONSTRAINT "onboarding_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_behavior_patterns" ADD CONSTRAINT "email_behavior_patterns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_time_tracking" ADD CONSTRAINT "email_time_tracking_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productivity_insights" ADD CONSTRAINT "productivity_insights_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_preferences" ADD CONSTRAINT "push_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_records" ADD CONSTRAINT "recall_records_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_records" ADD CONSTRAINT "recall_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_engagement" ADD CONSTRAINT "recipient_engagement_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_patterns" ADD CONSTRAINT "availability_patterns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_proposals" ADD CONSTRAINT "meeting_proposals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_categories" ADD CONSTRAINT "inbox_categories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_decisions" ADD CONSTRAINT "screener_decisions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_queue" ADD CONSTRAINT "screener_queue_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_bookmarks" ADD CONSTRAINT "search_bookmarks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_suggestions" ADD CONSTRAINT "search_suggestions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_log" ADD CONSTRAINT "security_audit_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_policies" ADD CONSTRAINT "security_policies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threat_detections" ADD CONSTRAINT "threat_detections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_health" ADD CONSTRAINT "relationship_health_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_timeline" ADD CONSTRAINT "sentiment_timeline_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_folders" ADD CONSTRAINT "smart_folders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_configs" ADD CONSTRAINT "sso_configs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_lists" ADD CONSTRAINT "suppression_lists_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_provider_configs" ADD CONSTRAINT "task_provider_configs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_mutes" ADD CONSTRAINT "thread_mutes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_translations" ADD CONSTRAINT "email_translations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_translations" ADD CONSTRAINT "email_translations_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_history" ADD CONSTRAINT "unsubscribe_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_history" ADD CONSTRAINT "unsubscribe_history_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD CONSTRAINT "meeting_recordings_room_id_meeting_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_style_profiles" ADD CONSTRAINT "voice_style_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_training_samples" ADD CONSTRAINT "voice_training_samples_profile_id_voice_style_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."voice_style_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_sessions" ADD CONSTRAINT "warmup_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_sessions" ADD CONSTRAINT "warmup_sessions_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_integrations" ADD CONSTRAINT "webhook_integrations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ab_tests_account_id_idx" ON "ab_tests" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ab_tests_status_idx" ON "ab_tests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_configs_account_id_idx" ON "agent_configs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "agent_drafts_account_id_idx" ON "agent_drafts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "agent_drafts_run_id_idx" ON "agent_drafts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_drafts_status_idx" ON "agent_drafts" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "agent_drafts_email_id_idx" ON "agent_drafts" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "agent_drafts_created_at_idx" ON "agent_drafts" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_account_id_idx" ON "agent_runs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "agent_runs_created_at_idx" ON "agent_runs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "category_feedback_account_id_idx" ON "category_feedback" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "category_feedback_predicted_category_idx" ON "category_feedback" USING btree ("predicted_category");--> statement-breakpoint
CREATE INDEX "email_categories_account_id_idx" ON "email_categories" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_categories_email_id_idx" ON "email_categories" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_categories_primary_category_idx" ON "email_categories" USING btree ("primary_category");--> statement-breakpoint
CREATE INDEX "email_categories_confidence_idx" ON "email_categories" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "smart_label_rules_account_id_idx" ON "smart_label_rules" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "smart_label_rules_label_id_idx" ON "smart_label_rules" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "smart_label_rules_is_active_idx" ON "smart_label_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "eps_account_id_idx" ON "email_priority_scores" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eps_email_id_idx" ON "email_priority_scores" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "eps_score_idx" ON "email_priority_scores" USING btree ("score");--> statement-breakpoint
CREATE INDEX "eps_urgency_level_idx" ON "email_priority_scores" USING btree ("urgency_level");--> statement-breakpoint
CREATE INDEX "eps_scored_at_idx" ON "email_priority_scores" USING btree ("scored_at");--> statement-breakpoint
CREATE UNIQUE INDEX "es_email_id_idx" ON "email_sentiments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "es_account_id_idx" ON "email_sentiments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "es_sentiment_idx" ON "email_sentiments" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "es_analyzed_at_idx" ON "email_sentiments" USING btree ("analyzed_at");--> statement-breakpoint
CREATE INDEX "pa_account_id_idx" ON "predictive_actions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "pa_email_id_idx" ON "predictive_actions" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "pa_predicted_action_idx" ON "predictive_actions" USING btree ("predicted_action");--> statement-breakpoint
CREATE INDEX "pa_was_accurate_idx" ON "predictive_actions" USING btree ("was_accurate");--> statement-breakpoint
CREATE INDEX "pa_predicted_at_idx" ON "predictive_actions" USING btree ("predicted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ri_account_contact_idx" ON "relationship_insights" USING btree ("account_id","contact_email");--> statement-breakpoint
CREATE INDEX "ri_account_id_idx" ON "relationship_insights" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ri_relationship_score_idx" ON "relationship_insights" USING btree ("relationship_score");--> statement-breakpoint
CREATE INDEX "ri_fading_alert_idx" ON "relationship_insights" USING btree ("fading_alert");--> statement-breakpoint
CREATE INDEX "ri_updated_at_idx" ON "relationship_insights" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "sr_account_id_idx" ON "smart_replies" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sr_email_id_idx" ON "smart_replies" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "sr_generated_at_idx" ON "smart_replies" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "sr_was_used_idx" ON "smart_replies" USING btree ("was_used");--> statement-breakpoint
CREATE INDEX "wc_account_id_idx" ON "writing_coach_results" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "wc_email_id_idx" ON "writing_coach_results" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "wc_overall_grade_idx" ON "writing_coach_results" USING btree ("overall_grade");--> statement-breakpoint
CREATE INDEX "wc_analyzed_at_idx" ON "writing_coach_results" USING btree ("analyzed_at");--> statement-breakpoint
CREATE INDEX "writing_profiles_account_id_idx" ON "writing_profiles" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "writing_profiles_account_name_idx" ON "writing_profiles" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "writing_suggestions_log_account_id_idx" ON "writing_suggestions_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "writing_suggestions_log_email_id_idx" ON "writing_suggestions_log" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "writing_suggestions_log_type_idx" ON "writing_suggestions_log" USING btree ("account_id","suggestion_type");--> statement-breakpoint
CREATE INDEX "writing_suggestions_log_created_at_idx" ON "writing_suggestions_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_goals_account_id_idx" ON "analytics_goals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "analytics_goals_account_metric_idx" ON "analytics_goals" USING btree ("account_id","metric");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_account_id_idx" ON "analytics_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_account_period_idx" ON "analytics_snapshots" USING btree ("account_id","period");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_date_idx" ON "analytics_snapshots" USING btree ("date");--> statement-breakpoint
CREATE INDEX "api_key_usage_api_key_id_idx" ON "api_key_usage" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_key_usage_timestamp_idx" ON "api_key_usage" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_account_id_idx" ON "api_keys" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "aa_account_id_idx" ON "attachment_analysis" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "aa_email_id_idx" ON "attachment_analysis" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "aa_threat_level_idx" ON "attachment_analysis" USING btree ("threat_level");--> statement-breakpoint
CREATE INDEX "aa_virus_scan_status_idx" ON "attachment_analysis" USING btree ("virus_scan_status");--> statement-breakpoint
CREATE INDEX "aa_file_type_idx" ON "attachment_analysis" USING btree ("file_type");--> statement-breakpoint
CREATE INDEX "sfo_account_id_idx" ON "smart_file_organization" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sfo_suggested_folder_idx" ON "smart_file_organization" USING btree ("suggested_folder");--> statement-breakpoint
CREATE INDEX "sfo_importance_idx" ON "smart_file_organization" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "sfo_is_actioned_idx" ON "smart_file_organization" USING btree ("is_actioned");--> statement-breakpoint
CREATE INDEX "auto_responder_log_responder_idx" ON "auto_responder_log" USING btree ("auto_responder_id");--> statement-breakpoint
CREATE INDEX "auto_responder_log_recipient_idx" ON "auto_responder_log" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "auto_responders_account_id_idx" ON "auto_responders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "auto_responders_active_idx" ON "auto_responders" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "calendar_availability_account_id_idx" ON "calendar_availability" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_availability_account_day_idx" ON "calendar_availability" USING btree ("account_id","day_of_week");--> statement-breakpoint
CREATE INDEX "calendar_events_account_id_idx" ON "calendar_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "calendar_events_start_at_idx" ON "calendar_events" USING btree ("account_id","start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_end_at_idx" ON "calendar_events" USING btree ("account_id","end_at");--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_id_idx" ON "calendar_events" USING btree ("account_id","calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_external_id_idx" ON "calendar_events" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "changelog_entries_version_idx" ON "changelog_entries" USING btree ("version");--> statement-breakpoint
CREATE INDEX "changelog_entries_category_idx" ON "changelog_entries" USING btree ("category");--> statement-breakpoint
CREATE INDEX "changelog_entries_published_at_idx" ON "changelog_entries" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "changelog_entries_is_published_idx" ON "changelog_entries" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "chat_channels_account_id_idx" ON "chat_channels" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "chat_channels_email_thread_idx" ON "chat_channels" USING btree ("email_thread_id");--> statement-breakpoint
CREATE INDEX "chat_members_channel_idx" ON "chat_members" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "chat_members_user_idx" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_channel_idx" ON "chat_messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "collab_history_session_id_idx" ON "collaboration_history" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "collab_history_session_version_idx" ON "collaboration_history" USING btree ("session_id","version");--> statement-breakpoint
CREATE INDEX "collab_invites_session_id_idx" ON "collaboration_invites" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "collab_invites_invitee_email_idx" ON "collaboration_invites" USING btree ("invitee_email");--> statement-breakpoint
CREATE UNIQUE INDEX "collab_invites_session_email_unique" ON "collaboration_invites" USING btree ("session_id","invitee_email");--> statement-breakpoint
CREATE INDEX "collab_participants_session_id_idx" ON "collaboration_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "collab_participants_user_id_idx" ON "collaboration_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collab_participants_session_user_unique" ON "collaboration_participants" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "collab_sessions_draft_id_idx" ON "collaboration_sessions" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "collab_sessions_account_id_idx" ON "collaboration_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "collab_sessions_created_by_idx" ON "collaboration_sessions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "collab_sessions_status_idx" ON "collaboration_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "connected_accounts_account_idx" ON "connected_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "connected_accounts_email_idx" ON "connected_accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_enrichments_contact_idx" ON "contact_enrichments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_enrichments_email_idx" ON "contact_enrichments" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contact_group_members_group_idx" ON "contact_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_group_members_unique_idx" ON "contact_group_members" USING btree ("group_id","contact_id");--> statement-breakpoint
CREATE INDEX "contact_groups_account_id_idx" ON "contact_groups" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_groups_account_name_idx" ON "contact_groups" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "contact_interactions_account_id_idx" ON "contact_interactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "contact_interactions_contact_id_idx" ON "contact_interactions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_interactions_occurred_at_idx" ON "contact_interactions" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "contact_interactions_type_idx" ON "contact_interactions" USING btree ("contact_id","type");--> statement-breakpoint
CREATE INDEX "contact_reminders_account_id_idx" ON "contact_reminders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "contact_reminders_contact_id_idx" ON "contact_reminders" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_reminders_reminder_at_idx" ON "contact_reminders" USING btree ("account_id","reminder_at");--> statement-breakpoint
CREATE INDEX "contact_reminders_completed_idx" ON "contact_reminders" USING btree ("account_id","is_completed");--> statement-breakpoint
CREATE INDEX "contacts_account_id_idx" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_account_email_idx" ON "contacts" USING btree ("account_id","email");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contacts_name_idx" ON "contacts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "email_action_items_account_id_idx" ON "email_action_items" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_action_items_email_id_idx" ON "email_action_items" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_action_items_thread_id_idx" ON "email_action_items" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "email_action_items_status_idx" ON "email_action_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_action_items_priority_idx" ON "email_action_items" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "email_action_items_due_date_idx" ON "email_action_items" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "email_action_items_assigned_to_idx" ON "email_action_items" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "email_deadlines_account_id_idx" ON "email_deadlines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_deadlines_email_id_idx" ON "email_deadlines" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_deadlines_deadline_date_idx" ON "email_deadlines" USING btree ("deadline_date");--> statement-breakpoint
CREATE INDEX "email_deadlines_reminder_sent_idx" ON "email_deadlines" USING btree ("reminder_sent");--> statement-breakpoint
CREATE INDEX "email_promises_account_id_idx" ON "email_promises" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_promises_email_id_idx" ON "email_promises" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_promises_promisor_idx" ON "email_promises" USING btree ("promisor");--> statement-breakpoint
CREATE INDEX "email_promises_promisee_idx" ON "email_promises" USING btree ("promisee");--> statement-breakpoint
CREATE INDEX "email_promises_status_idx" ON "email_promises" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_promises_due_date_idx" ON "email_promises" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "custom_dict_account_id_idx" ON "custom_dictionaries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "custom_dict_language_idx" ON "custom_dictionaries" USING btree ("account_id","language");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_dict_account_word_lang_idx" ON "custom_dictionaries" USING btree ("account_id","word","language");--> statement-breakpoint
CREATE INDEX "email_delegations_account_id_idx" ON "email_delegations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_delegations_delegator_user_id_idx" ON "email_delegations" USING btree ("delegator_user_id");--> statement-breakpoint
CREATE INDEX "email_delegations_delegate_user_id_idx" ON "email_delegations" USING btree ("delegate_user_id");--> statement-breakpoint
CREATE INDEX "email_delegations_is_active_idx" ON "email_delegations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "shared_drafts_account_id_idx" ON "shared_drafts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "shared_drafts_creator_user_id_idx" ON "shared_drafts" USING btree ("creator_user_id");--> statement-breakpoint
CREATE INDEX "shared_drafts_status_idx" ON "shared_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_folders_account_id_idx" ON "document_folders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "document_folders_parent_id_idx" ON "document_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_versions_doc_version_idx" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "documents_account_id_idx" ON "documents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "documents_folder_id_idx" ON "documents" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "documents_type_idx" ON "documents" USING btree ("account_id","type");--> statement-breakpoint
CREATE INDEX "documents_archived_at_idx" ON "documents" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "documents_is_template_idx" ON "documents" USING btree ("account_id","is_template");--> statement-breakpoint
CREATE INDEX "dns_records_domain_id_idx" ON "dns_records" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_domain_idx" ON "domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "domains_account_id_idx" ON "domains" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "domains_verification_status_idx" ON "domains" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "dpa_signatures_account_id_idx" ON "dpa_signatures" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "dpa_signatures_organization_id_idx" ON "dpa_signatures" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dpa_signatures_account_version_idx" ON "dpa_signatures" USING btree ("account_id","dpa_version");--> statement-breakpoint
CREATE INDEX "draft_snapshots_draft_id_idx" ON "draft_snapshots" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "draft_snapshots_account_id_idx" ON "draft_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dunning_records_account_id_idx" ON "dunning_records" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "dunning_records_state_idx" ON "dunning_records" USING btree ("state");--> statement-breakpoint
CREATE INDEX "dunning_records_grace_expires_idx" ON "dunning_records" USING btree ("grace_expires_at");--> statement-breakpoint
CREATE INDEX "email_embeddings_email_id_idx" ON "email_embeddings" USING btree ("email_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_embeddings_email_model_uniq" ON "email_embeddings" USING btree ("email_id","model");--> statement-breakpoint
CREATE INDEX "email_embeddings_vector_hnsw_idx" ON "email_embeddings" USING hnsw ("embedding_vector" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE UNIQUE INDEX "email_habits_account_date_idx" ON "email_habits" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "email_habits_account_id_idx" ON "email_habits" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_habits_date_idx" ON "email_habits" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "email_productivity_goals_account_idx" ON "email_productivity_goals" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_tracker_account_sender_idx" ON "subscription_tracker" USING btree ("account_id","sender_email");--> statement-breakpoint
CREATE INDEX "subscription_tracker_account_id_idx" ON "subscription_tracker" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "subscription_tracker_is_wanted_idx" ON "subscription_tracker" USING btree ("account_id","is_wanted");--> statement-breakpoint
CREATE INDEX "subscription_tracker_category_idx" ON "subscription_tracker" USING btree ("account_id","category");--> statement-breakpoint
CREATE INDEX "email_scripts_account_id_idx" ON "email_scripts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_scripts_account_trigger_idx" ON "email_scripts" USING btree ("account_id","trigger");--> statement-breakpoint
CREATE INDEX "email_scripts_account_active_idx" ON "email_scripts" USING btree ("account_id","is_active");--> statement-breakpoint
CREATE INDEX "script_runs_script_id_idx" ON "script_runs" USING btree ("script_id");--> statement-breakpoint
CREATE INDEX "script_runs_script_created_idx" ON "script_runs" USING btree ("script_id","created_at");--> statement-breakpoint
CREATE INDEX "script_runs_email_id_idx" ON "script_runs" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "attachments_email_id_idx" ON "attachments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "delivery_results_email_id_idx" ON "delivery_results" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "delivery_results_status_idx" ON "delivery_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "delivery_results_next_retry_idx" ON "delivery_results" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "emails_account_id_idx" ON "emails" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "emails_domain_id_idx" ON "emails" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "emails_status_idx" ON "emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "emails_message_id_idx" ON "emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "emails_created_at_idx" ON "emails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "emails_account_status_idx" ON "emails" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "emails_scheduled_at_idx" ON "emails" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "encryption_keys_account_id_idx" ON "encryption_keys" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "events_account_id_idx" ON "events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "events_email_id_idx" ON "events" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_timestamp_idx" ON "events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "events_account_type_timestamp_idx" ON "events" USING btree ("account_id","type","timestamp");--> statement-breakpoint
CREATE INDEX "events_recipient_idx" ON "events" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_event_id_idx" ON "webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_next_retry_idx" ON "webhook_deliveries" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "webhooks_account_id_idx" ON "webhooks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "files_account_id_idx" ON "files" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "files_email_id_idx" ON "files" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "files_mime_type_idx" ON "files" USING btree ("mime_type");--> statement-breakpoint
CREATE INDEX "files_uploaded_at_idx" ON "files" USING btree ("uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stats_account_date_idx" ON "daily_stats" USING btree ("account_id","stat_date");--> statement-breakpoint
CREATE INDEX "daily_stats_account_id_idx" ON "daily_stats" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "daily_stats_stat_date_idx" ON "daily_stats" USING btree ("stat_date");--> statement-breakpoint
CREATE INDEX "daily_stats_reached_zero_idx" ON "daily_stats" USING btree ("reached_zero");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_account_key_idx" ON "user_achievements" USING btree ("account_id","achievement_key");--> statement-breakpoint
CREATE INDEX "user_achievements_account_id_idx" ON "user_achievements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "user_achievements_unlocked_at_idx" ON "user_achievements" USING btree ("unlocked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_streaks_account_id_idx" ON "user_streaks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "user_streaks_current_streak_idx" ON "user_streaks" USING btree ("current_streak");--> statement-breakpoint
CREATE INDEX "user_streaks_longest_streak_idx" ON "user_streaks" USING btree ("longest_streak");--> statement-breakpoint
CREATE INDEX "knowledge_entities_account_id_idx" ON "knowledge_entities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "knowledge_entities_entity_type_idx" ON "knowledge_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entities_account_type_name_idx" ON "knowledge_entities" USING btree ("account_id","entity_type","normalized_name");--> statement-breakpoint
CREATE INDEX "knowledge_entities_mention_count_idx" ON "knowledge_entities" USING btree ("mention_count");--> statement-breakpoint
CREATE INDEX "knowledge_entities_last_seen_at_idx" ON "knowledge_entities" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "knowledge_extractions_account_id_idx" ON "knowledge_extractions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_extractions_email_id_idx" ON "knowledge_extractions" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "knowledge_extractions_created_at_idx" ON "knowledge_extractions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_account_id_idx" ON "knowledge_relationships" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_source_entity_id_idx" ON "knowledge_relationships" USING btree ("source_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_target_entity_id_idx" ON "knowledge_relationships" USING btree ("target_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_relationship_type_idx" ON "knowledge_relationships" USING btree ("relationship_type");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_strength_idx" ON "knowledge_relationships" USING btree ("strength");--> statement-breakpoint
CREATE INDEX "email_labels_email_idx" ON "email_labels" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_labels_label_idx" ON "email_labels" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_labels_unique_idx" ON "email_labels" USING btree ("email_id","label_id");--> statement-breakpoint
CREATE INDEX "labels_account_id_idx" ON "labels" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_account_name_idx" ON "labels" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "labels_parent_id_idx" ON "labels" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_previews_url_hash_idx" ON "link_previews" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "link_previews_expires_idx" ON "link_previews" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mail_merges_account_id_idx" ON "mail_merges" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "mail_merges_status_idx" ON "mail_merges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meeting_links_account_id_idx" ON "meeting_links" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meeting_links_thread_id_idx" ON "meeting_links" USING btree ("account_id","thread_id");--> statement-breakpoint
CREATE INDEX "meeting_links_status_idx" ON "meeting_links" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "meeting_links_scheduled_at_idx" ON "meeting_links" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "meeting_provider_connections_account_idx" ON "meeting_provider_connections" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meeting_provider_connections_account_provider_idx" ON "meeting_provider_connections" USING btree ("account_id","provider");--> statement-breakpoint
CREATE INDEX "notes_account_id_idx" ON "notes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notes_email_id_idx" ON "notes" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "notes_thread_id_idx" ON "notes" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "notes_contact_id_idx" ON "notes" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "focus_sessions_account_id_idx" ON "focus_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "focus_sessions_active_idx" ON "focus_sessions" USING btree ("account_id","is_active");--> statement-breakpoint
CREATE INDEX "focus_sessions_ends_at_idx" ON "focus_sessions" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "notification_batches_account_id_idx" ON "notification_batches" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notification_batches_scheduled_for_idx" ON "notification_batches" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "notification_batches_delivered_idx" ON "notification_batches" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "notification_rules_account_id_idx" ON "notification_rules" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notification_rules_active_idx" ON "notification_rules" USING btree ("account_id","is_active");--> statement-breakpoint
CREATE INDEX "notification_rules_priority_idx" ON "notification_rules" USING btree ("account_id","priority");--> statement-breakpoint
CREATE INDEX "onboarding_records_account_id_idx" ON "onboarding_records" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "onboarding_records_user_id_idx" ON "onboarding_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_challenges_challenge_idx" ON "passkey_challenges" USING btree ("challenge");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_credential_id_idx" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "email_behavior_patterns_account_id_idx" ON "email_behavior_patterns" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_behavior_patterns_pattern_type_idx" ON "email_behavior_patterns" USING btree ("pattern_type");--> statement-breakpoint
CREATE INDEX "email_behavior_patterns_day_of_week_idx" ON "email_behavior_patterns" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "email_time_tracking_account_id_idx" ON "email_time_tracking" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_time_tracking_email_id_idx" ON "email_time_tracking" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_time_tracking_activity_type_idx" ON "email_time_tracking" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "email_time_tracking_started_at_idx" ON "email_time_tracking" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "productivity_insights_account_id_idx" ON "productivity_insights" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "productivity_insights_insight_type_idx" ON "productivity_insights" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX "productivity_insights_severity_idx" ON "productivity_insights" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "productivity_insights_is_actioned_idx" ON "productivity_insights" USING btree ("is_actioned");--> statement-breakpoint
CREATE INDEX "productivity_insights_is_dismissed_idx" ON "productivity_insights" USING btree ("is_dismissed");--> statement-breakpoint
CREATE INDEX "productivity_insights_valid_until_idx" ON "productivity_insights" USING btree ("valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "push_prefs_user_idx" ON "push_notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "recall_records_token_idx" ON "recall_records" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "recall_records_email_id_idx" ON "recall_records" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "recall_records_account_id_idx" ON "recall_records" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ee_account_recipient_idx" ON "engagement_events" USING btree ("account_id","recipient_email");--> statement-breakpoint
CREATE INDEX "ee_recipient_email_idx" ON "engagement_events" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "ee_email_id_idx" ON "engagement_events" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "ee_event_type_idx" ON "engagement_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "ee_engaged_at_idx" ON "engagement_events" USING btree ("engaged_at");--> statement-breakpoint
CREATE INDEX "ee_engaged_hour_idx" ON "engagement_events" USING btree ("engaged_hour");--> statement-breakpoint
CREATE INDEX "ee_engaged_dow_idx" ON "engagement_events" USING btree ("engaged_day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "re_account_recipient_idx" ON "recipient_engagement" USING btree ("account_id","recipient_email");--> statement-breakpoint
CREATE INDEX "re_account_id_idx" ON "recipient_engagement" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "re_recipient_email_idx" ON "recipient_engagement" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "re_peak_open_hour_idx" ON "recipient_engagement" USING btree ("peak_open_hour");--> statement-breakpoint
CREATE INDEX "re_updated_at_idx" ON "recipient_engagement" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family");--> statement-breakpoint
CREATE INDEX "query_history_account_id_idx" ON "query_history" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "query_history_created_at_idx" ON "query_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "saved_queries_account_id_idx" ON "saved_queries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "saved_queries_last_run_at_idx" ON "saved_queries" USING btree ("last_run_at");--> statement-breakpoint
CREATE INDEX "saved_queries_created_at_idx" ON "saved_queries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ap_account_day_idx" ON "availability_patterns" USING btree ("account_id","day_of_week");--> statement-breakpoint
CREATE INDEX "ap_day_of_week_idx" ON "availability_patterns" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "mp_account_id_idx" ON "meeting_proposals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "mp_email_id_idx" ON "meeting_proposals" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "mp_thread_id_idx" ON "meeting_proposals" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "mp_status_idx" ON "meeting_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mp_created_at_idx" ON "meeting_proposals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "commitments_account_id_idx" ON "commitments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "commitments_status_idx" ON "commitments" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "commitments_source_email_idx" ON "commitments" USING btree ("source_email_id");--> statement-breakpoint
CREATE INDEX "inbox_categories_account_id_idx" ON "inbox_categories" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "inbox_categories_priority_idx" ON "inbox_categories" USING btree ("account_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "screener_decisions_account_sender_idx" ON "screener_decisions" USING btree ("account_id","sender_email");--> statement-breakpoint
CREATE INDEX "screener_decisions_account_id_idx" ON "screener_decisions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "screener_queue_account_id_idx" ON "screener_queue" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "screener_queue_sender_email_idx" ON "screener_queue" USING btree ("account_id","sender_email");--> statement-breakpoint
CREATE INDEX "search_bookmarks_account_id_idx" ON "search_bookmarks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "search_bookmarks_notify_on_new_idx" ON "search_bookmarks" USING btree ("account_id","notify_on_new");--> statement-breakpoint
CREATE INDEX "search_history_account_id_idx" ON "search_history" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "search_history_created_at_idx" ON "search_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_history_search_type_idx" ON "search_history" USING btree ("account_id","search_type");--> statement-breakpoint
CREATE INDEX "search_suggestions_account_id_idx" ON "search_suggestions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "search_suggestions_category_idx" ON "search_suggestions" USING btree ("account_id","category");--> statement-breakpoint
CREATE INDEX "search_suggestions_relevance_idx" ON "search_suggestions" USING btree ("account_id","relevance_score");--> statement-breakpoint
CREATE INDEX "sal_account_id_idx" ON "security_audit_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sal_event_type_idx" ON "security_audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "sal_created_at_idx" ON "security_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sp_account_id_idx" ON "security_policies" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sp_type_idx" ON "security_policies" USING btree ("type");--> statement-breakpoint
CREATE INDEX "sp_is_active_idx" ON "security_policies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "td_account_id_idx" ON "threat_detections" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "td_email_id_idx" ON "threat_detections" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "td_threat_type_idx" ON "threat_detections" USING btree ("threat_type");--> statement-breakpoint
CREATE INDEX "td_severity_idx" ON "threat_detections" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "td_created_at_idx" ON "threat_detections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "relationship_health_account_id_idx" ON "relationship_health" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_health_account_contact_idx" ON "relationship_health" USING btree ("account_id","contact_email");--> statement-breakpoint
CREATE INDEX "relationship_health_health_score_idx" ON "relationship_health" USING btree ("health_score");--> statement-breakpoint
CREATE INDEX "relationship_health_risk_level_idx" ON "relationship_health" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "sentiment_timeline_account_id_idx" ON "sentiment_timeline" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sentiment_timeline_contact_email_idx" ON "sentiment_timeline" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX "sentiment_timeline_sentiment_idx" ON "sentiment_timeline" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "sentiment_timeline_created_at_idx" ON "sentiment_timeline" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "signatures_account_id_idx" ON "signatures" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "signatures_default_idx" ON "signatures" USING btree ("account_id","is_default");--> statement-breakpoint
CREATE INDEX "smart_folders_account_id_idx" ON "smart_folders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "smart_folders_type_idx" ON "smart_folders" USING btree ("account_id","type");--> statement-breakpoint
CREATE INDEX "audit_logs_account_id_idx" ON "audit_logs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "audit_logs_account_created_idx" ON "audit_logs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_owner_account_id_idx" ON "organizations" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "team_invitations_account_id_idx" ON "team_invitations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "team_invitations_email_idx" ON "team_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_token_idx" ON "team_invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_lists_email_domain_idx" ON "suppression_lists" USING btree ("email","domain_id");--> statement-breakpoint
CREATE INDEX "suppression_lists_domain_id_idx" ON "suppression_lists" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "suppression_lists_reason_idx" ON "suppression_lists" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "task_provider_configs_account_idx" ON "task_provider_configs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "task_provider_configs_account_provider_idx" ON "task_provider_configs" USING btree ("account_id","provider");--> statement-breakpoint
CREATE INDEX "tasks_account_id_idx" ON "tasks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "tasks_account_status_idx" ON "tasks" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "tasks_account_priority_idx" ON "tasks" USING btree ("account_id","priority");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_provider_idx" ON "tasks" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "tasks_deleted_at_idx" ON "tasks" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "templates_account_id_idx" ON "templates" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "templates_name_idx" ON "templates" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "thread_mutes_account_id_idx" ON "thread_mutes" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_mutes_account_thread_idx" ON "thread_mutes" USING btree ("account_id","thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_translations_email_target_idx" ON "email_translations" USING btree ("email_id","target_language");--> statement-breakpoint
CREATE INDEX "email_translations_account_id_idx" ON "email_translations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_translations_email_id_idx" ON "email_translations" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_translations_source_lang_idx" ON "email_translations" USING btree ("source_language");--> statement-breakpoint
CREATE INDEX "email_translations_created_at_idx" ON "email_translations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "unsubscribe_history_account_id_idx" ON "unsubscribe_history" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "unsubscribe_history_email_id_idx" ON "unsubscribe_history" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "unsubscribe_history_from_idx" ON "unsubscribe_history" USING btree ("from_address");--> statement-breakpoint
CREATE INDEX "unsubscribe_history_status_idx" ON "unsubscribe_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "unsubscribe_history_created_at_idx" ON "unsubscribe_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_stripe_customer_idx" ON "accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_account_id_idx" ON "users" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meeting_recordings_room_id_idx" ON "meeting_recordings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "meeting_recordings_recorded_at_idx" ON "meeting_recordings" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "meeting_rooms_account_id_idx" ON "meeting_rooms" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_rooms_slug_idx" ON "meeting_rooms" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "meeting_rooms_is_personal_idx" ON "meeting_rooms" USING btree ("account_id","is_personal");--> statement-breakpoint
CREATE INDEX "voice_style_profiles_account_id_idx" ON "voice_style_profiles" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_style_profiles_account_name_idx" ON "voice_style_profiles" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "voice_style_profiles_is_default_idx" ON "voice_style_profiles" USING btree ("account_id","is_default");--> statement-breakpoint
CREATE INDEX "voice_training_samples_profile_id_idx" ON "voice_training_samples" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "voice_training_samples_email_id_idx" ON "voice_training_samples" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "warmup_sessions_domain_id_idx" ON "warmup_sessions" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "warmup_sessions_account_id_idx" ON "warmup_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "warmup_sessions_status_idx" ON "warmup_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "warmup_sessions_active_domain_idx" ON "warmup_sessions" USING btree ("domain_id","status");--> statement-breakpoint
CREATE INDEX "webhook_integrations_account_idx" ON "webhook_integrations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "webhook_integrations_platform_idx" ON "webhook_integrations" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "webhook_integrations_active_idx" ON "webhook_integrations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_id_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_runs_created_at_idx" ON "workflow_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_templates_category_idx" ON "workflow_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "workflows_account_id_idx" ON "workflows" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "workflows_is_active_idx" ON "workflows" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "workflows_last_run_at_idx" ON "workflows" USING btree ("last_run_at");