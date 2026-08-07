/**
 * Issue #166 — A/B test completion wrote confidence: 0.95 with no
 * significance test behind it, for every completed test with any winner.
 *
 * Now a real one-sided pooled two-proportion z-test runs between the winner
 * and the runner-up, or NO confidence value is stored at all — never a
 * constant. These tests pin the statistics helpers directly.
 */

import { describe, it, expect } from "vitest";
import {
  normalCdf,
  twoProportionConfidence,
} from "../src/routes/ab-tests.js";

describe("normalCdf", () => {
  it("matches known values of the standard normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    expect(normalCdf(3)).toBeCloseTo(0.99865, 4);
  });

  it("is symmetric: Φ(z) + Φ(-z) = 1", () => {
    for (const z of [0.3, 0.7, 1.5, 2.5]) {
      expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 6);
    }
  });
});

describe("twoProportionConfidence", () => {
  it("gives high confidence to a genuinely dominant variant", () => {
    const conf = twoProportionConfidence(
      { successes: 200, trials: 1000 },
      { successes: 100, trials: 1000 },
    );
    expect(conf).not.toBeNull();
    expect(conf as number).toBeGreaterThan(0.99);
  });

  it("gives ~0.5 (a coin flip) when the variants performed identically — never 0.95", () => {
    const conf = twoProportionConfidence(
      { successes: 50, trials: 500 },
      { successes: 50, trials: 500 },
    );
    expect(conf).toBeCloseTo(0.5, 6);
  });

  it("gives modest confidence to a tiny-sample lead — the case the constant 0.95 most misrepresented", () => {
    // 2/10 vs 1/10: nowhere near significance.
    const conf = twoProportionConfidence(
      { successes: 2, trials: 10 },
      { successes: 1, trials: 10 },
    );
    expect(conf).not.toBeNull();
    expect(conf as number).toBeLessThan(0.8);
  });

  it("returns null — no value at all — when the test cannot be computed", () => {
    // No sends on one side.
    expect(
      twoProportionConfidence(
        { successes: 5, trials: 10 },
        { successes: 0, trials: 0 },
      ),
    ).toBeNull();
    // Zero pooled variance: nobody opened anything.
    expect(
      twoProportionConfidence(
        { successes: 0, trials: 100 },
        { successes: 0, trials: 100 },
      ),
    ).toBeNull();
    // Zero pooled variance: everybody opened everything.
    expect(
      twoProportionConfidence(
        { successes: 100, trials: 100 },
        { successes: 50, trials: 50 },
      ),
    ).toBeNull();
  });

  it("stays within [0, 1]", () => {
    const conf = twoProportionConfidence(
      { successes: 999, trials: 1000 },
      { successes: 1, trials: 1000 },
    );
    expect(conf as number).toBeGreaterThan(0.99);
    expect(conf as number).toBeLessThanOrEqual(1);
  });
});
