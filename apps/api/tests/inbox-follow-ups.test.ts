/**
 * Issue #166 — GET /v1/inbox/follow-ups called detectFollowUpNeeded([]) with
 * a literal empty array: a silent always-empty 200 that read as "no
 * follow-ups needed" for every account forever.
 *
 * Now it feeds the detector the account's real sent mail and resolves
 * hasReply from stored In-Reply-To headers (matching both "<id>" and bare-id
 * spellings — the issue #76b angle-bracket lesson).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";
const DAY = 24 * 60 * 60 * 1000;

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

async function followUps(): Promise<Response> {
  const { inbox } = await import("../src/routes/inbox.js");
  const app = new Hono();
  app.route("/v1/inbox", inbox);
  return app.request("/v1/inbox/follow-ups");
}

function sentRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "em_1",
    messageId: "msg-1@alecrae.com",
    toAddresses: [{ address: "prospect@example.com" }],
    subject: "Proposal",
    sentAt: new Date(Date.now() - 10 * DAY),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
});

describe("GET /v1/inbox/follow-ups", () => {
  it("returns empty when the account has no sent mail — one query, no invention", async () => {
    selectResults = [[]];
    const res = await followUps();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
    // No reply lookup should run when there is nothing to look up.
    expect(selectCall).toBe(1);
  });

  it("nudges about a real unanswered sent email", async () => {
    selectResults = [
      [
        sentRow({
          id: "em_1",
          messageId: "msg-1@alecrae.com",
          sentAt: new Date(Date.now() - 10 * DAY),
        }),
      ],
      [], // no replies anywhere
    ];

    const res = await followUps();
    const body = (await res.json()) as {
      data: { emailId: string; recipient: string; daysSinceNoReply: number; urgency: string }[];
    };

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      emailId: "em_1",
      recipient: "prospect@example.com",
      urgency: "medium",
    });
    expect(body.data[0]?.daysSinceNoReply).toBeGreaterThanOrEqual(9);
  });

  it("does not nudge about an email that WAS replied to — including bracketed In-Reply-To", async () => {
    selectResults = [
      [
        sentRow({
          id: "em_answered",
          messageId: "msg-a@alecrae.com",
          sentAt: new Date(Date.now() - 8 * DAY),
        }),
        sentRow({
          id: "em_ignored",
          messageId: "msg-b@alecrae.com",
          toAddresses: [{ address: "ghost@example.com" }],
          sentAt: new Date(Date.now() - 8 * DAY),
        }),
      ],
      // The reply references the sent Message-ID in angle brackets, the way
      // most clients write In-Reply-To.
      [{ inReplyTo: "<msg-a@alecrae.com>" }],
    ];

    const res = await followUps();
    const body = (await res.json()) as { data: { emailId: string }[] };

    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.emailId).toBe("em_ignored");
  });

  it("does not nudge about mail sent too recently to need a follow-up", async () => {
    selectResults = [
      [sentRow({ sentAt: new Date(Date.now() - 1 * DAY) })],
      [],
    ];
    const res = await followUps();
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});
