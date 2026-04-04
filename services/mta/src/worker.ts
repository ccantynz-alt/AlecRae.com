/**
 * @emailed/mta — Queue Worker
 *
 * BullMQ worker that processes the outbound email queue. For each job:
 *   1. Retrieve the raw message from the job payload
 *   2. Sign with DKIM
 *   3. Resolve MX records for recipient domain
 *   4. Connect to recipient MX via SMTP client
 *   5. Deliver the message
 *   6. Update delivery status in Postgres (delivered / deferred / bounced)
 *   7. Handle retries for deferred messages via BullMQ backoff
 *
 * Supports graceful shutdown (drains in-flight jobs before exiting).
 */

import { Worker, Queue, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { getDatabase, emails, deliveryResults, domains, suppressionLists, events, webhooks as webhooksTable } from "@emailed/db";
import { signMessage, addSignatureToMessage } from "./dkim/signer.js";
import { SmtpClient } from "./smtp/client.js";
import { RelayClient, relayConfigFromEnv, type RelaySendResult } from "./relay/relay.js";
import { DeliveryOptimizer } from "./delivery/optimizer.js";
import { getTracer, recordEmailSent, recordEmailSendDuration, recordActiveConnection, SpanKind } from "@emailed/shared";
import type { QueuedEmail, DkimSignOptions } from "./types.js";

// ─── Job payload as stored in Redis ─────────────────────────────────────────

interface EmailJobData {
  email: QueuedEmail;
  addedAt: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface WorkerConfig {
  redisUrl: string;
  queueName: string;
  concurrency: number;
  localHostname: string;
  /** When true, use the relay client (SES/MailChannels/SMTP relay) instead of direct MX delivery. */
  useRelay: boolean;
}

const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  queueName: process.env["MTA_QUEUE_NAME"] ?? "emailed:outbound",
  concurrency: parseInt(process.env["MTA_WORKER_CONCURRENCY"] ?? "10", 10),
  localHostname: process.env["MTA_HOSTNAME"] ?? "mail.emailed.dev",
  useRelay: !!process.env["RELAY_PROVIDER"],
};

// ─── MtaWorker ──────────────────────────────────────────────────────────────

export class MtaWorker {
  private worker: Worker<EmailJobData> | null = null;
  private readonly config: WorkerConfig;
  private readonly optimizer: DeliveryOptimizer;
  private readonly relayClient: RelayClient | null;
  private shuttingDown = false;
  private maintenanceInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<WorkerConfig>) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
    this.optimizer = new DeliveryOptimizer();

    // Initialise relay client if configured
    if (this.config.useRelay) {
      try {
        this.relayClient = new RelayClient(relayConfigFromEnv());
        console.log(`[mta-worker] Relay client initialised (provider: ${this.relayClient.provider})`);
      } catch (error) {
        console.error(`[mta-worker] Failed to initialise relay client: ${error}`);
        console.warn("[mta-worker] Falling back to direct MX delivery");
        this.relayClient = null;
      }
    } else {
      this.relayClient = null;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start the worker, consuming jobs from the outbound queue.
   */
  async start(): Promise<void> {
    console.log(
      `[mta-worker] Starting worker on queue "${this.config.queueName}" ` +
        `with concurrency ${this.config.concurrency}`,
    );

    this.worker = new Worker<EmailJobData>(
      this.config.queueName,
      async (job) => this.processJob(job),
      {
        connection: { url: this.config.redisUrl },
        concurrency: this.config.concurrency,
        stalledInterval: 30_000,
        maxStalledCount: 2,
      },
    );

    this.worker.on("completed", (job) => {
      console.log(`[mta-worker] Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      console.error(
        `[mta-worker] Job ${job?.id ?? "unknown"} failed: ${error.message}`,
      );
    });

    this.worker.on("stalled", (jobId) => {
      console.warn(`[mta-worker] Job ${jobId} stalled`);
    });

    this.worker.on("error", (error) => {
      console.error(`[mta-worker] Worker error: ${error.message}`);
    });

    // Start maintenance interval: reset throttle counters and prune stale state
    this.maintenanceInterval = setInterval(() => {
      this.optimizer.resetHourlyCounters();
      this.optimizer.pruneStaleState();
    }, 60 * 60 * 1000); // Every hour

    console.log("[mta-worker] Worker started and listening for jobs");
  }

  /**
   * Gracefully shut down the worker. Waits for in-flight jobs to finish.
   */
  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    console.log("[mta-worker] Shutting down worker...");

    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    console.log("[mta-worker] Worker shut down");
  }

  // ── Job processor ───────────────────────────────────────────────────────

  /**
   * Process a single email job from the queue.
   *
   * Throws on transient failures so BullMQ retries with exponential backoff.
   * Returns normally on success or permanent failure (bounce).
   */
  private async processJob(job: Job<EmailJobData>): Promise<void> {
    const { email } = job.data;
    const db = getDatabase();
    const attemptNumber = job.attemptsMade;
    const sendStart = performance.now();
    const tracer = getTracer("mta-worker");

    console.log(
      `[mta-worker] Processing job ${job.id} (messageId=${email.messageId}, ` +
        `attempt=${attemptNumber + 1}, recipients=${email.to.length})`,
    );

    recordActiveConnection("mta-worker", 1);

    // ── 1. Update email status to processing ────────────────────────────
    await db
      .update(emails)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(emails.id, email.id));

    // ── 2. Fetch DKIM signing key for the sender domain ─────────────────
    const [domainRecord] = await db
      .select({
        id: domains.id,
        dkimSelector: domains.dkimSelector,
        dkimPrivateKey: domains.dkimPrivateKey,
        domain: domains.domain,
      })
      .from(domains)
      .where(eq(domains.domain, email.domain))
      .limit(1);

    // ── 3. Sign with DKIM if keys are available ─────────────────────────
    let signedMessage = email.rawMessage;

    if (domainRecord?.dkimPrivateKey && domainRecord?.dkimSelector) {
      const dkimOptions: DkimSignOptions = {
        domain: domainRecord.domain,
        selector: domainRecord.dkimSelector,
        privateKey: domainRecord.dkimPrivateKey,
        algorithm: "rsa-sha256",
        canonicalization: "relaxed/relaxed",
        headersToSign: [
          "from",
          "to",
          "cc",
          "subject",
          "date",
          "message-id",
          "mime-version",
          "content-type",
        ],
      };

      const signResult = signMessage(signedMessage, dkimOptions);
      if (signResult.ok) {
        signedMessage = addSignatureToMessage(
          signedMessage,
          signResult.value,
        );
        console.log(
          `[mta-worker] DKIM signed for ${domainRecord.domain} ` +
            `(selector=${domainRecord.dkimSelector})`,
        );
      } else {
        console.warn(
          `[mta-worker] DKIM signing failed, sending unsigned: ${signResult.error.message}`,
        );
      }
    } else {
      console.warn(
        `[mta-worker] No DKIM keys for domain ${email.domain}, sending unsigned`,
      );
    }

    // ── 3b. Check suppression list — skip recipients who have bounced/complained
    const suppressedSet = new Set<string>();
    if (domainRecord) {
      const suppressed = await db
        .select({ email: suppressionLists.email })
        .from(suppressionLists)
        .where(eq(suppressionLists.domainId, domainRecord.id));

      for (const s of suppressed) {
        suppressedSet.add(s.email.toLowerCase());
      }
    }

    // ── 4. Deliver to each recipient ──────────────────────────────────
    //   When a relay is configured, bypass the delivery optimizer and send
    //   directly through the relay (SES / MailChannels / SMTP relay).
    //   Otherwise, fall back to direct MX delivery via the optimizer.

    let anyDeferred = false;
    let allBounced = true;
    let anyDelivered = false;
    const errors: string[] = [];

    // ── 4a. Relay path: send through the configured relay provider ──
    if (this.relayClient) {
      // Filter out suppressed recipients first
      const activeRecipients: string[] = [];
      for (const recipient of email.to) {
        if (suppressedSet.has(recipient.toLowerCase())) {
          console.log(`[mta-worker] Skipping suppressed recipient: ${recipient}`);
          await db
            .update(deliveryResults)
            .set({
              status: "dropped",
              remoteResponse: "Recipient is on the suppression list",
              attemptCount: 1,
              lastAttemptAt: new Date(),
            })
            .where(
              and(
                eq(deliveryResults.emailId, email.id),
                eq(deliveryResults.recipientAddress, recipient),
              ),
            );
        } else {
          activeRecipients.push(recipient);
        }
      }

      if (activeRecipients.length > 0) {
        const relayResult = await this.relayClient.send(
          email.from,
          activeRecipients,
          signedMessage,
        );

        const now = new Date();

        if (relayResult.success) {
          allBounced = false;
          anyDelivered = true;

          for (const recipient of activeRecipients) {
            await db
              .update(deliveryResults)
              .set({
                status: "delivered",
                remoteResponse: relayResult.response ?? `Delivered via ${this.relayClient.provider} relay`,
                mxHost: `relay:${this.relayClient.provider}`,
                attemptCount: attemptNumber + 1,
                lastAttemptAt: now,
                deliveredAt: now,
                ...(attemptNumber === 0 ? { firstAttemptAt: now } : {}),
              })
              .where(
                and(
                  eq(deliveryResults.emailId, email.id),
                  eq(deliveryResults.recipientAddress, recipient),
                ),
              );

            console.log(
              `[mta-worker] Delivered to ${recipient} via ${this.relayClient.provider} relay` +
                (relayResult.messageId ? ` (id=${relayResult.messageId})` : ""),
            );
          }
        } else {
          // Relay failure — check if it looks permanent (5xx) or transient
          const isPermanent = relayResult.error?.match(/\b5\d{2}\b/) != null;

          if (isPermanent) {
            for (const recipient of activeRecipients) {
              await db
                .update(deliveryResults)
                .set({
                  status: "bounced",
                  remoteResponse: relayResult.error ?? "Permanent relay failure",
                  mxHost: `relay:${this.relayClient.provider}`,
                  attemptCount: attemptNumber + 1,
                  lastAttemptAt: now,
                  ...(attemptNumber === 0 ? { firstAttemptAt: now } : {}),
                })
                .where(
                  and(
                    eq(deliveryResults.emailId, email.id),
                    eq(deliveryResults.recipientAddress, recipient),
                  ),
                );
            }
            // allBounced stays true
          } else {
            // Transient failure — defer for retry
            allBounced = false;
            anyDeferred = true;
            const errorMsg = relayResult.error ?? "Relay delivery failed";

            for (const recipient of activeRecipients) {
              await db
                .update(deliveryResults)
                .set({
                  status: "deferred",
                  remoteResponse: errorMsg,
                  mxHost: `relay:${this.relayClient.provider}`,
                  attemptCount: attemptNumber + 1,
                  lastAttemptAt: now,
                  ...(attemptNumber === 0 ? { firstAttemptAt: now } : {}),
                })
                .where(
                  and(
                    eq(deliveryResults.emailId, email.id),
                    eq(deliveryResults.recipientAddress, recipient),
                  ),
                );
            }

            errors.push(`relay(${this.relayClient.provider}): ${errorMsg}`);
          }
        }
      }

      // Skip the direct-delivery path below — jump to status update
    } else {
      // ── 4b. Direct MX delivery path (no relay configured) ───────────

    // Transport callback: uses SmtpClient to deliver to a specific MX host
    const transport = async (
      host: string,
      port: number,
      from: string,
      to: string,
      data: string,
    ): Promise<{ code: number; message: string }> => {
      const client = new SmtpClient({
        localHostname: this.config.localHostname,
        opportunisticTls: true,
        requireTls: false,
      });

      const result = await client.attemptDelivery(host, from, to, data);
      if (result.ok) {
        return { code: 250, message: result.value.response };
      }
      // Parse response code from error message
      const codeMatch = result.error.message.match(/\b([45]\d{2})\b/);
      const code = codeMatch ? parseInt(codeMatch[1]!, 10) : 450;
      throw Object.assign(new Error(result.error.message), { code });
    };

    for (const recipient of email.to) {
      // Skip suppressed recipients
      if (suppressedSet.has(recipient.toLowerCase())) {
        console.log(`[mta-worker] Skipping suppressed recipient: ${recipient}`);

        await db
          .update(deliveryResults)
          .set({
            status: "dropped",
            remoteResponse: "Recipient is on the suppression list",
            attemptCount: 1,
            lastAttemptAt: new Date(),
          })
          .where(
            and(
              eq(deliveryResults.emailId, email.id),
              eq(deliveryResults.recipientAddress, recipient),
            ),
          );

        continue;
      }

      const optimizerResult = await this.optimizer.deliverMessage(
        email.id,
        recipient,
        signedMessage,
        email.from,
        transport,
        attemptNumber,
      );

      const now = new Date();

      if (optimizerResult.ok) {
        const { attempt } = optimizerResult.value;

        if (attempt.status === "delivered") {
          allBounced = false;
          anyDelivered = true;

          await db
            .update(deliveryResults)
            .set({
              status: "delivered",
              remoteResponse: `Delivered via ${attempt.mxHost}`,
              remoteResponseCode: attempt.lastStatusCode ?? 250,
              mxHost: attempt.mxHost,
              attemptCount: attemptNumber + 1,
              lastAttemptAt: now,
              deliveredAt: now,
              ...(attemptNumber === 0 ? { firstAttemptAt: now } : {}),
            })
            .where(
              and(
                eq(deliveryResults.emailId, email.id),
                eq(deliveryResults.recipientAddress, recipient),
              ),
            );

          console.log(
            `[mta-worker] Delivered to ${recipient} via ${attempt.mxHost}`,
          );
        } else if (attempt.status === "bounced") {
          await db
            .update(deliveryResults)
            .set({
              status: "bounced",
              remoteResponse: attempt.lastError ?? "Permanent failure",
              attemptCount: attemptNumber + 1,
              lastAttemptAt: now,
              ...(attemptNumber === 0 ? { firstAttemptAt: now } : {}),
            })
            .where(
              and(
                eq(deliveryResults.emailId, email.id),
                eq(deliveryResults.recipientAddress, recipient),
              ),
            );

          // Auto-suppress the recipient on hard bounce
          if (domainRecord) {
            const suppressId = crypto.randomUUID().replace(/-/g, "");
            await db
              .insert(suppressionLists)
              .values({
                id: suppressId,
                email: recipient.toLowerCase(),
                domainId: domainRecord.id,
                reason: "bounce",
              })
              .onConflictDoNothing()
              .catch(() => {});

            console.log(
              `[mta-worker] Auto-suppressed ${recipient} (hard bounce)`,
            );
          }

          console.warn(
            `[mta-worker] Bounced for ${recipient}: ${attempt.lastError}`,
          );
        } else if (attempt.status === "deferred") {
          allBounced = false;
          anyDeferred = true;

          await db
            .update(deliveryResults)
            .set({
              status: "deferred",
              remoteResponse: attempt.lastError ?? "Deferred",
              attemptCount: attemptNumber + 1,
              lastAttemptAt: now,
              ...(attemptNumber === 0 ? { firstAttemptAt: now } : {}),
            })
            .where(
              and(
                eq(deliveryResults.emailId, email.id),
                eq(deliveryResults.recipientAddress, recipient),
              ),
            );

          errors.push(`${recipient}: ${attempt.lastError ?? "deferred"}`);
          console.warn(
            `[mta-worker] Deferred for ${recipient}: ${attempt.lastError}`,
          );
        }
      } else {
        // Optimizer returned an error result — treat as deferred
        const errorMsg = optimizerResult.error.message;
        allBounced = false;
        anyDeferred = true;

        await db
          .update(deliveryResults)
          .set({
            status: "deferred",
            remoteResponse: errorMsg,
            attemptCount: attemptNumber + 1,
            lastAttemptAt: now,
            ...(attemptNumber === 0 ? { firstAttemptAt: now } : {}),
          })
          .where(
            and(
              eq(deliveryResults.emailId, email.id),
              eq(deliveryResults.recipientAddress, recipient),
            ),
          );

        errors.push(`${recipient}: ${errorMsg}`);
        console.error(
          `[mta-worker] Optimizer error for ${recipient}: ${errorMsg}`,
        );
      }
    }
    } // end else (direct MX delivery path)

    // ── 5. Update overall email status ──────────────────────────────────
    const now = new Date();
    const sendDurationMs = performance.now() - sendStart;

    // Record telemetry for the send operation
    recordActiveConnection("mta-worker", -1);
    recordEmailSendDuration(email.domain, sendDurationMs);

    if (allBounced && email.to.length > 0) {
      await db
        .update(emails)
        .set({ status: "bounced", updatedAt: now })
        .where(eq(emails.id, email.id));

      recordEmailSent(email.domain, "bounced");

      // Record bounce event
      await this.recordDeliveryEvent(db, email, "email.bounced").catch(() => {});
    } else if (anyDelivered && !anyDeferred) {
      await db
        .update(emails)
        .set({
          status: "delivered",
          sentAt: now,
          updatedAt: now,
        })
        .where(eq(emails.id, email.id));

      recordEmailSent(email.domain, "delivered");

      // Record delivery event
      await this.recordDeliveryEvent(db, email, "email.delivered").catch(() => {});
    } else if (anyDeferred) {
      await db
        .update(emails)
        .set({ status: "deferred", updatedAt: now })
        .where(eq(emails.id, email.id));

      recordEmailSent(email.domain, "deferred");

      // Record deferred event
      await this.recordDeliveryEvent(db, email, "email.deferred").catch(() => {});

      // Throw so BullMQ retries with exponential backoff
      throw new Error(
        `Deferred delivery for ${email.id}: ${errors.join("; ")}`,
      );
    } else {
      // Edge case: no recipients (shouldn't happen)
      await db
        .update(emails)
        .set({ status: "failed", updatedAt: now })
        .where(eq(emails.id, email.id));

      recordEmailSent(email.domain, "failed");
    }
  }

  /**
   * Record a delivery event in the events table and enqueue webhook delivery jobs.
   */
  private async recordDeliveryEvent(
    db: ReturnType<typeof getDatabase>,
    email: QueuedEmail,
    eventType: string,
  ): Promise<void> {
    const eventId = crypto.randomUUID().replace(/-/g, "");
    await db.insert(events).values({
      id: eventId,
      accountId: email.accountId,
      emailId: email.id,
      messageId: email.messageId,
      type: eventType as "email.delivered",
    });

    // Enqueue webhook delivery jobs for matching webhooks
    await this.enqueueWebhooksForEvent(db, eventId, email.accountId, eventType);
  }

  /**
   * Look up active webhooks for the account/event type and enqueue BullMQ
   * jobs on the shared `emailed:webhooks` queue.
   */
  private async enqueueWebhooksForEvent(
    db: ReturnType<typeof getDatabase>,
    eventId: string,
    accountId: string,
    eventType: string,
  ): Promise<void> {
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

    // Lazily create a queue instance for the webhook queue
    const webhookQueue = new Queue("emailed:webhooks", {
      connection: { url: this.config.redisUrl },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "custom" },
      },
    });

    try {
      for (const webhook of accountWebhooks) {
        if (
          webhook.eventTypes &&
          webhook.eventTypes.length > 0 &&
          !webhook.eventTypes.includes(eventType)
        ) {
          continue;
        }

        await webhookQueue.add(
          "deliver",
          {
            webhookId: webhook.id,
            eventId,
            accountId,
          },
          {
            jobId: `wh_${webhook.id}_${eventId}`,
          },
        );
      }
    } finally {
      await webhookQueue.close();
    }
  }
}
