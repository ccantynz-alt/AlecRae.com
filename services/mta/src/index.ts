/**
 * @alecrae/mta — Service Entry Point
 *
 * Starts the complete Mail Transfer Agent:
 *   1. SMTP server (for receiving inbound email)
 *   2. Queue worker (for processing outbound delivery)
 *   3. Connects to Postgres and Redis
 *   4. Handles graceful shutdown (SIGTERM, SIGINT)
 */

import { getMtaHostname } from "./config.js";
import { SmtpServer } from "./smtp/server.js";
import { MtaWorker } from "./worker.js";
import { TlsManager } from "./tls/manager.js";
import { createHealthServer, buildMtaHealthChecks } from "./health.js";
import { getDatabase, closeConnection, domains } from "@alecrae/db";
import { eq } from "drizzle-orm";
import { initTelemetry, shutdownTelemetry } from "@alecrae/shared";
import Redis from "ioredis";
import { Queue } from "bullmq";

// ─── Configuration ──────────────────────────────────────────────────────────

const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "25", 10);
const SMTP_HOST = process.env["SMTP_HOST"] ?? "0.0.0.0";
const SMTP_HOSTNAME = getMtaHostname();
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const MTA_QUEUE_NAME = process.env["MTA_QUEUE_NAME"] ?? "alecrae-outbound";
const WORKER_CONCURRENCY = parseInt(
  process.env["MTA_WORKER_CONCURRENCY"] ?? "10",
  10,
);
const HEALTH_PORT = parseInt(process.env["HEALTH_PORT"] ?? "8082", 10);
const SERVICE_VERSION = process.env["SERVICE_VERSION"] ?? "0.1.0";
/** Waiting-job count above which /readyz reports the queue as backed up. */
const MAX_HEALTHY_QUEUE_DEPTH = parseInt(
  process.env["MTA_MAX_HEALTHY_QUEUE_DEPTH"] ?? "1000",
  10,
);

/**
 * Whether this OUTBOUND service also opens an SMTP listener.
 *
 * Default false. See the long note at the call site: the port-25 receiver is
 * `services/inbound`'s job, this process shipped an unfinished duplicate, and
 * that duplicate is what ran as an open relay for 9 days (Known Issue #105).
 */
const ENABLE_SMTP_RECEIVER = process.env["MTA_ENABLE_SMTP_RECEIVER"] === "true";

/** How often the accepted-recipient domain list is refreshed from the DB. */
const LOCAL_DOMAIN_REFRESH_MS = 5 * 60 * 1000;
let localDomainTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Domains this server will accept mail FOR — the relay control.
 *
 * Combines active, verified customer domains with any set explicitly in
 * MTA_LOCAL_DOMAINS (the service's own infrastructure addresses, e.g. the
 * bounce host, which has no `domains` row).
 *
 * Returns the env list alone if the DB is unreachable. That degrades to
 * refusing customer mail, which is the correct direction to fail: a relay
 * control that opens up when its data source is down is not a control.
 */
async function loadLocalDomains(): Promise<string[]> {
  const fromEnv = (process.env["MTA_LOCAL_DOMAINS"] ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  try {
    const db = getDatabase();
    const rows = await db
      .select({ domain: domains.domain })
      .from(domains)
      .where(eq(domains.isActive, true));
    return [...new Set([...fromEnv, ...rows.map((r) => r.domain.toLowerCase())])];
  } catch (err) {
    console.error(
      `[mta] Could not load hosted domains for the relay control: ${
        err instanceof Error ? err.message : String(err)
      } — accepting only MTA_LOCAL_DOMAINS (${fromEnv.length} entries)`,
    );
    return fromEnv;
  }
}

// TLS was previously hardcoded off entirely — the fully-built TlsManager
// (tls/manager.ts) was never constructed or passed to SmtpServer, so mail
// transited in plaintext regardless of what certs existed. This wires it in
// for real: if TLS_CERT_PATH/TLS_KEY_PATH point at a loadable cert+key pair,
// STARTTLS is genuinely offered; otherwise it degrades to the previous
// plaintext-only behavior rather than crashing. Issuing an actual
// certificate for the MTA hostname is a separate infra task (ACME
// HTTP-01 needs port 80, which the platform gateway already owns on this
// box; DNS-01 needs Cloudflare API access) — this only removes the
// application-code half of the gap.
const TLS_CERT_PATH = process.env["TLS_CERT_PATH"];
const TLS_KEY_PATH = process.env["TLS_KEY_PATH"];
const TLS_CA_PATH = process.env["TLS_CA_PATH"];
const TLS_MIN_VERSION = (process.env["TLS_MIN_VERSION"] === "TLSv1.3" ? "TLSv1.3" : "TLSv1.2") as
  | "TLSv1.2"
  | "TLSv1.3";

// ─── Service state ──────────────────────────────────────────────────────────

let smtpServer: SmtpServer | null = null;
let mtaWorker: MtaWorker | null = null;
let redis: Redis | null = null;
/** Read-only Queue handle used solely by the queue-depth readiness check. */
let healthQueue: Queue | null = null;
let healthServer: { start: () => Promise<void>; stop: () => Promise<void> } | null = null;
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

  // ── 3. Load TLS certificate (if configured) ─────────────────────────
  const tlsManager = new TlsManager({
    certsDir: process.env["TLS_CERTS_DIR"] ?? "/etc/alecrae/tls",
    defaultMinVersion: TLS_MIN_VERSION,
    autoRenewDays: 30,
  });
  let starttlsEnabled = false;
  if (TLS_CERT_PATH && TLS_KEY_PATH) {
    const loaded = tlsManager.loadCertificate(SMTP_HOSTNAME, TLS_KEY_PATH, TLS_CERT_PATH, TLS_CA_PATH);
    if (loaded.ok) {
      starttlsEnabled = true;
      console.log(
        `[mta] TLS certificate loaded for ${SMTP_HOSTNAME} (expires ${loaded.value.expiresAt.toISOString()}) — STARTTLS enabled`,
      );
    } else {
      console.error(
        `[mta] TLS_CERT_PATH/TLS_KEY_PATH set but failed to load: ${loaded.error.message} — starting WITHOUT STARTTLS`,
      );
    }
  } else if (ENABLE_SMTP_RECEIVER) {
    // Only meaningful when a receiver is actually running — this TlsManager
    // serves STARTTLS to inbound connections, not outbound delivery (the
    // SmtpClient negotiates its own opportunistic TLS).
    console.warn(
      "[mta] TLS_CERT_PATH/TLS_KEY_PATH not set — SMTP receiver starting WITHOUT STARTTLS (mail transits in plaintext)",
    );
  }

  // ── 4. SMTP receiver — OFF unless explicitly enabled ───────────────
  //
  // This service is the OUTBOUND MTA: a BullMQ consumer that delivers queued
  // mail (docs/infra/multi-platform-mail-plan.md, Phase 1). The port-25
  // listener that receives mail is a different service, `services/inbound`
  // (Phase 2, `alecrae-inbound`), which has the real pipeline — MIME parsing,
  // DKIM/DMARC verification, a relay control, routing and Postgres storage.
  //
  // This process nonetheless shipped its own SMTP receiver, bound to port 25
  // by default, whose message handler logged an envelope and discarded it. It
  // duplicated a service that already exists, did it incompletely, and had no
  // relay control — and it is exactly what ran as an open relay for 9 days
  // (Known Issue #105). The architecture never called for it.
  //
  // So it is now opt-in and off by default: the outbound MTA opens no listening
  // socket at all unless someone deliberately sets MTA_ENABLE_SMTP_RECEIVER=true.
  // Removing the attack surface beats guarding it. The relay control added to
  // SmtpServer stays as defence in depth for anyone who does enable it.
  if (!ENABLE_SMTP_RECEIVER) {
    console.log(
      "[mta] SMTP receiver disabled (default). This service delivers outbound mail only; " +
        "inbound mail is handled by services/inbound. Set MTA_ENABLE_SMTP_RECEIVER=true to " +
        "override — but see Known Issue #105 first.",
    );
  } else {
    console.warn(
      "[mta] MTA_ENABLE_SMTP_RECEIVER=true — starting an SMTP receiver in the OUTBOUND service. " +
        "This duplicates services/inbound and its message handler does not deliver mail anywhere. " +
        "Prefer running services/inbound instead.",
    );
    // The relay control (localDomains) is loaded BEFORE the listener starts, so
    // there is no window in which the server is up and accepting anything.
    const initialLocalDomains = await loadLocalDomains();
    if (initialLocalDomains.length === 0) {
      console.warn(
        "[mta] No hosted domains resolved — the SMTP server will refuse every recipient. " +
          "Set MTA_LOCAL_DOMAINS or verify a domain. (Refusing is deliberate: an " +
          "unconfigured relay control must never accept mail — see Known Issue #105.)",
      );
    } else {
      console.log(`[mta] Relay control: accepting mail for ${initialLocalDomains.length} domain(s)`);
    }

    console.log(`[mta] Starting SMTP server on ${SMTP_HOST}:${SMTP_PORT}...`);
    smtpServer = new SmtpServer(
      {
        host: SMTP_HOST,
        port: SMTP_PORT,
        hostname: SMTP_HOSTNAME,
        maxMessageSize: 25 * 1024 * 1024,
        maxRecipients: 100,
        maxConnections: 500,
        connectionTimeout: 300_000,
        socketTimeout: 60_000,
        requireAuth: false,
        enableStarttls: starttlsEnabled,
        localDomains: initialLocalDomains,
      },
      starttlsEnabled ? tlsManager : undefined,
    );

    // Customer domains are onboarded while the server runs; without this a newly
    // verified domain would be refused until the next restart.
    localDomainTimer = setInterval(() => {
      void loadLocalDomains().then((list) => {
        smtpServer?.updateLocalDomains(list);
      });
    }, LOCAL_DOMAIN_REFRESH_MS);

    smtpServer.on("listening", (addr) => {
      console.log(`[mta] SMTP server listening on ${addr.address}:${addr.port}`);
    });

    smtpServer.on("connection", (session) => {
      console.log(
        `[mta] SMTP connection from ${session.remoteAddress}:${session.remotePort}`,
      );
    });

  smtpServer.on("message", (envelope, _session) => {
      // This handler accepts a message and does nothing with it — it never
      // delivered mail anywhere. That is why the receiver is opt-in: rather
      // than build a second, competing inbound pipeline here, received mail
      // belongs to services/inbound, which parses MIME, verifies DKIM/DMARC,
      // routes to a mailbox and stores it. Anything accepted here is dropped,
      // and saying so plainly beats a "in production this would..." comment.
      console.warn(
        `[mta] DISCARDING message from ${envelope.mailFrom?.address ?? "unknown"} ` +
          `to ${envelope.rcptTo.map((r) => r.address).join(", ")} ` +
          `(${envelope.data.length} bytes) — this service has no inbound pipeline. ` +
          `Run services/inbound to actually receive mail.`,
      );
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
  }

  // ── 5. Start outbound queue worker ──────────────────────────────────
  console.log("[mta] Starting outbound queue worker...");
  mtaWorker = new MtaWorker({
    redisUrl: REDIS_URL,
    queueName: MTA_QUEUE_NAME,
    concurrency: WORKER_CONCURRENCY,
    localHostname: SMTP_HOSTNAME,
  });

  await mtaWorker.start();

  // ── 6. Start health server ──────────────────────────────────────────
  // buildMtaHealthChecks registers the full set (previously only db + redis
  // were wired — the queue-depth and SMTP-listener checks existed but had no
  // callers, so /readyz reported ok while the outbound queue backed up).
  console.log(`[mta] Starting health server on port ${HEALTH_PORT}...`);
  const redisClient = redis;
  healthQueue = new Queue(MTA_QUEUE_NAME, {
    connection: { url: REDIS_URL },
  });
  const depthQueue = healthQueue;
  healthServer = createHealthServer({
    port: HEALTH_PORT,
    version: SERVICE_VERSION,
    checks: buildMtaHealthChecks({
      getDb: () => getDatabase(),
      redis: redisClient,
      getQueueDepth: () => depthQueue.getWaitingCount(),
      maxHealthyQueueDepth: MAX_HEALTHY_QUEUE_DEPTH,
      // The listener check is registered only when the receiver is enabled:
      // it is default-OFF by design (Known Issue #128), and an always-on
      // check would flag the deliberately-absent listener as unhealthy.
      smtpReceiverEnabled: ENABLE_SMTP_RECEIVER,
      getSmtpStatus: () => ({
        listening: smtpServer?.isListening() ?? false,
        port: SMTP_PORT,
      }),
    }),
  });
  try {
    await healthServer.start();
    console.log(`[mta] Health server listening on :${HEALTH_PORT} (/healthz, /readyz)`);
  } catch (err) {
    console.warn(`[mta] Health server failed to start on port ${HEALTH_PORT}: ${String(err)}. Continuing without health endpoint. Set HEALTH_PORT to override.`);
    healthServer = null;
  }

  // ── 7. Register shutdown handlers ───────────────────────────────────
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log("=".repeat(60));
  console.log("  AlecRae MTA — Running");
  console.log(
    `  SMTP:   ${
      smtpServer
        ? `receiving on ${SMTP_HOST}:${SMTP_PORT}`
        : "receiver OFF (outbound only — inbound is services/inbound)"
    }`,
  );
  console.log(
    `  TLS:    ${
      smtpServer
        ? starttlsEnabled
          ? "STARTTLS enabled"
          : "DISABLED — plaintext only"
        : "n/a (no receiver)"
    }`,
  );
  console.log(`  Queue:  ${MTA_QUEUE_NAME} (concurrency: ${WORKER_CONCURRENCY})`);
  console.log(`  Health: :${HEALTH_PORT} (/healthz, /readyz)`);
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

  if (localDomainTimer) {
    clearInterval(localDomainTimer);
    localDomainTimer = null;
  }

  try {
    // Stop the health server first — signals the load balancer to stop
    // routing traffic to this instance before we tear down dependencies.
    if (healthServer) {
      console.log("[mta] Stopping health server...");
      await healthServer.stop();
      healthServer = null;
      console.log("[mta] Health server stopped");
    }

    // Stop accepting new work next
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

    if (healthQueue) {
      console.log("[mta] Closing health-check queue handle...");
      await healthQueue.close();
      healthQueue = null;
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
