/**
 * Regression test for issue #29 (voice-message half): POST /record and
 * POST /:id/reply used to be an honest 501 (no object storage backend
 * wired) after previously handing back a fake `/v1/voice-messages/:id/audio`
 * URL that no route served. This verifies the real Vapron-backed upload:
 * bytes are actually PUT to the presigned URL, a `voice_messages` row is
 * only persisted after that succeeds, and failures at any stage return an
 * honest error rather than fabricating success.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let vapronConfigured = true;
let getUploadUrlImpl: () => Promise<{ uploadUrl: string }> = () =>
  Promise.resolve({ uploadUrl: "https://storage.vapron.ai/alecrae-voice-messages/acct_1/key.webm?sig=abc" });

vi.mock("../src/lib/vapron.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../src/lib/vapron.js");
  return {
    ...actual,
    isVapronConfigured: () => vapronConfigured,
    vapron: {
      storage: {
        getUploadUrl: (...args: unknown[]) => getUploadUrlImpl(...(args as [])),
      },
    },
  };
});

const realFetch = globalThis.fetch;
let putShouldSucceed = true;
let putCalls: { url: string; init: RequestInit }[] = [];

const insertedRows: Record<string, unknown>[] = [];
let parentRow: { id: string; accountId: string } | null = null;

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => Promise.resolve(parentRow ? [parentRow] : [])),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockImplementation((row: Record<string, unknown>) => {
    insertedRows.push(row);
    return {
      returning: vi.fn().mockResolvedValue([{ ...row, createdAt: new Date("2026-07-21T00:00:00Z") }]),
    };
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
    await next();
  },
}));

function audioFormData(): FormData {
  const fd = new FormData();
  fd.append("audio", new File([new Uint8Array([1, 2, 3, 4])], "clip.webm", { type: "audio/webm" }));
  return fd;
}

describe("voice-message.ts real upload wiring", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    insertedRows.length = 0;
    putCalls = [];
    parentRow = null;
    vapronConfigured = true;
    putShouldSucceed = true;
    getUploadUrlImpl = () =>
      Promise.resolve({ uploadUrl: "https://storage.vapron.ai/alecrae-voice-messages/acct_1/key.webm?sig=abc" });

    globalThis.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      putCalls.push({ url, init });
      return Promise.resolve(new Response(null, { status: putShouldSucceed ? 200 : 500 }));
    }) as unknown as typeof fetch;

    delete process.env["OPENAI_API_KEY"];

    const { voiceMessageRouter } = await import("../src/routes/voice-message.js");
    app = new Hono();
    app.route("/v1/voice-messages", voiceMessageRouter);
  });

  it("POST /record actually PUTs the audio bytes and persists the row only after success", async () => {
    const res = await app.request("/v1/voice-messages/record", {
      method: "POST",
      body: audioFormData(),
    });

    expect(res.status).toBe(201);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]?.url).toContain("storage.vapron.ai");
    expect(insertedRows).toHaveLength(1);

    const body = (await res.json()) as { data: { audioUrl: string; sizeBytes: number } };
    expect(body.data.audioUrl).not.toContain("sig=abc"); // query string stripped for the canonical URL
    expect(body.data.sizeBytes).toBe(4);
  });

  it("POST /record returns an honest 503 when storage is unconfigured (no fake URL)", async () => {
    vapronConfigured = false;
    const res = await app.request("/v1/voice-messages/record", {
      method: "POST",
      body: audioFormData(),
    });

    expect(res.status).toBe(503);
    expect(putCalls).toHaveLength(0);
    expect(insertedRows).toHaveLength(0);
  });

  it("POST /record returns 502 and persists nothing when the storage PUT fails", async () => {
    putShouldSucceed = false;
    const res = await app.request("/v1/voice-messages/record", {
      method: "POST",
      body: audioFormData(),
    });

    expect(res.status).toBe(502);
    expect(insertedRows).toHaveLength(0);
  });

  it("POST /:id/reply 404s for a voice message not owned by the caller", async () => {
    parentRow = null; // not found / not owned
    const res = await app.request("/v1/voice-messages/vm_other/reply", {
      method: "POST",
      body: audioFormData(),
    });

    expect(res.status).toBe(404);
    expect(putCalls).toHaveLength(0);
  });

  it("POST /record rejects an oversized recording before ever calling storage", async () => {
    const fd = new FormData();
    const oversized = new Uint8Array(51 * 1024 * 1024);
    fd.append("audio", new File([oversized], "huge.webm", { type: "audio/webm" }));

    const res = await app.request("/v1/voice-messages/record", { method: "POST", body: fd });

    expect(res.status).toBe(400);
    expect(putCalls).toHaveLength(0);
    expect(insertedRows).toHaveLength(0);
  });

  it("POST /:id/reply uploads and sets replyToId when the parent exists", async () => {
    parentRow = { id: "vm_parent", accountId: ACCOUNT_ID };
    const res = await app.request("/v1/voice-messages/vm_parent/reply", {
      method: "POST",
      body: audioFormData(),
    });

    expect(res.status).toBe(201);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.["replyToId"]).toBe("vm_parent");
  });
});

afterAll(() => {
  globalThis.fetch = realFetch;
});
