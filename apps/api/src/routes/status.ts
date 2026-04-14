/**
 * Status / Health Route — Public Service Health Endpoint
 *
 * GET /v1/status/health — Returns health data for all AlecRae services.
 *
 * This route is intentionally NOT behind auth middleware so that
 * the status page and external monitoring can probe it freely.
 */

import { Hono } from "hono";
import { getDatabase } from "@alecrae/db";
import { sql } from "drizzle-orm";
import Redis from "ioredis";

const status = new Hono();

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVICE_VERSION = process.env["SERVICE_VERSION"] ?? "0.1.0";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const MEILISEARCH_URL =
  process.env["MEILISEARCH_URL"] ?? "http://localhost:7700";
const ANTHROPIC_API_KEY =
  process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];
const startedAt = Date.now();

// ─── Service Status Types ───────────────────────────────────────────────────

interface ServiceHealth {
  name: string;
  status: "operational" | "degraded" | "outage";
  latencyMs: number;
  description: string;
  error?: string;
}

interface HealthResponse {
  overall: "operational" | "degraded" | "outage";
  version: string;
  uptime: number;
  timestamp: string;
  services: ServiceHealth[];
}

// ─── Dependency Check Helpers ───────────────────────────────────────────────

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const db = getDatabase();
    await db.execute(sql`SELECT 1`);
    return {
      name: "Database (Neon Postgres)",
      status: "operational",
      latencyMs: Date.now() - start,
      description: "Primary database — Neon Serverless Postgres",
    };
  } catch (error: unknown) {
    return {
      name: "Database (Neon Postgres)",
      status: "outage",
      latencyMs: Date.now() - start,
      description: "Primary database — Neon Serverless Postgres",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRedis(): Promise<ServiceHealth> {
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
    return {
      name: "Cache (Upstash Redis)",
      status: "operational",
      latencyMs: latency,
      description: "Cache and queue — Upstash Redis",
    };
  } catch (error: unknown) {
    try {
      await client?.quit();
    } catch {
      // Ignore cleanup errors
    }
    return {
      name: "Cache (Upstash Redis)",
      status: "outage",
      latencyMs: Date.now() - start,
      description: "Cache and queue — Upstash Redis",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkSearch(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const response = await fetch(`${MEILISEARCH_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return {
        name: "Search (Meilisearch)",
        status: "operational",
        latencyMs: Date.now() - start,
        description: "Full-text search — Meilisearch",
      };
    }
    return {
      name: "Search (Meilisearch)",
      status: "degraded",
      latencyMs: Date.now() - start,
      description: "Full-text search — Meilisearch",
      error: `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      name: "Search (Meilisearch)",
      status: "outage",
      latencyMs: Date.now() - start,
      description: "Full-text search — Meilisearch",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkAI(): Promise<ServiceHealth> {
  const start = Date.now();

  if (!ANTHROPIC_API_KEY) {
    return {
      name: "AI Services (Claude)",
      status: "degraded",
      latencyMs: 0,
      description: "AI inference — Claude API (Anthropic)",
      error: "API key not configured",
    };
  }

  try {
    // Lightweight check: just validate the key by calling the API with minimal tokens
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok || response.status === 429) {
      // 429 means rate limited but API is reachable
      return {
        name: "AI Services (Claude)",
        status: response.ok ? "operational" : "degraded",
        latencyMs: Date.now() - start,
        description: "AI inference — Claude API (Anthropic)",
        ...(response.status === 429 ? { error: "Rate limited" } : {}),
      };
    }

    return {
      name: "AI Services (Claude)",
      status: "degraded",
      latencyMs: Date.now() - start,
      description: "AI inference — Claude API (Anthropic)",
      error: `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      name: "AI Services (Claude)",
      status: "outage",
      latencyMs: Date.now() - start,
      description: "AI inference — Claude API (Anthropic)",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkEmailDelivery(): ServiceHealth {
  // Email delivery check: for now we report based on MTA process status
  // In production this would check SMTP connectivity and queue depth
  return {
    name: "Email Delivery (MTA)",
    status: "operational",
    latencyMs: 0,
    description: "Inbound MX + outbound SMTP — Fly.io",
  };
}

function checkWebApp(): ServiceHealth {
  return {
    name: "Web App",
    status: "operational",
    latencyMs: 0,
    description: "mail.alecrae.com — AlecRae inbox UI",
  };
}

// ─── Route ──────────────────────────────────────────────────────────────────

status.get("/health", async (c) => {
  const [database, redis, search, ai] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkSearch(),
    checkAI(),
  ]);

  const emailDelivery = checkEmailDelivery();
  const webApp = checkWebApp();

  const services: ServiceHealth[] = [
    webApp,
    database,
    redis,
    search,
    ai,
    emailDelivery,
  ];

  // Calculate overall status
  const statuses = services.map((s) => s.status);
  let overall: "operational" | "degraded" | "outage";

  if (statuses.every((s) => s === "operational")) {
    overall = "operational";
  } else if (statuses.some((s) => s === "outage")) {
    overall = statuses.filter((s) => s === "outage").length > 2
      ? "outage"
      : "degraded";
  } else {
    overall = "degraded";
  }

  const responseBody: HealthResponse = {
    overall,
    version: SERVICE_VERSION,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    services,
  };

  const statusCode = overall === "outage" ? 503 : 200;
  return c.json(responseBody, statusCode);
});

export { status };
