/**
 * The MTA health probe must distinguish "the queue data structure is readable"
 * from "an MTA worker is actually consuming it". Production reported mta:ok
 * for weeks while alecrae-mta was stopped, because the old probe only did a
 * getJobCounts() against the API's own Redis — in the split-Redis failure
 * mode (issue #149) every send would vanish into an unread queue while
 * health said ok. These tests pin the worker-liveness half of the probe.
 */
import { describe, expect, it } from "vitest";

process.env["REDIS_URL"] = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

const { checkMtaQueue } = await import("../src/routes/health.js");
import type { MtaQueueProbe } from "../src/routes/health.js";

interface FakeQueueBehavior {
  workers: unknown[];
  waiting?: number;
  failCounts?: boolean;
}

function fakeQueue(behavior: FakeQueueBehavior): MtaQueueProbe {
  return {
    getJobCounts: async (): Promise<Record<string, number>> => {
      if (behavior.failCounts) throw new Error("connection refused");
      return { waiting: behavior.waiting ?? 0, active: 0, delayed: 0, failed: 0 };
    },
    getWorkers: async (): Promise<unknown[]> => behavior.workers,
    close: async (): Promise<void> => undefined,
  };
}

describe("checkMtaQueue worker liveness", () => {
  it("reports ok only when at least one worker is consuming the queue", async () => {
    const result = await checkMtaQueue(() => fakeQueue({ workers: [{ id: "w1" }] }));
    expect(result.status).toBe("ok");
  });

  it("reports degraded — not ok — when the queue is reachable but has no worker", async () => {
    const result = await checkMtaQueue(() => fakeQueue({ workers: [], waiting: 7 }));
    expect(result.status).toBe("degraded");
    expect(result.error).toContain("no worker");
    expect(result.error).toContain("7 waiting");
  });

  it("reports down when the queue itself is unreachable", async () => {
    const result = await checkMtaQueue(() => fakeQueue({ workers: [], failCounts: true }));
    expect(result.status).toBe("down");
  });
});
