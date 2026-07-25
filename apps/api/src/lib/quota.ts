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
// True only once the socket is "ready" to accept commands. Command issuance is
// gated on this so we never send before the connection is writeable — otherwise
// the first command races the connect and ioredis rejects it with "Stream isn't
// writeable" (enableOfflineQueue: false). ioredis reconnects in the background
// and re-fires "ready" when Redis returns, so no manual retry loop is needed.
let redisReady = false;

function getRedis(): Redis | null {
  if (!redisClient) {
    try {
      const client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        enableOfflineQueue: false,
      });

      client.on("ready", () => {
        redisReady = true;
      });
      client.on("error", (err) => {
        // Log only the first transition to down; ioredis retries quietly.
        if (redisReady) {
          console.warn("[quota] Redis error, falling back to DB:", err.message);
        }
        redisReady = false;
      });
      client.on("end", () => {
        redisReady = false;
      });

      redisClient = client;
    } catch {
      return null;
    }
  }

  // Until the connection is ready, callers fall back to the database.
  return redisReady ? redisClient : null;
}

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
 *
 * These rows are written by `incrementQuota()` on every enqueue. Until that was
 * wired, NOTHING in the codebase ever inserted an `email.queued` event, so this
 * query always returned 0 and the fallback silently disabled quota enforcement
 * entirely (see incrementQuota's doc comment).
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

/** Optional provenance for the durable `email.queued` row. */
export interface QueuedEmailRecord {
  emailId?: string;
  messageId?: string;
  recipient?: string;
}

/**
 * Record one queued email against the account's monthly quota, AFTER a
 * successful enqueue. Fire-and-forget safe — failures are logged, never thrown.
 *
 * Writes BOTH counters, deliberately:
 *
 *  - A durable `email.queued` event row. This is the source of truth
 *    `getCountFromDb()` reads whenever Redis is unavailable. It previously
 *    wrote nothing at all: the only reference to `"email.queued"` anywhere in
 *    the codebase was quota.ts's own SELECT, so the fallback counted 0 forever
 *    and `checkQuota()` returned `allowed: true` unconditionally — no account
 *    could ever exceed its plan limit's enforcement, and the 429 response
 *    reported "0 sent". That fired on any Redis blip AND on the first send
 *    after every API restart, because `getRedis()` returns null until the
 *    async "ready" event lands. The old code's comment here ("DB counter is
 *    updated separately by the existing code") described code that did not
 *    exist.
 *
 *  - The Redis month bucket, which `checkQuota()` prefers as the fast path.
 *
 * Writing both never double-counts: `checkQuota()` reads Redis OR the DB, never
 * sums them. Because the event row is written on every send regardless of Redis
 * health, a mid-month Redis outage falls back to a count that covers the whole
 * month rather than restarting from zero.
 */
export async function incrementQuota(
  accountId: string,
  record: QueuedEmailRecord = {},
): Promise<void> {
  // Durable counter first — it's the one enforcement falls back to.
  try {
    const db = getDatabase();
    await db.insert(events).values({
      id: crypto.randomUUID().replace(/-/g, ""),
      accountId,
      emailId: record.emailId ?? null,
      messageId: record.messageId ?? null,
      type: "email.queued",
      recipient: record.recipient ?? null,
    });
  } catch (err) {
    console.warn("[quota] Failed to record email.queued event:", (err as Error).message);
  }

  const redis = getRedis();
  if (!redis) return;

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
