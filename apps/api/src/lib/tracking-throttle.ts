/**
 * Recording throttle for the public tracking endpoints.
 *
 * `/t/*` is mounted with no rate limiting at all — deliberately, because mail
 * clients hit it without a session. But each request for a VALID email id
 * costs a database insert *and* enqueues a webhook delivery to the customer's
 * own endpoint. Anyone holding a single tracking URL — the recipient, anyone
 * they forwarded the message to — could therefore make us emit unlimited
 * outbound webhook calls at a customer's receiver and fill the events table,
 * from an endpoint that requires no credentials.
 *
 * ── Why this throttles per EMAIL and not per IP ─────────────────────────────
 * Gmail, Yahoo and Apple fetch tracking pixels through image proxies: a few
 * proxy IPs fetch on behalf of enormous numbers of unrelated recipients. A
 * per-IP limit tight enough to matter would silently drop open tracking for
 * every Gmail recipient we have — a self-inflicted outage of exactly the
 * engagement data the send-time predictor and warm-up gates depend on.
 *
 * Keying on the email id inverts that: a proxy fetching for 10,000 recipients
 * touches 10,000 different ids and never approaches the limit, while a flood
 * against one message is caught immediately. The abuse is inherently
 * per-message, so that is the axis to measure.
 *
 * ── Throttled, not rejected ─────────────────────────────────────────────────
 * Over-limit requests still get their pixel and still follow their redirect.
 * Only the *recording* stops. Breaking a real recipient's link to protect our
 * own analytics would be a far worse trade than losing a duplicate open event.
 */

import Redis from "ioredis";

/**
 * Opens per email per hour before we stop recording. A person genuinely
 * re-reading a message might trip a handful; hundreds is not a person.
 */
const DEFAULT_LIMIT_PER_HOUR = 120;

/** Unsubscribes are idempotent, so a second one carries no information. */
const UNSUBSCRIBE_LIMIT_PER_HOUR = 10;

const WINDOW_SECONDS = 60 * 60;

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
    redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false });
    redis.on("error", () => {
      // Handled per call; the listener only stops an unhandled 'error' event
      // from taking the process down.
    });
    return redis;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

/** Per-process fallback counters, keyed the same way as the Redis keys. */
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function bumpMemory(key: string, now: number): number {
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

// Bounded cleanup so the fallback map cannot grow without limit under the very
// flood it exists to survive.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryCounters) {
    if (entry.expiresAt <= now) memoryCounters.delete(key);
  }
}, 5 * 60_000).unref();

function limitFor(eventType: string): number {
  return eventType.includes("unsubscribe")
    ? UNSUBSCRIBE_LIMIT_PER_HOUR
    : DEFAULT_LIMIT_PER_HOUR;
}

/**
 * Should this tracking event be persisted?
 *
 * Never throws and never blocks the response — on any storage failure it
 * returns true, because losing engagement data to an infrastructure blip is
 * worse than the flood this guards against, and the per-process counter still
 * bounds the damage.
 */
export async function shouldRecordTrackingEvent(
  emailId: string,
  eventType: string,
  now: number = Date.now(),
): Promise<boolean> {
  const limit = limitFor(eventType);
  const key = `tracking:throttle:${emailId}:${eventType}`;

  const client = getRedis();
  if (client) {
    try {
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, WINDOW_SECONDS);
      return count <= limit;
    } catch {
      // Fall through to the in-process counter.
    }
  }

  return bumpMemory(key, now) <= limit;
}

/** Test seam: drop cached state so counters and the client start clean. */
export function resetTrackingThrottleForTests(): void {
  memoryCounters.clear();
  redis = null;
  redisUnavailable = false;
}
