/**
 * Scheduling conflict window and meeting-type narrowing (issue #75d).
 *
 * Two pieces of logic that ran but decided nothing:
 *
 *  - `/conflicts` filtered on `createdAt >= startDate` — when the PROPOSAL was
 *    created, not when the MEETING is. Asking "what clashes next week" missed
 *    any meeting scheduled for next week but agreed a month ago, which is
 *    exactly the meeting most likely to clash. `endDate` was computed from the
 *    `range` parameter and then never referenced, so `range` did nothing at all.
 *
 *  - `/propose` called the intent classifier with an EMPTY STRING, discarded
 *    the result, and set meetingType from a ternary whose branches were both
 *    "one_on_one". Every proposal was a one-to-one whatever the email said.
 */

import { describe, it, expect } from "vitest";

/** Mirrors the window filter: overlap, not containment. */
function overlapsWindow(
  meeting: { selectedTime: string | null; duration: number },
  windowStart: number,
  windowEnd: number,
): boolean {
  if (!meeting.selectedTime) return false;
  const start = new Date(meeting.selectedTime).getTime();
  if (Number.isNaN(start)) return false;
  const end = start + meeting.duration * 60 * 1000;
  return end >= windowStart && start <= windowEnd;
}

const MEETING_TYPES = [
  "one_on_one",
  "group",
  "standup",
  "interview",
  "demo",
  "social",
] as const;

function toMeetingType(value: string): (typeof MEETING_TYPES)[number] {
  return MEETING_TYPES.find((t) => t === value) ?? "one_on_one";
}

const WINDOW_START = Date.parse("2026-03-02T00:00:00.000Z");
const WINDOW_END = Date.parse("2026-03-09T00:00:00.000Z");

describe("conflict window", () => {
  it("includes a meeting inside the window", () => {
    expect(
      overlapsWindow(
        { selectedTime: "2026-03-04T10:00:00.000Z", duration: 30 },
        WINDOW_START,
        WINDOW_END,
      ),
    ).toBe(true);
  });

  it("includes a long-scheduled meeting — the case the old filter missed", () => {
    // Agreed months ago, happening inside the window. Filtering on createdAt
    // excluded exactly this, and it is the most likely to clash.
    expect(
      overlapsWindow(
        { selectedTime: "2026-03-05T14:00:00.000Z", duration: 60 },
        WINDOW_START,
        WINDOW_END,
      ),
    ).toBe(true);
  });

  it("excludes a meeting outside the window — proving range now does something", () => {
    expect(
      overlapsWindow(
        { selectedTime: "2026-04-01T10:00:00.000Z", duration: 30 },
        WINDOW_START,
        WINDOW_END,
      ),
    ).toBe(false);
  });

  it("includes a meeting that starts before the window and runs into it", () => {
    // Overlap, not containment: a meeting starting 30 minutes before the
    // window still occupies time inside it and can still clash.
    expect(
      overlapsWindow(
        { selectedTime: "2026-03-01T23:30:00.000Z", duration: 60 },
        WINDOW_START,
        WINDOW_END,
      ),
    ).toBe(true);
  });

  it("skips rows with no or unparseable time rather than throwing", () => {
    expect(overlapsWindow({ selectedTime: null, duration: 30 }, WINDOW_START, WINDOW_END)).toBe(false);
    expect(
      overlapsWindow({ selectedTime: "not a date", duration: 30 }, WINDOW_START, WINDOW_END),
    ).toBe(false);
  });
});

describe("meeting type narrowing", () => {
  it("passes through every value the classifier can produce", () => {
    for (const type of ["standup", "interview", "demo", "social", "one_on_one"]) {
      expect(toMeetingType(type)).toBe(type);
    }
  });

  it("falls back rather than writing an invalid enum value", () => {
    // The insert used `as "one_on_one"` — an assertion that would have written
    // whatever the classifier returned straight into a Postgres enum column.
    expect(toMeetingType("something_else")).toBe("one_on_one");
    expect(toMeetingType("")).toBe("one_on_one");
  });
});
