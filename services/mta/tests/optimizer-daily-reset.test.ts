/**
 * Tests for the per-ISP daily counter reset (DeliveryOptimizer).
 *
 * `resetDailyCounters()`'s own doc comment said "should be called by an
 * external scheduler once per day" — and it had ZERO callers. So
 * `messagesThisDay` only ever incremented, and a long-lived MTA process
 * eventually saturated every ISP's daily cap and silently throttled to zero,
 * permanently. The hourly sibling was wired (worker.ts maintenance interval);
 * the daily one was not.
 *
 * The worker now polls `maybeResetDailyCounters()` every minute, which resets
 * exactly once per UTC-date change. That rollover detection — the part a
 * future refactor could silently drop again — is what is pinned here.
 */

import { describe, it, expect } from "vitest";
import { DeliveryOptimizer } from "../src/delivery/optimizer.js";

/** A time comfortably inside one UTC day. */
const TODAY = new Date("2026-03-02T09:00:00.000Z");
/** Later the same UTC day — must NOT trigger a reset. */
const TODAY_LATER = new Date("2026-03-02T23:59:59.000Z");
/** Just past the following UTC midnight — MUST trigger a reset. */
const TOMORROW = new Date("2026-03-03T00:00:30.000Z");

function saturatedOptimizer(): DeliveryOptimizer {
  const optimizer = new DeliveryOptimizer();
  // Simulate a long-lived process that has sent all day: counters high,
  // domain hard-throttled until "midnight".
  const state = optimizer.getThrottleState("gmail.com");
  state.messagesThisDay = 50_000; // at gmail.com's maxMessagesPerDay
  state.messagesThisHour = 1_200;
  state.throttled = true;
  state.throttledUntil = new Date("2026-03-03T00:00:00.000Z");
  return optimizer;
}

describe("DeliveryOptimizer — maybeResetDailyCounters", () => {
  it("does nothing while the UTC date is unchanged", () => {
    const optimizer = saturatedOptimizer();
    // Align the tracked date with TODAY first (construction uses real now).
    optimizer.maybeResetDailyCounters(TODAY);
    const state = optimizer.getThrottleState("gmail.com");
    state.messagesThisDay = 50_000;
    state.messagesThisHour = 1_200;

    expect(optimizer.maybeResetDailyCounters(TODAY_LATER)).toBe(false);
    expect(state.messagesThisDay).toBe(50_000);
    expect(state.messagesThisHour).toBe(1_200);
  });

  it("resets the counters when the UTC day rolls over", () => {
    const optimizer = saturatedOptimizer();
    optimizer.maybeResetDailyCounters(TODAY); // align tracked date
    const state = optimizer.getThrottleState("gmail.com");
    state.messagesThisDay = 50_000;
    state.messagesThisHour = 1_200;
    state.throttled = true;
    state.throttledUntil = new Date("2026-03-03T00:00:00.000Z");

    expect(optimizer.maybeResetDailyCounters(TOMORROW)).toBe(true);
    expect(state.messagesThisDay).toBe(0);
    expect(state.messagesThisHour).toBe(0);
    expect(state.throttled).toBe(false);
    expect(state.throttledUntil).toBeNull();
  });

  it("resets at most once per UTC day, however often it is polled", () => {
    const optimizer = saturatedOptimizer();
    optimizer.maybeResetDailyCounters(TODAY);

    expect(optimizer.maybeResetDailyCounters(TOMORROW)).toBe(true);

    // The worker's send counting resumes after the rollover; further polls
    // the same day must not wipe it again.
    const state = optimizer.getThrottleState("gmail.com");
    state.messagesThisDay = 7;
    const laterSameDay = new Date("2026-03-03T12:00:00.000Z");
    expect(optimizer.maybeResetDailyCounters(laterSameDay)).toBe(false);
    expect(state.messagesThisDay).toBe(7);
  });

  it("resets every registered domain, not just one", () => {
    const optimizer = new DeliveryOptimizer();
    optimizer.maybeResetDailyCounters(TODAY);
    for (const domain of ["gmail.com", "outlook.com", "example.org"]) {
      optimizer.getThrottleState(domain).messagesThisDay = 999;
    }

    expect(optimizer.maybeResetDailyCounters(TOMORROW)).toBe(true);
    for (const domain of ["gmail.com", "outlook.com", "example.org"]) {
      expect(optimizer.getThrottleState(domain).messagesThisDay).toBe(0);
    }
  });
});
