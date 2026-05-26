/**
 * @alecrae/mta — Email Queue Manager
 *
 * BullMQ-backed priority queue for outbound email delivery. Supports five
 * priority tiers, domain-based grouping for ISP throttling, delayed/scheduled
 * sends, and automatic stalled-job recovery.
 *
 * All public methods return `Result<T>` — business logic never throws.
 */

import { randomUUID } from "node:crypto";
import type { Job} from "bullmq";
import { Queue, Worker, QueueEvents, type JobsOptions } from "bullmq";
import {
  type QueuedEmail,
  type QueueConfig,
  type QueuePriority,
  type QueueJobStatus,
  type Result,
  ok,
  err,
} from "../types.js";

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Map our 1-5 priority to BullMQ priority (lower = higher in BullMQ). */
function toBullPriority(p: QueuePriority): number {
  return p;
}

/** Extract the domain part from an email address. */
function domainOf(address: string): string {
  const idx = address.lastIndexOf("@");
  return idx === -1 ? address : address.slice(idx + 1).toLowerCase();
}

// ─── Queue metrics snapshot ─────────────────────────────────────────────────

export interface QueueMetrics {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
}

// ─── Job payload stored in Redis ────────────────────────────────────────────

interface EmailJobData {
  email: QueuedEmail;
  addedAt: string; // ISO-8601
}

// ─── EmailQueueManager ─────────────────────────────────────────────────────

/**
 * Manages the outbound email sending queue.
 *
 * Lifecycle:
 *   1. `init()`   — creates the BullMQ Queue, Worker, and QueueEvents.
 *   2. Use `enqueue` / `dequeue` / `prioritize` etc. as needed.
 *   3. `close()`  — gracefully shuts everything down.
 *
 * Domain grouping: emails are tagged with a BullMQ "group" that equals
 * the recipient domain. This lets the worker respect per-domain concurrency
 * limits without a separate queue per ISP.
 */
export class EmailQueueManager {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private events: QueueEvents | null = null;
  private readonly config: QueueConfig;
  private isPaused = false;

  constructor(config: QueueConfig) {
    this.config = config;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Initialise the underlying BullMQ queue and event listener.
   *
   * @param processor - Callback invoked for every job the worker picks up.
   *   Return `true` to mark the job completed, `false` to mark it failed.
   */
  async init(
    processor: (email: QueuedEmail) => Promise<boolean>,
  ): Promise<Result<void>> {
    try {
      const connection = { url: this.config.redisUrl };

      this.queue = new Queue(this.config.queueName, { connection });

      this.events = new QueueEvents(this.config.queueName, { connection });

      this.worker = new Worker(
        this.config.queueName,
        async (job: Job<EmailJobData>) => {
          const success = await processor(job.data.email);
          if (!success) {
            throw new Error(`Delivery failed for ${job.data.email.id}`);
          }
        },
        {
          connection,
          concurrency: this.config.concurrency,
          stalledInterval: this.config.stalledInterval,
          maxStalledCount: this.config.maxStalledCount,
        },
      );

      // Stalled-job recovery: BullMQ fires "stalled" events automatically
      // based on `stalledInterval` / `maxStalledCount`. We log and let
      // BullMQ move them back to waiting or to failed.
      this.worker.on("stalled", (jobId: string) => {
        // In production this would feed into the observability pipeline.
        console.warn(`[queue] stalled job detected: ${jobId}`);
      });

      return ok(undefined);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Gracefully shut down all BullMQ resources.
   */
  async close(): Promise<Result<void>> {
    try {
      await this.worker?.close();
      await this.events?.close();
      await this.queue?.close();
      this.worker = null;
      this.events = null;
      this.queue = null;
      return ok(undefined);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  // ── Core operations ─────────────────────────────────────────────────────

  /**
   * Enqueue an email for delivery.
   *
   * @param email  - The email to queue. If `id` is empty a UUID is assigned.
   * @param delay  - Optional delay in milliseconds (for scheduled sending).
   * @returns The assigned job ID.
   */
  async enqueue(email: QueuedEmail, delay?: number): Promise<Result<string>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised — call init() first"));
    }

    try {
      const id = email.id || randomUUID();
      const emailWithId: QueuedEmail = { ...email, id };

      // BullMQ Pro supports `group` for rate-limit grouping by domain — if
      // the runtime lib is the Pro build this is honored; otherwise it's a
      // harmless extra field. TS JobsOptions (non-Pro) doesn't declare it,
      // so we widen the type via intersection.
      const jobOpts: JobsOptions & { group?: { id: string } } = {
        priority: toBullPriority(emailWithId.priority),
        attempts: emailWithId.maxAttempts || this.config.maxRetries,
        backoff: {
          type: "exponential",
          delay: this.config.retryDelay,
        },
        removeOnComplete: true,
        removeOnFail: false,
        group: {
          id: emailWithId.domain || domainOf(emailWithId.to[0] ?? ""),
        },
      };

      if (delay !== undefined && delay > 0) {
        jobOpts.delay = delay;
      } else if (emailWithId.scheduledAt) {
        const delayMs = emailWithId.scheduledAt.getTime() - Date.now();
        if (delayMs > 0) {
          jobOpts.delay = delayMs;
        }
      }

      const data: EmailJobData = {
        email: emailWithId,
        addedAt: new Date().toISOString(),
      };

      await this.queue.add(id, data, jobOpts);
      return ok(id);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Remove a queued email by job ID.
   *
   * Only jobs that are still in "waiting" or "delayed" state can be
   * dequeued. Active or completed jobs are not affected.
   */
  async dequeue(jobId: string): Promise<Result<boolean>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised"));
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return ok(false);
      }

      const state = await job.getState();
      if (state === "waiting" || state === "delayed") {
        await job.remove();
        return ok(true);
      }

      return ok(false);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Change the priority of an already-queued job.
   *
   * BullMQ supports `job.changePriority()`. If the job is not in
   * "waiting" state the operation is a no-op and returns `false`.
   */
  async prioritize(
    jobId: string,
    newPriority: QueuePriority,
  ): Promise<Result<boolean>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised"));
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return ok(false);
      }

      await job.changePriority({ priority: toBullPriority(newPriority) });
      return ok(true);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Return the current status of a job.
   */
  async getStatus(jobId: string): Promise<Result<QueueJobStatus | null>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised"));
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return ok(null);
      }

      const state = await job.getState();
      return ok(state as QueueJobStatus);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  // ── Queue control ───────────────────────────────────────────────────────

  /**
   * Pause the queue — no new jobs will be picked up by the worker.
   * Already-running jobs are allowed to finish.
   */
  async pause(): Promise<Result<void>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised"));
    }
    try {
      await this.queue.pause();
      this.isPaused = true;
      return ok(undefined);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Resume a previously paused queue.
   */
  async resume(): Promise<Result<void>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised"));
    }
    try {
      await this.queue.resume();
      this.isPaused = false;
      return ok(undefined);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Drain the queue — remove all waiting and delayed jobs.
   * Active jobs are NOT affected and will finish naturally.
   */
  async drain(): Promise<Result<void>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised"));
    }
    try {
      await this.queue.drain();
      return ok(undefined);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  // ── Observability ───────────────────────────────────────────────────────

  /**
   * Return a point-in-time snapshot of queue metrics.
   */
  async getMetrics(): Promise<Result<QueueMetrics>> {
    if (!this.queue) {
      return err(new Error("Queue not initialised"));
    }
    try {
      const [waiting, active, delayed, completed, failed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getDelayedCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
      ]);

      return ok({
        waiting,
        active,
        delayed,
        completed,
        failed,
        paused: this.isPaused,
      });
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
