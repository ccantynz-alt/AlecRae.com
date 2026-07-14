/**
 * Tests for the in-memory → DB store migration helpers.
 *
 * Covers the pure logic added while moving route state into Postgres:
 *  1. snooze.ts        — undo-send reconciliation from persisted metadata
 *  2. import.ts        — orphaned import-job reconciliation after a restart
 *  3. dlq-processor.ts — DB row → in-memory DLQ record mapping
 *  4. calendar.ts      — calendar_events row → legacy response shape mapping
 *  5. ai-rules.ts      — email_rules row serialization (ISO timestamps)
 *
 * No live DB needed — these helpers are pure on their inputs.
 */

import { describe, it, expect, vi } from "vitest";

// Mock BullMQ + queue config so importing dlq-processor never opens sockets.
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    getFailed: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../src/lib/queue.js", () => ({
  QUEUE_NAME: "test-outbound",
  REDIS_URL: "redis://localhost:6379",
  getSendQueue: vi.fn(),
}));

// Mock the ai-engine calendar modules so importing calendar.ts is cheap.
vi.mock("@alecrae/ai-engine/calendar/slot-detector", () => ({
  detectMeetingIntent: vi.fn(),
}));
vi.mock("@alecrae/ai-engine/calendar/slot-suggester", () => ({
  suggestSlotsForCompose: vi.fn(),
}));

describe("snooze.ts — resolveUndoFromMetadata", () => {
  // 15s: the first dynamic import of snooze.js pays the whole module-graph
  // transform cost, which exceeds the 5s default when the suite runs in
  // parallel on a loaded machine (flaked twice on 2026-07-14).
  it("returns not_registered when there is no metadata or marker", { timeout: 15_000 }, async () => {
    const { resolveUndoFromMetadata } = await import("../src/routes/snooze.js");

    expect(resolveUndoFromMetadata(null, Date.now())).toBe("not_registered");
    expect(resolveUndoFromMetadata(undefined, Date.now())).toBe("not_registered");
    expect(resolveUndoFromMetadata({}, Date.now())).toBe("not_registered");
    expect(
      resolveUndoFromMetadata({ snoozedUntil: new Date().toISOString() }, Date.now()),
    ).toBe("not_registered");
  });

  it("returns undoable while the persisted window is still open", async () => {
    const { resolveUndoFromMetadata } = await import("../src/routes/snooze.js");

    const now = Date.now();
    const metadata = { undoableUntil: new Date(now + 10_000).toISOString() };
    expect(resolveUndoFromMetadata(metadata, now)).toBe("undoable");
  });

  it("returns expired once the persisted window has passed", async () => {
    const { resolveUndoFromMetadata } = await import("../src/routes/snooze.js");

    const now = Date.now();
    const metadata = { undoableUntil: new Date(now - 1).toISOString() };
    expect(resolveUndoFromMetadata(metadata, now)).toBe("expired");
  });

  it("treats unparseable timestamps as not registered", async () => {
    const { resolveUndoFromMetadata } = await import("../src/routes/snooze.js");

    expect(
      resolveUndoFromMetadata({ undoableUntil: "not-a-date" }, Date.now()),
    ).toBe("not_registered");
  });
});

describe("import.ts — reconcileJobStatus", () => {
  it("marks pending/running jobs with no live worker as failed (restart orphan)", async () => {
    const { reconcileJobStatus } = await import("../src/routes/import.js");

    for (const status of ["pending", "running"] as const) {
      const result = reconcileJobStatus(
        { id: "job1", status, error: null },
        false,
      );
      expect(result.orphaned).toBe(true);
      expect(result.status).toBe("failed");
      expect(result.error).toMatch(/restart/i);
    }
  });

  it("leaves pending/running jobs alone while their worker is alive", async () => {
    const { reconcileJobStatus } = await import("../src/routes/import.js");

    const result = reconcileJobStatus(
      { id: "job1", status: "running", error: null },
      true,
    );
    expect(result.orphaned).toBe(false);
    expect(result.status).toBe("running");
    expect(result.error).toBeNull();
  });

  it("never touches completed or failed jobs", async () => {
    const { reconcileJobStatus } = await import("../src/routes/import.js");

    for (const status of ["completed", "failed"] as const) {
      const result = reconcileJobStatus(
        { id: "job1", status, error: "boom" },
        false,
      );
      expect(result.orphaned).toBe(false);
      expect(result.status).toBe(status);
      expect(result.error).toBe("boom");
    }
  });
});

describe("dlq-processor.ts — rowToDlqRecord", () => {
  it("maps a DB row back into the in-memory record shape", async () => {
    const { rowToDlqRecord } = await import("../src/lib/dlq-processor.js");

    const createdAt = new Date("2026-06-11T01:02:03.000Z");
    const retryAt = new Date("2026-06-11T02:02:03.000Z");

    const record = rowToDlqRecord({
      jobId: "job_42",
      jobName: "send_email",
      data: { to: "x@example.com" },
      failedReason: "Connection refused",
      attemptsMade: 3,
      status: "pending_retry",
      retryScheduledAt: retryAt,
      createdAt,
    });

    expect(record).toEqual({
      jobId: "job_42",
      jobName: "send_email",
      data: { to: "x@example.com" },
      failedReason: "Connection refused",
      attemptsMade: 3,
      timestamp: "2026-06-11T01:02:03.000Z",
      status: "pending_retry",
      retryScheduledAt: "2026-06-11T02:02:03.000Z",
    });
  });

  it("omits retryScheduledAt and nulls data for final records", async () => {
    const { rowToDlqRecord } = await import("../src/lib/dlq-processor.js");

    const record = rowToDlqRecord({
      jobId: "job_43",
      jobName: "send_email",
      data: null,
      failedReason: "Permanent failure",
      attemptsMade: 4,
      status: "permanently_failed",
      retryScheduledAt: null,
      createdAt: new Date("2026-06-11T01:02:03.000Z"),
    });

    expect(record.data).toBeNull();
    expect(record.status).toBe("permanently_failed");
    expect("retryScheduledAt" in record).toBe(false);
  });
});

describe("calendar.ts — toCalendarEventResponse", () => {
  const baseRow = {
    id: "evt1",
    accountId: "acc1",
    title: "Standup",
    description: null,
    location: null,
    startAt: new Date("2026-06-12T09:00:00.000Z"),
    endAt: new Date("2026-06-12T09:30:00.000Z"),
    allDay: false,
    recurrence: null,
    attendees: [
      { email: "a@example.com", status: "accepted" as const },
      { email: "b@example.com", name: "Bee", status: "pending" as const },
    ],
    reminders: [],
    color: null,
    calendarId: null,
    externalId: null,
    videoLink: null,
    isPrivate: false,
    status: "confirmed" as const,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };

  it("maps a DB row to the legacy response shape with ISO times", async () => {
    const { toCalendarEventResponse } = await import("../src/routes/calendar.js");

    const event = toCalendarEventResponse(baseRow);

    expect(event.id).toBe("evt1");
    expect(event.title).toBe("Standup");
    expect(event.description).toBe("");
    expect(event.startTime).toBe("2026-06-12T09:00:00.000Z");
    expect(event.endTime).toBe("2026-06-12T09:30:00.000Z");
    expect(event.isAllDay).toBe(false);
    expect(event.attendees).toEqual([
      { name: "", email: "a@example.com", status: "accepted" },
      { name: "Bee", email: "b@example.com", status: "pending" },
    ]);
    // Optional fields are OMITTED (not null) when unset — legacy shape.
    expect("location" in event).toBe(false);
    expect("conferenceUrl" in event).toBe(false);
  });

  it("includes location and conferenceUrl when present", async () => {
    const { toCalendarEventResponse } = await import("../src/routes/calendar.js");

    const event = toCalendarEventResponse({
      ...baseRow,
      location: "Room 4",
      videoLink: "https://meet.alecrae.com/xyz",
    });

    expect(event.location).toBe("Room 4");
    expect(event.conferenceUrl).toBe("https://meet.alecrae.com/xyz");
  });
});

describe("ai-rules.ts — serializeRule", () => {
  it("serializes Date columns to ISO strings and preserves jsonb fields", async () => {
    const { serializeRule } = await import("../src/routes/ai-rules.js");

    const createdAt = new Date("2026-06-10T10:00:00.000Z");
    const updatedAt = new Date("2026-06-11T11:00:00.000Z");

    const serialized = serializeRule({
      id: "rule1",
      accountId: "acc1",
      name: "Receipts",
      description: "file receipts",
      conditions: [{ field: "from", operator: "contains", value: "@stripe.com" }],
      matchMode: "all",
      actions: [{ type: "label", value: "Receipts" }],
      enabled: true,
      matchCount: 7,
      createdAt,
      updatedAt,
    });

    expect(serialized).toEqual({
      id: "rule1",
      accountId: "acc1",
      name: "Receipts",
      description: "file receipts",
      conditions: [{ field: "from", operator: "contains", value: "@stripe.com" }],
      matchMode: "all",
      actions: [{ type: "label", value: "Receipts" }],
      enabled: true,
      matchCount: 7,
      createdAt: "2026-06-10T10:00:00.000Z",
      updatedAt: "2026-06-11T11:00:00.000Z",
    });
  });
});
