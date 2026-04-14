import { describe, it, expect } from 'bun:test';
import {
  AUTO_WARMUP_SCHEDULE,
  resolveAutoStep,
  computeNextAutoDay,
} from '../src/warmup/orchestrator.js';

// ---------------------------------------------------------------------------
// AUTO_WARMUP_SCHEDULE — spec values (Fix 2: reputation-protection audit)
// ---------------------------------------------------------------------------

describe('AUTO_WARMUP_SCHEDULE', () => {
  it('matches the reputation-protection spec exactly for days 1-30', () => {
    // Required: day/limit/bounce-threshold from the audit spec.
    const expected = [
      { day: 1, dailyLimit: 50, advanceBounceRate: 0.05 },
      { day: 2, dailyLimit: 100, advanceBounceRate: 0.05 },
      { day: 3, dailyLimit: 500, advanceBounceRate: 0.05 },
      { day: 4, dailyLimit: 1_000, advanceBounceRate: 0.04 },
      { day: 7, dailyLimit: 5_000, advanceBounceRate: 0.03 },
      { day: 14, dailyLimit: 25_000, advanceBounceRate: 0.02 },
      { day: 30, dailyLimit: 100_000, advanceBounceRate: 0.01 },
    ];

    for (const e of expected) {
      const step = AUTO_WARMUP_SCHEDULE.find((s) => s.day === e.day);
      expect(step).toBeDefined();
      expect(step!.dailyLimit).toBe(e.dailyLimit);
      expect(step!.advanceBounceRate).toBe(e.advanceBounceRate);
    }
  });

  it('treats day 60+ as unlimited (plan-capped)', () => {
    const day60 = AUTO_WARMUP_SCHEDULE.find((s) => s.day === 60);
    expect(day60).toBeDefined();
    expect(day60!.dailyLimit).toBeGreaterThanOrEqual(Number.MAX_SAFE_INTEGER);
  });
});

describe('resolveAutoStep', () => {
  it('returns day-1 step for new domains (day 1)', () => {
    expect(resolveAutoStep(1).dailyLimit).toBe(50);
  });

  it('stays on day-3 step for days 3, 4, 5, 6', () => {
    // day 3 limit is 500; day 4 starts 1000; so day 3 only covers day 3
    expect(resolveAutoStep(3).dailyLimit).toBe(500);
    expect(resolveAutoStep(4).dailyLimit).toBe(1_000);
    // days 5 and 6 are still at the day-4 step of 1000 until day 7
    expect(resolveAutoStep(5).dailyLimit).toBe(1_000);
    expect(resolveAutoStep(6).dailyLimit).toBe(1_000);
    expect(resolveAutoStep(7).dailyLimit).toBe(5_000);
  });

  it('caps at the day-60 unlimited step for very old domains', () => {
    expect(resolveAutoStep(365).dailyLimit).toBeGreaterThanOrEqual(
      Number.MAX_SAFE_INTEGER,
    );
  });
});

// ---------------------------------------------------------------------------
// computeNextAutoDay — advance gate
// ---------------------------------------------------------------------------

describe('computeNextAutoDay — bounce-rate gate', () => {
  it('advances from day 1 → day 2 when wall-clock has moved and bounces are healthy', () => {
    const next = computeNextAutoDay({
      currentDay: 1,
      elapsedDays: 2,
      bounceRate24h: 0.01,
    });
    expect(next).toBe(2);
  });

  it('stays pinned at day 3 when bounce rate exceeds 5%', () => {
    // day-3 step allows advance only if bounceRate ≤ 0.05.
    const next = computeNextAutoDay({
      currentDay: 3,
      elapsedDays: 7, // wall-clock says day 7
      bounceRate24h: 0.08, // too high
    });
    expect(next).toBe(3);
  });

  it('stays pinned at day 4 when bounce rate exceeds 4%', () => {
    const next = computeNextAutoDay({
      currentDay: 4,
      elapsedDays: 14,
      bounceRate24h: 0.05, // > 4%
    });
    expect(next).toBe(4);
  });

  it('advances day 4 → day 7 when bounces are under 4%', () => {
    const next = computeNextAutoDay({
      currentDay: 4,
      elapsedDays: 7,
      bounceRate24h: 0.03, // under 4%
    });
    expect(next).toBe(7);
  });

  it('never advances past wall-clock even with perfect signals', () => {
    const next = computeNextAutoDay({
      currentDay: 1,
      elapsedDays: 1, // only day 1 of wall clock
      bounceRate24h: 0,
    });
    expect(next).toBe(1);
  });

  it('stays pinned at day 14 when bounce rate exceeds 2%', () => {
    const next = computeNextAutoDay({
      currentDay: 14,
      elapsedDays: 30,
      bounceRate24h: 0.025,
    });
    expect(next).toBe(14);
  });

  it('jumps multiple steps when wall-clock has advanced far and bounces are fine', () => {
    const next = computeNextAutoDay({
      currentDay: 1,
      elapsedDays: 14,
      bounceRate24h: 0.01,
    });
    // Day 1 can only advance if CURRENT step (day 1)'s threshold (5%) is met.
    // 1% < 5% → advance. Natural step for day 14 is 14 itself.
    expect(next).toBe(14);
  });
});
