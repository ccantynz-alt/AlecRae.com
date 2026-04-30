/**
 * @alecrae/mta — Health + Readiness Probe Module
 *
 * Exposes two HTTP endpoints on a separate port (Fly.io expects this on
 * the dedicated health port — 8080 per our fly.toml):
 *
 *   GET /healthz  → Liveness probe. 200 as long as the process is alive.
 *                   No external calls. Used by Fly's http_checks.
 *   GET /readyz   → Readiness probe. Runs all registered checks concurrently
 *                   with per-check timeouts. Returns 200 when all critical
 *                   checks pass, 503 when any critical check fails.
 *   GET /metrics  → Placeholder. Returns 404 — real metrics ship via
 *                   OpenTelemetry per CLAUDE.md.
 *
 * Design notes:
 *   - No `any` anywhere. TypeScript strict.
 *   - Check runners enforce timeouts via Promise.race.
 *   - Non-critical failures degrade readiness but don't fail it.
 *   - Uptime measured from module load (process start in practice).
 */

import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HealthCheck {
  readonly name: string;
  readonly check: () => Promise<HealthResult>;
  readonly timeoutMs?: number;
  readonly critical?: boolean;
}

export interface HealthResult {
  readonly healthy: boolean;
  readonly message?: string;
  readonly latencyMs?: number;
  readonly details?: Record<string, string | number | boolean>;
}

export interface HealthReport {
  readonly status: "ok" | "degraded" | "fail";
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly checks: Array<{ name: string } & HealthResult>;
  readonly timestamp: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 2000;

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Run a single check with a timeout. Always resolves — never throws —
 * producing a HealthResult that captures the outcome.
 */
async function runCheck(
  check: HealthCheck,
): Promise<{ name: string } & HealthResult> {
  const timeoutMs = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  const timeoutPromise = new Promise<HealthResult>((resolve) => {
    setTimeout(() => {
      resolve({
        healthy: false,
        message: `check timed out after ${timeoutMs}ms`,
        latencyMs: timeoutMs,
      });
    }, timeoutMs);
  });

  let result: HealthResult;
  try {
    result = await Promise.race([check.check(), timeoutPromise]);
  } catch (err) {
    result = {
      healthy: false,
      message: err instanceof Error ? err.message : "check threw non-Error",
      latencyMs: Date.now() - start,
    };
  }

  // Ensure latency is populated (checks may not report it).
  const latencyMs = result.latencyMs ?? Date.now() - start;

  return {
    name: check.name,
    healthy: result.healthy,
    ...(result.message !== undefined ? { message: result.message } : {}),
    latencyMs,
    ...(result.details !== undefined ? { details: result.details } : {}),
  };
}

/**
 * Aggregate overall status from an array of check results.
 *   - fail     = any critical check failed
 *   - degraded = all critical passed, but at least one non-critical failed
 *   - ok       = every check passed
 */
function aggregateStatus(
  results: ReadonlyArray<{ name: string } & HealthResult>,
  checks: readonly HealthCheck[],
): "ok" | "degraded" | "fail" {
  const byName = new Map(checks.map((c) => [c.name, c]));
  let anyCriticalFailed = false;
  let anyFailed = false;

  for (const r of results) {
    if (!r.healthy) {
      anyFailed = true;
      const def = byName.get(r.name);
      const isCritical = def?.critical ?? true;
      if (isCritical) anyCriticalFailed = true;
    }
  }

  if (anyCriticalFailed) return "fail";
  if (anyFailed) return "degraded";
  return "ok";
}

// ─── Server factory ─────────────────────────────────────────────────────────

export function createHealthServer(opts: {
  port: number;
  version: string;
  checks: readonly HealthCheck[];
}): { start: () => Promise<void>; stop: () => Promise<void> } {
  const startedAt = Date.now();
  const app = buildHealthApp({
    version: opts.version,
    checks: opts.checks,
    startedAt,
  });

  let server: ServerType | null = null;

  return {
    start: () =>
      new Promise<void>((resolve, reject) => {
        try {
          server = serve(
            { fetch: app.fetch, port: opts.port },
            () => resolve(),
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.close(() => resolve());
        server = null;
      }),
  };
}

/**
 * Build the Hono app. Exported for tests (via the internal test helper) so
 * we can exercise the routes without binding a TCP port.
 */
export function buildHealthApp(opts: {
  version: string;
  checks: readonly HealthCheck[];
  startedAt: number;
}): Hono {
  const app = new Hono();

  // Liveness: always 200 if the process can serve HTTP.
  app.get("/healthz", (c) =>
    c.json({
      status: "ok",
      version: opts.version,
      uptimeSeconds: Math.floor((Date.now() - opts.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }),
  );

  // Readiness: run all checks concurrently; 503 if any critical check fails.
  app.get("/readyz", async (c) => {
    const results = await Promise.all(opts.checks.map((check) => runCheck(check)));
    const status = aggregateStatus(results, opts.checks);
    const report: HealthReport = {
      status,
      version: opts.version,
      uptimeSeconds: Math.floor((Date.now() - opts.startedAt) / 1000),
      checks: results,
      timestamp: new Date().toISOString(),
    };
    const httpStatus = status === "fail" ? 503 : 200;
    return c.json(report, httpStatus);
  });

  // Metrics placeholder — real metrics emitted via OpenTelemetry.
  app.get("/metrics", (c) =>
    c.json(
      {
        error: "not_implemented",
        message: "TODO: real metrics emitted via OpenTelemetry (OTel exporter).",
      },
      404,
    ),
  );

  return app;
}

// ─── Built-in check factories ───────────────────────────────────────────────

/**
 * Database health check — runs `SELECT 1` against the provided connection.
 * The getter lets callers resolve the client lazily (supports DI + mocks).
 */
export function dbCheck(
  getDb: () => { execute: (sql: string) => Promise<unknown> },
): HealthCheck {
  return {
    name: "database",
    critical: true,
    timeoutMs: 2000,
    check: async (): Promise<HealthResult> => {
      const start = Date.now();
      try {
        await getDb().execute("SELECT 1");
        return { healthy: true, latencyMs: Date.now() - start };
      } catch (err) {
        return {
          healthy: false,
          message: err instanceof Error ? err.message : "db check failed",
          latencyMs: Date.now() - start,
        };
      }
    },
  };
}

/**
 * Redis health check — `PING` must return `PONG`.
 */
export function redisCheck(client: {
  ping: () => Promise<string>;
}): HealthCheck {
  return {
    name: "redis",
    critical: true,
    timeoutMs: 2000,
    check: async (): Promise<HealthResult> => {
      const start = Date.now();
      try {
        const reply = await client.ping();
        const healthy = reply === "PONG";
        return {
          healthy,
          latencyMs: Date.now() - start,
          ...(healthy ? {} : { message: `unexpected PING reply: ${reply}` }),
        };
      } catch (err) {
        return {
          healthy: false,
          message: err instanceof Error ? err.message : "redis check failed",
          latencyMs: Date.now() - start,
        };
      }
    },
  };
}

/**
 * Queue depth check — non-critical by default. A backed-up queue is a signal
 * to page, not a signal to fail readiness (we'd just stop accepting traffic).
 */
export function queueDepthCheck(
  getQueueDepth: () => Promise<number>,
  maxHealthyDepth: number,
): HealthCheck {
  return {
    name: "queue_depth",
    critical: false,
    timeoutMs: 2000,
    check: async (): Promise<HealthResult> => {
      const start = Date.now();
      try {
        const depth = await getQueueDepth();
        const healthy = depth <= maxHealthyDepth;
        return {
          healthy,
          latencyMs: Date.now() - start,
          details: { depth, maxHealthyDepth },
          ...(healthy
            ? {}
            : { message: `queue depth ${depth} exceeds ${maxHealthyDepth}` }),
        };
      } catch (err) {
        return {
          healthy: false,
          message:
            err instanceof Error ? err.message : "queue depth check failed",
          latencyMs: Date.now() - start,
        };
      }
    },
  };
}

/**
 * SMTP listener check — verifies the SMTP server is bound and listening.
 * Critical: without the listener, we can't accept mail.
 */
export function smtpListenerCheck(
  getSmtpStatus: () => { listening: boolean; port: number },
): HealthCheck {
  return {
    name: "smtp_listener",
    critical: true,
    timeoutMs: 500,
    check: async (): Promise<HealthResult> => {
      const start = Date.now();
      const status = getSmtpStatus();
      return {
        healthy: status.listening,
        latencyMs: Date.now() - start,
        details: { listening: status.listening, port: status.port },
        ...(status.listening
          ? {}
          : { message: `SMTP listener not bound on port ${status.port}` }),
      };
    },
  };
}
