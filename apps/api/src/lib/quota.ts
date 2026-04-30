/**
 * Hard Quota Enforcement — Redis-backed monthly email counter
 *
 * Provides atomic quota checking and incrementing backed by Upstash Redis,
 * with a Postgres fallback when Redis is unavailable.
 *
 * Key format: `quota:${accountId}:${YYYY-MM}`
 * Increment happens at enqueue time (the commitment point), not on send.
 */

import Redis from "ioredis";
import { eq, and, gte, sql } from "drizzle-orm";
import { getDatabase, accounts, events } from "@alecrae/db";
import { PLANS } from "./billing.js";
import type { PlanId } from "./billing.js";

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
        console.warn("[quota] Redis error, falling back to DB:", err.message);
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function currentMonthKey(accountId: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `quota:${accountId}:${yyyy}-${mm}`;
}

/**
 * Return the start of the next UTC month as an ISO string.
 */
function nextMonthReset(): string {
  const now = new Date();
  const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

/**
 * Seconds remaining until the first instant of next UTC month.
 * Used as the Redis key TTL so counters auto-expire.
 */
function secondsUntilNextMonth(): number {
  const now = new Date();
  const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return Math.max(1, Math.ceil((nextMonth.getTime() - now.getTime()) / 1000));
}

// ─── Quota result ─────────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean;
  plan: PlanId;
  limit: number;
  sent: number;
  resetsAt: string;
}

// ─── Redis-backed count ───────────────────────────────────────────────────

async function getCountFromRedis(accountId: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const key = currentMonthKey(accountId);
    const val = await redis.get(key);
    return val !== null ? parseInt(val, 10) : 0;
  } catch {
    return null;
  }
}

/**
 * DB fallback: count queued events for this account in the current UTC month.
 * Uses the events table as the source of truth when Redis is unavailable.
 */
async function getCountFromDb(accountId: string): Promise<number> {
  const db = getDatabase();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(
      and(
        eq(events.accountId, accountId),
        eq(events.type, "email.queued"),
        gte(events.timestamp, startOfMonth),
      ),
    );

  return Number(result?.count ?? 0);
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Check whether the account has quota remaining for at least one more send.
 * Returns the current usage and plan info regardless of the outcome.
 *
 * This is a READ-ONLY check. Use `incrementQuota` after enqueue.
 */
export async function checkQuota(accountId: string): Promise<QuotaCheckResult> {
  const db = getDatabase();
  const resetsAt = nextMonthReset();

  // Look up the account's plan
  const [account] = await db
    .select({
      planTier: accounts.planTier,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const plan = ((account?.planTier ?? "free") as PlanId);
  const limit = (PLANS[plan] ?? PLANS.free).emailsPerMonth;

  // Try Redis first, fall back to DB
  let sent = await getCountFromRedis(accountId);
  if (sent === null) {
    sent = await getCountFromDb(accountId);
  }

  return {
    allowed: sent < limit,
    plan,
    limit,
    sent,
    resetsAt,
  };
}

/**
 * Atomically increment the quota counter AFTER successful enqueue.
 * Fire-and-forget safe — failures are logged but do not block the caller.
 */
export async function incrementQuota(accountId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return; // DB counter is updated separately by the existing code

  try {
    const key = currentMonthKey(accountId);
    const pipeline = redis.multi();
    pipeline.incr(key);
    pipeline.expire(key, secondsUntilNextMonth());
    await pipeline.exec();
  } catch (err) {
    console.warn("[quota] Failed to increment Redis counter:", (err as Error).message);
  }
}

/**
 * Gracefully close the quota Redis connection. Call during app shutdown.
 */
export async function closeQuotaRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => {
      /* intentional no-op: best-effort shutdown */
    });
    redisClient = null;
  }
}
