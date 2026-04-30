/**
 * Tests for the health + readiness probe module.
 *
 * Uses Hono's built-in `app.request()` test helper — no port binding required.
 */

import { describe, it, expect } from "bun:test";
import {
  buildHealthApp,
  dbCheck,
  redisCheck,
  queueDepthCheck,
  smtpListenerCheck,
  type HealthCheck,
  type HealthReport,
  type HealthResult,
} from "./health.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeApp(checks: readonly HealthCheck[]) {
  return buildHealthApp({
    version: "test-0.0.1",
    checks,
    startedAt: Date.now() - 5000, // fake 5s uptime
  });
}

async function getReadyz(
  checks: readonly HealthCheck[],
): Promise<{ status: number; body: HealthReport }> {
  const app = makeApp(checks);
  const res = await app.request("/readyz");
  const body = (await res.json()) as HealthReport;
  return { status: res.status, body };
}

const passingCheck = (name: string, critical = true): HealthCheck => ({
  name,
  critical,
  check: async (): Promise<HealthResult> => ({ healthy: true, latencyMs: 1 }),
});

const failingCheck = (name: string, critical = true): HealthCheck => ({
  name,
  critical,
  check: async (): Promise<HealthResult> => ({
    healthy: false,
    message: "simulated failure",
    latencyMs: 1,
  }),
});

// ─── /healthz ───────────────────────────────────────────────────────────────

describe("/healthz", () => {
  it("returns 200 with status ok regardless of checks", async () => {
    const app = makeApp([failingCheck("db")]); // even with a failing check
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      version: string;
      uptimeSeconds: number;
      timestamp: string;
    };
    expect(body.status).toBe("ok");
    expect(body.version).toBe("test-0.0.1");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof body.timestamp).toBe("string");
    // ISO 8601 sanity
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── /readyz ────────────────────────────────────────────────────────────────

describe("/readyz — aggregate status", () => {
  it("returns ok (200) when all checks pass", async () => {
    const { status, body } = await getReadyz([
      passingCheck("db"),
      passingCheck("redis"),
      passingCheck("queue", false),
    ]);
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toHaveLength(3);
    for (const c of body.checks) {
      expect(c.healthy).toBe(true);
      expect(typeof c.latencyMs).toBe("number");
    }
  });

  it("returns degraded (200) when only a non-critical check fails", async () => {
    const { status, body } = await getReadyz([
      passingCheck("db"),
      passingCheck("redis"),
      failingCheck("queue", false),
    ]);
    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
    const queue = body.checks.find((c) => c.name === "queue");
    expect(queue).toBeDefined();
    expect(queue?.healthy).toBe(false);
    expect(queue?.message).toBe("simulated failure");
  });

  it("returns fail (503) when a critical check fails", async () => {
    const { status, body } = await getReadyz([
      failingCheck("db", true),
      passingCheck("redis"),
    ]);
    expect(status).toBe(503);
    expect(body.status).toBe("fail");
    const db = body.checks.find((c) => c.name === "db");
    expect(db?.healthy).toBe(false);
  });

  it("returns fail (503) when a critical check throws", async () => {
    const throwing: HealthCheck = {
      name: "db",
      critical: true,
      check: async (): Promise<HealthResult> => {
        throw new Error("boom");
      },
    };
    const { status, body } = await getReadyz([throwing]);
    expect(status).toBe(503);
    expect(body.status).toBe("fail");
    const db = body.checks.find((c) => c.name === "db");
    expect(db?.healthy).toBe(false);
    expect(db?.message).toBe("boom");
  });

  it("defaults critical to true when unspecified", async () => {
    const noCritFlag: HealthCheck = {
      name: "db",
      check: async (): Promise<HealthResult> => ({
        healthy: false,
        message: "down",
      }),
    };
    const { status, body } = await getReadyz([noCritFlag]);
    expect(status).toBe(503);
    expect(body.status).toBe("fail");
  });
});

// ─── /readyz — timeouts ─────────────────────────────────────────────────────

describe("/readyz — timeout handling", () => {
  it("marks a check unhealthy if it exceeds timeoutMs", async () => {
    const slow: HealthCheck = {
      name: "slow",
      critical: true,
      timeoutMs: 50,
      check: () =>
        new Promise<HealthResult>((resolve) => {
          setTimeout(() => resolve({ healthy: true }), 300);
        }),
    };
    const started = Date.now();
    const { status, body } = await getReadyz([slow]);
    const elapsed = Date.now() - started;

    expect(status).toBe(503);
    expect(body.status).toBe("fail");
    const entry = body.checks.find((c) => c.name === "slow");
    expect(entry?.healthy).toBe(false);
    expect(entry?.message).toContain("timed out");
    // Must have aborted well before the 300ms the check would have taken.
    expect(elapsed).toBeLessThan(250);
  });

  it("does not time out checks that resolve in time", async () => {
    const fast: HealthCheck = {
      name: "fast",
      critical: true,
      timeoutMs: 200,
      check: () =>
        new Promise<HealthResult>((resolve) => {
          setTimeout(() => resolve({ healthy: true, latencyMs: 20 }), 20);
        }),
    };
    const { status, body } = await getReadyz([fast]);
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
  });
});

// ─── HealthResult shape ─────────────────────────────────────────────────────

describe("HealthResult shape", () => {
  it("includes name, healthy, latencyMs on every reported check", async () => {
    const withDetails: HealthCheck = {
      name: "detailed",
      critical: false,
      check: async (): Promise<HealthResult> => ({
        healthy: true,
        latencyMs: 7,
        details: { depth: 3, maxHealthyDepth: 100, listening: true },
      }),
    };
    const { body } = await getReadyz([withDetails]);
    const entry = body.checks[0];
    expect(entry).toBeDefined();
    expect(entry?.name).toBe("detailed");
    expect(entry?.healthy).toBe(true);
    expect(typeof entry?.latencyMs).toBe("number");
    expect(entry?.details).toEqual({
      depth: 3,
      maxHealthyDepth: 100,
      listening: true,
    });
  });

  it("populates a synthetic latencyMs when a check omits it", async () => {
    const noLatency: HealthCheck = {
      name: "no-latency",
      check: async (): Promise<HealthResult> => ({ healthy: true }),
    };
    const { body } = await getReadyz([noLatency]);
    const entry = body.checks[0];
    expect(typeof entry?.latencyMs).toBe("number");
    expect(entry?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("produces HealthReport with status/version/uptime/checks/timestamp", async () => {
    const { body } = await getReadyz([passingCheck("db")]);
    expect(["ok", "degraded", "fail"]).toContain(body.status);
    expect(body.version).toBe("test-0.0.1");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(Array.isArray(body.checks)).toBe(true);
    expect(typeof body.timestamp).toBe("string");
  });
});

// ─── /metrics ───────────────────────────────────────────────────────────────

describe("/metrics", () => {
  it("returns 404 with a TODO marker", async () => {
    const app = makeApp([]);
    const res = await app.request("/metrics");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not_implemented");
    expect(body.message).toContain("OpenTelemetry");
  });
});

// ─── Built-in check factories ───────────────────────────────────────────────

describe("dbCheck", () => {
  it("is healthy when execute() resolves", async () => {
    const check = dbCheck(() => ({ execute: async () => undefined }));
    const result = await check.check();
    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("is unhealthy when execute() rejects", async () => {
    const check = dbCheck(() => ({
      execute: async () => {
        throw new Error("connection refused");
      },
    }));
    const result = await check.check();
    expect(result.healthy).toBe(false);
    expect(result.message).toBe("connection refused");
  });
});

describe("redisCheck", () => {
  it("is healthy when ping returns PONG", async () => {
    const check = redisCheck({ ping: async () => "PONG" });
    const result = await check.check();
    expect(result.healthy).toBe(true);
  });

  it("is unhealthy when ping returns something else", async () => {
    const check = redisCheck({ ping: async () => "WAT" });
    const result = await check.check();
    expect(result.healthy).toBe(false);
    expect(result.message).toContain("WAT");
  });

  it("is unhealthy when ping throws", async () => {
    const check = redisCheck({
      ping: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const result = await check.check();
    expect(result.healthy).toBe(false);
    expect(result.message).toBe("ECONNREFUSED");
  });
});

describe("queueDepthCheck", () => {
  it("is non-critical by default", () => {
    const check = queueDepthCheck(async () => 0, 100);
    expect(check.critical).toBe(false);
  });

  it("is healthy when depth <= max", async () => {
    const check = queueDepthCheck(async () => 50, 100);
    const result = await check.check();
    expect(result.healthy).toBe(true);
    expect(result.details?.["depth"]).toBe(50);
  });

  it("is unhealthy when depth exceeds max", async () => {
    const check = queueDepthCheck(async () => 500, 100);
    const result = await check.check();
    expect(result.healthy).toBe(false);
    expect(result.message).toContain("500");
    expect(result.message).toContain("100");
  });
});

describe("smtpListenerCheck", () => {
  it("is healthy when listener is bound", async () => {
    const check = smtpListenerCheck(() => ({ listening: true, port: 25 }));
    const result = await check.check();
    expect(result.healthy).toBe(true);
    expect(result.details?.["port"]).toBe(25);
    expect(result.details?.["listening"]).toBe(true);
  });

  it("is unhealthy when listener is not bound", async () => {
    const check = smtpListenerCheck(() => ({ listening: false, port: 25 }));
    const result = await check.check();
    expect(result.healthy).toBe(false);
    expect(result.message).toContain("25");
  });
});
