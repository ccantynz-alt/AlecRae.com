/**
 * Global AI spend circuit breaker — independent of per-account quota.
 *
 * ai-quota.ts's per-account monthly counter is Redis-backed and
 * deliberately fails OPEN on a Redis outage (documented there: blocking
 * every AI feature account-wide on a Redis blip is worse than a brief
 * unmetered window). That's a reasonable per-account tradeoff, but it
 * means a Redis outage removes the *only* AI cost control that exists,
 * with nothing behind it — a retry storm, a bug, or abuse during exactly
 * that window has no ceiling at all.
 *
 * CLAUDE.md's own Emergency Protocols already promise this: "If AI cost
 * spikes 10x normal: Auto-throttle to free tier limits" — never actually
 * implemented anywhere. This is a process-wide (not per-account),
 * in-memory (not Redis-dependent, so it stays effective *during* a Redis
 * outage) sliding-window limiter: if AI calls across the whole process
 * spike far beyond normal volume, halt all AI calls for a cooldown period
 * rather than let a runaway loop burn spend with nothing to stop it.
 *
 * This is a blunt, last-resort safety net, not a replacement for the
 * per-account quota — it should only ever trip on a genuine anomaly.
 */

export interface CircuitBreakerCheck {
  allowed: boolean;
  reason?: "tripped";
}

export class AiCircuitBreaker {
  private callTimestamps: number[] = [];
  private trippedUntil = 0;

  constructor(
    private readonly maxCallsPerWindow: number,
    private readonly windowMs: number,
    private readonly cooldownMs: number,
  ) {}

  /** Check whether a call is allowed right now, and record it if so. */
  checkAndRecord(now: number = Date.now()): CircuitBreakerCheck {
    if (now < this.trippedUntil) {
      return { allowed: false, reason: "tripped" };
    }

    const windowStart = now - this.windowMs;
    this.callTimestamps = this.callTimestamps.filter((t) => t > windowStart);

    if (this.callTimestamps.length >= this.maxCallsPerWindow) {
      this.trippedUntil = now + this.cooldownMs;
      console.error(
        `[ai-circuit-breaker] TRIPPED: ${this.callTimestamps.length} AI calls in the last ${this.windowMs}ms (limit ${this.maxCallsPerWindow}) — halting ALL AI calls process-wide for ${this.cooldownMs}ms`,
      );
      return { allowed: false, reason: "tripped" };
    }

    this.callTimestamps.push(now);
    return { allowed: true };
  }

  /** Current state, for health/diagnostics endpoints. */
  getStatus(now: number = Date.now()): { tripped: boolean; recentCalls: number } {
    const windowStart = now - this.windowMs;
    return {
      tripped: now < this.trippedUntil,
      recentCalls: this.callTimestamps.filter((t) => t > windowStart).length,
    };
  }
}

const MAX_CALLS_PER_WINDOW = parseInt(process.env["AI_CIRCUIT_BREAKER_MAX_CALLS"] ?? "500", 10);
const WINDOW_MS = parseInt(process.env["AI_CIRCUIT_BREAKER_WINDOW_MS"] ?? "60000", 10); // 1 minute
const COOLDOWN_MS = parseInt(process.env["AI_CIRCUIT_BREAKER_COOLDOWN_MS"] ?? "300000", 10); // 5 minutes

export const globalAiCircuitBreaker = new AiCircuitBreaker(
  MAX_CALLS_PER_WINDOW,
  WINDOW_MS,
  COOLDOWN_MS,
);
