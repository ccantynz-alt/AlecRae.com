/**
 * @alecrae/mta — Warmup pacing engine tests
 */

import { describe, expect, test } from "bun:test";
import {
  classifyRecipientIsp,
  computeLimitsForDay,
  recordSend,
  rollDailyCountersIfNeeded,
  shouldAllowSend,
  type IspBucket,
  type WarmupState,
} from "./warmup.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_COUNTERS: Record<IspBucket, number> = {
  gmail: 0,
  outlook: 0,
  yahoo: 0,
  apple: 0,
  other: 0,
};

function makeState(partial?: Partial<WarmupState>): WarmupState {
  return {
    ipAddress: "1.2.3.4",
    warmupStartedAt: Date.UTC(2026, 0, 1),
    currentDay: 1,
    sentTodayByIsp: { ...EMPTY_COUNTERS },
    dailyResetAt: Date.UTC(2026, 0, 2),
    ...partial,
  };
}

// ─── classifyRecipientIsp ───────────────────────────────────────────────────

describe("classifyRecipientIsp", () => {
  test("recognises gmail domains", () => {
    expect(classifyRecipientIsp("alice@gmail.com")).toBe("gmail");
    expect(classifyRecipientIsp("bob@googlemail.com")).toBe("gmail");
    expect(classifyRecipientIsp("team@google.com")).toBe("gmail");
  });

  test("recognises outlook / microsoft family", () => {
    expect(classifyRecipientIsp("a@outlook.com")).toBe("outlook");
    expect(classifyRecipientIsp("a@hotmail.com")).toBe("outlook");
    expect(classifyRecipientIsp("a@live.com")).toBe("outlook");
    expect(classifyRecipientIsp("a@msn.com")).toBe("outlook");
    expect(classifyRecipientIsp("a@office365.com")).toBe("outlook");
  });

  test("recognises yahoo family", () => {
    expect(classifyRecipientIsp("a@yahoo.com")).toBe("yahoo");
    expect(classifyRecipientIsp("a@ymail.com")).toBe("yahoo");
    expect(classifyRecipientIsp("a@rocketmail.com")).toBe("yahoo");
  });

  test("recognises apple family", () => {
    expect(classifyRecipientIsp("a@icloud.com")).toBe("apple");
    expect(classifyRecipientIsp("a@me.com")).toBe("apple");
    expect(classifyRecipientIsp("a@mac.com")).toBe("apple");
  });

  test("treats unknown domains as other", () => {
    expect(classifyRecipientIsp("craig@alecrae.com")).toBe("other");
    expect(classifyRecipientIsp("x@example.com")).toBe("other");
    expect(classifyRecipientIsp("x@proton.me")).toBe("other");
  });

  test("is case-insensitive and trims", () => {
    expect(classifyRecipientIsp("Alice@GMAIL.com")).toBe("gmail");
    expect(classifyRecipientIsp("BOB@Outlook.COM")).toBe("outlook");
  });

  test("matches subdomains to their parent ISP", () => {
    expect(classifyRecipientIsp("a@mail.gmail.com")).toBe("gmail");
    expect(classifyRecipientIsp("a@corp.office365.com")).toBe("outlook");
  });

  test("handles malformed inputs as other", () => {
    expect(classifyRecipientIsp("not-an-email")).toBe("other");
    expect(classifyRecipientIsp("")).toBe("other");
    expect(classifyRecipientIsp("user@")).toBe("other");
  });
});

// ─── computeLimitsForDay ────────────────────────────────────────────────────

describe("computeLimitsForDay", () => {
  test("week 1 limits (day 1)", () => {
    const l = computeLimitsForDay(1);
    expect(l.byIsp).toEqual({
      gmail: 50,
      outlook: 50,
      yahoo: 25,
      apple: 25,
      other: 25,
    });
    expect(l.totalDaily).toBe(175);
  });

  test("week 1 limits hold through day 7", () => {
    expect(computeLimitsForDay(7).byIsp.gmail).toBe(50);
  });

  test("week 2 starts at day 8 and doubles", () => {
    const l = computeLimitsForDay(8);
    expect(l.byIsp.gmail).toBe(100);
    expect(l.byIsp.yahoo).toBe(50);
    expect(l.totalDaily).toBe(350);
  });

  test("weeks 3-6 follow the runbook schedule", () => {
    expect(computeLimitsForDay(15).byIsp.gmail).toBe(250); // W3
    expect(computeLimitsForDay(22).byIsp.gmail).toBe(500); // W4
    expect(computeLimitsForDay(29).byIsp.gmail).toBe(1000); // W5
    expect(computeLimitsForDay(36).byIsp.gmail).toBe(2000); // W6
    expect(computeLimitsForDay(42).byIsp.gmail).toBe(2000); // still W6
    expect(computeLimitsForDay(36).totalDaily).toBe(7000); // W6 total
  });

  test("day 43+ doubles off week 6 baseline", () => {
    const l43 = computeLimitsForDay(43);
    expect(l43.byIsp.gmail).toBe(4000);
    expect(l43.byIsp.other).toBe(2000);
    const l44 = computeLimitsForDay(44);
    expect(l44.byIsp.gmail).toBe(8000);
  });

  test("clamps non-positive day inputs to day 1", () => {
    expect(computeLimitsForDay(0)).toEqual(computeLimitsForDay(1));
    expect(computeLimitsForDay(-5)).toEqual(computeLimitsForDay(1));
  });
});

// ─── shouldAllowSend ────────────────────────────────────────────────────────

describe("shouldAllowSend", () => {
  test("allows first send of the day on day 1", () => {
    const d = shouldAllowSend(makeState(), "alice@gmail.com");
    expect(d.allow).toBe(true);
    expect(d.remainingQuotaForIsp).toBe(50);
  });

  test("denies once per-ISP cap hit, with nextAvailableAt = dailyResetAt", () => {
    const state = makeState({
      sentTodayByIsp: { ...EMPTY_COUNTERS, gmail: 50 },
    });
    const d = shouldAllowSend(state, "bob@gmail.com");
    expect(d.allow).toBe(false);
    expect(d.remainingQuotaForIsp).toBe(0);
    expect(d.nextAvailableAt).toBe(state.dailyResetAt);
    expect(d.reason).toContain("gmail");
  });

  test("per-ISP cap on one bucket does not block a different bucket", () => {
    const state = makeState({
      sentTodayByIsp: { ...EMPTY_COUNTERS, gmail: 50 },
    });
    expect(shouldAllowSend(state, "a@outlook.com").allow).toBe(true);
    expect(shouldAllowSend(state, "a@icloud.com").allow).toBe(true);
  });

  test("total-daily cap blocks even when a per-ISP bucket still has room", () => {
    // Day 1 total cap = 175. Fill everything except gmail to just hit total.
    // outlook=50, yahoo=25, apple=25, other=25 = 125; plus gmail=50 = 175.
    const state = makeState({
      sentTodayByIsp: { gmail: 50, outlook: 50, yahoo: 25, apple: 25, other: 25 },
    });
    // Gmail is already at cap — try a different bucket to hit total-first logic.
    // Drop gmail to 49 to leave 1 slot in gmail while total is 174.
    const state2 = makeState({
      sentTodayByIsp: { gmail: 49, outlook: 50, yahoo: 25, apple: 25, other: 25 },
    });
    const d = shouldAllowSend(state2, "x@gmail.com");
    expect(d.allow).toBe(true); // 1 gmail slot + total at 174 < 175

    // Now fill total exactly with a non-gmail send — gmail still has a slot
    // but total cap is hit.
    const state3 = makeState({
      sentTodayByIsp: { gmail: 49, outlook: 50, yahoo: 25, apple: 26, other: 25 },
    });
    const d3 = shouldAllowSend(state3, "x@gmail.com");
    expect(d3.allow).toBe(false);
    expect(d3.reason).toContain("Total");
    expect(d3.remainingQuotaForIsp).toBe(1); // gmail still reports 1 left per-ISP
  });

  test("day 8 (week 2) doubles allowed sends", () => {
    const state = makeState({
      currentDay: 8,
      sentTodayByIsp: { ...EMPTY_COUNTERS, gmail: 50 },
    });
    // 50 sent, cap now 100 → allowed
    expect(shouldAllowSend(state, "a@gmail.com").allow).toBe(true);
  });

  test("unknown ISP uses the 'other' bucket", () => {
    const state = makeState({
      sentTodayByIsp: { ...EMPTY_COUNTERS, other: 25 },
    });
    const d = shouldAllowSend(state, "craig@alecrae.com");
    expect(d.allow).toBe(false);
    expect(d.reason).toContain("other");
  });
});

// ─── recordSend ─────────────────────────────────────────────────────────────

describe("recordSend", () => {
  test("increments the correct bucket immutably", () => {
    const s1 = makeState();
    const s2 = recordSend(s1, "a@gmail.com");
    expect(s2.sentTodayByIsp.gmail).toBe(1);
    expect(s1.sentTodayByIsp.gmail).toBe(0); // original untouched
    expect(s2).not.toBe(s1);
  });

  test("does not touch unrelated buckets", () => {
    const s = recordSend(makeState(), "a@yahoo.com");
    expect(s.sentTodayByIsp.yahoo).toBe(1);
    expect(s.sentTodayByIsp.gmail).toBe(0);
    expect(s.sentTodayByIsp.outlook).toBe(0);
    expect(s.sentTodayByIsp.apple).toBe(0);
    expect(s.sentTodayByIsp.other).toBe(0);
  });

  test("can be applied many times in a row", () => {
    let s = makeState();
    for (let i = 0; i < 10; i++) s = recordSend(s, `user${i}@outlook.com`);
    expect(s.sentTodayByIsp.outlook).toBe(10);
  });

  test("preserves identity fields", () => {
    const s1 = makeState();
    const s2 = recordSend(s1, "a@gmail.com");
    expect(s2.ipAddress).toBe(s1.ipAddress);
    expect(s2.warmupStartedAt).toBe(s1.warmupStartedAt);
    expect(s2.currentDay).toBe(s1.currentDay);
    expect(s2.dailyResetAt).toBe(s1.dailyResetAt);
  });
});

// ─── rollDailyCountersIfNeeded ──────────────────────────────────────────────

describe("rollDailyCountersIfNeeded", () => {
  test("is a no-op before the reset boundary", () => {
    const s = makeState({
      sentTodayByIsp: { ...EMPTY_COUNTERS, gmail: 10 },
      dailyResetAt: 1000,
    });
    const out = rollDailyCountersIfNeeded(s, 500);
    expect(out).toBe(s); // same reference
  });

  test("zeroes counters and advances reset when due", () => {
    const resetAt = Date.UTC(2026, 0, 2);
    const s = makeState({
      currentDay: 1,
      sentTodayByIsp: { gmail: 10, outlook: 5, yahoo: 2, apple: 3, other: 1 },
      dailyResetAt: resetAt,
    });
    const out = rollDailyCountersIfNeeded(s, resetAt + 60_000);
    expect(out.sentTodayByIsp).toEqual(EMPTY_COUNTERS);
    expect(out.currentDay).toBe(2);
    expect(out.dailyResetAt).toBe(resetAt + 24 * 60 * 60 * 1000);
  });

  test("rolls forward multiple idle days at once", () => {
    const resetAt = Date.UTC(2026, 0, 2);
    const s = makeState({
      currentDay: 1,
      sentTodayByIsp: { ...EMPTY_COUNTERS, gmail: 7 },
      dailyResetAt: resetAt,
    });
    // 3.5 days later → crossed 4 whole daily boundaries
    const later = resetAt + 3.5 * 24 * 60 * 60 * 1000;
    const out = rollDailyCountersIfNeeded(s, later);
    expect(out.currentDay).toBe(5);
    expect(out.sentTodayByIsp.gmail).toBe(0);
    // Next reset must be strictly after `later`
    expect(out.dailyResetAt).toBeGreaterThan(later);
    // And within 24h of `later`
    expect(out.dailyResetAt - later).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test("after rollover, shouldAllowSend reflects fresh limits", () => {
    const resetAt = Date.UTC(2026, 0, 2);
    const saturated = makeState({
      currentDay: 1,
      sentTodayByIsp: { ...EMPTY_COUNTERS, gmail: 50 },
      dailyResetAt: resetAt,
    });
    expect(shouldAllowSend(saturated, "a@gmail.com").allow).toBe(false);
    const rolled = rollDailyCountersIfNeeded(saturated, resetAt + 1);
    expect(shouldAllowSend(rolled, "a@gmail.com").allow).toBe(true);
  });
});

// ─── Integration-style sanity check ─────────────────────────────────────────

describe("warmup integration", () => {
  test("a full day-1 run hits caps in the right order", () => {
    let state = makeState();
    let allowed = 0;
    for (let i = 0; i < 1000; i++) {
      const d = shouldAllowSend(state, `user${i}@gmail.com`);
      if (!d.allow) break;
      state = recordSend(state, `user${i}@gmail.com`);
      allowed += 1;
    }
    expect(allowed).toBe(50);
    expect(shouldAllowSend(state, "next@gmail.com").allow).toBe(false);
  });
});
