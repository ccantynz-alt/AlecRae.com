/**
 * Unit tests for the WarmupOrchestrator module.
 *
 * Tests the pure/exported helpers and schedule constants that can be
 * exercised without a database. The DB-backed class methods
 * (startWarmup, getDailyLimit, ensureWarmupAndCheck, etc.) are tested
 * via integration tests that depend on a running Postgres instance.
 */

import { describe, it, expect } from 'bun:test';
import {
  resolveAutoStep,
  computeNextAutoDay,
  AUTO_WARMUP_SCHEDULE,
  WARMUP_SCHEDULES,
  WARMUP_LIMIT_EXCEEDED,
} from '../src/warmup/orchestrator.js';
import type { AutoWarmupStep, ScheduleStep } from '../src/warmup/orchestrator.js';

// ---------------------------------------------------------------------------
// AUTO_WARMUP_SCHEDULE constants
// ---------------------------------------------------------------------------

describe('AUTO_WARMUP_SCHEDULE', () => {
  it('should have at least 5 steps', () => {
    expect(AUTO_WARMUP_SCHEDULE.length).toBeGreaterThanOrEqual(5);
  });

  it('should have increasing daily limits across steps', () => {
    for (let i = 1; i < AUTO_WARMUP_SCHEDULE.length; i++) {
      expect(AUTO_WARMUP_SCHEDULE[i]!.dailyLimit).toBeGreaterThan(
        AUTO_WARMUP_SCHEDULE[i - 1]!.dailyLimit,
      );
    }
  });

  it('should have increasing day numbers across steps', () => {
    for (let i = 1; i < AUTO_WARMUP_SCHEDULE.length; i++) {
      expect(AUTO_WARMUP_SCHEDULE[i]!.day).toBeGreaterThan(
        AUTO_WARMUP_SCHEDULE[i - 1]!.day,
      );
    }
  });

  it('should start at day 1 with a conservative limit', () => {
    const first = AUTO_WARMUP_SCHEDULE[0]!;
    expect(first.day).toBe(1);
    expect(first.dailyLimit).toBeLessThanOrEqual(100);
  });

  it('should have decreasing advance bounce rate thresholds', () => {
    for (let i = 1; i < AUTO_WARMUP_SCHEDULE.length; i++) {
      expect(AUTO_WARMUP_SCHEDULE[i]!.advanceBounceRate).toBeLessThanOrEqual(
        AUTO_WARMUP_SCHEDULE[i - 1]!.advanceBounceRate,
      );
    }
  });

  it('should end with an effectively unlimited step', () => {
    const last = AUTO_WARMUP_SCHEDULE[AUTO_WARMUP_SCHEDULE.length - 1]!;
    expect(last.dailyLimit).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ---------------------------------------------------------------------------
// resolveAutoStep
// ---------------------------------------------------------------------------

describe('resolveAutoStep', () => {
  it('should return the first step for day 1', () => {
    const step = resolveAutoStep(1);
    expect(step.day).toBe(1);
    expect(step.dailyLimit).toBe(50);
  });

  it('should return the correct step for an exact day boundary', () => {
    const step = resolveAutoStep(7);
    expect(step.day).toBe(7);
    expect(step.dailyLimit).toBe(5_000);
  });

  it('should return the previous step for a day between boundaries', () => {
    // Day 5 is between day 4 (1000) and day 7 (5000) — should return day 4
    const step = resolveAutoStep(5);
    expect(step.day).toBe(4);
    expect(step.dailyLimit).toBe(1_000);
  });

  it('should return the last step for very high day numbers', () => {
    const step = resolveAutoStep(999);
    const last = AUTO_WARMUP_SCHEDULE[AUTO_WARMUP_SCHEDULE.length - 1]!;
    expect(step.day).toBe(last.day);
    expect(step.dailyLimit).toBe(last.dailyLimit);
  });

  it('should handle day 0 by returning the first step', () => {
    // Edge case: day 0 — first step has day=1 which is > 0, so the initial
    // seed (step = schedule[0]) should be returned.
    const step = resolveAutoStep(0);
    expect(step.day).toBe(AUTO_WARMUP_SCHEDULE[0]!.day);
  });
});

// ---------------------------------------------------------------------------
// computeNextAutoDay
// ---------------------------------------------------------------------------

describe('computeNextAutoDay', () => {
  it('should stay at current day when not enough wall-clock time has passed', () => {
    const nextDay = computeNextAutoDay({
      currentDay: 1,
      elapsedDays: 1,
      bounceRate24h: 0,
    });
    expect(nextDay).toBe(1);
  });

  it('should advance when elapsed days surpass current step and bounces are low', () => {
    const nextDay = computeNextAutoDay({
      currentDay: 1,
      elapsedDays: 7,
      bounceRate24h: 0.01,
    });
    expect(nextDay).toBe(7);
  });

  it('should NOT advance when bounce rate exceeds current step threshold', () => {
    // Day 1 threshold is 0.05. Bounce rate of 0.06 should block advancement.
    const nextDay = computeNextAutoDay({
      currentDay: 1,
      elapsedDays: 7,
      bounceRate24h: 0.06,
    });
    expect(nextDay).toBe(1);
  });

  it('should advance to the correct intermediate step (not skip ahead)', () => {
    // From day 1, with 3 elapsed days, should go to day 3 (not day 7)
    const nextDay = computeNextAutoDay({
      currentDay: 1,
      elapsedDays: 3,
      bounceRate24h: 0,
    });
    expect(nextDay).toBe(3);
  });

  it('should handle advancement from mid-schedule positions', () => {
    // Currently at day 4, 14 days have elapsed, bounces are fine
    const nextDay = computeNextAutoDay({
      currentDay: 4,
      elapsedDays: 14,
      bounceRate24h: 0.01,
    });
    expect(nextDay).toBe(14);
  });

  it('should respect bounce threshold of the CURRENT step when gating', () => {
    // Day 7 step has advanceBounceRate of 0.03
    // Bounce rate of 0.035 should block advancement from day 7
    const nextDay = computeNextAutoDay({
      currentDay: 7,
      elapsedDays: 30,
      bounceRate24h: 0.035,
    });
    expect(nextDay).toBe(7);
  });

  it('should advance past day 7 when bounce rate is under 0.03', () => {
    const nextDay = computeNextAutoDay({
      currentDay: 7,
      elapsedDays: 30,
      bounceRate24h: 0.02,
    });
    expect(nextDay).toBe(30);
  });

  it('should stay put when already at the last step', () => {
    const lastStep = AUTO_WARMUP_SCHEDULE[AUTO_WARMUP_SCHEDULE.length - 1]!;
    const nextDay = computeNextAutoDay({
      currentDay: lastStep.day,
      elapsedDays: lastStep.day + 100,
      bounceRate24h: 0,
    });
    expect(nextDay).toBe(lastStep.day);
  });
});

// ---------------------------------------------------------------------------
// WARMUP_SCHEDULES (named templates)
// ---------------------------------------------------------------------------

describe('WARMUP_SCHEDULES', () => {
  it('should have three schedule templates', () => {
    expect(Object.keys(WARMUP_SCHEDULES)).toEqual(
      expect.arrayContaining(['conservative', 'moderate', 'aggressive']),
    );
  });

  it('conservative should be the longest schedule', () => {
    const conserv = WARMUP_SCHEDULES.conservative;
    const moderate = WARMUP_SCHEDULES.moderate;
    const aggressive = WARMUP_SCHEDULES.aggressive;

    const lastDay = (s: ScheduleStep[]): number => s[s.length - 1]!.day;

    expect(lastDay(conserv)).toBeGreaterThan(lastDay(moderate));
    expect(lastDay(moderate)).toBeGreaterThan(lastDay(aggressive));
  });

  it('each schedule should have increasing daily limits', () => {
    for (const [, schedule] of Object.entries(WARMUP_SCHEDULES)) {
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i]!.dailyLimit).toBeGreaterThan(
          schedule[i - 1]!.dailyLimit,
        );
      }
    }
  });

  it('aggressive should start with a higher initial volume than conservative', () => {
    expect(WARMUP_SCHEDULES.aggressive[0]!.dailyLimit).toBeGreaterThan(
      WARMUP_SCHEDULES.conservative[0]!.dailyLimit,
    );
  });
});

// ---------------------------------------------------------------------------
// WARMUP_LIMIT_EXCEEDED constant
// ---------------------------------------------------------------------------

describe('WARMUP_LIMIT_EXCEEDED', () => {
  it('should be a string error code', () => {
    expect(typeof WARMUP_LIMIT_EXCEEDED).toBe('string');
    expect(WARMUP_LIMIT_EXCEEDED).toBe('WARMUP_LIMIT_EXCEEDED');
  });
});
