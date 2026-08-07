/**
 * Shared BullMQ queue producer for the API service.
 *
 * Lazily initialises a single BullMQ `Queue` instance that feeds into the MTA
 * worker's outbound queue. The queue name and Redis URL are sourced from
 * environment variables so the API producer and MTA consumer always agree.
 *
 * Usage:
 *   import { getSendQueue, closeSendQueue } from "../lib/queue.js";
 *   const queue = getSendQueue();
 *   await queue.add(jobName, jobData, opts);
 */

import { Queue } from "bullmq";

// ─── Configuration (must match MTA worker defaults) ────────────────────────

// NOTE: BullMQ forbids ":" in queue names — use a hyphen. Keep in sync with the
// MTA worker default (services/mta) and the fly.toml MTA_QUEUE_NAME.
const QUEUE_NAME = process.env["MTA_QUEUE_NAME"] ?? "alecrae-outbound";

/**
 * Resolve the Redis URL the send queue connects to.
 *
 * Reads `REDIS_URL` ONLY — deliberately NOT `UPSTASH_REDIS_URL`. The MTA
 * worker (services/mta) resolves exactly `REDIS_URL ?? localhost`; when this
 * producer also honoured `UPSTASH_REDIS_URL`, an operator who set only that
 * var got the API enqueueing into one Redis while the MTA polled another —
 * both sides healthy, every send silently vanishing (the issue #149 failure
 * mode, reintroduced through config asymmetry). Nothing in the deployed
 * architecture reads the UPSTASH_* connection vars (see issue #150's history
 * and the hosting notes): self-hosted Redis via `REDIS_URL` is the contract.
 *
 * `routes/health.ts` imports this same getter so the health probe can never
 * report on a different Redis than the producer actually uses.
 */
export function getRedisUrl(): string {
  return process.env["REDIS_URL"] ?? "redis://localhost:6379";
}

const REDIS_URL = getRedisUrl();

/** True only when Redis is explicitly configured (not the localhost fallback). */
export function isRedisConfigured(): boolean {
  return Boolean(process.env["REDIS_URL"]);
}

// ─── Canonical retry policy for outbound send jobs ─────────────────────────

/**
 * The MTA worker THROWS on a deferral (e.g. a greylisting 4xx) precisely so
 * BullMQ retries the job — which makes `attempts` load-bearing. BullMQ's
 * default is 1 attempt, so a producer that passes no per-job options turned a
 * single greylist deferral into a permanent failure (agent-send did exactly
 * that, while the identical message via /v1/messages retried 8×). These
 * values mirror routes/messages.ts's explicit options — that is the canonical
 * policy — and live in `defaultJobOptions` below so every producer inherits
 * them without having to know to pass them.
 */
export const SEND_JOB_ATTEMPTS = 8;
export const SEND_JOB_BACKOFF = {
  type: "exponential",
  delay: 60_000,
} as const;

// ─── Singleton queue instance ──────────────────────────────────────────────

let sendQueue: Queue | null = null;

/**
 * Return the shared BullMQ queue for outbound email. Creates it on first call.
 */
export function getSendQueue(): Queue {
  if (!sendQueue) {
    sendQueue = new Queue(QUEUE_NAME, {
      connection: { url: getRedisUrl() },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: SEND_JOB_ATTEMPTS,
        backoff: { ...SEND_JOB_BACKOFF },
      },
    });
  }
  return sendQueue;
}

/**
 * Gracefully close the queue connection. Call during application shutdown.
 */
export async function closeSendQueue(): Promise<void> {
  if (sendQueue) {
    await sendQueue.close();
    sendQueue = null;
  }
}

export { QUEUE_NAME, REDIS_URL };
