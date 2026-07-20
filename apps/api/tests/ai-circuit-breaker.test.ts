/**
 * Tests for the process-wide AI spend circuit breaker
 * (apps/api/src/lib/ai-circuit-breaker.ts).
 *
 * This is the safety net behind ai-quota.ts's per-account Redis quota,
 * which deliberately fails open on a Redis outage — the circuit breaker
 * is in-memory specifically so it stays effective during that outage.
 */

import { describe, it, expect } from "vitest";
import { AiCircuitBreaker } from "../src/lib/ai-circuit-breaker.js";

describe("AiCircuitBreaker", () => {
  it("allows calls under the limit", () => {
    const breaker = new AiCircuitBreaker(5, 60_000, 300_000);
    for (let i = 0; i < 5; i++) {
      expect(breaker.checkAndRecord(1000).allowed).toBe(true);
    }
  });

  it("trips once the window limit is exceeded", () => {
    const breaker = new AiCircuitBreaker(3, 60_000, 300_000);
    expect(breaker.checkAndRecord(1000).allowed).toBe(true);
    expect(breaker.checkAndRecord(1000).allowed).toBe(true);
    expect(breaker.checkAndRecord(1000).allowed).toBe(true);
    const fourth = breaker.checkAndRecord(1000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toBe("tripped");
  });

  it("stays tripped for the full cooldown, even for calls that would otherwise be under the window limit", () => {
    const breaker = new AiCircuitBreaker(1, 60_000, 300_000);
    breaker.checkAndRecord(1000); // allowed, trips nothing yet
    expect(breaker.checkAndRecord(1000).allowed).toBe(false); // trips here
    // Still within the cooldown window (300s), even far outside the 60s rate window.
    expect(breaker.checkAndRecord(1000 + 120_000).allowed).toBe(false);
  });

  it("recovers after the cooldown expires", () => {
    const breaker = new AiCircuitBreaker(1, 60_000, 300_000);
    breaker.checkAndRecord(1000);
    expect(breaker.checkAndRecord(1000).allowed).toBe(false); // trips
    expect(breaker.checkAndRecord(1000 + 300_001).allowed).toBe(true); // cooldown elapsed
  });

  it("old calls fall out of the sliding window and don't count toward the limit", () => {
    const breaker = new AiCircuitBreaker(2, 10_000, 300_000);
    expect(breaker.checkAndRecord(1000).allowed).toBe(true);
    expect(breaker.checkAndRecord(2000).allowed).toBe(true);
    // 15s later — the first two calls are now outside the 10s window.
    expect(breaker.checkAndRecord(16_000).allowed).toBe(true);
  });

  it("getStatus reports tripped state and recent call count", () => {
    const breaker = new AiCircuitBreaker(2, 60_000, 300_000);
    breaker.checkAndRecord(1000);
    breaker.checkAndRecord(1000);
    expect(breaker.checkAndRecord(1000).allowed).toBe(false);
    const status = breaker.getStatus(1000);
    expect(status.tripped).toBe(true);
  });
});
