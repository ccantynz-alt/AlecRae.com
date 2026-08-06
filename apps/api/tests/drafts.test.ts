/**
 * Regression test for the Drafts journey, which had no persistence at all.
 *
 * Compose's "Save Draft" button was `() => setStatus("Draft saved locally")` —
 * nothing was written anywhere, so unsent work was silently lost. There was no
 * draft endpoint in the API to write to, and the Drafts page listed
 * `status: "queued"` (outbound mail waiting to be delivered) rather than drafts.
 *
 * These tests pin the new endpoints and, critically, that a draft can never be
 * used to mutate mail that has already entered the send pipeline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

interface Inserted {
  status?: string;
  folder?: string;
  subject?: string;
  messageId?: string;
  fromAddress?: string;
  toAddresses?: { address: string; name?: string }[];
  ccAddresses?: unknown;
  textBody?: string | null;
  htmlBody?: string | null;
}

let inserted: Inserted[] = [];
let updated: Record<string, unknown>[] = [];
/** Row returned by the existence lookup in PUT /drafts/:id. */
let existingRow: { id: string; status: string } | undefined;

const mockDb = {
  insert: vi.fn(() => ({
    values: vi.fn((row: Inserted) => {
      inserted.push(row);
      return Promise.resolve();
    }),
  })),
  select: vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(existingRow ? [existingRow] : [])),
    };
    return chain;
  }),
  update: vi.fn(() => ({
    set: vi.fn((vals: Record<string, unknown>) => {
      updated.push(vals);
      return { where: vi.fn(() => Promise.resolve()) };
    }),
  })),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../src/middleware/auth.js");
  return {
    ...actual,
    requireScope:
      () =>
      async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
        c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
        await next();
      },
  };
});

async function post(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function put(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("drafts", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    inserted = [];
    updated = [];
    existingRow = { id: "draft_1", status: "draft" };

    const { messages } = await import("../src/routes/messages.js");
    app = new Hono();
    app.route("/v1/messages", messages);
  });

  it("persists a draft with status draft in the drafts folder", async () => {
    const res = await post(app, "/v1/messages/drafts", {
      from: { email: "me@alecrae.com" },
      to: [{ email: "alice@example.com" }],
      subject: "Half-written",
      text: "still thinking",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id).toBeTruthy();

    expect(inserted).toHaveLength(1);
    const row = inserted[0]!;
    expect(row.status).toBe("draft");
    expect(row.folder).toBe("drafts");
    expect(row.subject).toBe("Half-written");
    expect(row.toAddresses).toEqual([{ address: "alice@example.com" }]);
    expect(row.fromAddress).toBe("me@alecrae.com");
    // messageId is NOT NULL and unique per (accountId, messageId).
    expect(row.messageId).toContain(body.data.id);
  });

  it("accepts a draft with only a body and no recipients", async () => {
    const res = await post(app, "/v1/messages/drafts", { text: "just a thought" });

    expect(res.status).toBe(201);
    expect(inserted[0]!.toAddresses).toEqual([]);
    expect(inserted[0]!.textBody).toBe("just a thought");
  });

  it("rejects a completely empty draft", async () => {
    const res = await post(app, "/v1/messages/drafts", { subject: "   ", text: "" });

    // 422 is this codebase's validation-failure status (middleware/validator.ts).
    expect(res.status).toBe(422);
    expect(inserted).toHaveLength(0);
  });

  it("updates an existing draft in place rather than creating another", async () => {
    const res = await put(app, "/v1/messages/drafts/draft_1", {
      to: [{ email: "bob@example.com" }],
      subject: "Now finished",
      text: "done",
    });

    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0]!["subject"]).toBe("Now finished");
    expect(updated[0]!["toAddresses"]).toEqual([{ address: "bob@example.com" }]);
  });

  it("404s when updating a draft that does not belong to the caller", async () => {
    existingRow = undefined;

    const res = await put(app, "/v1/messages/drafts/someone_elses", { text: "x" });

    expect(res.status).toBe(404);
    expect(updated).toHaveLength(0);
  });

  it("refuses to rewrite a message that has already been sent", async () => {
    // The important safety property: this endpoint must never become a way to
    // mutate mail that has left the drafts folder.
    existingRow = { id: "msg_sent", status: "sent" };

    const res = await put(app, "/v1/messages/drafts/msg_sent", { text: "tampered" });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_a_draft");
    expect(updated).toHaveLength(0);
  });

  it("refuses to rewrite a message already queued for delivery", async () => {
    existingRow = { id: "msg_q", status: "queued" };

    const res = await put(app, "/v1/messages/drafts/msg_q", { text: "tampered" });

    expect(res.status).toBe(409);
    expect(updated).toHaveLength(0);
  });
});
