/**
 * AI usage quota — Redis-backed monthly call counter.
 *
 * Mirrors quota.ts's email-sending quota (same Redis instance, same
 * month-bucketed key + TTL pattern) but for Claude/Whisper API calls, which
 * previously had no ceiling anywhere in the codebase — the AI audit flagged
 * this explicitly: "a single compromised or shared API key has no ceiling
 * on Claude spend."
 *
 * Redis-only, deliberately — there's no equivalent "ai.call" events table
 * to fall back to the way quota.ts falls back to counting `email.queued`
 * events. If Redis is unavailable, checkAiQuota() fails open (allowed:
 * true) rather than blocking every AI feature account-wide on a Redis
 * outage — the same risk tolerance middleware/usage.ts already accepts for
 * email quota ("log but allow the request through to avoid blocking sends
 * due to billing system outages").
 */

import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { getDatabase, accounts } from "@alecrae/db";
import { PLANS } from "./billing.js";
import type { PlanId } from "./billing.js";

const REDIS_URL =
  process.env["REDIS_URL"] ??
  process.env["UPSTASH_REDIS_URL"] ??
  "redis://localhost:6379";

let redisClient: Redis | null = null;
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
        if (redisReady) {
          console.warn("[ai-quota] Redis error, AI quota unenforced until it recovers:", err.message);
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
  return redisReady ? redisClient : null;
}

function currentMonthKey(accountId: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `ai-quota:${accountId}:${yyyy}-${mm}`;
}

function nextMonthReset(): string {
  const now = new Date();
  const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

function secondsUntilNextMonth(): number {
  const now = new Date();
  const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return Math.max(1, Math.ceil((nextMonth.getTime() - now.getTime()) / 1000));
}

export interface AiQuotaCheckResult {
  allowed: boolean;
  enforced: boolean;
  plan: PlanId;
  limit: number;
  used: number;
  resetsAt: string;
}

/** Read-only check. Use incrementAiQuota() after a successful AI call. */
export async function checkAiQuota(accountId: string): Promise<AiQuotaCheckResult> {
  const resetsAt = nextMonthReset();
  const db = getDatabase();

  const [account] = await db
    .select({ planTier: accounts.planTier })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const plan = (account?.planTier ?? "free") as PlanId;
  const limit = (PLANS[plan] ?? PLANS.free).aiCallsPerMonth;

  const redis = getRedis();
  if (!redis) {
    // Fail open — see module doc.
    return { allowed: true, enforced: false, plan, limit, used: 0, resetsAt };
  }

  try {
    const val = await redis.get(currentMonthKey(accountId));
    const used = val !== null ? parseInt(val, 10) : 0;
    return { allowed: used < limit, enforced: true, plan, limit, used, resetsAt };
  } catch {
    return { allowed: true, enforced: false, plan, limit, used: 0, resetsAt };
  }
}

/** Fire-and-forget safe — call after a successful AI call. */
export async function incrementAiQuota(accountId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = currentMonthKey(accountId);
    const pipeline = redis.multi();
    pipeline.incr(key);
    pipeline.expire(key, secondsUntilNextMonth());
    await pipeline.exec();
  } catch (err) {
    console.warn("[ai-quota] Failed to increment counter:", (err as Error).message);
  }
}

export async function closeAiQuotaRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => {
      /* intentional no-op: best-effort shutdown */
    });
    redisClient = null;
  }
}
