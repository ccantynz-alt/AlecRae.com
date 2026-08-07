/**
 * `email.received` event + webhook emission for mail delivered via our own MX
 * (CLAUDE.md issue #169, the bounded half).
 *
 * Until this existed, only the Gmail/Outlook-sync and MBOX/EML-import path
 * (apps/api's received-email-store.ts) ever wrote an `email.received` events
 * row or fired a webhook — mail arriving on port 25 / the HTTP ingest was
 * stored silently, so a platform pointing MX at us got no programmatic signal
 * at all (no Resend-style receiving parity).
 *
 * Contract matched against the consumer, not assumed:
 *  - events row shape: packages/db/src/schema/events.ts (`type` is the dotted
 *    `email_event_type` enum value "email.received").
 *  - job shape: apps/api/src/lib/webhook-dispatcher.ts `WebhookJobData`
 *    ({ webhookId, eventId, accountId }) on queue "alecrae-webhooks", job name
 *    "deliver", jobId `wh_<webhookId>_<eventId>` — identical to the producer in
 *    services/mta/src/worker.ts `enqueueWebhooksForEvent`.
 *  - eventTypes filter convention (dispatcher + MTA worker, verbatim): a
 *    NULL or EMPTY `eventTypes` array means "all events"; a non-empty array
 *    must contain the event type.
 *
 * Failure posture: NEVER throws. By the time this runs the message is already
 * stored and the sender must be answered 250 — an eventing failure must not
 * turn a delivered message into a redelivery loop. Errors are logged loudly
 * instead (same fire-and-forget posture as tracking.ts / the MTA worker's
 * `.catch(() => {})` around recordDeliveryEvent).
 */

import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { getDatabase, events, webhooks as webhooksTable } from "@alecrae/db";
import type { StoredEmail, ResolvedRecipient } from "../types.js";

// Must stay in sync with apps/api/src/lib/webhook-dispatcher.ts (the consumer)
// and services/mta/src/worker.ts (the other producer). BullMQ forbids ":" in
// queue names, hence the hyphen.
const WEBHOOK_QUEUE_NAME = "alecrae-webhooks";

/** The emitter signature the ingress handlers accept (injectable for tests). */
export type ReceivedEventEmitter = (
  stored: StoredEmail,
  recipient: ResolvedRecipient,
) => Promise<void>;

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Redis / queue plumbing ──────────────────────────────────────────────────

// REDIS_URL only — deliberately NO UPSTASH_* fallback. Everything queue-shaped
// in this repo (webhook-dispatcher, lib/queue.ts, the MTA worker) resolves the
// connection the same way; a second env var here would silently split this
// producer from the consumer onto a different Redis (the issue #149 failure
// mode: jobs enqueued into a queue nothing watches).
function getRedisUrl(): string | undefined {
  return process.env["REDIS_URL"];
}

let webhookQueue: Queue | null = null;
let webhookQueueUrl: string | null = null;
let warnedNoRedis = false;
let warnedNoDb = false;

function getWebhookQueue(redisUrl: string): Queue {
  // Re-create if the URL changed (only really happens across tests).
  if (webhookQueue && webhookQueueUrl === redisUrl) return webhookQueue;
  webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: { type: "custom" },
    },
  });
  webhookQueueUrl = redisUrl;
  return webhookQueue;
}

/** Close the shared queue connection (called from the service's shutdown path). */
export async function closeReceivedEventQueue(): Promise<void> {
  if (webhookQueue) {
    await webhookQueue.close().catch(() => {
      /* closing on shutdown — nothing useful to do with the error */
    });
    webhookQueue = null;
    webhookQueueUrl = null;
  }
}

/** Test hook: reset module singletons and one-time-log latches. */
export function resetReceivedEventStateForTests(): void {
  webhookQueue = null;
  webhookQueueUrl = null;
  warnedNoRedis = false;
  warnedNoDb = false;
}

// ── The emitter ─────────────────────────────────────────────────────────────

/**
 * Record an `email.received` events row for a freshly stored inbound message
 * and enqueue webhook delivery jobs for the account's matching active
 * webhooks. Never throws.
 *
 * Deduplication: when the store MERGED this delivery into an existing row
 * (multi-recipient delivery on one account — postgres-store.ts sets
 * `stored.merged`), the event for this (accountId, messageId) was already
 * emitted by the recipient that inserted the row, so nothing is emitted again.
 *
 * NOTE — issue #169's remaining half deliberately does NOT live here: the
 * sync/import path additionally runs AI triage, user-defined rules and
 * semantic indexing per received message (apps/api's received-email-store.ts).
 * Those are API-side capabilities with quota/backfill guards (#130) and need a
 * design pass before this service can fan out to them; wiring them naively
 * from here would repeat the unbounded per-message AI-spend class of bug.
 */
export async function emitReceivedEvent(
  stored: StoredEmail,
  recipient: ResolvedRecipient,
): Promise<void> {
  try {
    if (stored.merged) {
      // The row already existed — its insert already emitted the event.
      return;
    }

    if (!process.env["DATABASE_URL"]) {
      // The in-memory dev store (index.ts falls back to it when DATABASE_URL
      // is unset) has no events table to write to. One-time log, not
      // per-message spam; production inbound always has a database.
      if (!warnedNoDb) {
        warnedNoDb = true;
        console.warn(
          "[Inbound] DATABASE_URL is not set — email.received events and webhooks are disabled " +
            "(in-memory store mode).",
        );
      }
      return;
    }

    // The events row is DB-mandatory; webhook enqueue is best-effort on top.
    const db = getDatabase();
    const eventId = generateId();
    await db.insert(events).values({
      id: eventId,
      accountId: stored.accountId,
      emailId: stored.id,
      messageId: stored.messageId,
      type: "email.received",
      // The address the sender actually addressed (RCPT TO), before alias /
      // plus-addressing / catch-all resolution — that is the identity an
      // external platform's webhook consumer knows about.
      recipient: recipient.originalAddress,
    });

    await enqueueWebhooksForReceivedEvent(db, eventId, stored.accountId);
  } catch (err) {
    // Fail open: the message is stored and the sender gets its 250 no matter
    // what happens here. Loud log so a broken eventing path is visible.
    console.error(
      `[Inbound] Failed to emit email.received event for ${stored.id} (account ${stored.accountId}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function enqueueWebhooksForReceivedEvent(
  db: ReturnType<typeof getDatabase>,
  eventId: string,
  accountId: string,
): Promise<void> {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    // The events row is still written above — an operator can backfill webhook
    // deliveries once Redis exists. One-time log, not per-message spam.
    if (!warnedNoRedis) {
      warnedNoRedis = true;
      console.warn(
        "[Inbound] REDIS_URL is not set — email.received events are recorded in the DB " +
          "but webhook deliveries are NOT enqueued. Set REDIS_URL (the same one apps/api " +
          "uses — see issue #149) to enable webhook delivery for inbound mail.",
      );
    }
    return;
  }

  const accountWebhooks = await db
    .select({ id: webhooksTable.id, eventTypes: webhooksTable.eventTypes })
    .from(webhooksTable)
    .where(
      and(
        eq(webhooksTable.accountId, accountId),
        eq(webhooksTable.isActive, true),
      ),
    );

  if (accountWebhooks.length === 0) return;

  const queue = getWebhookQueue(redisUrl);
  for (const webhook of accountWebhooks) {
    // Null/empty eventTypes = subscribe to everything (the dispatcher's own
    // convention — apps/api/src/lib/webhook-dispatcher.ts).
    if (
      webhook.eventTypes &&
      webhook.eventTypes.length > 0 &&
      !webhook.eventTypes.includes("email.received")
    ) {
      continue;
    }

    await queue.add(
      "deliver",
      { webhookId: webhook.id, eventId, accountId },
      { jobId: `wh_${webhook.id}_${eventId}` },
    );
  }
}
