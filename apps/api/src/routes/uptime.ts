/**
 * Uptime / Status Route (Gap G6) — Public Component Uptime Endpoint
 *
 * GET /v1/uptime — Aggregates live health probes (DB, Redis, Search, AI, MTA,
 *   Web App) into a status payload AND computes real uptime % over rolling
 *   windows (24h / 7d / 90d) from recorded probe samples.
 *
 * This route is intentionally NOT behind auth middleware so that the status
 * page (status.alecrae.com) and external monitoring can probe it freely.
 * It is mounted with `readRateLimit` in server.ts (light, public rate limit),
 * matching how other public read endpoints (e.g. /v1/changelog GETs) are done.
 *
 * ── Honesty contract (CLAUDE.md: "NEVER fabricate uptime numbers") ──
 * Real *historical* uptime requires the OpenTelemetry → Grafana backend
 * described in CLAUDE.md, which is not yet queryable. Until that exists, this
 * route records each live probe result into a rolling Redis sorted-set ledger
 * (one entry per component per probe) and derives uptime from THOSE recorded
 * samples only. Each GET also records a fresh sample so the ledger fills over
 * time. When a window has no recorded samples (fresh deploy, Redis down, or
 * fallback in-memory store emptied on restart), uptime is reported as `null`
 * ("unknown") — it is never invented.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getDatabase } from "@alecrae/db";
import { sql } from "drizzle-orm";
import Redis from "ioredis";

const uptime = new Hono();

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVICE_VERSION = process.env["SERVICE_VERSION"] ?? "0.1.0";
const REDIS_URL =
  process.env["REDIS_URL"] ??
  process.env["UPSTASH_REDIS_URL"] ??
  "redis://localhost:6379";
const MEILISEARCH_URL =
  process.env["MEILISEARCH_URL"] ?? "http://localhost:7700";
const ANTHROPIC_API_KEY =
  process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

const startedAt = Date.now();

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const RETENTION_MS = 90 * MS_PER_DAY;
const REDIS_KEY_PREFIX = "alecrae:uptime:";

// ─── Component identity ──────────────────────────────────────────────────────

const COMPONENTS = [
  { key: "web", name: "Web App", description: "mail.alecrae.com — AlecRae inbox UI" },
  { key: "database", name: "Database (Neon Postgres)", description: "Primary database — Neon Serverless Postgres" },
  { key: "redis", name: "Cache (Upstash Redis)", description: "Cache and queue — Upstash Redis" },
  { key: "search", name: "Search (Meilisearch)", description: "Full-text search — Meilisearch" },
  { key: "ai", name: "AI Services (Claude)", description: "AI inference — Claude API (Anthropic)" },
  { key: "mta", name: "Email Delivery (MTA)", description: "Inbound MX + outbound SMTP — Fly.io" },
] as const;

type ComponentKey = (typeof COMPONENTS)[number]["key"];

// ─── Zod schemas (validated at the API boundary) ────────────────────────────

const ServiceStatusSchema = z.enum(["operational", "degraded", "outage", "unknown"]);

const UptimeWindowSchema = z.object({
  /** Uptime percentage, or null when no samples have been recorded yet. */
  percentage: z.number().min(0).max(100).nullable(),
  /** Number of probe samples this percentage is computed from (0 = unknown). */
  sampleCount: z.number().int().min(0),
});

const ComponentUptimeSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  status: ServiceStatusSchema,
  latencyMs: z.number().int().min(0),
  error: z.string().optional(),
  uptime: z.object({
    day: UptimeWindowSchema,
    week: UptimeWindowSchema,
    quarter: UptimeWindowSchema,
  }),
});

const UptimeResponseSchema = z.object({
  overall: ServiceStatusSchema,
  version: z.string(),
  /** API process uptime in seconds (how long this server instance has run). */
  apiUptimeSeconds: z.number().int().min(0),
  timestamp: z.string(),
  /** True when historical uptime is backed by recorded samples. */
  historyAvailable: z.boolean(),
  /** Honest note about where the uptime numbers come from. */
  historyNote: z.string(),
  components: z.array(ComponentUptimeSchema),
});

export type UptimeResponse = z.infer<typeof UptimeResponseSchema>;
type ProbeStatus = "operational" | "degraded" | "outage";

interface ProbeResult {
  readonly status: ProbeStatus;
  readonly latencyMs: number;
  readonly error?: string;
}

// ─── Probe helpers (same probes as the health route, kept self-contained) ────

async function probeDatabase(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const db = getDatabase();
    await db.execute(sql`SELECT 1`);
    return { status: "operational", latencyMs: Date.now() - start };
  } catch (error: unknown) {
    return {
      status: "outage",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeRedis(): Promise<ProbeResult> {
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
    const latencyMs = Date.now() - start;
    await client.quit();
    return { status: "operational", latencyMs };
  } catch (error: unknown) {
    try {
      await client?.quit();
    } catch {
      // Ignore cleanup errors
    }
    return {
      status: "outage",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeSearch(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${MEILISEARCH_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return { status: "operational", latencyMs: Date.now() - start };
    }
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      error: `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      status: "outage",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeAI(): Promise<ProbeResult> {
  const start = Date.now();

  if (!ANTHROPIC_API_KEY) {
    return {
      status: "degraded",
      latencyMs: 0,
      error: "API key not configured",
    };
  }

  try {
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

    // 429 means rate limited but the API is reachable.
    if (response.ok) {
      return { status: "operational", latencyMs: Date.now() - start };
    }
    if (response.status === 429) {
      return {
        status: "degraded",
        latencyMs: Date.now() - start,
        error: "Rate limited",
      };
    }
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      error: `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      status: "outage",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * MTA / Web App: we do not currently run an authoritative live probe for these
 * from inside the API process (the MTA is a separate Fly.io service, and the
 * web app serving this request implies the edge is up). We report them based
 * on their dependency health rather than inventing a number. If a real probe
 * is added later, swap these for it.
 */
function deriveMtaStatus(redis: ProbeResult): ProbeResult {
  // The MTA queue rides on Redis; if Redis is down, outbound mail is impacted.
  if (redis.status === "outage") {
    return { status: "degraded", latencyMs: 0, error: "Queue backend (Redis) unreachable" };
  }
  return { status: "operational", latencyMs: 0 };
}

function deriveWebStatus(): ProbeResult {
  // This request reaching the API means the edge/API tier is serving traffic.
  return { status: "operational", latencyMs: 0 };
}

// ─── Rolling sample ledger (Redis sorted set, in-memory fallback) ───────────

/** Each recorded sample: 1 = up (operational), 0 = not fully up. */
interface Sample {
  readonly timestamp: number;
  readonly up: 0 | 1;
}

// In-memory fallback. Lost on restart — that's fine, we report "unknown" then.
const memoryLedger = new Map<ComponentKey, Sample[]>();

let ledgerRedis: Redis | null = null;
let ledgerRedisAvailable = true;

function getLedgerRedis(): Redis | null {
  if (!ledgerRedisAvailable) return null;
  if (ledgerRedis) return ledgerRedis;
  try {
    ledgerRedis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    ledgerRedis.on("error", () => {
      ledgerRedisAvailable = false;
      ledgerRedis?.disconnect();
      ledgerRedis = null;
    });
    ledgerRedis.connect().catch(() => {
      ledgerRedisAvailable = false;
      ledgerRedis = null;
    });
    return ledgerRedis;
  } catch {
    ledgerRedisAvailable = false;
    ledgerRedis = null;
    return null;
  }
}

function statusToUp(status: ProbeStatus): 0 | 1 {
  return status === "operational" ? 1 : 0;
}

async function recordSample(key: ComponentKey, status: ProbeStatus, now: number): Promise<void> {
  const up = statusToUp(status);
  const redis = getLedgerRedis();

  if (redis) {
    try {
      const redisKey = `${REDIS_KEY_PREFIX}${key}`;
      // member must be unique per timestamp; encode up-bit alongside ts.
      const member = `${now}:${up}`;
      await redis
        .multi()
        .zadd(redisKey, now, member)
        .zremrangebyscore(redisKey, 0, now - RETENTION_MS)
        .pexpire(redisKey, RETENTION_MS)
        .exec();
      return;
    } catch {
      // Fall through to in-memory on any Redis error.
    }
  }

  const existing = memoryLedger.get(key) ?? [];
  existing.push({ timestamp: now, up });
  const cutoff = now - RETENTION_MS;
  memoryLedger.set(
    key,
    existing.filter((s) => s.timestamp >= cutoff),
  );
}

async function readSamples(key: ComponentKey, sinceMs: number): Promise<readonly Sample[]> {
  const redis = getLedgerRedis();
  if (redis) {
    try {
      const redisKey = `${REDIS_KEY_PREFIX}${key}`;
      const members = await redis.zrangebyscore(redisKey, sinceMs, "+inf");
      return members.map((m): Sample => {
        const sep = m.lastIndexOf(":");
        const ts = Number(m.slice(0, sep));
        const up = m.slice(sep + 1) === "1" ? 1 : 0;
        return { timestamp: ts, up };
      });
    } catch {
      // Fall through to in-memory.
    }
  }
  const existing = memoryLedger.get(key) ?? [];
  return existing.filter((s) => s.timestamp >= sinceMs);
}

function computeWindow(samples: readonly Sample[]): z.infer<typeof UptimeWindowSchema> {
  if (samples.length === 0) {
    return { percentage: null, sampleCount: 0 };
  }
  const upCount = samples.reduce((acc, s) => acc + s.up, 0);
  const pct = (upCount / samples.length) * 100;
  // Clamp + round to 3 decimals; never exceed bounds.
  const rounded = Math.min(100, Math.max(0, Math.round(pct * 1000) / 1000));
  return { percentage: rounded, sampleCount: samples.length };
}

// ─── Route ──────────────────────────────────────────────────────────────────

uptime.get("/", async (c) => {
  const now = Date.now();

  // Run independent live probes in parallel.
  const [database, redis, search, ai] = await Promise.all([
    probeDatabase(),
    probeRedis(),
    probeSearch(),
    probeAI(),
  ]);
  const mta = deriveMtaStatus(redis);
  const web = deriveWebStatus();

  const probes: Readonly<Record<ComponentKey, ProbeResult>> = {
    web,
    database,
    redis,
    search,
    ai,
    mta,
  };

  // Record fresh samples (best-effort; never blocks the response on failure).
  await Promise.all(
    COMPONENTS.map((comp) => recordSample(comp.key, probes[comp.key].status, now)),
  );

  // Read rolling windows from the ledger and assemble per-component payloads.
  const components = await Promise.all(
    COMPONENTS.map(async (comp) => {
      const probe = probes[comp.key];
      const [day, week, quarter] = await Promise.all([
        readSamples(comp.key, now - MS_PER_DAY).then(computeWindow),
        readSamples(comp.key, now - 7 * MS_PER_DAY).then(computeWindow),
        readSamples(comp.key, now - RETENTION_MS).then(computeWindow),
      ]);
      return {
        key: comp.key,
        name: comp.name,
        description: comp.description,
        status: probe.status as z.infer<typeof ServiceStatusSchema>,
        latencyMs: probe.latencyMs,
        ...(probe.error ? { error: probe.error } : {}),
        uptime: { day, week, quarter },
      };
    }),
  );

  // Overall status from current live probes.
  const statuses = components.map((s) => s.status);
  let overall: z.infer<typeof ServiceStatusSchema>;
  if (statuses.every((s) => s === "operational")) {
    overall = "operational";
  } else if (statuses.filter((s) => s === "outage").length > 2) {
    overall = "outage";
  } else {
    overall = "degraded";
  }

  const historyAvailable = components.some((comp) => comp.uptime.quarter.sampleCount > 0);

  const responseBody: UptimeResponse = {
    overall,
    version: SERVICE_VERSION,
    apiUptimeSeconds: Math.floor((now - startedAt) / 1000),
    timestamp: new Date(now).toISOString(),
    historyAvailable,
    historyNote: historyAvailable
      ? "Uptime % is computed from recorded health-probe samples. Long-term historical accuracy improves as the OpenTelemetry → Grafana backend (see CLAUDE.md) is wired in."
      : "No probe history recorded yet — uptime percentages are reported as unknown until samples accumulate. Real historical uptime requires the OpenTelemetry → Grafana backend (see CLAUDE.md).",
    components,
  };

  // Validate the payload shape at the boundary before sending.
  const parsed = UptimeResponseSchema.parse(responseBody);

  const statusCode = overall === "outage" ? 503 : 200;
  return c.json(parsed, statusCode);
});

export { uptime, UptimeResponseSchema };
