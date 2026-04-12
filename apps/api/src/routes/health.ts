/**
 * Health Check Endpoint
 *
 * GET /v1/health — Returns service health with dependency checks.
 *
 * This route is intentionally NOT behind auth middleware so that
 * load balancers and monitoring systems can probe it freely.
 */

import { Hono } from "hono";
import { getDatabase } from "@emailed/db";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { Queue } from "bullmq";

const health = new Hono();

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVICE_VERSION = process.env["SERVICE_VERSION"] ?? "0.1.0";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const MTA_QUEUE_NAME = process.env["MTA_QUEUE_NAME"] ?? "emailed:outbound";
const startedAt = Date.now();

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
    await db.execute(sql`SELECT 1`);
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
  const start = Date.now();
  let client: Redis | null = null;
  try {
    client = new Redis(REDIS_URL, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
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
  const start = Date.now();
  let queue: Queue | null = null;
  try {
    queue = new Queue(MTA_QUEUE_NAME, {
      connection: { url: REDIS_URL },
    });
    await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
    );
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

// Deep health check with dependency verification
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

export { health };
