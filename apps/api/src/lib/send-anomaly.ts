/**
 * Send-Volume Anomaly Detection — catches a compromised account mid-blast.
 *
 * WHY THIS EXISTS (Known Issue #117)
 * ----------------------------------
 * The only volume control on sending was a flat per-account rate limit sized
 * for legitimate heavy use. Nothing compared an account's current sending to
 * its OWN history, so an account that normally sends 20 emails an hour could
 * suddenly send thousands — every one of them individually under the ceiling,
 * all of them signed by us and relayed from our IP — and nothing would notice
 * until a blocklisting arrived. That is the shape of the incident in issue
 * #105, and the flat limit is exactly why it ran for nine days unseen.
 *
 * The outbound spam gate (outbound-spam-gate.ts) reads message *content*; this
 * reads *behaviour*. They catch different attacks: content scoring misses a
 * blast of individually-bland messages, and volume analysis misses a single
 * well-crafted phish. Both are needed.
 *
 * HOW THE THRESHOLD IS CHOSEN
 * ---------------------------
 * `max(floor, baseline × multiplier)` where the baseline is the account's own
 * mean hourly volume over the trailing week.
 *
 *   - The multiplier catches the "20/hour account suddenly sending 5,000"
 *     case that a flat ceiling cannot see.
 *   - The floor is what stops this from punishing normal growth and new
 *     accounts: an account with no history has a baseline of 0, and without a
 *     floor ANY send would look infinitely anomalous. A legitimate first
 *     campaign must not trip this.
 *
 * FAILURE BEHAVIOUR
 * -----------------
 * Redis primary, Postgres fallback (the same shape as quota.ts) so a Redis
 * outage does not blind the control — that would be the one moment an abuser
 * most wants it blind. Only if BOTH are unavailable does it fail open, and
 * loudly: refusing all mail because a counter is unreachable is a self-
 * inflicted outage, and the hard controls (warm-up, suppression, per-ISP
 * throttles, spam gate) still apply regardless.
 */

import Redis from "ioredis";
import { eq, and, gte, sql } from "drizzle-orm";
import { getDatabase, emails } from "@alecrae/db";

const REDIS_URL =
  process.env["REDIS_URL"] ??
  process.env["UPSTASH_REDIS_URL"] ??
  "redis://localhost:6379";

/** Never trip below this many sends in one hour, whatever the baseline. */
const DEFAULT_FLOOR = 200;
/** Trip when the hour exceeds this multiple of the account's own mean. */
const DEFAULT_MULTIPLIER = 10;
/** Days of history used to compute the baseline. */
const BASELINE_DAYS = 7;
const BASELINE_HOURS = BASELINE_DAYS * 24;
/** How long a computed baseline is cached, in seconds. */
const BASELINE_TTL = 3600;

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
      client.on("error", () => {
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

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Redis key for the current hour's send count. */
function hourKey(accountId: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return `sendvol:${accountId}:${stamp}`;
}

export interface SendAnomalyResult {
  /** False when this send should be refused. */
  allowed: boolean;
  /** Sends already recorded for this account this hour. */
  currentHour: number;
  /** The account's own mean hourly volume over the trailing week. */
  baseline: number;
  /** The computed trip threshold. */
  threshold: number;
  /** True when neither Redis nor Postgres could be consulted. */
  degraded: boolean;
}

/**
 * Mean hourly send volume for this account over the trailing week.
 * Cached in Redis so the aggregate is not recomputed on every send.
 */
async function getBaseline(accountId: string, now: Date): Promise<number> {
  const redis = getRedis();
  const cacheKey = `sendvol:baseline:${accountId}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        const n = Number(cached);
        if (Number.isFinite(n)) return n;
      }
    } catch {
      // fall through to recompute
    }
  }

  const since = new Date(now.getTime() - BASELINE_HOURS * 3600_000);
  // No initializer: both branches below assign, so a default here would only
  // hide which one actually ran.
  let mean: number;
  try {
    const db = getDatabase();
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(emails)
      .where(and(eq(emails.accountId, accountId), gte(emails.createdAt, since)));
    mean = Number(row?.total ?? 0) / BASELINE_HOURS;
  } catch {
    // No history available — treated as 0, so only the floor applies.
    mean = 0;
  }

  if (redis) {
    try {
      await redis.set(cacheKey, String(mean), "EX", BASELINE_TTL);
    } catch {
      // Caching is best-effort.
    }
  }
  return mean;
}

/** Count this hour's sends, preferring Redis and falling back to Postgres. */
async function getCurrentHourCount(
  accountId: string,
  now: Date,
): Promise<{ count: number; degraded: boolean }> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(hourKey(accountId, now));
      return { count: raw === null ? 0 : Number(raw) || 0, degraded: false };
    } catch {
      // fall through to Postgres
    }
  }

  try {
    const db = getDatabase();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(emails)
      .where(and(eq(emails.accountId, accountId), gte(emails.createdAt, hourStart)));
    return { count: Number(row?.total ?? 0), degraded: false };
  } catch {
    return { count: 0, degraded: true };
  }
}

/**
 * Decide whether this account's current sending rate looks like an incident.
 * Never throws — a failure returns `allowed: true, degraded: true`.
 */
export async function checkSendAnomaly(accountId: string): Promise<SendAnomalyResult> {
  const floor = envInt("SEND_ANOMALY_FLOOR", DEFAULT_FLOOR);
  const multiplier = envInt("SEND_ANOMALY_MULTIPLIER", DEFAULT_MULTIPLIER);
  const now = new Date();

  try {
    const [{ count: currentHour, degraded }, baseline] = await Promise.all([
      getCurrentHourCount(accountId, now),
      getBaseline(accountId, now),
    ]);

    const threshold = Math.max(floor, Math.ceil(baseline * multiplier));

    if (degraded) {
      console.error(
        `[send-anomaly] could not read send volume for account=${accountId} — allowing send (fail-open)`,
      );
      return { allowed: true, currentHour, baseline, threshold, degraded: true };
    }

    if (currentHour >= threshold) {
      console.error(
        `[send-anomaly] BLOCKED account=${accountId} currentHour=${currentHour} ` +
          `threshold=${threshold} baseline=${baseline.toFixed(2)}/hr — possible compromised account`,
      );
      return { allowed: false, currentHour, baseline, threshold, degraded: false };
    }

    return { allowed: true, currentHour, baseline, threshold, degraded: false };
  } catch (err) {
    console.error(
      `[send-anomaly] unexpected error for account=${accountId}: ${
        err instanceof Error ? err.message : String(err)
      } — allowing send (fail-open)`,
    );
    return { allowed: true, currentHour: 0, baseline: 0, threshold: 0, degraded: true };
  }
}

/**
 * Record a send against the current hour. Best-effort: a counter that fails to
 * increment must never fail the send that already happened.
 */
export async function recordSend(accountId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = hourKey(accountId, new Date());
    const count = await redis.incr(key);
    // Expire a little over two hours out so the key cannot leak if the
    // process dies between INCR and EXPIRE on a fresh key.
    if (count === 1) await redis.expire(key, 7500);
  } catch {
    // Postgres remains the fallback source of truth for the count.
  }
}
