/**
 * Regression test for issue #29 (files half): POST /v1/files/upload used to
 * be an honest 501 (no object storage backend wired). This verifies the real
 * Vapron-backed presigned-upload flow: a configured backend returns a real
 * uploadUrl and persists a `files` row, a getUploadUrl failure returns an
 * honest 502/503 rather than a fabricated success, and an unconfigured
 * backend still refuses cleanly instead of silently discarding the upload.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let vapronConfigured = true;
let getUploadUrlImpl: () => Promise<{ uploadUrl: string }> = () =>
  Promise.resolve({ uploadUrl: "https://storage.vapron.ai/alecrae-files/acct_1/key?X-Amz-Signature=abc" });

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

const insertedRows: Record<string, unknown>[] = [];

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockImplementation((row: Record<string, unknown>) => {
    insertedRows.push(row);
    return {
      returning: vi.fn().mockResolvedValue([
        { ...row, uploadedAt: new Date("2026-07-21T00:00:00Z") },
      ]),
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

describe("POST /v1/files/upload", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    insertedRows.length = 0;
    vapronConfigured = true;
    getUploadUrlImpl = () =>
      Promise.resolve({ uploadUrl: "https://storage.vapron.ai/alecrae-files/acct_1/key?X-Amz-Signature=abc" });

    const { filesRouter } = await import("../src/routes/files.js");
    app = new Hono();
    app.route("/v1/files", filesRouter);
  });

  it("returns a real uploadUrl and persists a files row when storage is configured", async () => {
    const res = await app.request("/v1/files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "report.pdf", mimeType: "application/pdf", size: 12345 }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { uploadUrl: string; file: { name: string; storageKey: string } } };
    expect(body.data.uploadUrl).toContain("https://storage.vapron.ai");
    expect(body.data.file.name).toBe("report.pdf");
    expect(body.data.file.storageKey).toContain(ACCOUNT_ID);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.["source"]).toBe("upload");
  });

  it("returns an honest 503 (not a fake URL) when storage is unconfigured", async () => {
    vapronConfigured = false;
    const res = await app.request("/v1/files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "report.pdf", mimeType: "application/pdf", size: 12345 }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("storage_unavailable");
    expect(insertedRows).toHaveLength(0);
  });

  it("returns an honest error (not a fake success) when Vapron's getUploadUrl fails", async () => {
    getUploadUrlImpl = () => Promise.reject(new Error("upstream 500"));
    const res = await app.request("/v1/files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "report.pdf", mimeType: "application/pdf", size: 12345 }),
    });

    expect([502, 503]).toContain(res.status);
    expect(insertedRows).toHaveLength(0);
  });

  it("rejects a file over the size ceiling with a validation error, not silent truncation", async () => {
    const res = await app.request("/v1/files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "huge.zip", mimeType: "application/zip", size: 200 * 1024 * 1024 }),
    });

    expect(res.status).toBe(422);
    expect(insertedRows).toHaveLength(0);
  });
});
