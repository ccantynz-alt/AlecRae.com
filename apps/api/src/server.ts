/**
 * @alecrae/api — Main Server Entry Point
 *
 * Creates the Hono application, registers all routes, applies middleware,
 * starts listening, and handles graceful shutdown.
 *
 * This file is the production entry point. The `index.ts` file re-exports
 * for Bun's built-in HTTP server, but this module can also be used
 * standalone or in tests.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { logger } from "hono/logger";
import { timing } from "hono/timing";
import { secureHeaders } from "hono/secure-headers";

import { authMiddleware } from "./middleware/auth.js";
import {
  globalIpRateLimit,
  authRateLimit,
  sendRateLimit,
  readRateLimit,
  writeRateLimit,
  webhookRateLimit,
  searchRateLimit,
  closeRateLimitRedis,
} from "./middleware/rate-limit.js";
import { messages } from "./routes/messages.js";
import { domains } from "./routes/domains.js";
import { webhooks } from "./routes/webhooks.js";
import { analytics } from "./routes/analytics.js";
import { suppressions } from "./routes/suppressions.js";
import { tracking } from "./routes/tracking.js";
import { apiKeysRouter } from "./routes/api-keys.js";
import { account } from "./routes/account.js";
import { auth } from "./routes/auth.js";
import { passkeyRouter } from "./routes/passkey.js";
import { health } from "./routes/health.js";
import { admin } from "./routes/admin.js";
import { billing } from "./routes/billing.js";
import { templatesRouter } from "./routes/templates.js";
import { voice } from "./routes/voice.js";
import { voiceClone } from "./routes/voice-clone.js";
import { meetingLink } from "./routes/meeting-link.js";
import { meetings } from "./routes/meetings.js";
import { grammar } from "./routes/grammar.js";
import { dictation } from "./routes/dictation.js";
import { inbox } from "./routes/inbox.js";
import { recall } from "./routes/recall.js";
import { translate, emailTranslate } from "./routes/translate.js";
import { collaborate } from "./routes/collaborate.js";
import { connect } from "./routes/connect.js";
import { snooze, scheduleSend } from "./routes/snooze.js";
import { importRouter } from "./routes/import.js";
import { aiSearch } from "./routes/ai-search.js";
import { semanticSearch } from "./routes/semantic-search.js";
import { contacts } from "./routes/contacts.js";
import { calendar } from "./routes/calendar.js";
import { encryption } from "./routes/encryption.js";
import { aiRules } from "./routes/ai-rules.js";
import { programs } from "./routes/programs.js";
import { explain } from "./routes/explain.js";
import { agent } from "./routes/agent.js";
import { security, emailSecurity } from "./routes/security.js";
import { todo, emailTasks, taskRoutes } from "./routes/todo.js";
import { unsubscribe, emailUnsubscribe } from "./routes/unsubscribe.js";
import { sendTime, optimalSendTime, recipientPatterns } from "./routes/send-time.js";
import { composeAssist } from "./routes/compose-assist.js";
import { sso } from "./routes/sso.js";
import { spellcheckRouter } from "./routes/spellcheck.js";
import { status } from "./routes/status.js";
import { gamification } from "./routes/gamification.js";
import { changelog } from "./routes/changelog.js";
import { heatmapAnalytics } from "./routes/heatmap.js";
import { voiceMessageRouter } from "./routes/voice-message.js";
import { scripts } from "./routes/scripts.js";
import { emailQuery } from "./routes/email-query.js";
import { fbl } from "./routes/fbl.js";
import { signaturesRouter } from "./routes/signatures.js";
import { contactGroupsRouter } from "./routes/contact-groups.js";
import { threadMutesRouter } from "./routes/thread-mutes.js";
import { bulkActionsRouter } from "./routes/bulk-actions.js";
import { abTestsRouter } from "./routes/ab-tests.js";
import { mailMergeRouter } from "./routes/mail-merge.js";
import { contactEnrichmentRouter } from "./routes/contact-enrichment.js";
import { autoResponderRouter } from "./routes/auto-responder.js";
import { pushNotificationsRouter } from "./routes/push-notifications.js";
import { smartFoldersRouter } from "./routes/smart-folders.js";
import { labelsRouter } from "./routes/labels.js";
import { notesRouter, emailNotesRouter, threadNotesRouter } from "./routes/notes.js";
import { filesRouter, emailAttachmentsRouter } from "./routes/files.js";
import { chatRouter } from "./routes/chat.js";
// NOTE: warmup route is built but mounting it pulls in @alecrae/reputation + services/dns,
// which have pre-existing exactOptionalPropertyTypes errors blocking the typecheck gate.
// Fix those errors first, then re-enable this import and the route mount below.
// import { warmup } from "./routes/warmup.js";
import { linkPreviewRouter } from "./routes/link-previews.js";
import { integrationsRouter } from "./routes/integrations.js";
import { schedulingAnalyticsRouter } from "./routes/scheduling-analytics.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { videoMeetingsRouter } from "./routes/video-meetings.js";
import { aiWritingRouter } from "./routes/ai-writing.js";
import { notificationsRouter, focusRouter } from "./routes/notification-intelligence.js";
import { hygieneRouter } from "./routes/email-hygiene.js";
import { aiIntelligenceRouter } from "./routes/ai-intelligence.js";
import { contactsExtendedRouter } from "./routes/contacts-extended.js";
import { documentsRouter } from "./routes/documents.js";
import { calendarEventsRouter } from "./routes/calendar-events.js";
import { analyticsDashboardRouter } from "./routes/analytics-dashboard.js";
import { delegationRouter, sharedDraftsRouter } from "./routes/delegation.js";
import { workflowsRouter } from "./routes/workflows.js";
import { aiCategorizationRouter } from "./routes/ai-categorization.js";
import { searchIntelligenceRouter } from "./routes/search-intelligence.js";
import { securityIntelligenceRouter } from "./routes/security-intelligence.js";
import { sentimentTimelineRouter } from "./routes/sentiment-timeline.js";
import { attachmentIntelligenceRouter } from "./routes/attachment-intelligence.js";
import { schedulingIntelligenceRouter } from "./routes/scheduling-intelligence.js";
import { contextIntelligenceRouter } from "./routes/context-intelligence.js";
import { productivityAnalyticsRouter } from "./routes/productivity-analytics.js";
import { knowledgeGraphRouter } from "./routes/knowledge-graph.js";
import { closeConnection } from "@alecrae/db";
import { closeIdempotencyRedis } from "./middleware/idempotency.js";
import { closeSendQueue, getSendQueue } from "./lib/queue.js";
import { startWebhookWorker, stopWebhookWorker } from "./lib/webhook-dispatcher.js";
import { initSearchIndex, initTelemetry, shutdownTelemetry, telemetryMiddleware } from "@alecrae/shared";
import { startAutoIndexer, stopAutoIndexer } from "@alecrae/ai-engine/embeddings/auto-indexer";
import { processDLQ } from "./lib/dlq-processor.js";
import { reconcileStorageUsage } from "./lib/storage-quota.js";

// ─── Create the Hono app ───────────────────────────────────────────────────

const app = new Hono();

// ─── Global Middleware ──────────────────────────────────────────────────────

// OpenTelemetry tracing and metrics
app.use("*", telemetryMiddleware());

// Request ID for distributed tracing
app.use("*", requestId());

// Structured request logging
app.use("*", logger());

// Server-Timing headers for performance debugging
app.use("*", timing());

// Security headers (CSP, X-Frame-Options, etc.)
app.use("*", secureHeaders());

// Global IP-based rate limit (DDoS baseline: 1000 req/min per IP)
app.use("*", globalIpRateLimit);

// CORS — explicit allowlist (never reflect arbitrary origins with credentials)
const DEFAULT_CORS_ORIGINS = [
  "https://alecrae.com",
  "https://mail.alecrae.com",
  "https://admin.alecrae.com",
  "https://docs.alecrae.com",
  "https://status.alecrae.com",
  "https://changelog.alecrae.com",
];
const corsOrigins = (process.env["CORS_ORIGINS"]?.split(",").map((s) => s.trim()).filter(Boolean)) ??
  (process.env["NODE_ENV"] === "production"
    ? DEFAULT_CORS_ORIGINS
    : [...DEFAULT_CORS_ORIGINS, "http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]);

app.use(
  "*",
  cors({
    origin: (origin) => (corsOrigins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-API-Key",
      "X-Request-Id",
      "Idempotency-Key",
    ],
    exposeHeaders: [
      "X-Request-Id",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After",
      "X-Idempotent-Replayed",
    ],
    maxAge: 86400,
    credentials: true,
  }),
);

// ─── Health check (no auth) ────────────────────────────────────────────────

// Simple liveness probe (always returns 200)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "alecrae-api",
    version: process.env["SERVICE_VERSION"] ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// Deep health check with dependency verification (also no auth)
app.route("/v1/health", health);

// Public status health endpoint (no auth — consumed by status.alecrae.com)
app.route("/v1/status", status);

// Auth endpoints: strict IP rate limiting (10 req/min), no API key auth
app.use("/v1/auth/*", authRateLimit);
app.route("/v1/auth", auth);
app.route("/v1/auth/passkey", passkeyRouter);

// SSO endpoints: metadata and ACS are public (IdP calls them), config endpoints use their own auth
app.use("/v1/sso/config", writeRateLimit);
app.use("/v1/sso/*", authRateLimit);
app.route("/v1/sso", sso);

// Tracking endpoints (no auth — embedded in emails)
app.route("/t", tracking);

// ─── Authenticated routes ──────────────────────────────────────────────────

// ─── Per-category rate limits on authenticated routes ─────────────────────
// Send endpoint: 100 req/min per API key
app.use("/v1/messages/send", authMiddleware, sendRateLimit);
// Search endpoint: 60 req/min per API key
app.use("/v1/messages/search", authMiddleware, searchRateLimit);
// Read messages: 600 req/min per API key
app.use("/v1/messages/*", authMiddleware, readRateLimit);
// Domains: write-level limits (200 req/min)
app.use("/v1/domains/*", authMiddleware, writeRateLimit);
// app.use("/v1/domains/:id/warmup/*", authMiddleware, writeRateLimit); // see warmup import note
// Webhooks: write-level limits (200 req/min)
app.use("/v1/webhooks/*", authMiddleware, writeRateLimit);
// Analytics: read-level limits (600 req/min)
app.use("/v1/analytics/*", authMiddleware, readRateLimit);
// Suppressions: write-level limits (200 req/min)
app.use("/v1/suppressions/*", authMiddleware, writeRateLimit);
// API keys management: write-level limits (200 req/min)
app.use("/v1/api-keys/*", authMiddleware, writeRateLimit);
// Account management: write-level limits (200 req/min)
app.use("/v1/account/*", authMiddleware, writeRateLimit);
// Billing authenticated endpoints: write-level limits (200 req/min)
app.use("/v1/billing/checkout", authMiddleware, writeRateLimit);
app.use("/v1/billing/portal", authMiddleware, writeRateLimit);
app.use("/v1/billing/usage", authMiddleware, readRateLimit);
app.use("/v1/billing/plan", authMiddleware, readRateLimit);
// Stripe webhook: IP-based, no auth (Stripe verifies via signature)
app.use("/v1/billing/webhook", webhookRateLimit);
// Templates: write-level limits (200 req/min)
app.use("/v1/templates/*", authMiddleware, writeRateLimit);
app.use("/v1/templates", authMiddleware, writeRateLimit);
// Voice: write-level limits (200 req/min)
app.use("/v1/voice/*", authMiddleware, writeRateLimit);
// Voice Clone (S4): write-level — heavier than basic voice profile
app.use("/v1/voice-clone/*", authMiddleware, writeRateLimit);
app.use("/v1/voice-clone", authMiddleware, writeRateLimit);
// Meeting Link (S9): read-level — detection + transcript fetch
app.use("/v1/meeting-link/*", authMiddleware, readRateLimit);
app.use("/v1/meeting-link", authMiddleware, readRateLimit);
// Meetings (S9 full): detect, link-recording, transcribe, summary
app.use("/v1/meetings/detect", authMiddleware, writeRateLimit);
app.use("/v1/meetings/thread/*", authMiddleware, readRateLimit);
app.use("/v1/meetings/*/link-recording", authMiddleware, writeRateLimit);
app.use("/v1/meetings/*/transcribe", authMiddleware, writeRateLimit);
app.use("/v1/meetings/*/summary", authMiddleware, readRateLimit);
// Grammar: high-frequency read (600 req/min — real-time typing)
app.use("/v1/grammar/*", authMiddleware, readRateLimit);
// Dictation: write-level (200 req/min)
app.use("/v1/dictation/*", authMiddleware, writeRateLimit);
// Smart Inbox: read/write (200 req/min)
app.use("/v1/inbox/*", authMiddleware, writeRateLimit);
// Recall: write-level (200 req/min)
app.use("/v1/recall/enable", authMiddleware, writeRateLimit);
app.use("/v1/recall/revoke/*", authMiddleware, writeRateLimit);
app.use("/v1/recall/status/*", authMiddleware, readRateLimit);
app.use("/v1/recall/self-destruct", authMiddleware, writeRateLimit);
// Recall view is PUBLIC (no auth — recipients access via link)
// Translation: read-level (600 req/min)
app.use("/v1/translate/*", authMiddleware, readRateLimit);
app.use("/v1/translate", authMiddleware, readRateLimit);
// Collaboration: write-level (200 req/min)
app.use("/v1/collaborate/*", authMiddleware, writeRateLimit);
// Account connection: OAuth callbacks are public, everything else authed
app.use("/v1/connect/gmail", authMiddleware, writeRateLimit);
app.use("/v1/connect/outlook", authMiddleware, writeRateLimit);
app.use("/v1/connect/imap", authMiddleware, writeRateLimit);
app.use("/v1/connect/accounts", authMiddleware, readRateLimit);
app.use("/v1/connect/accounts/*", authMiddleware, writeRateLimit);
// Snooze: write-level (200 req/min)
app.use("/v1/snooze/*", authMiddleware, writeRateLimit);
// Schedule/Undo send: write-level (200 req/min)
app.use("/v1/send/*", authMiddleware, writeRateLimit);
// Import: write-level (200 req/min)
app.use("/v1/import/*", authMiddleware, writeRateLimit);
// AI Search: search-level (60 req/min)
app.use("/v1/search/*", authMiddleware, searchRateLimit);
// Semantic Vector Search: search-level (60 req/min)
app.use("/v1/semantic/*", authMiddleware, searchRateLimit);
// Contacts: read-level (600 req/min)
app.use("/v1/contacts/*", authMiddleware, readRateLimit);
app.use("/v1/contacts", authMiddleware, readRateLimit);
// Contacts Extended (CRM-lite): read + write level
app.use("/v1/contacts-extended/interactions/*", authMiddleware, readRateLimit);
app.use("/v1/contacts-extended/interactions", authMiddleware, writeRateLimit);
app.use("/v1/contacts-extended/reminders/*/complete", authMiddleware, writeRateLimit);
app.use("/v1/contacts-extended/reminders/*", authMiddleware, writeRateLimit);
app.use("/v1/contacts-extended/reminders", authMiddleware, writeRateLimit);
app.use("/v1/contacts-extended/insights/*", authMiddleware, readRateLimit);
// Calendar: read-level (600 req/min)
app.use("/v1/calendar/*", authMiddleware, readRateLimit);
// Encryption: write-level (200 req/min)
app.use("/v1/encryption/*", authMiddleware, writeRateLimit);
// AI Rules: write-level (200 req/min)
app.use("/v1/rules/*", authMiddleware, writeRateLimit);
app.use("/v1/programs", authMiddleware, writeRateLimit);
app.use("/v1/programs/*", authMiddleware, writeRateLimit);
app.use("/v1/rules", authMiddleware, readRateLimit);
// Explain (newsletter summary + "why is this in my inbox?"): read-level (600 req/min)
app.use("/v1/explain/*", authMiddleware, readRateLimit);
// Email-level explain/summary convenience endpoints (S6+S7)
app.use("/v1/emails/*/summary", authMiddleware, readRateLimit);
app.use("/v1/emails/*/explain", authMiddleware, readRateLimit);
// Per-email unsubscribe (B3): write-level (200 req/min)
app.use("/v1/emails/*/unsubscribe", authMiddleware, writeRateLimit);
app.use("/v1/emails/*/unsubscribe/*", authMiddleware, readRateLimit);
// Per-email translation (B4): read-level (600 req/min)
app.use("/v1/emails/*/translate", authMiddleware, readRateLimit);
app.use("/v1/emails/*/translation", authMiddleware, readRateLimit);
// Per-email security report (B5+B6): read-level (600 req/min)
app.use("/v1/emails/*/security", authMiddleware, readRateLimit);
// AI Inbox Agent: write-level (200 req/min) — heavy operations
app.use("/v1/agent/*", authMiddleware, writeRateLimit);
app.use("/v1/agent", authMiddleware, writeRateLimit);
// Security (sender verification + phishing protection): read-level (600 req/min)
app.use("/v1/security/*", authMiddleware, readRateLimit);
app.use("/v1/unsubscribe/*", authMiddleware, writeRateLimit);
app.use("/v1/unsubscribe", authMiddleware, writeRateLimit);
// Predictive Send-Time Optimization (S10)
app.use("/v1/send-time/*", authMiddleware, writeRateLimit);
// Optimal Send Time (batch endpoint for multiple recipients)
app.use("/v1/emails/optimal-send-time", authMiddleware, readRateLimit);
// Compose-Assist / AI calendar slot suggestions (B7)
app.use("/v1/compose-assist/*", authMiddleware, writeRateLimit);
// Spell Check (C10): high-frequency read (600 req/min — real-time typing)
app.use("/v1/compose/spellcheck/*", authMiddleware, readRateLimit);
app.use("/v1/compose/spellcheck", authMiddleware, readRateLimit);
// Native Todo App Integrations (S8): write-level (200 req/min)
app.use("/v1/todo/*", authMiddleware, writeRateLimit);
app.use("/v1/todo", authMiddleware, writeRateLimit);
// Thread action-item extraction (S8): write-level (200 req/min — AI call)
app.use("/v1/emails/*/extract-tasks", authMiddleware, writeRateLimit);
// Task CRUD (S8): write-level for create, read-level for list
app.use("/v1/tasks/create", authMiddleware, writeRateLimit);
app.use("/v1/tasks/create-batch", authMiddleware, writeRateLimit);
app.use("/v1/tasks/providers", authMiddleware, readRateLimit);
app.use("/v1/tasks/providers/*/config", authMiddleware, writeRateLimit);
app.use("/v1/tasks", authMiddleware, readRateLimit);
// Gamification (A7): read-level for stats, write-level for check-zero/track
app.use("/v1/gamification/*", authMiddleware, readRateLimit);
app.use("/v1/gamification", authMiddleware, readRateLimit);
// Email Query (B2): search-level (60 req/min — AI query translation)
app.use("/v1/query/*", authMiddleware, searchRateLimit);
app.use("/v1/query", authMiddleware, searchRateLimit);
// Changelog (C8): public read, admin-authed write (200 req/min)
// Note: GET endpoints are public (no auth middleware). POST/PUT/DELETE require admin scope
// which is enforced inside the route via requireScope("admin:write").
app.use("/v1/changelog", readRateLimit);
app.use("/v1/changelog/*", readRateLimit);
// Voice Messages (B8): write-level (200 req/min — audio upload + transcription)
app.use("/v1/voice-messages/*", authMiddleware, writeRateLimit);
app.use("/v1/voice-messages", authMiddleware, writeRateLimit);
// Programmable Email Scripts (B1): write-level (200 req/min)
app.use("/v1/scripts/*", authMiddleware, writeRateLimit);
app.use("/v1/scripts", authMiddleware, writeRateLimit);
// Thread Mutes: write-level for mute/unmute, read-level for listing
app.use("/v1/threads/muted", authMiddleware, readRateLimit);
app.use("/v1/threads/*/mute", authMiddleware, writeRateLimit);
// Bulk Actions: write-level (200 req/min)
app.use("/v1/bulk/*", authMiddleware, writeRateLimit);
app.use("/v1/bulk", authMiddleware, writeRateLimit);
// A/B Tests: write-level (200 req/min)
app.use("/v1/ab-tests/*", authMiddleware, writeRateLimit);
app.use("/v1/ab-tests", authMiddleware, writeRateLimit);
// Mail Merge: write-level (200 req/min)
app.use("/v1/mail-merge/*", authMiddleware, writeRateLimit);
app.use("/v1/mail-merge", authMiddleware, writeRateLimit);

// Notes: write-level for create/update/delete/pin
app.use("/v1/notes/*", authMiddleware, writeRateLimit);
app.use("/v1/notes", authMiddleware, writeRateLimit);
// Per-email notes + per-thread notes: read-level
app.use("/v1/emails/*/notes", authMiddleware, readRateLimit);
app.use("/v1/threads/*/notes", authMiddleware, readRateLimit);
// Files: write-level for upload/delete, read-level for listing
app.use("/v1/files/*", authMiddleware, writeRateLimit);
app.use("/v1/files", authMiddleware, readRateLimit);
// Per-email attachments: read-level
app.use("/v1/emails/*/attachments", authMiddleware, readRateLimit);
// Chat: write-level for send/create/edit/delete
app.use("/v1/chat/*", authMiddleware, writeRateLimit);
app.use("/v1/chat", authMiddleware, writeRateLimit);

// Smart Folders / Saved Searches: write-level for CRUD, read-level for email queries
app.use("/v1/smart-folders/*/emails", authMiddleware, readRateLimit);
app.use("/v1/smart-folders/*", authMiddleware, writeRateLimit);
app.use("/v1/smart-folders", authMiddleware, writeRateLimit);
// Labels / Tags: write-level for CRUD + apply/remove, read-level for listing
app.use("/v1/labels/*/apply", authMiddleware, writeRateLimit);
app.use("/v1/labels/*", authMiddleware, writeRateLimit);
app.use("/v1/labels", authMiddleware, writeRateLimit);
// Link Previews: read-level for cached lookups, write-level for fetch
app.use("/v1/link-preview/*", authMiddleware, readRateLimit);
app.use("/v1/link-preview", authMiddleware, readRateLimit);
// Integrations (Zapier/Make/n8n): write-level for CRUD + test
app.use("/v1/integrations/*", authMiddleware, writeRateLimit);
app.use("/v1/integrations", authMiddleware, writeRateLimit);
// Scheduling Analytics: read-level for analytics queries
app.use("/v1/analytics/scheduling/*", authMiddleware, readRateLimit);
app.use("/v1/analytics/scheduling", authMiddleware, readRateLimit);
// Onboarding: write-level (200 req/min) — guided setup wizard
app.use("/v1/onboarding/*", authMiddleware, writeRateLimit);
app.use("/v1/onboarding", authMiddleware, writeRateLimit);
// Video Meetings (AlecRae Meet): write-level for room CRUD + schedule, read-level for listing
app.use("/v1/meetings/rooms/*/recordings", authMiddleware, readRateLimit);
app.use("/v1/meetings/rooms/*/schedule", authMiddleware, writeRateLimit);
app.use("/v1/meetings/rooms/*", authMiddleware, writeRateLimit);
app.use("/v1/meetings/rooms", authMiddleware, writeRateLimit);
app.use("/v1/meetings/recordings/*/summarize", authMiddleware, writeRateLimit);
app.use("/v1/meetings/recordings/*", authMiddleware, readRateLimit);
app.use("/v1/meetings/instant", authMiddleware, writeRateLimit);
// AI Writing Intelligence: write-level for compose/rewrite/expand, read-level for stats/profiles
app.use("/v1/ai/write/profiles/*", authMiddleware, writeRateLimit);
app.use("/v1/ai/write/profiles", authMiddleware, readRateLimit);
app.use("/v1/ai/write/stats", authMiddleware, readRateLimit);
app.use("/v1/ai/write/*", authMiddleware, writeRateLimit);
app.use("/v1/ai/write", authMiddleware, writeRateLimit);
// Notification Intelligence: write-level for rule CRUD + evaluate, read-level for batches/digest
app.use("/v1/notifications/rules/*", authMiddleware, writeRateLimit);
app.use("/v1/notifications/rules", authMiddleware, writeRateLimit);
app.use("/v1/notifications/evaluate", authMiddleware, writeRateLimit);
app.use("/v1/notifications/batches/*/deliver", authMiddleware, writeRateLimit);
app.use("/v1/notifications/batches/*", authMiddleware, readRateLimit);
app.use("/v1/notifications/batches", authMiddleware, readRateLimit);
app.use("/v1/notifications/digest", authMiddleware, readRateLimit);
// Focus Sessions: write-level for start/end, read-level for current/deferred
app.use("/v1/focus/start", authMiddleware, writeRateLimit);
app.use("/v1/focus/end", authMiddleware, writeRateLimit);
app.use("/v1/focus/current", authMiddleware, readRateLimit);
app.use("/v1/focus/deferred", authMiddleware, readRateLimit);
// Email Hygiene: write-level for goals/cleanup/audit, read-level for analytics
app.use("/v1/hygiene/subscriptions/audit", authMiddleware, readRateLimit);
app.use("/v1/hygiene/subscriptions/*/wanted", authMiddleware, writeRateLimit);
app.use("/v1/hygiene/subscriptions/*", authMiddleware, readRateLimit);
app.use("/v1/hygiene/subscriptions", authMiddleware, readRateLimit);
app.use("/v1/hygiene/inbox-cleanup", authMiddleware, writeRateLimit);
app.use("/v1/hygiene/goals", authMiddleware, writeRateLimit);
app.use("/v1/hygiene/*", authMiddleware, readRateLimit);
// Documents (AlecRae Docs): write-level for CRUD, read-level for listing
app.use("/v1/documents/folders/*", authMiddleware, writeRateLimit);
app.use("/v1/documents/folders", authMiddleware, writeRateLimit);
app.use("/v1/documents/*/ai-assist", authMiddleware, writeRateLimit);
app.use("/v1/documents/*/export", authMiddleware, writeRateLimit);
app.use("/v1/documents/*/restore/*", authMiddleware, writeRateLimit);
app.use("/v1/documents/*/versions", authMiddleware, readRateLimit);
app.use("/v1/documents/*", authMiddleware, writeRateLimit);
app.use("/v1/documents", authMiddleware, writeRateLimit);
// Calendar Events: write-level for CRUD + scheduling, read-level for queries
app.use("/v1/calendar-events/find-time", authMiddleware, writeRateLimit);
app.use("/v1/calendar-events/schedule-from-text", authMiddleware, writeRateLimit);
app.use("/v1/calendar-events/today", authMiddleware, readRateLimit);
app.use("/v1/calendar-events/availability", authMiddleware, writeRateLimit);
app.use("/v1/calendar-events/*/prep", authMiddleware, readRateLimit);
app.use("/v1/calendar-events/*", authMiddleware, writeRateLimit);
app.use("/v1/calendar-events", authMiddleware, writeRateLimit);
// Analytics Dashboard: read-level for snapshots/goals, write-level for create/update
app.use("/v1/analytics/dashboard/goals/*", authMiddleware, writeRateLimit);
app.use("/v1/analytics/dashboard/goals", authMiddleware, writeRateLimit);
app.use("/v1/analytics/dashboard/*", authMiddleware, readRateLimit);
app.use("/v1/analytics/dashboard", authMiddleware, readRateLimit);
// Delegation: write-level for create/update, read-level for listing
app.use("/v1/delegation/*", authMiddleware, writeRateLimit);
app.use("/v1/delegation", authMiddleware, writeRateLimit);
// Shared Drafts: write-level for CRUD
app.use("/v1/shared-drafts/*", authMiddleware, writeRateLimit);
app.use("/v1/shared-drafts", authMiddleware, writeRateLimit);
// Workflows: write-level for CRUD + trigger, read-level for runs
app.use("/v1/workflows/*/runs", authMiddleware, readRateLimit);
app.use("/v1/workflows/templates", authMiddleware, readRateLimit);
app.use("/v1/workflows/*", authMiddleware, writeRateLimit);
app.use("/v1/workflows", authMiddleware, writeRateLimit);
// AI Categorization: write-level for categorize/train, read-level for listing
app.use("/v1/ai/categorize/feedback", authMiddleware, writeRateLimit);
app.use("/v1/ai/categorize/batch", authMiddleware, writeRateLimit);
app.use("/v1/ai/categorize/smart-labels/*", authMiddleware, writeRateLimit);
app.use("/v1/ai/categorize/smart-labels", authMiddleware, writeRateLimit);
app.use("/v1/ai/categorize/*", authMiddleware, readRateLimit);
app.use("/v1/ai/categorize", authMiddleware, writeRateLimit);
// Search Intelligence: search-level for queries, write-level for bookmarks
app.use("/v1/search-intelligence/bookmarks/*", authMiddleware, writeRateLimit);
app.use("/v1/search-intelligence/bookmarks", authMiddleware, writeRateLimit);
app.use("/v1/search-intelligence/*", authMiddleware, searchRateLimit);
app.use("/v1/search-intelligence", authMiddleware, searchRateLimit);
// Security Intelligence: write-level for policies/actions, read-level for dashboard
app.use("/v1/security-intelligence/policies/*", authMiddleware, writeRateLimit);
app.use("/v1/security-intelligence/policies", authMiddleware, writeRateLimit);
app.use("/v1/security-intelligence/threats/*/action", authMiddleware, writeRateLimit);
app.use("/v1/security-intelligence/scan/*", authMiddleware, writeRateLimit);
app.use("/v1/security-intelligence/report-phishing", authMiddleware, writeRateLimit);
app.use("/v1/security-intelligence/*", authMiddleware, readRateLimit);
app.use("/v1/security-intelligence", authMiddleware, readRateLimit);
// Sentiment Timeline: write-level for analyze, read-level for queries
app.use("/v1/sentiment/analyze", authMiddleware, writeRateLimit);
app.use("/v1/sentiment/batch-analyze", authMiddleware, writeRateLimit);
app.use("/v1/sentiment/*", authMiddleware, readRateLimit);
app.use("/v1/sentiment", authMiddleware, readRateLimit);
// Attachment Intelligence: write-level for analyze/scan, read-level for queries
app.use("/v1/attachments/intelligence/analyze", authMiddleware, writeRateLimit);
app.use("/v1/attachments/intelligence/scan", authMiddleware, writeRateLimit);
app.use("/v1/attachments/intelligence/batch-scan", authMiddleware, writeRateLimit);
app.use("/v1/attachments/intelligence/extract-text", authMiddleware, writeRateLimit);
app.use("/v1/attachments/intelligence/organize/*/action", authMiddleware, writeRateLimit);
app.use("/v1/attachments/intelligence/*", authMiddleware, readRateLimit);
app.use("/v1/attachments/intelligence", authMiddleware, readRateLimit);
// Scheduling Intelligence: write-level for propose/detect, read-level for queries
app.use("/v1/scheduling/detect", authMiddleware, writeRateLimit);
app.use("/v1/scheduling/propose", authMiddleware, writeRateLimit);
app.use("/v1/scheduling/auto-respond", authMiddleware, writeRateLimit);
app.use("/v1/scheduling/patterns/learn", authMiddleware, writeRateLimit);
app.use("/v1/scheduling/patterns", authMiddleware, writeRateLimit);
app.use("/v1/scheduling/*", authMiddleware, readRateLimit);
app.use("/v1/scheduling", authMiddleware, readRateLimit);
// Context Intelligence: write-level for extract, read-level for queries
app.use("/v1/context/extract", authMiddleware, writeRateLimit);
app.use("/v1/context/batch-extract", authMiddleware, writeRateLimit);
app.use("/v1/context/action-items/*", authMiddleware, writeRateLimit);
app.use("/v1/context/deadlines/*/remind", authMiddleware, writeRateLimit);
app.use("/v1/context/promises/*", authMiddleware, writeRateLimit);
app.use("/v1/context/*", authMiddleware, readRateLimit);
app.use("/v1/context", authMiddleware, readRateLimit);
// Productivity Analytics: write-level for track/generate, read-level for queries
app.use("/v1/productivity/track", authMiddleware, writeRateLimit);
app.use("/v1/productivity/insights/generate", authMiddleware, writeRateLimit);
app.use("/v1/productivity/insights/*", authMiddleware, writeRateLimit);
app.use("/v1/productivity/*", authMiddleware, readRateLimit);
app.use("/v1/productivity", authMiddleware, readRateLimit);
// Knowledge Graph: write-level for extract/update/delete, read-level for queries
app.use("/v1/knowledge/extract", authMiddleware, writeRateLimit);
app.use("/v1/knowledge/batch-extract", authMiddleware, writeRateLimit);
app.use("/v1/knowledge/entities/*", authMiddleware, writeRateLimit);
app.use("/v1/knowledge/*", authMiddleware, readRateLimit);
app.use("/v1/knowledge", authMiddleware, readRateLimit);
// Mount route handlers
app.route("/v1/messages", messages);
app.route("/v1/domains", domains);
// app.route("/v1/domains/:id/warmup", warmup); // see warmup import note
app.route("/v1/webhooks", webhooks);
app.route("/v1/analytics", analytics);
app.route("/v1/suppressions", suppressions);
app.route("/v1/api-keys", apiKeysRouter);
app.route("/v1/account", account);
app.route("/v1/billing", billing);
app.route("/v1/templates", templatesRouter);
app.route("/v1/voice", voice);
app.route("/v1/voice-clone", voiceClone);
app.route("/v1/meeting-link", meetingLink);
app.route("/v1/meetings", meetings);
app.route("/v1/grammar", grammar);
app.route("/v1/dictation", dictation);
app.route("/v1/inbox", inbox);
app.route("/v1/recall", recall);
app.route("/v1/translate", translate);
app.route("/v1/collaborate", collaborate);
app.route("/v1/connect", connect);
app.route("/v1/snooze", snooze);
app.route("/v1/send", scheduleSend);
app.route("/v1/import", importRouter);
app.route("/v1/search", aiSearch);
app.route("/v1/semantic", semanticSearch);
app.route("/v1/contacts", contacts);
// Contacts Extended (CRM-lite) — interactions, reminders, AI insights
app.route("/v1/contacts-extended", contactsExtendedRouter);
app.route("/v1/calendar", calendar);
app.route("/v1/encryption", encryption);
app.route("/v1/rules", aiRules);
app.route("/v1/programs", programs);
app.route("/v1/explain", explain);
// Mount explain router again at /v1 to serve /v1/emails/:id/summary and /v1/emails/:id/explain
app.route("/v1", explain);
app.route("/v1/agent", agent);
app.route("/v1/security", security);
app.route("/v1/unsubscribe", unsubscribe);
// Per-email unsubscribe (B3): /v1/emails/:id/unsubscribe
app.route("/v1/emails", emailUnsubscribe);
// Per-email translation (B4): /v1/emails/:id/translate + /v1/emails/:id/translation
app.route("/v1/emails", emailTranslate);
// Per-email security (B5+B6): /v1/emails/:id/security
app.route("/v1/emails", emailSecurity);
app.route("/v1/send-time", sendTime);
app.route("/v1/emails", optimalSendTime);
app.route("/v1/analytics", recipientPatterns);
// A3: Inbox Heatmap analytics (heatmap grid, hourly chart, stats dashboard)
app.route("/v1/analytics", heatmapAnalytics);
app.route("/v1/compose-assist", composeAssist);
app.route("/v1/compose/spellcheck", spellcheckRouter);
app.route("/v1/todo", todo);
// S8: Thread → Action Items extraction + task CRUD
app.route("/v1/emails", emailTasks);
app.route("/v1/tasks", taskRoutes);
app.route("/v1/gamification", gamification);
app.route("/v1/changelog", changelog);
// B8: Voice-to-Voice Replies (recording, transcription, inline player)
app.route("/v1/voice-messages", voiceMessageRouter);
// B1: Programmable Email — TypeScript snippet engine
app.route("/v1/scripts", scripts);
// B2: Email-as-Database — SQL over inbox query engine
app.route("/v1/query", emailQuery);
// FBL: ISP Feedback Loop — complaint reports (no auth — ISPs call this)
app.use("/v1/fbl/*", webhookRateLimit);
app.route("/v1/fbl", fbl);
// Signatures — multiple per account, auto-switch by context
app.route("/v1/signatures", signaturesRouter);
// Contact Groups / Distribution Lists — group contacts, send to groups
app.route("/v1/contact-groups", contactGroupsRouter);
// Thread Mutes — silence a thread without unsubscribing
app.route("/v1/threads", threadMutesRouter);
// Bulk Actions — select multiple emails and act on them at once
app.route("/v1/bulk", bulkActionsRouter);
// Email A/B Testing — send variants, track performance
app.route("/v1/ab-tests", abTestsRouter);
// Mail Merge — personalized mass emails from CSV/contacts
app.route("/v1/mail-merge", mailMergeRouter);
// Contact Enrichment — auto-pull company info, social profiles
// Mounts under /v1/contacts (enrichment routes use /:contactId/enrich etc.)
app.route("/v1/contacts", contactEnrichmentRouter);
// Auto-Responder / Vacation Mode — AI-powered OOO with smart replies
app.route("/v1/auto-responder", autoResponderRouter);
// Push Notifications — Web Push subscription management
app.route("/v1/push", pushNotificationsRouter);
// Smart Folders / Saved Searches — custom auto-populating views
app.route("/v1/smart-folders", smartFoldersRouter);
// Labels / Tags — shared across team, nested hierarchy
app.route("/v1/labels", labelsRouter);
// Notes — email-linked notes (like Notion meets email)
app.route("/v1/notes", notesRouter);
// Per-email notes: /v1/emails/:emailId/notes
app.route("/v1/emails", emailNotesRouter);
// Per-thread notes: /v1/threads/:threadId/notes
app.route("/v1/threads", threadNotesRouter);
// Files — attachment management + cloud storage browser
app.route("/v1/files", filesRouter);
// Per-email attachments: /v1/emails/:emailId/attachments
app.route("/v1/emails", emailAttachmentsRouter);
// Chat — secure internal messaging for teams
app.route("/v1/chat", chatRouter);
// Link Previews — URL unfurling with 7-day cache
app.route("/v1/link-preview", linkPreviewRouter);
// Integrations — Zapier/Make/n8n webhook connectors
app.route("/v1/integrations", integrationsRouter);
// Scheduling Analytics — best send times, engagement patterns
app.route("/v1/analytics/scheduling", schedulingAnalyticsRouter);
// Onboarding — Gmail + Microsoft 365 guided setup wizard
app.route("/v1/onboarding", onboardingRouter);
// Video Meetings — AlecRae Meet (Teams/Zoom replacement)
app.route("/v1/meetings", videoMeetingsRouter);
// AI Writing Intelligence — full writing assistant
app.route("/v1/ai/write", aiWritingRouter);
// Notification Intelligence — AI-powered smart notification rules + focus sessions
app.route("/v1/notifications", notificationsRouter);
app.route("/v1/focus", focusRouter);
// AI Intelligence Hub — priority scoring, relationships, smart replies, sentiment, writing coach, predictions
app.route("/v1/ai-intelligence", aiIntelligenceRouter);
// Email Hygiene — productivity insights, subscription tracking, inbox cleanup
app.route("/v1/hygiene", hygieneRouter);
// Documents — AlecRae Docs/Sheets/Slides
app.route("/v1/documents", documentsRouter);
// Calendar Events — Smart Calendar with AI scheduling
app.route("/v1/calendar-events", calendarEventsRouter);
// Analytics Dashboard — periodic snapshots + goals
app.route("/v1/analytics/dashboard", analyticsDashboardRouter);
// Delegation — email delegation + shared drafts
app.route("/v1/delegation", delegationRouter);
app.route("/v1/shared-drafts", sharedDraftsRouter);
// Workflows — automated email workflows + templates
app.route("/v1/workflows", workflowsRouter);
// AI Categorization — email categories + smart labels + feedback
app.route("/v1/ai/categorize", aiCategorizationRouter);
// Search Intelligence — search history, bookmarks, suggestions
app.route("/v1/search-intelligence", searchIntelligenceRouter);
// Security Intelligence — threat detection, policies, audit log
app.route("/v1/security-intelligence", securityIntelligenceRouter);
// Sentiment Timeline — sentiment tracking + relationship health
app.route("/v1/sentiment", sentimentTimelineRouter);
// Attachment Intelligence — AI file analysis, virus scanning, PII detection
app.route("/v1/attachments/intelligence", attachmentIntelligenceRouter);
// Scheduling Intelligence — AI meeting proposals + availability patterns
app.route("/v1/scheduling", schedulingIntelligenceRouter);
// Context Intelligence — action items, deadlines, promises
app.route("/v1/context", contextIntelligenceRouter);
// Productivity Analytics — time tracking, insights, behavior patterns
app.route("/v1/productivity", productivityAnalyticsRouter);
// Knowledge Graph — entity extraction, relationships, graph visualization
app.route("/v1/knowledge", knowledgeGraphRouter);

// Admin dashboard: requires admin API key auth (applied via authMiddleware above)
app.use("/v1/admin/*", authMiddleware, readRateLimit);
app.route("/v1/admin", admin);

// ─── 404 handler ────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json(
    {
      error: {
        type: "not_found",
        message: `Route ${c.req.method} ${c.req.path} not found`,
        code: "route_not_found",
      },
    },
    404,
  );
});

// ─── Global error handler ──────────────────────────────────────────────────

app.onError((err, c) => {
  const reqId = c.get("requestId") ?? "unknown";

  console.error(`[${reqId}] Unhandled error:`, err);

  const isProduction = process.env.NODE_ENV === "production";

  return c.json(
    {
      error: {
        type: "server_error",
        message: isProduction
          ? "An internal server error occurred"
          : err.message,
        code: "internal_error",
        ...(isProduction ? {} : { stack: err.stack }),
      },
    },
    500,
  );
});

// ─── Server startup ─────────────────────────────────────────────────────────

const port = parseInt(process.env["PORT"] ?? "3001", 10);

console.log("=".repeat(60));
console.log("  AlecRae API — Starting");
console.log(`  Port: ${port}`);
console.log(`  Environment: ${process.env.NODE_ENV ?? "development"}`);
console.log("=".repeat(60));

// Initialize OpenTelemetry
initTelemetry("alecrae-api").catch((err) => {
  console.warn("[api] OpenTelemetry init failed:", err);
});

// Initialize Meilisearch index on startup (non-blocking)
initSearchIndex().catch((err) => {
  console.warn("[api] Meilisearch init failed (search will be unavailable):", err);
});

// Start the webhook delivery worker (BullMQ consumer)
startWebhookWorker();

// Start the semantic search auto-indexer (embeds new emails in background)
startAutoIndexer();

// Register DLQ processor repeat job (every 15 minutes)
const dlqInterval = setInterval(() => {
  processDLQ().catch((err) => {
    console.warn("[api] DLQ processing error:", err);
  });
}, 15 * 60 * 1000);
dlqInterval.unref();

// Register storage reconciliation repeat job (weekly — every 7 days)
const storageReconcileInterval = setInterval(() => {
  reconcileStorageUsage().catch((err) => {
    console.warn("[api] Storage reconciliation error:", err);
  });
}, 7 * 24 * 60 * 60 * 1000);
storageReconcileInterval.unref();

// ─── Graceful shutdown ──────────────────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[api] Received ${signal} — shutting down...`);

  const timeout = setTimeout(() => {
    console.error("[api] Shutdown timed out — forcing exit");
    process.exit(1);
  }, 15_000);

  try {
    // Stop the semantic search auto-indexer (drains remaining queue)
    await stopAutoIndexer();
    console.log("[api] Auto-indexer stopped");

    // Close the webhook delivery worker
    await stopWebhookWorker();
    console.log("[api] Webhook worker stopped");

    // Close the BullMQ send queue
    await closeSendQueue();
    console.log("[api] Send queue closed");

    // Flush telemetry
    await shutdownTelemetry();
    console.log("[api] Telemetry shut down");

    // Close rate-limit Redis connection
    await closeRateLimitRedis();
    console.log("[api] Rate-limit Redis closed");

    // Close idempotency Redis connection
    await closeIdempotencyRedis();
    console.log("[api] Idempotency Redis closed");

    // Close the database connection pool
    await closeConnection();
    console.log("[api] Database connections closed");

    clearTimeout(timeout);
    console.log("[api] Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[api] Shutdown error:", error);
    clearTimeout(timeout);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Export for Bun serve() ─────────────────────────────────────────────────

export default {
  port,
  fetch: app.fetch,
};

export { app };
