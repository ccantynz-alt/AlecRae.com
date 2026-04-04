import { describe, it, expect } from "bun:test";
import {
  WARMUP_SCHEDULES,
  type ScheduleStep,
} from "../src/warmup/orchestrator.js";

// ---------------------------------------------------------------------------
// Schedule template validation
// ---------------------------------------------------------------------------

describe("WARMUP_SCHEDULES", () => {
  it("conservative schedule has 12 steps over 30 days", () => {
    const schedule = WARMUP_SCHEDULES.conservative;
    expect(schedule.length).toBe(12);
    expect(schedule[0]!.day).toBe(1);
    expect(schedule[0]!.dailyLimit).toBe(50);
    expect(schedule[schedule.length - 1]!.day).toBe(30);
    expect(schedule[schedule.length - 1]!.dailyLimit).toBe(100000);
  });

  it("moderate schedule has 11 steps over 21 days", () => {
    const schedule = WARMUP_SCHEDULES.moderate;
    expect(schedule.length).toBe(11);
    expect(schedule[0]!.day).toBe(1);
    expect(schedule[0]!.dailyLimit).toBe(100);
    expect(schedule[schedule.length - 1]!.day).toBe(21);
    expect(schedule[schedule.length - 1]!.dailyLimit).toBe(100000);
  });

  it("aggressive schedule has 9 steps over 14 days", () => {
    const schedule = WARMUP_SCHEDULES.aggressive;
    expect(schedule.length).toBe(9);
    expect(schedule[0]!.day).toBe(1);
    expect(schedule[0]!.dailyLimit).toBe(200);
    expect(schedule[schedule.length - 1]!.day).toBe(14);
    expect(schedule[schedule.length - 1]!.dailyLimit).toBe(100000);
  });

  it("all schedules have monotonically increasing days", () => {
    for (const [name, schedule] of Object.entries(WARMUP_SCHEDULES)) {
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i]!.day).toBeGreaterThan(schedule[i - 1]!.day);
      }
    }
  });

  it("all schedules have monotonically increasing daily limits", () => {
    for (const [name, schedule] of Object.entries(WARMUP_SCHEDULES)) {
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i]!.dailyLimit).toBeGreaterThan(
          schedule[i - 1]!.dailyLimit,
        );
      }
    }
  });

  it("all schedules start on day 1", () => {
    for (const schedule of Object.values(WARMUP_SCHEDULES)) {
      expect(schedule[0]!.day).toBe(1);
    }
  });

  it("all schedules end at 100000 daily limit", () => {
    for (const schedule of Object.values(WARMUP_SCHEDULES)) {
      expect(schedule[schedule.length - 1]!.dailyLimit).toBe(100000);
    }
  });
});

// ---------------------------------------------------------------------------
// computeDailyLimit logic (extracted to test independently)
// ---------------------------------------------------------------------------

function computeDailyLimit(
  schedule: ScheduleStep[],
  currentDay: number,
): number {
  let limit = schedule[0]?.dailyLimit ?? 50;
  for (const step of schedule) {
    if (step.day <= currentDay) {
      limit = step.dailyLimit;
    } else {
      break;
    }
  }
  return limit;
}

describe("computeDailyLimit", () => {
  const schedule = WARMUP_SCHEDULES.conservative;

  it("returns first step limit on day 1", () => {
    expect(computeDailyLimit(schedule, 1)).toBe(50);
  });

  it("returns correct limit on exact step day", () => {
    expect(computeDailyLimit(schedule, 5)).toBe(800);
    expect(computeDailyLimit(schedule, 14)).toBe(6000);
    expect(computeDailyLimit(schedule, 30)).toBe(100000);
  });

  it("returns previous step limit between steps", () => {
    // Day 6 is between day 5 (800) and day 7 (1500)
    expect(computeDailyLimit(schedule, 6)).toBe(800);
    // Day 8 is between day 7 (1500) and day 10 (3000)
    expect(computeDailyLimit(schedule, 8)).toBe(1500);
  });

  it("returns last step limit after schedule ends", () => {
    expect(computeDailyLimit(schedule, 50)).toBe(100000);
  });

  it("returns first step limit on day 0 (edge case)", () => {
    // Day 0 means no steps match (all steps have day >= 1)
    // The default is schedule[0].dailyLimit since no step.day <= 0
    expect(computeDailyLimit(schedule, 0)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Schedule extension logic
// ---------------------------------------------------------------------------

function extendSchedule(
  schedule: ScheduleStep[],
  extraDays: number,
): ScheduleStep[] {
  if (schedule.length < 2) return schedule;

  const last = schedule[schedule.length - 1]!;
  const secondLast = schedule[schedule.length - 2]!;

  const newSteps = [...schedule];
  newSteps[newSteps.length - 1] = {
    day: last.day + extraDays,
    dailyLimit: last.dailyLimit,
  };

  const midDay =
    secondLast.day +
    Math.floor((last.day + extraDays - secondLast.day) / 2);
  const midLimit = Math.floor(
    (secondLast.dailyLimit + last.dailyLimit) / 2,
  );

  const midExists = newSteps.some((s) => s.day === midDay);
  if (
    !midExists &&
    midDay > secondLast.day &&
    midDay < last.day + extraDays
  ) {
    newSteps.splice(newSteps.length - 1, 0, {
      day: midDay,
      dailyLimit: midLimit,
    });
  }

  return newSteps;
}

describe("extendSchedule", () => {
  it("extends schedule by shifting the last day", () => {
    const schedule: ScheduleStep[] = [
      { day: 1, dailyLimit: 50 },
      { day: 5, dailyLimit: 800 },
      { day: 10, dailyLimit: 3000 },
    ];

    const extended = extendSchedule(schedule, 2);

    // Last step should now be at day 12 instead of 10
    const lastStep = extended[extended.length - 1]!;
    expect(lastStep.day).toBe(12);
    expect(lastStep.dailyLimit).toBe(3000);
  });

  it("does not modify single-step schedule", () => {
    const schedule: ScheduleStep[] = [{ day: 1, dailyLimit: 50 }];
    const extended = extendSchedule(schedule, 2);
    expect(extended).toEqual(schedule);
  });
});

// ---------------------------------------------------------------------------
// Schedule compression logic
// ---------------------------------------------------------------------------

function compressSchedule(
  schedule: ScheduleStep[],
  removeDays: number,
): ScheduleStep[] {
  if (schedule.length <= 2) return schedule;

  const result = [...schedule];
  for (let i = 1; i < result.length; i++) {
    result[i] = {
      ...result[i]!,
      day: Math.max(
        result[i]!.day - removeDays,
        result[i - 1]!.day + 1,
      ),
    };
  }

  return result;
}

describe("compressSchedule", () => {
  it("compresses schedule by reducing day numbers", () => {
    const schedule: ScheduleStep[] = [
      { day: 1, dailyLimit: 50 },
      { day: 5, dailyLimit: 800 },
      { day: 10, dailyLimit: 3000 },
    ];

    const compressed = compressSchedule(schedule, 1);
    expect(compressed[0]!.day).toBe(1); // First day unchanged
    expect(compressed[1]!.day).toBe(4); // 5 - 1
    expect(compressed[2]!.day).toBe(9); // 10 - 1
  });

  it("ensures days never collide", () => {
    const schedule: ScheduleStep[] = [
      { day: 1, dailyLimit: 50 },
      { day: 2, dailyLimit: 100 },
      { day: 3, dailyLimit: 200 },
    ];

    const compressed = compressSchedule(schedule, 2);
    // Day 2 - 2 = 0, but must be > day 1, so clamped to 2
    expect(compressed[1]!.day).toBeGreaterThan(compressed[0]!.day);
    expect(compressed[2]!.day).toBeGreaterThan(compressed[1]!.day);
  });

  it("does not modify 2-step schedule", () => {
    const schedule: ScheduleStep[] = [
      { day: 1, dailyLimit: 50 },
      { day: 10, dailyLimit: 3000 },
    ];
    const compressed = compressSchedule(schedule, 1);
    expect(compressed).toEqual(schedule);
  });
});
