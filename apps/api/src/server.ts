/**
 * @emailed/api — Main Server Entry Point
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
import { grammar } from "./routes/grammar.js";
import { dictation } from "./routes/dictation.js";
import { inbox } from "./routes/inbox.js";
import { recall } from "./routes/recall.js";
import { translate } from "./routes/translate.js";
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
import { security } from "./routes/security.js";
import { todo } from "./routes/todo.js";
import { unsubscribe } from "./routes/unsubscribe.js";
import { sendTime } from "./routes/send-time.js";
import { composeAssist } from "./routes/compose-assist.js";
import { sso } from "./routes/sso.js";
import { closeConnection } from "@emailed/db";
import { closeSendQueue } from "./lib/queue.js";
import { startWebhookWorker, stopWebhookWorker } from "./lib/webhook-dispatcher.js";
import { initSearchIndex, initTelemetry, shutdownTelemetry, telemetryMiddleware } from "@emailed/shared";

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

// CORS
app.use(
  "*",
  cors({
    origin: (origin) => origin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-API-Key",
      "X-Request-Id",
    ],
    exposeHeaders: [
      "X-Request-Id",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After",
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
    service: "emailed-api",
    version: process.env["SERVICE_VERSION"] ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// Deep health check with dependency verification (also no auth)
app.route("/v1/health", health);

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
// AI Inbox Agent: write-level (200 req/min) — heavy operations
app.use("/v1/agent/*", authMiddleware, writeRateLimit);
app.use("/v1/agent", authMiddleware, writeRateLimit);
// Security (sender verification + phishing protection): read-level (600 req/min)
app.use("/v1/security/*", authMiddleware, readRateLimit);
app.use("/v1/unsubscribe/*", authMiddleware, writeRateLimit);
app.use("/v1/unsubscribe", authMiddleware, writeRateLimit);
// Predictive Send-Time Optimization (S10)
app.use("/v1/send-time/*", authMiddleware, writeRateLimit);
// Compose-Assist / AI calendar slot suggestions (B7)
app.use("/v1/compose-assist/*", authMiddleware, writeRateLimit);
// Native Todo App Integrations (S8): write-level (200 req/min)
app.use("/v1/todo/*", authMiddleware, writeRateLimit);
app.use("/v1/todo", authMiddleware, writeRateLimit);

// Mount route handlers
app.route("/v1/messages", messages);
app.route("/v1/domains", domains);
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
app.route("/v1/calendar", calendar);
app.route("/v1/encryption", encryption);
app.route("/v1/rules", aiRules);
app.route("/v1/programs", programs);
app.route("/v1/explain", explain);
app.route("/v1/agent", agent);
app.route("/v1/security", security);
app.route("/v1/unsubscribe", unsubscribe);
app.route("/v1/send-time", sendTime);
app.route("/v1/compose-assist", composeAssist);
app.route("/v1/todo", todo);

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
console.log("  Emailed API — Starting");
console.log(`  Port: ${port}`);
console.log(`  Environment: ${process.env.NODE_ENV ?? "development"}`);
console.log("=".repeat(60));

// Initialize OpenTelemetry
initTelemetry("emailed-api").catch((err) => {
  console.warn("[api] OpenTelemetry init failed:", err);
});

// Initialize Meilisearch index on startup (non-blocking)
initSearchIndex().catch((err) => {
  console.warn("[api] Meilisearch init failed (search will be unavailable):", err);
});

// Start the webhook delivery worker (BullMQ consumer)
startWebhookWorker();

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
