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

import { Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { getDatabase } from "@emailed/db/client/connection.js";
import { emails, deliveryResults } from "@emailed/db/schema/emails.js";
import { domains } from "@emailed/db/schema/domains.js";
import { signMessage, addSignatureToMessage } from "./dkim/signer.js";
import { SmtpClient } from "./smtp/client.js";
import { DeliveryOptimizer } from "./delivery/optimizer.js";
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
}

const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  queueName: process.env["MTA_QUEUE_NAME"] ?? "emailed:outbound",
  concurrency: parseInt(process.env["MTA_WORKER_CONCURRENCY"] ?? "10", 10),
  localHostname: process.env["MTA_HOSTNAME"] ?? "mail.emailed.dev",
};

// ─── MtaWorker ──────────────────────────────────────────────────────────────

export class MtaWorker {
  private worker: Worker<EmailJobData> | null = null;
  private readonly config: WorkerConfig;
  private readonly optimizer: DeliveryOptimizer;
  private shuttingDown = false;

  constructor(config?: Partial<WorkerConfig>) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
    this.optimizer = new DeliveryOptimizer();
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

    console.log("[mta-worker] Worker started and listening for jobs");
  }

  /**
   * Gracefully shut down the worker. Waits for in-flight jobs to finish.
   */
  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    console.log("[mta-worker] Shutting down worker...");

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

    console.log(
      `[mta-worker] Processing job ${job.id} (messageId=${email.messageId}, ` +
        `attempt=${attemptNumber + 1}, recipients=${email.to.length})`,
    );

    // ── 1. Update email status to processing ────────────────────────────
    await db
      .update(emails)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(emails.id, email.id));

    // ── 2. Fetch DKIM signing key for the sender domain ─────────────────
    const [domainRecord] = await db
      .select({
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

    // ── 4. Deliver to each recipient ────────────────────────────────────
    //   We track per-recipient outcomes. If ALL recipients bounce, the
    //   email is marked bounced. If any are deferred, we throw so BullMQ
    //   retries the entire job.

    let anyDeferred = false;
    let allBounced = true;
    let anyDelivered = false;
    const errors: string[] = [];

    for (const recipient of email.to) {
      const client = new SmtpClient({
        localHostname: this.config.localHostname,
        opportunisticTls: true,
        requireTls: false,
      });

      try {
        // Use the SmtpClient's built-in MX resolution and delivery
        const result = await client.sendMail(
          email.from,
          recipient,
          signedMessage,
        );

        const now = new Date();

        if (result.ok) {
          // ── Delivered ──────────────────────────────────────────────
          allBounced = false;
          anyDelivered = true;

          await db
            .update(deliveryResults)
            .set({
              status: "delivered",
              remoteResponse: result.value.response,
              remoteResponseCode: 250,
              mxHost: result.value.host,
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
            `[mta-worker] Delivered to ${recipient} via ${result.value.host}`,
          );
        } else {
          // ── Failed — determine if bounce or deferral ──────────────
          const errorMsg = result.error.message;
          const isPermanent =
            errorMsg.includes("5") && /\b5\d{2}\b/.test(errorMsg);

          if (isPermanent) {
            // Permanent failure — bounce
            await db
              .update(deliveryResults)
              .set({
                status: "bounced",
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

            console.warn(
              `[mta-worker] Permanent failure for ${recipient}: ${errorMsg}`,
            );
          } else {
            // Transient failure — defer
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
            console.warn(
              `[mta-worker] Deferred for ${recipient}: ${errorMsg}`,
            );
          }
        }
      } catch (error: unknown) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        allBounced = false;
        anyDeferred = true;

        await db
          .update(deliveryResults)
          .set({
            status: "deferred",
            remoteResponse: errorMsg,
            attemptCount: attemptNumber + 1,
            lastAttemptAt: new Date(),
            ...(attemptNumber === 0
              ? { firstAttemptAt: new Date() }
              : {}),
          })
          .where(
            and(
              eq(deliveryResults.emailId, email.id),
              eq(deliveryResults.recipientAddress, recipient),
            ),
          );

        errors.push(`${recipient}: ${errorMsg}`);
        console.error(
          `[mta-worker] Exception delivering to ${recipient}: ${errorMsg}`,
        );
      }
    }

    // ── 5. Update overall email status ──────────────────────────────────
    const now = new Date();

    if (allBounced && email.to.length > 0) {
      await db
        .update(emails)
        .set({ status: "bounced", updatedAt: now })
        .where(eq(emails.id, email.id));
    } else if (anyDelivered && !anyDeferred) {
      await db
        .update(emails)
        .set({
          status: "delivered",
          sentAt: now,
          updatedAt: now,
        })
        .where(eq(emails.id, email.id));
    } else if (anyDeferred) {
      await db
        .update(emails)
        .set({ status: "deferred", updatedAt: now })
        .where(eq(emails.id, email.id));

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
    }
  }
}
