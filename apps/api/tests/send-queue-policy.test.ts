/**
 * Send-queue retry policy + Redis single-source guards.
 *
 * Two defect classes pinned here:
 *
 * 1. Retry policy (issue: agent-send jobs got zero retries). The MTA worker
 *    THROWS on a greylist deferral to trigger a BullMQ retry, so `attempts`
 *    is load-bearing. routes/messages.ts passed attempts: 8 + exponential
 *    backoff explicitly, but the queue's defaultJobOptions set none — so any
 *    producer that didn't know to pass its own options (agent-send) inherited
 *    BullMQ's default of 1 attempt, and a single deferral permanently failed
 *    the message. The canonical policy now lives in defaultJobOptions so every
 *    producer inherits it.
 *
 * 2. Redis URL resolution (split-brain risk). The API used to fall back
 *    REDIS_URL ?? UPSTASH_REDIS_URL ?? localhost while the MTA reads only
 *    REDIS_URL ?? localhost. An operator setting only UPSTASH_REDIS_URL got
 *    the API enqueueing into one Redis and the MTA polling another — silently,
 *    both healthy (the issue #149 failure mode via config asymmetry). Nothing
 *    should read the UPSTASH_* connection vars (issue #150); everything keys
 *    off REDIS_URL, and health reports on the same source the producer uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// ─── Mock BullMQ so constructing the queue never opens a socket ─────────────

interface CapturedQueueOptions {
  connection?: { url?: string };
  defaultJobOptions?: {
    attempts?: number;
    backoff?: { type?: string; delay?: number };
    removeOnComplete?: boolean;
    removeOnFail?: boolean;
  };
}

const queueCtor = vi.fn(
  (_name: string, _opts: CapturedQueueOptions) =>
    ({ add: vi.fn(), close: vi.fn() }) as const,
);

vi.mock("bullmq", () => ({
  Queue: queueCtor,
}));

// ─── Env bookkeeping ────────────────────────────────────────────────────────

const savedRedisUrl = process.env["REDIS_URL"];
const savedUpstashUrl = process.env["UPSTASH_REDIS_URL"];

beforeEach(() => {
  vi.resetModules();
  queueCtor.mockClear();
  delete process.env["REDIS_URL"];
  delete process.env["UPSTASH_REDIS_URL"];
});

afterEach(() => {
  if (savedRedisUrl === undefined) delete process.env["REDIS_URL"];
  else process.env["REDIS_URL"] = savedRedisUrl;
  if (savedUpstashUrl === undefined) delete process.env["UPSTASH_REDIS_URL"];
  else process.env["UPSTASH_REDIS_URL"] = savedUpstashUrl;
});

async function importQueueModule(): Promise<typeof import("../src/lib/queue.js")> {
  return import("../src/lib/queue.js");
}

// ─── 1. Retry policy in defaultJobOptions ──────────────────────────────────

describe("send queue default retry policy", () => {
  it("carries attempts + exponential backoff so every producer inherits retries", async () => {
    process.env["REDIS_URL"] = "redis://queue-host:6379";
    const { getSendQueue } = await importQueueModule();
    getSendQueue();

    expect(queueCtor).toHaveBeenCalledTimes(1);
    const opts = queueCtor.mock.calls[0]?.[1];
    expect(opts?.defaultJobOptions).toMatchObject({
      attempts: 8,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  });

  it("matches the explicit options routes/messages.ts passes (the canonical policy)", async () => {
    const { SEND_JOB_ATTEMPTS, SEND_JOB_BACKOFF } = await importQueueModule();
    const messagesSrc = readFileSync(join(SRC, "routes", "messages.ts"), "utf8");

    // messages.ts keeps its explicit per-job options; if either side changes,
    // this test forces the other to be reconciled rather than silently drift.
    expect(messagesSrc).toContain(`attempts: ${SEND_JOB_ATTEMPTS},`);
    expect(messagesSrc).toContain(
      `backoff: { type: "${SEND_JOB_BACKOFF.type}", delay: 60_000 }`,
    );
    expect(SEND_JOB_BACKOFF.delay).toBe(60_000);
  });
});

// ─── 2. Redis URL resolution ───────────────────────────────────────────────

describe("Redis URL resolution (split-brain guard)", () => {
  it("UPSTASH_REDIS_URL alone does NOT configure the queue", async () => {
    process.env["UPSTASH_REDIS_URL"] = "redis://upstash.example:6379";
    const { getRedisUrl, isRedisConfigured, getSendQueue } = await importQueueModule();

    // The MTA resolves REDIS_URL ?? localhost — the API must do exactly the
    // same, or the two halves of the send pipeline point at different Redis.
    expect(isRedisConfigured()).toBe(false);
    expect(getRedisUrl()).toBe("redis://localhost:6379");

    getSendQueue();
    expect(queueCtor.mock.calls[0]?.[1]?.connection?.url).toBe("redis://localhost:6379");
  });

  it("REDIS_URL configures the queue and wins outright", async () => {
    process.env["REDIS_URL"] = "redis://real-host:6379";
    process.env["UPSTASH_REDIS_URL"] = "redis://upstash.example:6379";
    const { getRedisUrl, isRedisConfigured, getSendQueue } = await importQueueModule();

    expect(isRedisConfigured()).toBe(true);
    expect(getRedisUrl()).toBe("redis://real-host:6379");

    getSendQueue();
    expect(queueCtor.mock.calls[0]?.[1]?.connection?.url).toBe("redis://real-host:6379");
  });
});

// ─── 3. Structural single-source guards ────────────────────────────────────

describe("Redis config single-source (structural)", () => {
  it("no queue-facing module falls back to UPSTASH_REDIS_URL", () => {
    for (const rel of [
      ["lib", "queue.ts"],
      ["lib", "webhook-dispatcher.ts"],
      ["routes", "health.ts"],
    ] as const) {
      const src = readFileSync(join(SRC, ...rel), "utf8");
      // Comments may mention the var by name in prose; what must not exist is
      // an actual env read of it.
      expect(
        src.includes('process.env["UPSTASH_REDIS_URL"]'),
        `${rel.join("/")} must not read UPSTASH_REDIS_URL`,
      ).toBe(false);
    }
  });

  it("routes/health.ts resolves Redis through lib/queue.ts, never its own env read", () => {
    const healthSrc = readFileSync(join(SRC, "routes", "health.ts"), "utf8");

    // Health must import the producer's own resolution so it can never report
    // on a different Redis (or a different queue name) than the queue uses.
    expect(healthSrc).toMatch(
      /import\s*\{[^}]*getRedisUrl[^}]*\}\s*from\s*"\.\.\/lib\/queue\.js"/s,
    );
    expect(healthSrc).toMatch(
      /import\s*\{[^}]*isRedisConfigured[^}]*\}\s*from\s*"\.\.\/lib\/queue\.js"/s,
    );
    expect(healthSrc).toMatch(
      /import\s*\{[^}]*QUEUE_NAME[^}]*\}\s*from\s*"\.\.\/lib\/queue\.js"/s,
    );
    expect(healthSrc.includes('process.env["REDIS_URL"]')).toBe(false);
    expect(healthSrc.includes('process.env["MTA_QUEUE_NAME"]')).toBe(false);
  });
});
