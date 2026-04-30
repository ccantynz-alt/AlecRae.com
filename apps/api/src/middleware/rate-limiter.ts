import { createMiddleware } from "hono/factory";
import type { PlanTier } from "../types.js";
import { RATE_LIMITS } from "../types.js";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// In production, this would use Redis for distributed rate limiting.
const buckets = new Map<string, TokenBucket>();

// Periodic cleanup of stale buckets
const CLEANUP_INTERVAL_MS = 60_000;
const BUCKET_TTL_MS = 300_000;

let lastCleanup = Date.now();

function cleanupStaleBuckets(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > BUCKET_TTL_MS) {
      buckets.delete(key);
    }
  }
}

function refillBucket(bucket: TokenBucket, rps: number, burstSize: number): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(burstSize, bucket.tokens + elapsed * rps);
  bucket.lastRefill = now;
}

function tryConsume(key: string, tier: PlanTier): { allowed: boolean; remaining: number; resetMs: number } {
  cleanupStaleBuckets();

  const config = RATE_LIMITS[tier];
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: config.burstSize, lastRefill: Date.now() };
    buckets.set(key, bucket);
  }

  refillBucket(bucket, config.requestsPerSecond, config.burstSize);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetMs: Math.ceil((1 / config.requestsPerSecond) * 1000),
    };
  }

  const waitTime = Math.ceil(((1 - bucket.tokens) / config.requestsPerSecond) * 1000);
  return {
    allowed: false,
    remaining: 0,
    resetMs: waitTime,
  };
}

export const rateLimiter = createMiddleware(async (c, next) => {
  const auth = c.get("auth");
  if (!auth) {
    // Auth middleware should run first; skip rate limiting if no auth context
    await next();
    return;
  }

  const key = `rl:${auth.accountId}`;
  const tier = auth.tier;
  const config = RATE_LIMITS[tier];
  const result = tryConsume(key, tier);

  // Always set rate limit headers
  c.header("X-RateLimit-Limit", String(config.burstSize));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + Math.ceil(result.resetMs / 1000)));

  if (!result.allowed) {
    c.header("Retry-After", String(Math.ceil(result.resetMs / 1000)));
    return c.json(
      {
        error: {
          type: "rate_limit_error",
          message: `Rate limit exceeded. Retry after ${Math.ceil(result.resetMs / 1000)} seconds.`,
          code: "rate_limited",
          details: {
            tier,
            limit: config.requestsPerSecond,
            retryAfterMs: result.resetMs,
          },
        },
      },
      429,
    );
  }

  await next();
  return;
});
