/**
 * @alecrae/mta — Service Entry Point
 *
 * Starts the complete Mail Transfer Agent:
 *   1. SMTP server (for receiving inbound email)
 *   2. Queue worker (for processing outbound delivery)
 *   3. Connects to Postgres and Redis
 *   4. Handles graceful shutdown (SIGTERM, SIGINT)
 */

import { SmtpServer } from "./smtp/server.js";
import { MtaWorker } from "./worker.js";
import { getDatabase, closeConnection } from "@alecrae/db";
import { initTelemetry, shutdownTelemetry } from "@alecrae/shared";
import Redis from "ioredis";

// ─── Configuration ──────────────────────────────────────────────────────────

const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "25", 10);
const SMTP_HOST = process.env["SMTP_HOST"] ?? "0.0.0.0";
const SMTP_HOSTNAME = process.env["SMTP_HOSTNAME"] ?? "mail.alecrae.dev";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const MTA_QUEUE_NAME = process.env["MTA_QUEUE_NAME"] ?? "alecrae:outbound";
const WORKER_CONCURRENCY = parseInt(
  process.env["MTA_WORKER_CONCURRENCY"] ?? "10",
  10,
);

// ─── Service state ──────────────────────────────────────────────────────────

let smtpServer: SmtpServer | null = null;
let mtaWorker: MtaWorker | null = null;
let redis: Redis | null = null;
let isShuttingDown = false;

// ─── Startup ────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  AlecRae MTA — Starting");
  console.log("=".repeat(60));

  // ── 0. Initialize OpenTelemetry ──────────────────────────────────────
  await initTelemetry("alecrae-mta").catch((err) => {
    console.warn("[mta] OpenTelemetry init failed:", err);
  });

  // ── 1. Connect to Postgres ──────────────────────────────────────────
  console.log("[mta] Connecting to Postgres...");
  try {
    getDatabase();
    console.log("[mta] Postgres connection pool initialised");
  } catch (error) {
    console.error("[mta] Failed to connect to Postgres:", error);
    process.exit(1);
  }

  // ── 2. Connect to Redis ─────────────────────────────────────────────
  console.log(`[mta] Connecting to Redis at ${REDIS_URL}...`);
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
    });

    const redisInstance = redis;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Redis connection timeout"));
      }, 10_000);

      redisInstance.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });

      redisInstance.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    console.log("[mta] Redis connected");
  } catch (error) {
    console.error("[mta] Failed to connect to Redis:", error);
    process.exit(1);
  }

  // ── 3. Start SMTP server (inbound) ─────────────────────────────────
  console.log(`[mta] Starting SMTP server on ${SMTP_HOST}:${SMTP_PORT}...`);
  smtpServer = new SmtpServer({
    host: SMTP_HOST,
    port: SMTP_PORT,
    hostname: SMTP_HOSTNAME,
    maxMessageSize: 25 * 1024 * 1024,
    maxRecipients: 100,
    maxConnections: 500,
    connectionTimeout: 300_000,
    socketTimeout: 60_000,
    requireAuth: false,
    enableStarttls: false, // Enable when TLS certs are configured
  });

  smtpServer.on("listening", (addr) => {
    console.log(`[mta] SMTP server listening on ${addr.address}:${addr.port}`);
  });

  smtpServer.on("connection", (session) => {
    console.log(
      `[mta] SMTP connection from ${session.remoteAddress}:${session.remotePort}`,
    );
  });

  smtpServer.on("message", (envelope, _session) => {
    console.log(
      `[mta] Received message from ${envelope.mailFrom?.address ?? "unknown"} ` +
        `to ${envelope.rcptTo.map((r) => r.address).join(", ")} ` +
        `(${envelope.data.length} bytes)`,
    );
    // In production: route to inbound processing pipeline
    // (spam filtering, mailbox routing, storage)
  });

  smtpServer.on("error", (error, session) => {
    console.error(
      `[mta] SMTP error${session ? ` (session ${session.id})` : ""}: ${error.message}`,
    );
  });

  try {
    await smtpServer.start();
  } catch (error) {
    console.error("[mta] Failed to start SMTP server:", error);
    // Non-fatal: the outbound worker can still run without the SMTP receiver
    // if port 25 is not available (common in development).
    console.warn(
      "[mta] SMTP server failed to start — outbound-only mode enabled",
    );
    smtpServer = null;
  }

  // ── 4. Start outbound queue worker ──────────────────────────────────
  console.log("[mta] Starting outbound queue worker...");
  mtaWorker = new MtaWorker({
    redisUrl: REDIS_URL,
    queueName: MTA_QUEUE_NAME,
    concurrency: WORKER_CONCURRENCY,
    localHostname: SMTP_HOSTNAME,
  });

  await mtaWorker.start();

  // ── 5. Register shutdown handlers ───────────────────────────────────
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log("=".repeat(60));
  console.log("  AlecRae MTA — Running");
  console.log(`  SMTP:   ${smtpServer ? `${SMTP_HOST}:${SMTP_PORT}` : "disabled"}`);
  console.log(`  Queue:  ${MTA_QUEUE_NAME} (concurrency: ${WORKER_CONCURRENCY})`);
  console.log("=".repeat(60));
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[mta] Received ${signal} — initiating graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    console.error("[mta] Shutdown timed out after 30s — forcing exit");
    process.exit(1);
  }, 30_000);

  try {
    // Stop accepting new work first
    if (mtaWorker) {
      console.log("[mta] Stopping queue worker...");
      await mtaWorker.stop();
      console.log("[mta] Queue worker stopped");
    }

    if (smtpServer) {
      console.log("[mta] Stopping SMTP server...");
      await smtpServer.stop();
      console.log("[mta] SMTP server stopped");
    }

    if (redis) {
      console.log("[mta] Closing Redis connection...");
      await redis.quit();
      redis = null;
      console.log("[mta] Redis disconnected");
    }

    console.log("[mta] Flushing telemetry...");
    await shutdownTelemetry();
    console.log("[mta] Telemetry shut down");

    console.log("[mta] Closing Postgres connection pool...");
    await closeConnection();
    console.log("[mta] Postgres disconnected");

    clearTimeout(shutdownTimeout);
    console.log("[mta] Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[mta] Error during shutdown:", error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// ─── Start the service ──────────────────────────────────────────────────────

start().catch((error) => {
  console.error("[mta] Fatal startup error:", error);
  process.exit(1);
});
