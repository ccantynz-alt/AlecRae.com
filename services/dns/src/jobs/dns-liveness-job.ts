/**
 * DNS Liveness BullMQ Job — Daily Re-verification
 *
 * Registers a repeatable BullMQ job that runs at 03:00 UTC daily,
 * invoking `runLivenessCheck()` to re-verify DNS records for all
 * verified domains. Domains with stale records are paused.
 *
 * Usage:
 *   import { registerDnsLivenessJob, closeDnsLivenessQueue } from "./jobs/dns-liveness-job";
 *   await registerDnsLivenessJob();
 */

import { Queue, Worker } from "bullmq";
import { runLivenessCheck } from "../liveness-checker.js";

// ─── Configuration ────────────────────────────────────────────────────────

const QUEUE_NAME = "alecrae:dns-liveness";
const REDIS_URL =
  process.env["REDIS_URL"] ??
  process.env["UPSTASH_REDIS_URL"] ??
  "redis://localhost:6379";

// ─── State ────────────────────────────────────────────────────────────────

let queue: Queue | null = null;
let worker: Worker | null = null;

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Register the DNS liveness check as a BullMQ repeatable job.
 * Runs daily at 03:00 UTC. Safe to call multiple times — only one
 * repeatable job config is stored in Redis.
 */
export async function registerDnsLivenessJob(): Promise<void> {
  const connection = { url: REDIS_URL };

  queue = new Queue(QUEUE_NAME, { connection });

  // Register the repeatable job: daily at 03:00 UTC
  await queue.upsertJobScheduler(
    "dns-liveness-daily",
    { pattern: "0 3 * * *" },
    {
      name: "dns-liveness-check",
      opts: {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    },
  );

  // Create a worker to process the job
  worker = new Worker(
    QUEUE_NAME,
    async (_job) => {
      console.log("[dns-liveness-job] Starting daily DNS liveness check...");
      const report = await runLivenessCheck();
      console.log(
        `[dns-liveness-job] Completed: ${report.totalDomains} checked, ` +
        `${report.healthyDomains} healthy, ${report.staleDomains} stale`,
      );
      return {
        totalDomains: report.totalDomains,
        healthyDomains: report.healthyDomains,
        staleDomains: report.staleDomains,
        checkedAt: report.checkedAt.toISOString(),
      };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[dns-liveness-job] Job ${job?.id ?? "unknown"} failed:`,
      err.message,
    );
  });

  console.log("[dns-liveness-job] Registered daily DNS liveness check (03:00 UTC)");
}

/**
 * Gracefully close the queue and worker. Call during service shutdown.
 */
export async function closeDnsLivenessQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
