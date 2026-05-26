/**
 * Production Rate Limiting Middleware
 *
 * Sliding window rate limiter backed by Redis (ioredis) with automatic
 * fallback to an in-memory Map when Redis is unavailable.
 *
 * Provides two middleware factories:
 *   - rateLimitByIp(limit, windowMs)  — keyed by client IP address
 *   - rateLimitByKey(limit, windowMs) — keyed by authenticated API key ID
 *
 * Redis implementation uses sorted sets with MULTI/EXEC for atomic
 * sliding window counting. Each request is scored by its timestamp, and
 * expired entries are pruned on every check.
 *
 * Headers returned on every response:
 *   X-RateLimit-Limit     — max requests allowed in the window
 *   X-RateLimit-Remaining — requests remaining in the current window
 *   X-RateLimit-Reset     — Unix timestamp (seconds) when window resets
 *   Retry-After           — seconds until next request (only on 429)
 */

import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler } from "hono";
import Redis from "ioredis";

// ─── Redis connection (singleton, lazy) ────────────────────────────────────

const REDIS_URL =
  process.env["REDIS_URL"] ??
  process.env["UPSTASH_REDIS_URL"] ??
  "redis://localhost:6379";

let redisClient: Redis | null = null;
let redisAvailable = true;

function getRedis(): Redis | null {
  if (!redisAvailable) return null;

  if (!redisClient) {
    try {
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      redisClient.on("error", (err) => {
        console.warn("[rate-limit] Redis error, falling back to in-memory:", err.message);
        redisAvailable = false;
        redisClient?.disconnect();
        redisClient = null;
      });

      redisClient.on("connect", () => {
        redisAvailable = true;
      });

      // Attempt initial connection
      redisClient.connect().catch(() => {
        redisAvailable = false;
        redisClient = null;
      });
    } catch {
      redisAvailable = false;
      return null;
    }
  }

  return redisClient;
}

// Periodically retry Redis if it went down (every 30s)
setInterval(() => {
  if (!redisAvailable) {
    redisAvailable = true; // Allow next getRedis() to try reconnecting
    redisClient = null;
  }
}, 30_000).unref();

// ─── In-memory fallback store ──────────────────────────────────────────────

interface MemoryWindowEntry {
  timestamps: number[];
  lastCleanup: number;
}

const memoryStore = new Map<string, MemoryWindowEntry>();

// Periodic cleanup of stale entries (every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    // Remove entries that haven't been accessed in 5 minutes
    if (now - entry.lastCleanup > 300_000) {
      memoryStore.delete(key);
    }
  }
}, 60_000).unref();

// ─── Sliding window check: Redis ───────────────────────────────────────────

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix seconds
  retryAfterSec: number;
}

async function checkRedis(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const resetAt = Math.ceil((now + windowMs) / 1000);
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  // Atomic sliding window via MULTI/EXEC:
  // 1. Remove expired entries (score < windowStart)
  // 2. Add current request
  // 3. Count entries in window
  // 4. Set key expiry to window duration (auto-cleanup)
  const pipeline = redis.multi();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  if (!results) {
    // Pipeline failed; treat as allowed but with no info
    return { allowed: true, limit, remaining: limit - 1, resetAt, retryAfterSec: 0 };
  }

  // results[2] is the ZCARD response: [error, count]
  const count = (results[2]?.[1] as number) ?? 0;
  const remaining = Math.max(0, limit - count);
  const allowed = count <= limit;

  if (!allowed) {
    // Find the oldest entry to calculate retry-after
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    let retryAfterSec = Math.ceil(windowMs / 1000);
    if (oldest.length >= 2 && oldest[1] !== undefined) {
      const oldestTs = parseInt(oldest[1], 10);
      retryAfterSec = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));
    }
    return { allowed: false, limit, remaining: 0, resetAt, retryAfterSec };
  }

  return { allowed: true, limit, remaining, resetAt, retryAfterSec: 0 };
}

// ─── Sliding window check: In-memory fallback ─────────────────────────────

function checkMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const resetAt = Math.ceil((now + windowMs) / 1000);

  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [], lastCleanup: now };
    memoryStore.set(key, entry);
  }

  // Prune expired timestamps
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
  entry.lastCleanup = now;

  const count = entry.timestamps.length;

  if (count >= limit) {
    const oldest = entry.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, limit, remaining: 0, resetAt, retryAfterSec };
  }

  entry.timestamps.push(now);
  const remaining = Math.max(0, limit - entry.timestamps.length);
  return { allowed: true, limit, remaining, resetAt, retryAfterSec: 0 };
}

// ─── Unified check ─────────────────────────────────────────────────────────

async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (redis) {
    try {
      return await checkRedis(redis, key, limit, windowMs);
    } catch (err) {
      console.warn("[rate-limit] Redis check failed, using in-memory fallback:", (err as Error).message);
    }
  }
  return checkMemory(key, limit, windowMs);
}

// ─── Response helpers ──────────────────────────────────────────────────────

function setRateLimitHeaders(c: Context, result: RateLimitResult): void {
  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  c.header("X-RateLimit-Reset", String(result.resetAt));
}

function rateLimitResponse(c: Context, result: RateLimitResult): Response {
  setRateLimitHeaders(c, result);
  c.header("Retry-After", String(result.retryAfterSec));
  return c.json(
    {
      error: {
        type: "rate_limit_error",
        message: `Rate limit exceeded. Retry after ${result.retryAfterSec} seconds.`,
        code: "rate_limited",
        details: {
          limit: result.limit,
          retryAfterSeconds: result.retryAfterSec,
        },
      },
    },
    429,
  );
}

// ─── Client IP extraction ──────────────────────────────────────────────────

function getClientIp(c: Context): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    c.req.header("X-Real-IP") ??
    "unknown"
  );
}

// ─── Middleware factories ──────────────────────────────────────────────────

/**
 * Rate limit by client IP address.
 * Use for unauthenticated endpoints (auth, webhooks, health).
 */
export function rateLimitByIp(limit: number, windowMs: number): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c);
    const key = `rl:ip:${ip}:${c.req.routePath ?? c.req.path}`;
    const result = await checkRateLimit(key, limit, windowMs);

    setRateLimitHeaders(c, result);

    if (!result.allowed) {
      return rateLimitResponse(c, result);
    }

    await next();
    return;
  });
}

/**
 * Rate limit by authenticated API key / account ID.
 * Use for authenticated endpoints. Falls back to IP if no auth context.
 */
export function rateLimitByKey(limit: number, windowMs: number): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const auth = c.get("auth");
    const identifier = auth
      ? `rl:key:${auth.accountId}`
      : `rl:ip:${getClientIp(c)}`;
    const method = c.req.method;
    const key = `${identifier}:${method}:${c.req.routePath ?? c.req.path}`;
    const result = await checkRateLimit(key, limit, windowMs);

    setRateLimitHeaders(c, result);

    if (!result.allowed) {
      return rateLimitResponse(c, result);
    }

    await next();
    return;
  });
}

// ─── Pre-configured middleware for endpoint categories ─────────────────────

const ONE_MINUTE = 60_000;

/** Auth endpoints: 10 req/min per IP (brute force protection) */
export const authRateLimit = rateLimitByIp(10, ONE_MINUTE);

/** Send endpoint: 100 req/min per API key */
export const sendRateLimit = rateLimitByKey(100, ONE_MINUTE);

/** Read endpoints: 600 req/min per API key */
export const readRateLimit = rateLimitByKey(600, ONE_MINUTE);

/** Write endpoints: 200 req/min per API key */
export const writeRateLimit = rateLimitByKey(200, ONE_MINUTE);

/** Webhook endpoints: 30 req/min per IP */
export const webhookRateLimit = rateLimitByIp(30, ONE_MINUTE);

/** Search endpoint: 60 req/min per API key */
export const searchRateLimit = rateLimitByKey(60, ONE_MINUTE);

/** Global IP-based rate limit: 1000 req/min (DDoS baseline) */
export const globalIpRateLimit = rateLimitByIp(1000, ONE_MINUTE);

// ─── Cleanup on shutdown ───────────────────────────────────────────────────

export async function closeRateLimitRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => { /* ignore */ });
    redisClient = null;
  }
}
