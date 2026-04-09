// =============================================================================
// Vieanna — Database Migration 001: Initial Schema
// =============================================================================
// Complete schema for the Vieanna email platform.
// PostgreSQL (Neon Serverless) + Drizzle ORM.

import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, index, uniqueIndex, pgEnum, serial, real, varchar, bigint } from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const planEnum = pgEnum('plan', ['free', 'personal', 'pro', 'team', 'enterprise']);
export const accountStatusEnum = pgEnum('account_status', ['active', 'suspended', 'cancelled', 'pending_verification']);
export const domainStatusEnum = pgEnum('domain_status', ['pending', 'verified', 'failed', 'suspended']);
export const emailStatusEnum = pgEnum('email_status', ['queued', 'sending', 'delivered', 'bounced', 'deferred', 'failed', 'cancelled']);
export const bounceTypeEnum = pgEnum('bounce_type', ['hard', 'soft', 'complaint']);
export const ticketStatusEnum = pgEnum('ticket_status', ['open', 'in_progress', 'waiting_customer', 'escalated', 'resolved', 'closed']);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['critical', 'high', 'medium', 'low']);
export const warmupStatusEnum = pgEnum('warmup_status', ['pending', 'active', 'paused', 'completed', 'failed']);
export const webhookStatusEnum = pgEnum('webhook_status', ['active', 'paused', 'failed']);

// ─── Users & Accounts ──────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  plan: planEnum('plan').notNull().default('free'),
  status: accountStatusEnum('status').notNull().default('active'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  preferences: jsonb('preferences').default({}),
  voiceProfileData: jsonb('voice_profile_data'),
  timezone: text('timezone').default('UTC'),
  language: text('language').default('en'),
  aiComposeCount: integer('ai_compose_count').default(0),
  aiComposeResetAt: timestamp('ai_compose_reset_at'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_users_email').on(table.email),
  index('idx_users_stripe').on(table.stripeCustomerId),
  index('idx_users_status').on(table.status),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_sessions_user').on(table.userId),
  index('idx_sessions_token').on(table.token),
  index('idx_sessions_expires').on(table.expiresAt),
]);

export const passkeys = pgTable('passkeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  deviceName: text('device_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
}, (table) => [
  index('idx_passkeys_user').on(table.userId),
  uniqueIndex('idx_passkeys_credential').on(table.credentialId),
]);

// ─── Email Accounts (connected Gmail, Outlook, IMAP) ───────────────────────

export const emailAccounts = pgTable('email_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // gmail, outlook, imap, vieanna
  email: text('email').notNull(),
  name: text('name'),
  oauthAccessToken: text('oauth_access_token'),
  oauthRefreshToken: text('oauth_refresh_token'),
  oauthExpiresAt: timestamp('oauth_expires_at'),
  imapHost: text('imap_host'),
  imapPort: integer('imap_port'),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  syncState: text('sync_state'), // JMAP state token or IMAP UIDVALIDITY
  lastSyncAt: timestamp('last_sync_at'),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_email_accounts_user').on(table.userId),
  index('idx_email_accounts_provider').on(table.provider),
]);

// ─── Domains ────────────────────────────────────────────────────────────────

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull().unique(),
  status: domainStatusEnum('status').notNull().default('pending'),
  spfConfigured: boolean('spf_configured').default(false),
  dkimConfigured: boolean('dkim_configured').default(false),
  dmarcConfigured: boolean('dmarc_configured').default(false),
  dkimSelector: text('dkim_selector'),
  dkimPublicKey: text('dkim_public_key'),
  dkimPrivateKey: text('dkim_private_key'), // encrypted
  verificationToken: text('verification_token'),
  verifiedAt: timestamp('verified_at'),
  reputationScore: real('reputation_score').default(50),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_domains_domain').on(table.domain),
  index('idx_domains_user').on(table.userId),
  index('idx_domains_status').on(table.status),
]);

// ─── Emails ─────────────────────────────────────────────────────────────────

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => emailAccounts.id),
  threadId: text('thread_id'),
  messageId: text('message_id').unique(),
  inReplyTo: text('in_reply_to'),
  references: text('references_header'),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name'),
  toAddresses: jsonb('to_addresses').notNull(), // [{name, address}]
  ccAddresses: jsonb('cc_addresses').default([]),
  bccAddresses: jsonb('bcc_addresses').default([]),
  subject: text('subject').notNull().default(''),
  textBody: text('text_body'),
  htmlBody: text('html_body'),
  snippet: text('snippet'),
  status: emailStatusEnum('status').notNull().default('queued'),
  isRead: boolean('is_read').default(false),
  isStarred: boolean('is_starred').default(false),
  isDraft: boolean('is_draft').default(false),
  isSpam: boolean('is_spam').default(false),
  labels: jsonb('labels').default([]),
  aiPriority: integer('ai_priority').default(50),
  aiCategory: text('ai_category'),
  aiSummary: text('ai_summary'),
  aiSentiment: real('ai_sentiment'), // -1 to 1
  headers: jsonb('headers').default({}),
  rawSize: integer('raw_size'),
  sentAt: timestamp('sent_at'),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_emails_user').on(table.userId),
  index('idx_emails_account').on(table.accountId),
  index('idx_emails_thread').on(table.threadId),
  index('idx_emails_message_id').on(table.messageId),
  index('idx_emails_received').on(table.receivedAt),
  index('idx_emails_from').on(table.fromAddress),
  index('idx_emails_status').on(table.status),
  index('idx_emails_user_received').on(table.userId, table.receivedAt),
  index('idx_emails_spam').on(table.isSpam),
]);

// ─── Attachments ────────────────────────────────────────────────────────────

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailId: uuid('email_id').notNull().references(() => emails.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  storageKey: text('storage_key').notNull(), // S3/R2 key
  contentId: text('content_id'), // for inline images
  checksum: text('checksum'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_attachments_email').on(table.emailId),
]);

// ─── Contacts ───────────────────────────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  company: text('company'),
  title: text('title'),
  phone: text('phone'),
  notes: text('notes'),
  interactionCount: integer('interaction_count').default(0),
  lastInteractionAt: timestamp('last_interaction_at'),
  aiRelationshipScore: real('ai_relationship_score').default(50),
  aiRelationshipTrend: text('ai_relationship_trend'), // improving/stable/declining
  tags: jsonb('tags').default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_contacts_user').on(table.userId),
  index('idx_contacts_email').on(table.email),
  uniqueIndex('idx_contacts_user_email').on(table.userId, table.email),
]);

// ─── API Keys ───────────────────────────────────────────────────────────────

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(), // hashed key
  prefix: text('prefix').notNull(), // first 8 chars for identification
  scopes: jsonb('scopes').default([]),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  rateLimit: integer('rate_limit').default(1000), // per hour
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_api_keys_user').on(table.userId),
  index('idx_api_keys_prefix').on(table.prefix),
]);

// ─── Support Tickets ────────────────────────────────────────────────────────

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  status: ticketStatusEnum('status').notNull().default('open'),
  priority: ticketPriorityEnum('priority').notNull().default('medium'),
  category: text('category'),
  assignedTo: text('assigned_to'),
  aiConfidence: real('ai_confidence'),
  aiResolved: boolean('ai_resolved').default(false),
  slaFirstResponseDue: timestamp('sla_first_response_due'),
  slaResolutionDue: timestamp('sla_resolution_due'),
  firstResponseAt: timestamp('first_response_at'),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
  csatRating: integer('csat_rating'), // 1-5
  csatFeedback: text('csat_feedback'),
  tags: jsonb('tags').default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_tickets_user').on(table.userId),
  index('idx_tickets_status').on(table.status),
  index('idx_tickets_priority').on(table.priority),
  index('idx_tickets_created').on(table.createdAt),
]);

export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorType: text('author_type').notNull(), // user, ai, system, human_agent
  authorId: text('author_id'),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false),
  emailMessageId: text('email_message_id'), // links to actual email
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_ticket_messages_ticket').on(table.ticketId),
  index('idx_ticket_messages_created').on(table.createdAt),
]);

// ─── IP Warm-up ─────────────────────────────────────────────────────────────

export const ipWarmups = pgTable('ip_warmups', {
  id: uuid('id').primaryKey().defaultRandom(),
  ipAddress: text('ip_address').notNull(),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  status: warmupStatusEnum('status').notNull().default('pending'),
  currentPhase: integer('current_phase').default(0),
  adaptiveMultiplier: real('adaptive_multiplier').default(1.0),
  totalSent: integer('total_sent').default(0),
  totalDelivered: integer('total_delivered').default(0),
  totalBounced: integer('total_bounced').default(0),
  totalComplaints: integer('total_complaints').default(0),
  dailySnapshots: jsonb('daily_snapshots').default([]),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_warmups_ip').on(table.ipAddress),
  index('idx_warmups_domain').on(table.domainId),
  index('idx_warmups_status').on(table.status),
]);

// ─── Suppression List ───────────────────────────────────────────────────────

export const suppressions = pgTable('suppressions', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  domainId: uuid('domain_id').references(() => domains.id),
  reason: text('reason').notNull(), // complaint, bounce, unsubscribe, spam_trap, manual
  source: text('source'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_suppressions_email').on(table.email),
  index('idx_suppressions_domain').on(table.domainId),
  uniqueIndex('idx_suppressions_email_domain').on(table.email, table.domainId),
]);

// ─── Webhooks ───────────────────────────────────────────────────────────────

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  events: jsonb('events').notNull(), // ['email.delivered', 'email.bounced', ...]
  secret: text('secret').notNull(),
  status: webhookStatusEnum('status').notNull().default('active'),
  failureCount: integer('failure_count').default(0),
  lastTriggeredAt: timestamp('last_triggered_at'),
  lastFailedAt: timestamp('last_failed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_webhooks_user').on(table.userId),
  index('idx_webhooks_status').on(table.status),
]);

// ─── Email Events (delivery tracking) ───────────────────────────────────────

export const emailEvents = pgTable('email_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailId: uuid('email_id').notNull().references(() => emails.id),
  type: text('type').notNull(), // sent, delivered, opened, clicked, bounced, complained, unsubscribed
  recipient: text('recipient'),
  metadata: jsonb('metadata').default({}),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (table) => [
  index('idx_events_email').on(table.emailId),
  index('idx_events_type').on(table.type),
  index('idx_events_timestamp').on(table.timestamp),
  index('idx_events_recipient').on(table.recipient),
]);

// ─── Blocklist Checks ───────────────────────────────────────────────────────

export const blocklistChecks = pgTable('blocklist_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ipAddress: text('ip_address'),
  domain: text('domain'),
  blocklistName: text('blocklist_name').notNull(),
  listed: boolean('listed').notNull(),
  returnCode: text('return_code'),
  reason: text('reason'),
  resolvedAt: timestamp('resolved_at'),
  checkedAt: timestamp('checked_at').notNull().defaultNow(),
}, (table) => [
  index('idx_blocklist_ip').on(table.ipAddress),
  index('idx_blocklist_domain').on(table.domain),
  index('idx_blocklist_listed').on(table.listed),
]);

// ─── Consent Records (GDPR/CAN-SPAM compliance) ────────────────────────────

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  domainId: uuid('domain_id').references(() => domains.id),
  consentType: text('consent_type').notNull(), // explicit, implicit, transactional
  consentSource: text('consent_source').notNull(),
  consentDate: timestamp('consent_date').notNull(),
  ipAddress: text('ip_address'),
  proofUrl: text('proof_url'),
  withdrawnAt: timestamp('withdrawn_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_consent_email').on(table.email),
  index('idx_consent_domain').on(table.domainId),
]);

// ─── Email Templates ────────────────────────────────────────────────────────

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  htmlContent: text('html_content'),
  textContent: text('text_content'),
  variables: jsonb('variables').default([]), // [{name, type, defaultValue}]
  category: text('category'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_templates_user').on(table.userId),
]);

// ─── Knowledge Base Articles (for AI support) ───────────────────────────────

export const knowledgeArticles = pgTable('knowledge_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  tags: jsonb('tags').default([]),
  isPublished: boolean('is_published').default(true),
  viewCount: integer('view_count').default(0),
  helpfulCount: integer('helpful_count').default(0),
  notHelpfulCount: integer('not_helpful_count').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_kb_category').on(table.category),
  index('idx_kb_published').on(table.isPublished),
]);

// ─── Migration Runner ───────────────────────────────────────────────────────

export const migrationMeta = pgTable('_vieanna_migrations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  appliedAt: timestamp('applied_at').notNull().defaultNow(),
});
