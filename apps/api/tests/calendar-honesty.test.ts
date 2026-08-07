/**
 * Issue #166 — calendar-events fabricated AI output.
 *
 * POST /schedule-from-text ignored input.text entirely: every request came
 * back "tomorrow at 12:00" with parsed: true and confidence: 0.75 labelled
 * "AI-parsed". Nothing parses text on this route → honest 501 now.
 *
 * GET /:id/prep invented a three-bullet suggestedAgenda and confidence: 0.7
 * as if a model produced them. The real event-derived fields stay; the
 * fabrications are gone.
 *
 * POST /find-time attached invented per-slot confidence values (0.5–0.9) and
 * claimed the slots were "AI-suggested based on attendee availability
 * patterns". The deterministic proposals stay (honest and useful); the score
 * and the claim are gone.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let selectResults: unknown[][] = [];
let selectCall = 0;

function chain(result: () => unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "groupBy", "orderBy", "limit"]) {
    c[m] = vi.fn(() => c);
  }
  c["then"] = (resolve: (v: unknown) => unknown) => resolve(result());
  return c;
}

const mockDb = {
  select: vi.fn(() => {
    const idx = selectCall++;
    return chain(() => selectResults[idx] ?? []);
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

async function request(path: string, init?: RequestInit): Promise<Response> {
  const { calendarEventsRouter } = await import("../src/routes/calendar-events.js");
  const app = new Hono();
  app.route("/v1/calendar-events", calendarEventsRouter);
  return app.request(`/v1/calendar-events${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
});

describe("POST /schedule-from-text", () => {
  it("answers 501 instead of inventing a tomorrow-noon event", async () => {
    const res = await request("/schedule-from-text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "lunch with Sam next Tuesday at 1pm" }),
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("schedule_from_text_unavailable");
    // No invented event payload of any kind.
    expect(JSON.stringify(body)).not.toContain("suggestedEvent");
    expect(JSON.stringify(body)).not.toContain("confidence");
  });
});

describe("GET /:id/prep", () => {
  it("still 404s for an event the caller does not own", async () => {
    selectResults = [[]];
    const res = await request("/ev_1/prep");
    expect(res.status).toBe(404);
  });

  it("keeps real event-derived fields and drops the invented agenda + confidence", async () => {
    selectResults = [
      [
        {
          id: "ev_1",
          title: "Q3 planning",
          startAt: new Date("2026-08-20T10:00:00Z"),
          attendees: [{ email: "a@example.com", name: "A", status: "accepted" }],
        },
      ],
    ];
    const res = await request("/ev_1/prep");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        briefing: Record<string, unknown>;
      } & Record<string, unknown>;
    };

    // Real, event-derived content stays.
    expect(body.data["title"]).toBe("Q3 planning");
    expect(body.data["attendeeCount"]).toBe(1);
    expect(body.data.briefing["summary"]).toContain("Q3 planning");

    // The fabrications are gone in both places they lived.
    expect(body.data.briefing).not.toHaveProperty("suggestedAgenda");
    expect(body.data).not.toHaveProperty("confidence");
  });
});

describe("POST /find-time", () => {
  it("returns proposals without invented confidence, with an honest note", async () => {
    const res = await request("/find-time", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attendeeEmails: ["a@example.com", "b@example.com"],
        durationMinutes: 30,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        suggestedSlots: Record<string, unknown>[];
        note: string;
      };
    };

    // Real functionality kept: five concrete proposals with valid times.
    expect(body.data.suggestedSlots).toHaveLength(5);
    for (const slot of body.data.suggestedSlots) {
      expect(typeof slot["startAt"]).toBe("string");
      expect(typeof slot["endAt"]).toBe("string");
      expect(slot).not.toHaveProperty("confidence");
      expect(slot).not.toHaveProperty("attendeesAvailable");
    }

    // The note states what does NOT happen instead of claiming AI.
    expect(body.data.note).toContain("NOT checked");
    expect(body.data.note).not.toContain("AI-suggested");
  });
});
