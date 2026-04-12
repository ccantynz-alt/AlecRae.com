/**
 * Reliable Webhook Delivery System
 *
 * Uses BullMQ to enqueue and process webhook delivery jobs with:
 *   - Exponential backoff retries (3 attempts: 30s, 2min, 10min)
 *   - Full audit trail in the `webhook_deliveries` table
 *   - HMAC-SHA256 signatures matching the SDK verification format
 *   - Automatic webhook deactivation after 5+ consecutive failures
 *
 * Usage:
 *   import { enqueueWebhookDelivery } from "../lib/webhook-dispatcher.js";
 *   await enqueueWebhookDelivery(eventId, accountId);
 */

import { Queue, Worker, type Job } from "bullmq";
import { eq, and, desc } from "drizzle-orm";
import { createHmac } from "node:crypto";
import {
  getDatabase,
  webhooks as webhooksTable,
  webhookDeliveries,
  events,
} from "@emailed/db";

// ─── Configuration ─────────────────────────────────────────────────────────

const WEBHOOK_QUEUE_NAME = "emailed:webhooks";
const REDIS_URL =
  process.env["REDIS_URL"] ??
  process.env["UPSTASH_REDIS_URL"] ??
  "redis://localhost:6379";

/** Maximum retries per delivery attempt. */
const MAX_ATTEMPTS = 3;

/** Backoff delays in milliseconds: 30s, 2min, 10min. */
const BACKOFF_DELAYS = [30_000, 120_000, 600_000];

/** After this many consecutive failures across all events, deactivate the webhook. */
const CONSECUTIVE_FAILURE_THRESHOLD = 5;

/** HTTP timeout for webhook delivery in milliseconds. */
const DELIVERY_TIMEOUT_MS = 10_000;

// ─── Job payload ───────────────────────────────────────────────────────────

interface WebhookJobData {
  webhookId: string;
  eventId: string;
  accountId: string;
}

// ─── Singleton queue instance ──────────────────────────────────────────────

let webhookQueue: Queue | null = null;

function getWebhookQueue(): Queue {
  if (!webhookQueue) {
    webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
      connection: { url: REDIS_URL },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: MAX_ATTEMPTS,
        backoff: {
          type: "custom",
        },
      },
    });
  }
  return webhookQueue;
}

// ─── Signature computation (matches SDK verification format) ───────────────

/**
 * Compute HMAC-SHA256 signature matching the SDK's `computeSignature` format.
 * Signed content is `<timestamp>.<payload>` to prevent replay attacks.
 */
function computeSignature(
  payload: string,
  secret: string,
  timestamp: string,
): string {
  const signedContent = `${timestamp}.${payload}`;
  return createHmac("sha256", secret).update(signedContent).digest("hex");
}

// ─── ID generation ─────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Enqueue ───────────────────────────────────────────────────────────────

/**
 * Look up active webhooks for the given account/event type, and enqueue a
 * delivery job for each matching webhook.
 */
export async function enqueueWebhookDelivery(
  eventId: string,
  accountId: string,
): Promise<void> {
  const db = getDatabase();

  // Fetch the event to know its type
  const [event] = await db
    .select({ type: events.type })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    console.warn(`[webhook-dispatcher] Event ${eventId} not found, skipping`);
    return;
  }

  // Fetch all active webhooks for this account
  const accountWebhooks = await db
    .select({ id: webhooksTable.id, eventTypes: webhooksTable.eventTypes })
    .from(webhooksTable)
    .where(
      and(
        eq(webhooksTable.accountId, accountId),
        eq(webhooksTable.isActive, true),
      ),
    );

  const queue = getWebhookQueue();

  for (const webhook of accountWebhooks) {
    // Check if this webhook subscribes to this event type
    if (
      webhook.eventTypes &&
      webhook.eventTypes.length > 0 &&
      !webhook.eventTypes.includes(event.type)
    ) {
      continue;
    }

    await queue.add(
      "deliver",
      {
        webhookId: webhook.id,
        eventId,
        accountId,
      } satisfies WebhookJobData,
      {
        jobId: `wh_${webhook.id}_${eventId}`,
      },
    );
  }
}

/**
 * Enqueue a delivery job for a specific webhook and event.
 * Used by the test endpoint to send a test event to a specific webhook.
 */
export async function enqueueWebhookDeliveryForWebhook(
  webhookId: string,
  eventId: string,
  accountId: string,
): Promise<void> {
  const queue = getWebhookQueue();
  await queue.add(
    "deliver",
    {
      webhookId,
      eventId,
      accountId,
    } satisfies WebhookJobData,
    {
      jobId: `wh_${webhookId}_${eventId}`,
    },
  );
}

// ─── Worker ────────────────────────────────────────────────────────────────

let webhookWorker: Worker | null = null;

/**
 * Start the webhook delivery worker. Should be called once at API startup.
 */
export function startWebhookWorker(): void {
  if (webhookWorker) return;

  webhookWorker = new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job) => processWebhookJob(job),
    {
      connection: { url: REDIS_URL },
      concurrency: 5,
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          // attemptsMade is 1-indexed here (1 = first retry)
          const idx = Math.min(attemptsMade - 1, BACKOFF_DELAYS.length - 1);
          return BACKOFF_DELAYS[idx] ?? 600_000;
        },
      },
    },
  );

  webhookWorker.on("completed", (job) => {
    console.log(`[webhook-worker] Job ${job.id} completed`);
  });

  webhookWorker.on("failed", (job, error) => {
    console.error(
      `[webhook-worker] Job ${job?.id ?? "unknown"} failed: ${error.message}`,
    );
  });

  webhookWorker.on("error", (error) => {
    console.error(`[webhook-worker] Worker error: ${error.message}`);
  });

  console.log("[webhook-worker] Webhook delivery worker started");
}

/**
 * Stop the webhook delivery worker gracefully.
 */
export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
  }
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }
}

// ─── Job processor ─────────────────────────────────────────────────────────

async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { webhookId, eventId } = job.data;
  const attemptNumber = job.attemptsMade; // 0-indexed for first attempt
  const db = getDatabase();

  // ── 1. Fetch webhook config ──────────────────────────────────────────
  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.id, webhookId))
    .limit(1);

  if (!webhook) {
    console.warn(
      `[webhook-worker] Webhook ${webhookId} not found, discarding job`,
    );
    return; // Don't retry — webhook was deleted
  }

  if (!webhook.isActive) {
    console.warn(
      `[webhook-worker] Webhook ${webhookId} is inactive, discarding job`,
    );
    return;
  }

  // ── 2. Fetch the event ───────────────────────────────────────────────
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    console.warn(
      `[webhook-worker] Event ${eventId} not found, discarding job`,
    );
    return;
  }

  // ── 3. Build the payload ─────────────────────────────────────────────
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({
    id: event.id,
    type: event.type,
    timestamp,
    data: {
      emailId: event.emailId,
      messageId: event.messageId,
      recipient: event.recipient,
      url: event.url,
      userAgent: event.userAgent,
      ipAddress: event.ipAddress,
      tags: event.tags,
      metadata: event.metadata,
    },
  });

  // ── 4. Compute signature (matching SDK verification format) ──────────
  const signature = computeSignature(payload, webhook.secret, timestamp);

  // ── 5. Attempt delivery ──────────────────────────────────────────────
  const deliveryId = generateId();
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emailed-Signature": signature,
        "X-Emailed-Timestamp": timestamp,
        "X-Emailed-Event": event.type,
        "X-Emailed-Delivery": deliveryId,
      },
      body: payload,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    statusCode = response.status;

    // Read response body (truncated to 4KB to avoid storing huge responses)
    try {
      const text = await response.text();
      responseBody = text.slice(0, 4096);
    } catch {
      // leave responseBody as null
    }

    // Consider 2xx as success
    success = statusCode >= 200 && statusCode < 300;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    responseBody = error.message.slice(0, 4096);
    // statusCode remains null (network error / timeout)
  }

  // ── 6. Record delivery attempt in webhook_deliveries ─────────────────
  await db.insert(webhookDeliveries).values({
    id: deliveryId,
    webhookId,
    eventId,
    statusCode: statusCode !== null ? String(statusCode) : null,
    responseBody,
    attemptCount: attemptNumber + 1,
    success,
    nextRetryAt:
      !success && attemptNumber + 1 < MAX_ATTEMPTS
        ? new Date(
            Date.now() +
              (BACKOFF_DELAYS[attemptNumber] ?? 600_000),
          )
        : null,
    createdAt: new Date(),
  });

  console.log(
    `[webhook-worker] Delivery ${deliveryId} to ${webhook.url}: ` +
      `status=${statusCode ?? "network_error"}, success=${success}, ` +
      `attempt=${attemptNumber + 1}/${MAX_ATTEMPTS}`,
  );

  // ── 7. Check for consecutive failures and deactivate if needed ───────
  if (!success) {
    // Count recent consecutive failed deliveries for this webhook
    const recentDeliveries = await db
      .select({
        success: webhookDeliveries.success,
      })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(CONSECUTIVE_FAILURE_THRESHOLD);

    const allFailed =
      recentDeliveries.length >= CONSECUTIVE_FAILURE_THRESHOLD &&
      recentDeliveries.every((d) => !d.success);

    if (allFailed) {
      await db
        .update(webhooksTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(webhooksTable.id, webhookId));

      console.warn(
        `[webhook-worker] Webhook ${webhookId} deactivated after ` +
          `${CONSECUTIVE_FAILURE_THRESHOLD} consecutive failures`,
      );

      // Don't retry — webhook is now deactivated
      return;
    }

    // Throw so BullMQ retries with backoff
    throw new Error(
      `Webhook delivery failed: status=${statusCode ?? "network_error"} ` +
        `url=${webhook.url}`,
    );
  }
}
