/**
 * The single source of Redis connections for the API.
 *
 * Before this, eight modules each defined their own private `getRedis()` and
 * opened their own socket to the same Redis — rate limiting, idempotency, the
 * send quota, the AI quota, login protection, send-anomaly detection, the
 * tracking throttle and provider backoff — plus a ninth in `routes/uptime.ts`.
 * Six were byte-identical apart from a log prefix. A single API process held
 * 13-15 connections where one would do.
 *
 * The duplication was not just waste; it produced real defects. Two close
 * functions (`closeQuotaRedis`, `closeAiQuotaRedis`) existed with zero callers,
 * so they looked like shutdown coverage and were not. Four modules had no close
 * function at all. And the copies had drifted: six carried a readiness gate,
 * two did not — the two written most recently, which is the tell that
 * copy-paste was the mechanism rather than deliberate choice.
 *
 * ── Why ONE shared client rather than a pool ────────────────────────────────
 * ioredis multiplexes: commands from any number of callers are pipelined over
 * a single socket and matched to replies in order. The only things that take a
 * connection out of request/response service are `SUBSCRIBE` (the connection
 * enters pub/sub mode), blocking pops like `BRPOPLPUSH`, and interactive
 * `WATCH`/`MULTI`. **No caller in this codebase does any of them** — every use
 * is `get`/`set`/`incr`/`expire`/`zadd`/`multi()`, and ioredis `multi()` is a
 * pipelined `MULTI…EXEC` batch, not an interactive transaction. Separate
 * connections would therefore buy nothing but idle sockets.
 *
 * **Do not call `subscribe()`, a blocking pop, or `watch()` on the shared
 * client.** Any of them stops it answering for every other subsystem at once.
 * Use `createDedicatedRedis()` if you need one.
 *
 * BullMQ is deliberately excluded: its Workers issue blocking reads and it
 * requires `maxRetriesPerRequest: null`, which contradicts the setting here.
 * It builds its own correctly-configured clients from a `{ url }` object.
 */

import Redis, { type RedisOptions } from "ioredis";

/**
 * Promoted verbatim from `middleware/rate-limit.ts`, which had the most
 * careful implementation of the eight.
 *
 * `enableOfflineQueue: false` and the readiness gate below are a pair, not two
 * independent choices: with the queue disabled, a command issued before the
 * socket is writeable is rejected outright with "Stream isn't writeable"
 * instead of waiting. The gate is what stops that race on every process start
 * and every reconnect.
 */
const CLIENT_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  enableOfflineQueue: false,
};

/**
 * Every client this module hands out, so shutdown can close all of them
 * without each subsystem having to remember to expose a close function — which
 * is exactly what four of them forgot.
 */
const clients = new Set<Redis>();

let shared: Redis | null = null;
let sharedReady = false;

/**
 * Resolve the Redis URL, or null when none is configured.
 *
 * Read on every call rather than captured at module load. That is load-bearing
 * for tests: `provider-backoff.test.ts` and `tracking-throttle.test.ts` delete
 * `process.env.REDIS_URL` in `beforeEach` to force the in-memory path, which
 * only works if the value is read at connect time.
 *
 * There is deliberately no `redis://localhost:6379` default. In production it
 * never helped — a client pointed at a Redis that isn't there never becomes
 * ready, so the gate returns null and the caller takes its fallback anyway,
 * except now with a permanent reconnect loop underneath. Removing it makes
 * "configured" mean exactly one thing: an explicit URL is set.
 */
export function getRedisUrl(): string | null {
  const raw = process.env["REDIS_URL"] ?? process.env["UPSTASH_REDIS_URL"];
  const trimmed = raw?.trim();
  return trimmed !== undefined && trimmed !== "" ? trimmed : null;
}

/** True when an explicit Redis URL is configured. */
export function isRedisConfigured(): boolean {
  return getRedisUrl() !== null;
}

/** Attach lifecycle listeners and register a client for shutdown. */
function register(client: Redis): Redis {
  clients.add(client);
  client.on("end", () => {
    clients.delete(client);
  });
  return client;
}

/**
 * The shared command client, or null when Redis is unconfigured or not yet
 * writeable. A null return is normal and every caller already handles it by
 * falling back to in-process state — that is the contract, not an error path.
 */
export function getRedis(): Redis | null {
  if (!shared) {
    const url = getRedisUrl();
    if (url === null) return null;

    try {
      const client = new Redis(url, CLIENT_OPTIONS);

      client.on("ready", () => {
        sharedReady = true;
      });
      client.on("error", (err: Error) => {
        // Log only the transition to down; ioredis retries quietly and would
        // otherwise emit continuously for the whole outage.
        if (sharedReady) {
          console.warn(
            `[redis] connection lost, subsystems degrading to in-process fallbacks: ${err.message}`,
          );
        }
        sharedReady = false;
      });
      client.on("end", () => {
        sharedReady = false;
      });

      shared = register(client);
    } catch {
      return null;
    }
  }

  return sharedReady ? shared : null;
}

/**
 * A connection that will not be shared — for the modes that monopolise one
 * (pub/sub, blocking reads, interactive transactions).
 *
 * Exists so that needing one of those leads to a registered, closed connection
 * rather than to `new Redis(...)` in some other module, which is how the
 * sprawl this file replaces began. `label` appears in error logs.
 */
export function createDedicatedRedis(
  label: string,
  overrides: RedisOptions = {},
): Redis | null {
  const url = getRedisUrl();
  if (url === null) return null;

  try {
    const client = new Redis(url, { ...CLIENT_OPTIONS, ...overrides });
    client.on("error", (err: Error) => {
      console.warn(`[redis:${label}] ${err.message}`);
    });
    return register(client);
  } catch {
    return null;
  }
}

/**
 * A throwaway client for a health probe, which the caller must quit.
 *
 * Probes deliberately do NOT use the shared client: a probe answered from a
 * pooled connection reports that connection's cached state rather than testing
 * whether Redis is reachable, and the `latencyMs` these endpoints publish
 * currently includes the connect handshake. Reusing a warm socket would
 * silently change what that number means — and it feeds the uptime ledger.
 *
 * Registered anyway, so a probe leaked by a thrown request is still closed at
 * shutdown.
 */
export function createProbeRedis(overrides: RedisOptions = {}): Redis | null {
  const url = getRedisUrl();
  if (url === null) return null;

  try {
    return register(
      new Redis(url, { ...CLIENT_OPTIONS, lazyConnect: true, ...overrides }),
    );
  } catch {
    return null;
  }
}

/**
 * Close every client this module handed out.
 *
 * `quit()` on a client that never finished connecting can wait for the connect
 * timeout, so each is raced against `disconnect()`. Shutdown has a 15s
 * force-exit timer (`server.ts`) and a graceful close that trips it is not
 * graceful.
 */
export async function closeAllRedis(): Promise<void> {
  const snapshot = [...clients];
  clients.clear();
  shared = null;
  sharedReady = false;

  await Promise.all(
    snapshot.map(async (client) => {
      try {
        await Promise.race([
          client.quit(),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch {
        // Already closing or never connected.
      } finally {
        client.disconnect();
      }
    }),
  );
}

/**
 * Test seam: forget the shared client and the registry WITHOUT quitting, so a
 * suite that swapped `process.env.REDIS_URL` or mocked ioredis starts clean.
 */
export function __resetRedisForTests(): void {
  clients.clear();
  shared = null;
  sharedReady = false;
}
