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
import { rateLimiter } from "./middleware/rate-limiter.js";
import { messages } from "./routes/messages.js";
import { domains } from "./routes/domains.js";
import { webhooks } from "./routes/webhooks.js";
import { analytics } from "./routes/analytics.js";
import { suppressions } from "./routes/suppressions.js";
import { tracking } from "./routes/tracking.js";
import { apiKeysRouter } from "./routes/api-keys.js";
import { account } from "./routes/account.js";
import { auth } from "./routes/auth.js";
import { health } from "./routes/health.js";
import { admin } from "./routes/admin.js";
import { closeConnection } from "@emailed/db";
import { closeSendQueue } from "./lib/queue.js";

// ─── Create the Hono app ───────────────────────────────────────────────────

const app = new Hono();

// ─── Global Middleware ──────────────────────────────────────────────────────

// Request ID for distributed tracing
app.use("*", requestId());

// Structured request logging
app.use("*", logger());

// Server-Timing headers for performance debugging
app.use("*", timing());

// Security headers (CSP, X-Frame-Options, etc.)
app.use("*", secureHeaders());

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

// Auth endpoints (no API key auth required)
app.route("/v1/auth", auth);

// Tracking endpoints (no auth — embedded in emails)
app.route("/t", tracking);

// ─── Authenticated routes ──────────────────────────────────────────────────

// Apply auth + rate limiting to all /v1/* EXCEPT /v1/auth/* and /v1/health/*
app.use("/v1/messages/*", authMiddleware, rateLimiter);
app.use("/v1/domains/*", authMiddleware, rateLimiter);
app.use("/v1/webhooks/*", authMiddleware, rateLimiter);
app.use("/v1/analytics/*", authMiddleware, rateLimiter);
app.use("/v1/suppressions/*", authMiddleware, rateLimiter);
app.use("/v1/api-keys/*", authMiddleware, rateLimiter);
app.use("/v1/account/*", authMiddleware, rateLimiter);

// Mount route handlers
app.route("/v1/messages", messages);
app.route("/v1/domains", domains);
app.route("/v1/webhooks", webhooks);
app.route("/v1/analytics", analytics);
app.route("/v1/suppressions", suppressions);
app.route("/v1/api-keys", apiKeysRouter);
app.route("/v1/account", account);

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
    // Close the BullMQ send queue
    await closeSendQueue();
    console.log("[api] Send queue closed");

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
