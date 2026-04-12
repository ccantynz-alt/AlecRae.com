/**
 * Idempotency Key Middleware
 *
 * Prevents duplicate side-effects when a client retries a request.
 *
 * Behaviour:
 *  - Extracts `Idempotency-Key` header from the request.
 *  - If absent, the request proceeds without idempotency (backwards compatible).
 *  - If present, the key must be a valid UUID v4.
 *  - Checks Redis for `idempotency:${accountId}:${key}`.
 *    - Cache hit  -> returns the cached JSON response with `X-Idempotent-Replayed: true`.
 *    - Cache miss -> proceeds to the handler, then caches the response for 24h.
 *
 * Redis client: re-uses the same ioredis pattern as the existing quota/rate-limit modules.
 */

import { createMiddleware } from "hono/factory";
import Redis from "ioredis";

// ─── UUID v4 validation ────────────────────────────────────────────────────

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidIdempotencyKey(key: string): boolean {
  return UUID_V4_RE.test(key);
}

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
        console.warn("[idempotency] Redis error, proceeding without cache:", err.message);
        redisAvailable = false;
        redisClient?.disconnect();
        redisClient = null;
      });

      redisClient.on("connect", () => {
        redisAvailable = true;
      });

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
    redisAvailable = true;
    redisClient = null;
  }
}, 30_000).unref();

// ─── Constants ─────────────────────────────────────────────────────────────

const TTL_SECONDS = 24 * 60 * 60; // 24 hours

// ─── Middleware factory ────────────────────────────────────────────────────

/**
 * Creates a Hono middleware that enforces request-level idempotency.
 *
 * Usage:
 * ```ts
 * app.post("/v1/messages/send", idempotency(), ...otherMiddleware, handler);
 * ```
 */
export function idempotency() {
  return createMiddleware(async (c, next) => {
    const idempotencyKey = c.req.header("Idempotency-Key");

    // No header -> proceed without idempotency (backwards compatible)
    if (!idempotencyKey) {
      await next();
      return;
    }

    // Validate key format
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message:
              "Idempotency-Key must be a valid UUID v4 (e.g. 550e8400-e29b-41d4-a716-446655440000).",
            code: "invalid_idempotency_key",
          },
        },
        400,
      );
    }

    const redis = getRedis();

    // If Redis is unavailable, degrade gracefully — proceed without caching
    if (!redis) {
      await next();
      return;
    }

    // Build the cache key scoped to the authenticated account
    const auth = c.get("auth");
    const accountId = auth?.accountId ?? "anonymous";
    const cacheKey = `idempotency:${accountId}:${idempotencyKey}`;

    // ── Check for a cached response ──────────────────────────────────
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          status: number;
          body: unknown;
        };
        c.header("X-Idempotent-Replayed", "true");
        return c.json(parsed.body as Record<string, unknown>, parsed.status as 200);
      }
    } catch {
      // Cache read failed — proceed normally
    }

    // ── Execute the handler ──────────────────────────────────────────
    await next();

    // ── Cache the response (fire-and-forget) ─────────────────────────
    try {
      const status = c.res.status;
      // Only cache successful responses (2xx)
      if (status >= 200 && status < 300) {
        // Clone the response so we can read the body without consuming it
        const cloned = c.res.clone();
        const body = await cloned.json();
        const payload = JSON.stringify({ status, body });
        await redis.set(cacheKey, payload, "EX", TTL_SECONDS);
      }
    } catch {
      // Cache write failed — the request succeeded, so this is non-critical
    }
  });
}

/**
 * Gracefully close the idempotency Redis connection. Call during app shutdown.
 */
export async function closeIdempotencyRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
  }
}

// Export for testing
export { isValidIdempotencyKey };
