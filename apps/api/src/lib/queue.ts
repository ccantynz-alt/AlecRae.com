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

const QUEUE_NAME = process.env["MTA_QUEUE_NAME"] ?? "emailed:outbound";
const REDIS_URL =
  process.env["REDIS_URL"] ??
  process.env["UPSTASH_REDIS_URL"] ??
  "redis://localhost:6379";

// ─── Singleton queue instance ──────────────────────────────────────────────

let sendQueue: Queue | null = null;

/**
 * Return the shared BullMQ queue for outbound email. Creates it on first call.
 */
export function getSendQueue(): Queue {
  if (!sendQueue) {
    sendQueue = new Queue(QUEUE_NAME, {
      connection: { url: REDIS_URL },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
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
