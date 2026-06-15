/**
 * Health Check Endpoints
 *
 * GET /v1/health        — Basic dependency health check (DB, Redis, MTA queue).
 * GET /v1/health/detailed — Full config status report: every required and
 *                           optional env var checked + live connectivity probes.
 *                           No auth required. Rate-limited at the server level.
 *
 * Both routes are intentionally NOT behind auth middleware so that load
 * balancers, monitoring systems, and operators can probe them freely.
 */

import { Hono } from "hono";
import { getDatabase } from "@alecrae/db";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { Queue } from "bullmq";
import { MeiliSearch } from "meilisearch";

const health = new Hono();

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVICE_VERSION = process.env["SERVICE_VERSION"] ?? "0.1.0";
const REDIS_URL = process.env["REDIS_URL"] ?? "";
const MTA_QUEUE_NAME = process.env["MTA_QUEUE_NAME"] ?? "alecrae-outbound";
const startedAt = Date.now();

/** Probe timeout in milliseconds — never block longer than this. */
const PROBE_TIMEOUT_MS = 2000;

// ─── Dependency check helpers ───────────────────────────────────────────────

interface ServiceStatus {
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const db = getDatabase();
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout after 2s")), PROBE_TIMEOUT_MS),
      ),
    ]);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error: unknown) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  if (!REDIS_URL) {
    return { status: "degraded", error: "REDIS_URL not configured — using in-memory fallback" };
  }
  const start = Date.now();
  let client: Redis | null = null;
  try {
    client = new Redis(REDIS_URL, {
      connectTimeout: PROBE_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await Promise.race([
      (async () => {
        await client!.connect();
        await client!.ping();
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout after 2s")), PROBE_TIMEOUT_MS),
      ),
    ]);
    const latency = Date.now() - start;
    await client.quit();
    return { status: "ok", latencyMs: latency };
  } catch (error: unknown) {
    try {
      await client?.quit();
    } catch {
      // Ignore cleanup errors
    }
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkMtaQueue(): Promise<ServiceStatus> {
  if (!REDIS_URL) {
    return { status: "degraded", error: "Redis not configured — MTA queue unavailable" };
  }
  const start = Date.now();
  let queue: Queue | null = null;
  try {
    queue = new Queue(MTA_QUEUE_NAME, {
      connection: { url: REDIS_URL },
    });
    await Promise.race([
      queue.getJobCounts("waiting", "active", "delayed", "failed"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout after 2s")), PROBE_TIMEOUT_MS),
      ),
    ]);
    const latency = Date.now() - start;
    await queue.close();
    return {
      status: "ok",
      latencyMs: latency,
    };
  } catch (error: unknown) {
    try {
      await queue?.close();
    } catch {
      // Ignore cleanup errors
    }
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Basic deep health check with dependency verification
health.get("/", async (c) => {
  const [database, redis, mta] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkMtaQueue(),
  ]);

  const services = { database, redis, mta };

  // Overall status: "ok" if all deps are ok, "degraded" if some are down
  const allStatuses = Object.values(services).map((s) => s.status);
  const overallStatus = allStatuses.every((s) => s === "ok")
    ? "ok"
    : allStatuses.some((s) => s === "ok")
      ? "degraded"
      : "down";

  const statusCode = overallStatus === "ok" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return c.json(
    {
      status: overallStatus,
      version: SERVICE_VERSION,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      services,
    },
    statusCode,
  );
});

// ─── Detailed config status report ──────────────────────────────────────────

type CheckStatus = "ok" | "error" | "warning" | "missing";

interface ConfigCheck {
  status: CheckStatus;
  message: string;
}

interface DetailedHealthReport {
  status: "healthy" | "degraded" | "critical";
  timestamp: string;
  version: string;
  uptime_seconds: number;
  checks: {
    database: ConfigCheck;
    redis: ConfigCheck;
    google_oauth: ConfigCheck;
    jwt_secret: ConfigCheck;
    webauthn: ConfigCheck;
    vapron: ConfigCheck;
    anthropic: ConfigCheck;
    stripe: ConfigCheck;
    meilisearch: ConfigCheck;
  };
  missing_required: string[];
  missing_optional: string[];
  ready_for_production: boolean;
}

/** Run a quick Meilisearch health probe. */
async function checkMeilisearch(): Promise<ConfigCheck> {
  const url = process.env["MEILISEARCH_URL"] ?? process.env["MEILI_URL"] ?? "";
  const key = process.env["MEILISEARCH_API_KEY"] ?? process.env["MEILI_MASTER_KEY"] ?? "";

  if (!url) {
    return { status: "warning", message: "MEILISEARCH_URL not set — full-text search disabled" };
  }

  try {
    const client = new MeiliSearch({ host: url, apiKey: key });
    await Promise.race([
      client.health(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout after 2s")), PROBE_TIMEOUT_MS),
      ),
    ]);
    return { status: "ok", message: `Connected (${url})` };
  } catch (error: unknown) {
    return {
      status: "error",
      message: `Cannot connect: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Run a quick database probe and report table count. */
async function checkDatabaseDetailed(): Promise<ConfigCheck> {
  if (!process.env["DATABASE_URL"]) {
    return { status: "error", message: "DATABASE_URL not set — database unavailable" };
  }

  try {
    const db = getDatabase();

    const tableCountResult = await Promise.race([
      (async () => {
        await db.execute(sql`SELECT 1`);
        return db.execute(
          sql`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`,
        );
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout after 2s")), PROBE_TIMEOUT_MS),
      ),
    ]);

    // Drizzle execute() returns the rows directly as an iterable array
    const resultRows = tableCountResult as unknown as Array<{ count: string | number }>;
    const tableCount = resultRows[0]?.count ?? "?";
    return { status: "ok", message: `Connected (${tableCount} tables)` };
  } catch (error: unknown) {
    return {
      status: "error",
      message: `Cannot connect: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Run a quick Redis probe. */
async function checkRedisDetailed(): Promise<ConfigCheck> {
  if (!process.env["REDIS_URL"]) {
    return {
      status: "warning",
      message: "REDIS_URL not set — rate limiting and queues run in-memory",
    };
  }

  const start = Date.now();
  let client: Redis | null = null;
  try {
    client = new Redis(process.env["REDIS_URL"], {
      connectTimeout: PROBE_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await Promise.race([
      (async () => {
        await client!.connect();
        await client!.ping();
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout after 2s")), PROBE_TIMEOUT_MS),
      ),
    ]);
    await client.quit();
    return { status: "ok", message: `Connected (${Date.now() - start}ms)` };
  } catch (error: unknown) {
    try {
      await client?.quit();
    } catch {
      // ignore
    }
    return {
      status: "error",
      message: `Cannot connect: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Check Google OAuth credentials. */
function checkGoogleOAuth(): ConfigCheck {
  const clientId = process.env["GOOGLE_CLIENT_ID"]?.trim() ?? "";
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"]?.trim() ?? "";
  if (!clientId || !clientSecret) {
    const missing = [
      ...(!clientId ? ["GOOGLE_CLIENT_ID"] : []),
      ...(!clientSecret ? ["GOOGLE_CLIENT_SECRET"] : []),
    ].join(", ");
    return { status: "missing", message: `${missing} not set — Google login disabled` };
  }
  return { status: "ok", message: "Configured" };
}

/** Check JWT_SECRET length and presence. */
function checkJwtSecret(): ConfigCheck {
  const secret = process.env["JWT_SECRET"] ?? "";
  if (!secret) {
    return { status: "error", message: "JWT_SECRET not set — ALL sessions will fail" };
  }
  if (secret.length < 32) {
    return {
      status: "error",
      message: `JWT_SECRET too short (${secret.length} chars, need ≥32) — sessions will fail`,
    };
  }
  return { status: "ok", message: `Configured (${secret.length} chars)` };
}

/** Check WebAuthn / passkey configuration. */
function checkWebAuthn(): ConfigCheck {
  const rpId = process.env["WEBAUTHN_RP_ID"]?.trim() ?? "";
  const origin = process.env["WEBAUTHN_ORIGIN"]?.trim() ?? "";
  if (!rpId || !origin) {
    const missing = [
      ...(!rpId ? ["WEBAUTHN_RP_ID"] : []),
      ...(!origin ? ["WEBAUTHN_ORIGIN"] : []),
    ].join(", ");
    return { status: "missing", message: `${missing} not set — passkey login disabled` };
  }
  return { status: "ok", message: `Configured for ${rpId}` };
}

/** Check Vapron API key. */
function checkVapron(): ConfigCheck {
  const key = process.env["VAPRON_API_KEY"]?.trim() ?? "";
  if (!key) {
    return {
      status: "missing",
      message: "VAPRON_API_KEY not set — transactional email and AI gateway disabled",
    };
  }
  return { status: "ok", message: "API key configured" };
}

/** Check Anthropic API key. */
function checkAnthropic(): ConfigCheck {
  const key = process.env["ANTHROPIC_API_KEY"]?.trim() ?? "";
  if (!key) {
    return { status: "missing", message: "ANTHROPIC_API_KEY not set — AI features disabled" };
  }
  return { status: "ok", message: "Configured" };
}

/** Check Stripe secret key. */
function checkStripe(): ConfigCheck {
  const key = process.env["STRIPE_SECRET_KEY"]?.trim() ?? "";
  if (!key) {
    return { status: "missing", message: "STRIPE_SECRET_KEY not set — billing disabled" };
  }
  return { status: "ok", message: "Configured" };
}

/**
 * GET /v1/health/detailed
 *
 * Full config status report — live connectivity probes + env var checks.
 * No auth required. Safe to call externally (never returns secrets).
 */
health.get("/detailed", async (c) => {
  const [database, redis, meilisearch] = await Promise.all([
    checkDatabaseDetailed(),
    checkRedisDetailed(),
    checkMeilisearch(),
  ]);

  const googleOauth = checkGoogleOAuth();
  const jwtSecret = checkJwtSecret();
  const webauthn = checkWebAuthn();
  const vapron = checkVapron();
  const anthropic = checkAnthropic();
  const stripe = checkStripe();

  const checks = {
    database,
    redis,
    google_oauth: googleOauth,
    jwt_secret: jwtSecret,
    webauthn,
    vapron,
    anthropic,
    stripe,
    meilisearch,
  };

  // Required checks — any "error" here is critical
  const requiredChecks: Array<{ key: string; result: ConfigCheck }> = [
    { key: "DATABASE_URL", result: database },
    { key: "JWT_SECRET", result: jwtSecret },
    { key: "WEBAUTHN_RP_ID + WEBAUTHN_ORIGIN", result: webauthn },
  ];

  // Optional checks — "missing" or "warning" degrades but doesn't block boot
  const optionalChecks: Array<{ key: string; result: ConfigCheck }> = [
    { key: "REDIS_URL", result: redis },
    { key: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", result: googleOauth },
    { key: "VAPRON_API_KEY", result: vapron },
    { key: "ANTHROPIC_API_KEY", result: anthropic },
    { key: "STRIPE_SECRET_KEY", result: stripe },
    { key: "MEILISEARCH_URL", result: meilisearch },
  ];

  const missing_required = requiredChecks
    .filter((c) => c.result.status === "error" || c.result.status === "missing")
    .map((c) => c.key);

  const missing_optional = optionalChecks
    .filter((c) => c.result.status === "missing" || c.result.status === "warning")
    .map((c) => c.key);

  const ready_for_production = missing_required.length === 0;

  // Overall status
  const hasErrors = Object.values(checks).some((ch) => ch.status === "error");
  const hasWarnings = Object.values(checks).some(
    (ch) => ch.status === "warning" || ch.status === "missing",
  );

  const overallStatus: DetailedHealthReport["status"] = hasErrors
    ? "critical"
    : hasWarnings
      ? "degraded"
      : "healthy";

  const report: DetailedHealthReport = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: SERVICE_VERSION,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    checks,
    missing_required,
    missing_optional,
    ready_for_production,
  };

  const httpStatus = overallStatus === "critical" ? 503 : 200;
  return c.json(report, httpStatus);
});

export { health };

// ─── Startup config report ───────────────────────────────────────────────────

/**
 * Print a formatted config summary to stdout at API boot.
 *
 * Call this once after `assertProductionEnv()` in server.ts.
 * Never throws — catches all errors internally.
 */
export async function printStartupConfigReport(): Promise<void> {
  try {
    // Run live probes concurrently, with an overall cap of 3s
    const [dbResult, redisResult, meiliResult] = await Promise.race([
      Promise.all([checkDatabaseDetailed(), checkRedisDetailed(), checkMeilisearch()]),
      new Promise<[ConfigCheck, ConfigCheck, ConfigCheck]>((resolve) =>
        setTimeout(
          () =>
            resolve([
              { status: "error", message: "probe timed out" },
              { status: "error", message: "probe timed out" },
              { status: "error", message: "probe timed out" },
            ]),
          3000,
        ),
      ),
    ]);

    const googleResult = checkGoogleOAuth();
    const jwtResult = checkJwtSecret();
    const webauthnResult = checkWebAuthn();
    const vapronResult = checkVapron();
    const anthropicResult = checkAnthropic();
    const stripeResult = checkStripe();

    const rows: Array<{ label: string; result: ConfigCheck }> = [
      { label: "Database", result: dbResult },
      { label: "JWT Secret", result: jwtResult },
      { label: "WebAuthn", result: webauthnResult },
      { label: "Google OAuth", result: googleResult },
      { label: "Redis", result: redisResult },
      { label: "Vapron", result: vapronResult },
      { label: "Anthropic AI", result: anthropicResult },
      { label: "Stripe", result: stripeResult },
      { label: "Meilisearch", result: meiliResult },
    ];

    const icon = (status: CheckStatus): string => {
      switch (status) {
        case "ok":
          return "✅";
        case "error":
          return "❌";
        case "warning":
          return "⚠️ ";
        case "missing":
          return "⚠️ ";
      }
    };

    const passed = rows.filter((r) => r.result.status === "ok").length;
    const total = rows.length;

    // Box width is fixed — label col = 14 chars, message col fills the rest
    const LINE_WIDTH = 54;
    const LABEL_COL = 14;
    const MESSAGE_COL = LINE_WIDTH - LABEL_COL - 6; // icon(3) + spaces

    const pad = (s: string, len: number): string => s.padEnd(len).slice(0, len);

    const border = "═".repeat(LINE_WIDTH);
    const divider = "╠" + border + "╣";

    const formatRow = (label: string, result: ConfigCheck): string => {
      const ic = icon(result.status);
      const lbl = pad(label, LABEL_COL);
      const msg = pad(result.message, MESSAGE_COL);
      return `║ ${ic} ${lbl} ${msg} ║`;
    };

    const titleLine = "AlecRae API — Config Check";
    const titlePadded = titleLine.padStart(Math.floor((LINE_WIDTH + titleLine.length) / 2)).padEnd(LINE_WIDTH);

    console.log("\n╔" + border + "╗");
    console.log("║" + titlePadded + "║");
    console.log(divider);
    for (const row of rows) {
      console.log(formatRow(row.label, row.result));
    }
    console.log("╚" + border + "╝");

    const readyStr = passed === total ? "✅ All systems go" : `${passed}/${total} checks passed`;
    console.log(`  ${readyStr}\n`);
  } catch (err) {
    // Never throw from here — the API must keep booting regardless
    console.warn("[startup] Config report failed:", err);
  }
}
