/**
 * Per-account backoff after a provider rate-limits us.
 *
 * Gmail and Outlook sync had no 429 handling at all: a rate-limit response was
 * treated as an ordinary failure, and `resyncEligibleAccounts()` then retried
 * the same account on its next sweep a few minutes later — indefinitely, for
 * every affected account at once. Google's guidance on this is explicit, and
 * the consequence is not per-account: sustained disregard for 429 and
 * `Retry-After` gets throttling applied to the OAuth *client*, which would
 * break Gmail for every customer we have simultaneously. Our exposure on that
 * path is the app registration, not an IP.
 *
 * State lives in Redis rather than a new `connected_accounts` column: it is
 * ephemeral by nature, and a schema migration is Craig's call (Boss Rule #7).
 * Falls back to per-process memory, which is weaker across replicas but still
 * bounds the retry rate — the failure mode to avoid is not backing off at all.
 */

import Redis from "ioredis";

/**
 * Never retry sooner than this even if the provider says we may. A tighter
 * loop cannot help — the sweep only runs every few minutes anyway — and this
 * guards against a `Retry-After: 0`.
 */
const MIN_BACKOFF_SECONDS = 60;

/**
 * Never honour a backoff longer than this. A provider (or a proxy) returning
 * an absurd `Retry-After` must not silently disable a customer's mail sync for
 * days; at this point an operator should be looking at it instead.
 */
const MAX_BACKOFF_SECONDS = 60 * 60;

/** Used when a 429 arrives with no usable `Retry-After`. */
const DEFAULT_BACKOFF_SECONDS = 15 * 60;

let redis: Redis | null = null;
let redisUnavailable = false;

function getRedis(): Redis | null {
  if (redisUnavailable) return null;
  if (redis) return redis;

  const url = process.env["REDIS_URL"];
  if (!url) {
    redisUnavailable = true;
    return null;
  }
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 1 });
    redis.on("error", () => {
      // Handled per call; this listener only prevents an unhandled 'error'
      // event from taking the process down.
    });
    return redis;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

/** Fallback store: connected-account id → epoch ms when sync may resume. */
const memoryBackoff = new Map<string, number>();

function key(accountId: string): string {
  return `provider:backoff:${accountId}`;
}

/**
 * Parse an HTTP `Retry-After` header, which may be either a number of seconds
 * or an HTTP date. Returns seconds, or null if absent/unparseable.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!header) return null;

  const trimmed = header.trim();
  if (trimmed === "") return null;

  // Delta-seconds form.
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  // HTTP-date form.
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.ceil((asDate - now) / 1000));
  }

  return null;
}

/** Clamp a requested backoff into the range we are willing to honour. */
export function clampBackoffSeconds(seconds: number | null): number {
  if (seconds === null || !Number.isFinite(seconds)) {
    return DEFAULT_BACKOFF_SECONDS;
  }
  return Math.min(MAX_BACKOFF_SECONDS, Math.max(MIN_BACKOFF_SECONDS, Math.ceil(seconds)));
}

/**
 * Record that this account is rate-limited and must not be synced again until
 * the backoff expires. Never throws — a storage failure must not turn a
 * rate-limit into an unhandled error on the sweep.
 */
export async function recordProviderRateLimit(
  accountId: string,
  retryAfterHeader: string | null | undefined,
  now: number = Date.now(),
): Promise<number> {
  const seconds = clampBackoffSeconds(parseRetryAfter(retryAfterHeader, now));
  const resumeAt = now + seconds * 1000;

  const client = getRedis();
  if (client) {
    try {
      await client.set(key(accountId), String(resumeAt), "EX", seconds);
      return seconds;
    } catch {
      // Fall through to memory.
    }
  }

  memoryBackoff.set(accountId, resumeAt);
  return seconds;
}

/**
 * Is this account currently backing off? Returns the epoch ms at which sync
 * may resume, or null if it is clear to sync.
 *
 * Returns null (clear to sync) if the store is unreachable — a Redis outage
 * should not stop mail syncing entirely, and the memory fallback still applies
 * within each process.
 */
export async function getProviderBackoffUntil(
  accountId: string,
  now: number = Date.now(),
): Promise<number | null> {
  const client = getRedis();
  if (client) {
    try {
      const value = await client.get(key(accountId));
      if (value === null) return null;
      const resumeAt = Number(value);
      return Number.isFinite(resumeAt) && resumeAt > now ? resumeAt : null;
    } catch {
      // Fall through to memory.
    }
  }

  const resumeAt = memoryBackoff.get(accountId);
  if (resumeAt === undefined) return null;
  if (resumeAt <= now) {
    memoryBackoff.delete(accountId);
    return null;
  }
  return resumeAt;
}

/** Test seam: clear cached state between cases. */
export function resetProviderBackoffForTests(): void {
  memoryBackoff.clear();
  redis = null;
  redisUnavailable = false;
}
