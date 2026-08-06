/**
 * Regression test: the Sent page's "Opened" badge was permanently false.
 *
 * It read `tags.includes("opened")`, and nothing has ever written that tag.
 * The tracking pixel records an `events` row of type "email.opened" instead
 * (routes/tracking.ts), so a message the recipient had genuinely opened still
 * showed "Not opened" — forever, for everyone.
 *
 * GET /v1/messages now returns a real `openedAt` derived from those events.
 * Deliberately one extra query per page rather than a join on the hot list
 * query, and deliberately NOT a denormalised tag, which could then drift from
 * the events that are the actual source of truth.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

interface EmailRow {
  id: string;
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: { address: string }[];
  ccAddresses: null;
  subject: string;
  textBody: string;
  htmlBody: null;
  status: string;
  tags: string[];
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

let emailRows: EmailRow[] = [];
/** Rows the grouped open-events query resolves to. */
let openRows: { emailId: string; firstOpenedAt: Date }[] = [];
let openQueryThrows = false;

const mockDb = {
  select: vi.fn((cols: Record<string, unknown>) => {
    const isOpenQuery = "firstOpenedAt" in cols;
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(emailRows)),
      groupBy: vi.fn(() => {
        if (openQueryThrows) return Promise.reject(new Error("events table unavailable"));
        return Promise.resolve(openRows);
      }),
    };
    if (isOpenQuery && openQueryThrows) {
      chain["where"] = vi.fn(() => chain);
    }
    return chain;
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

function email(id: string): EmailRow {
  return {
    id,
    messageId: `<${id}@alecrae.com>`,
    fromAddress: "me@alecrae.com",
    fromName: null,
    toAddresses: [{ address: "them@example.com" }],
    ccAddresses: null,
    subject: "Hello",
    textBody: "body",
    htmlBody: null,
    status: "sent",
    tags: [],
    isRead: true,
    isStarred: false,
    folder: "inbox",
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    sentAt: new Date("2026-07-20T10:00:00.000Z"),
  };
}

describe("GET /v1/messages — open tracking", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    emailRows = [];
    openRows = [];
    openQueryThrows = false;

    const { messages } = await import("../src/routes/messages.js");
    app = new Hono();
    app.route("/v1/messages", messages);
  });

  it("reports openedAt from a real tracking event", async () => {
    emailRows = [email("em_1")];
    openRows = [{ emailId: "em_1", firstOpenedAt: new Date("2026-07-21T09:30:00.000Z") }];

    const res = await app.request("/v1/messages?status=sent");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { id: string; openedAt: string | null }[] };
    expect(body.data[0]!.openedAt).toBe("2026-07-21T09:30:00.000Z");
  });

  it("reports null for a message that was never opened", async () => {
    emailRows = [email("em_1")];
    openRows = [];

    const res = await app.request("/v1/messages?status=sent");
    const body = (await res.json()) as { data: { openedAt: string | null }[] };
    expect(body.data[0]!.openedAt).toBeNull();
  });

  it("does not infer opens from the 'opened' tag, which nothing writes", async () => {
    // Guards the old behaviour from creeping back: a tag must not be treated
    // as evidence of an open.
    const tagged = email("em_1");
    tagged.tags = ["opened"];
    emailRows = [tagged];
    openRows = [];

    const res = await app.request("/v1/messages?status=sent");
    const body = (await res.json()) as { data: { openedAt: string | null }[] };
    expect(body.data[0]!.openedAt).toBeNull();
  });

  it("maps each message to its own open time", async () => {
    emailRows = [email("em_1"), email("em_2"), email("em_3")];
    openRows = [
      { emailId: "em_3", firstOpenedAt: new Date("2026-07-22T08:00:00.000Z") },
      { emailId: "em_1", firstOpenedAt: new Date("2026-07-21T08:00:00.000Z") },
    ];

    const res = await app.request("/v1/messages?status=sent");
    const body = (await res.json()) as { data: { id: string; openedAt: string | null }[] };
    const byId = Object.fromEntries(body.data.map((d) => [d.id, d.openedAt]));

    expect(byId["em_1"]).toBe("2026-07-21T08:00:00.000Z");
    expect(byId["em_2"]).toBeNull();
    expect(byId["em_3"]).toBe("2026-07-22T08:00:00.000Z");
  });

  it("accepts every status the database can actually hold", async () => {
    // The query enum drifted from the DB enum: it accepted "sending" (not a
    // database value, so it matched nothing) while rejecting "sent" — the
    // status the send path writes and the one the Sent page filters on. That
    // page 422'd on every load as a result.
    emailRows = [email("em_1")];

    for (const status of [
      "draft",
      "queued",
      "processing",
      "sent",
      "delivered",
      "bounced",
      "deferred",
      "dropped",
      "complained",
      "failed",
    ]) {
      const res = await app.request(`/v1/messages?status=${status}`);
      expect(res.status, `status=${status} must be accepted`).toBe(200);
    }
  });

  it("rejects a status the database cannot hold", async () => {
    emailRows = [email("em_1")];
    const res = await app.request("/v1/messages?status=sending");
    expect(res.status).toBe(422);
  });

  it("still returns the message list if the open-events query fails", async () => {
    // Open data is supplementary — it must never take down the inbox.
    emailRows = [email("em_1")];
    openQueryThrows = true;

    const res = await app.request("/v1/messages?status=sent");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { openedAt: string | null }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.openedAt).toBeNull();
  });
});
