/**
 * @alecrae/mta — Retry policy tests
 *
 * Deterministic via a seedable Mulberry32 RNG. No I/O, no network, no Date
 * mocking beyond passing explicit `firstAttemptAt` values.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  DEFAULT_POLICY,
  decideRetry,
  registerDomainPolicy,
  getDomainPolicy,
  clearDomainPolicies,
  type RetryContext,
  type RetryPolicy,
} from "./retry-policy.js";

// ─── Deterministic RNG (Mulberry32) ─────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG fixed at 0.5 → zero-jitter (multiplier = 1). */
const noJitterRng = (): number => 0.5;

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<RetryContext> = {}): RetryContext {
  return {
    attempt: 1,
    firstAttemptAt: Date.now(),
    recipientDomain: "example.com",
    messageSizeBytes: 1024,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("retry-policy", () => {
  beforeEach(() => {
    clearDomainPolicies();
  });

  afterEach(() => {
    clearDomainPolicies();
  });

  test("first-attempt retry delay equals base (no jitter at rng=0.5)", () => {
    const d = decideRetry(makeCtx({ attempt: 1 }), DEFAULT_POLICY, noJitterRng);
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.delaySeconds).toBe(DEFAULT_POLICY.baseDelaySeconds);
      expect(d.attempt).toBe(2);
    }
  });

  test("exponential growth: attempt N delay ≈ base * 2^(N-1) (no jitter)", () => {
    const attempts = [1, 2, 3, 4, 5];
    const expected = attempts.map((a) => DEFAULT_POLICY.baseDelaySeconds * 2 ** (a - 1));
    const got = attempts.map((a) => {
      const d = decideRetry(makeCtx({ attempt: a }), DEFAULT_POLICY, noJitterRng);
      return d.action === "retry" ? d.delaySeconds : -1;
    });
    expect(got).toEqual(expected);
  });

  test("delay is clamped to maxDelaySeconds even at high attempt numbers", () => {
    const d = decideRetry(makeCtx({ attempt: 9 }), DEFAULT_POLICY, noJitterRng);
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.delaySeconds).toBeLessThanOrEqual(DEFAULT_POLICY.maxDelaySeconds);
      // base=60, 2^8=256 → 15360s raw, capped at 14400s.
      expect(d.delaySeconds).toBe(DEFAULT_POLICY.maxDelaySeconds);
    }
  });

  test("max-attempt cutoff → bounce", () => {
    const d = decideRetry(
      makeCtx({ attempt: DEFAULT_POLICY.maxAttempts }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(d.action).toBe("bounce");
    if (d.action === "bounce") {
      expect(d.reason).toContain("max attempts");
    }
  });

  test("max-age cutoff → bounce", () => {
    const d = decideRetry(
      makeCtx({
        attempt: 2,
        firstAttemptAt: Date.now() - (DEFAULT_POLICY.maxAgeSeconds + 10) * 1000,
      }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(d.action).toBe("bounce");
    if (d.action === "bounce") {
      expect(d.reason).toContain("max age");
    }
  });

  test("hard bounce short-circuits regardless of attempt", () => {
    const d = decideRetry(
      makeCtx({ attempt: 1, bounceClass: "hard" }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(d.action).toBe("bounce");
    if (d.action === "bounce") {
      expect(d.reason).toContain("hard");
    }
  });

  test("policy bounce short-circuits", () => {
    const d = decideRetry(
      makeCtx({ attempt: 1, bounceClass: "policy" }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(d.action).toBe("bounce");
    if (d.action === "bounce") {
      expect(d.reason).toContain("policy");
    }
  });

  test("block bounce short-circuits", () => {
    const d = decideRetry(
      makeCtx({ attempt: 1, bounceClass: "block" }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(d.action).toBe("bounce");
  });

  test("transient failures use a shorter base delay", () => {
    const transient = decideRetry(
      makeCtx({ attempt: 1, bounceClass: "transient" }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    const soft = decideRetry(
      makeCtx({ attempt: 1, bounceClass: "soft" }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(transient.action).toBe("retry");
    expect(soft.action).toBe("retry");
    if (transient.action === "retry" && soft.action === "retry") {
      expect(transient.delaySeconds).toBeLessThan(soft.delaySeconds);
    }
  });

  test("soft failures follow the standard curve", () => {
    const d = decideRetry(
      makeCtx({ attempt: 3, bounceClass: "soft" }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.delaySeconds).toBe(DEFAULT_POLICY.baseDelaySeconds * 4); // 2^(3-1)
    }
  });

  test("jitter bounds: delay stays within ±(jitter/2) of the raw value", () => {
    const rng = makeRng(42);
    const policy: RetryPolicy = { ...DEFAULT_POLICY, jitterFactor: 0.2 };
    const raw = DEFAULT_POLICY.baseDelaySeconds * 2; // attempt 2 → 120s
    const lower = raw * (1 - 0.2 * 0.5); // 108
    const upper = raw * (1 + 0.2 * 0.5); // 132
    for (let i = 0; i < 200; i++) {
      const d = decideRetry(makeCtx({ attempt: 2 }), policy, rng);
      expect(d.action).toBe("retry");
      if (d.action === "retry") {
        expect(d.delaySeconds).toBeGreaterThanOrEqual(lower - 1e-9);
        expect(d.delaySeconds).toBeLessThanOrEqual(upper + 1e-9);
      }
    }
  });

  test("jitterFactor=0 produces exactly the raw delay", () => {
    const policy: RetryPolicy = { ...DEFAULT_POLICY, jitterFactor: 0 };
    const rng = makeRng(99);
    const d = decideRetry(makeCtx({ attempt: 4 }), policy, rng);
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.delaySeconds).toBe(DEFAULT_POLICY.baseDelaySeconds * 8);
    }
  });

  test("per-domain override takes effect when no explicit policy is passed", () => {
    const gmailPolicy: RetryPolicy = {
      maxAttempts: 5,
      maxAgeSeconds: 24 * 60 * 60,
      baseDelaySeconds: 120,
      maxDelaySeconds: 2 * 60 * 60,
      jitterFactor: 0.1,
    };
    registerDomainPolicy("gmail.com", gmailPolicy);
    expect(getDomainPolicy("GMAIL.COM")).toEqual(gmailPolicy);

    const d = decideRetry(
      makeCtx({ attempt: 1, recipientDomain: "gmail.com" }),
      undefined,
      noJitterRng,
    );
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.delaySeconds).toBe(gmailPolicy.baseDelaySeconds);
    }
  });

  test("explicit policy argument overrides both domain override and default", () => {
    registerDomainPolicy("example.com", {
      ...DEFAULT_POLICY,
      baseDelaySeconds: 999,
    });
    const explicit: RetryPolicy = { ...DEFAULT_POLICY, baseDelaySeconds: 7 };
    const d = decideRetry(
      makeCtx({ attempt: 1, recipientDomain: "example.com" }),
      explicit,
      noJitterRng,
    );
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.delaySeconds).toBe(7);
    }
  });

  test("attempt count increments in returned decision", () => {
    const d = decideRetry(makeCtx({ attempt: 3 }), DEFAULT_POLICY, noJitterRng);
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.attempt).toBe(4);
    }
  });

  test("unknown / missing bounceClass follows soft-like path (still retries)", () => {
    const d1 = decideRetry(makeCtx({ attempt: 1 }), DEFAULT_POLICY, noJitterRng);
    const d2 = decideRetry(
      makeCtx({ attempt: 1, bounceClass: "unknown" }),
      DEFAULT_POLICY,
      noJitterRng,
    );
    expect(d1.action).toBe("retry");
    expect(d2.action).toBe("retry");
    if (d1.action === "retry" && d2.action === "retry") {
      expect(d1.delaySeconds).toBe(d2.delaySeconds);
    }
  });

  test("delay is never negative even with aggressive jitter values", () => {
    const policy: RetryPolicy = { ...DEFAULT_POLICY, jitterFactor: 1 };
    const rng = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const d = decideRetry(makeCtx({ attempt: 1 }), policy, rng);
      if (d.action === "retry") {
        expect(d.delaySeconds).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
