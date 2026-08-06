/**
 * Regression test: the Files route never enforced storage quota.
 *
 * apps/api/src/lib/storage-quota.ts was fully implemented and unit-tested
 * (tests/storage-quota.test.ts) but had ZERO production callers — only the
 * weekly reconciler was wired up in server.ts. So:
 *
 *   - POST /v1/files/upload issued presigned upload URLs without ever checking
 *     the account's plan limit: unbounded object-storage spend.
 *   - DELETE /v1/files/:id never gave the space back, so recorded usage only
 *     ever grew.
 *   - GET /v1/files/stats returned no `maxSize`, which is the field the page's
 *     usage bar reads.
 *
 * These tests pin all three so the helpers can't become orphaned again.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

const quotaCalls: { accountId: string; size: number }[] = [];
const incrementCalls: { accountId: string; size: number }[] = [];
const decrementCalls: { accountId: string; size: number }[] = [];

let quotaAllowed = true;
let quotaUsage = 0;
const QUOTA_LIMIT = 100 * 1024 * 1024;

vi.mock("../src/lib/storage-quota.js", () => ({
  checkStorageQuota: vi.fn(async (accountId: string, size: number) => {
    quotaCalls.push({ accountId, size });
    return {
      allowed: quotaAllowed,
      currentUsageBytes: quotaUsage,
      limitBytes: QUOTA_LIMIT,
      planTier: "free",
    };
  }),
  incrementStorageUsage: vi.fn(async (accountId: string, size: number) => {
    incrementCalls.push({ accountId, size });
  }),
  decrementStorageUsage: vi.fn(async (accountId: string, size: number) => {
    decrementCalls.push({ accountId, size });
  }),
}));

let getUploadUrlCalled = false;

vi.mock("../src/lib/vapron.js", () => ({
  isVapronConfigured: () => true,
  VapronError: class VapronError extends Error {
    status = 500;
    code = "vapron_error";
  },
  vapron: {
    storage: {
      getUploadUrl: vi.fn(async () => {
        getUploadUrlCalled = true;
        return { uploadUrl: "https://storage.example/put?sig=abc" };
      }),
    },
  },
}));

const existingFile = { id: "file_1", size: 4096 };

/**
 * Minimal drizzle-shaped chain. Queries in this route terminate three
 * different ways — `await db.select()...where()` (the stats totals),
 * `...groupBy()` (the stats breakdown), and `...limit()` (lookups) — so the
 * chain is thenable AND resolvable at `limit`, and reports the breakdown shape
 * once `groupBy` has been called.
 */
const mockDb = {
  select: vi.fn(() => {
    let grouped = false;
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      groupBy: vi.fn(() => {
        grouped = true;
        return chain;
      }),
      limit: vi.fn(() => Promise.resolve([existingFile])),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(grouped ? [] : [{ totalFiles: 1, totalSize: "4096" }]),
    };
    return chain;
  }),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() =>
        Promise.resolve([
          {
            id: "file_new",
            name: "report.pdf",
            mimeType: "application/pdf",
            size: 1024,
            storageKey: "acct_1/file_new/report.pdf",
            source: "upload",
            emailId: null,
            threadId: null,
            thumbnailKey: null,
            uploadedAt: new Date("2026-07-28T00:00:00.000Z"),
          },
        ]),
      ),
    })),
  })),
  delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
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

describe("files route — storage quota enforcement", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    quotaCalls.length = 0;
    incrementCalls.length = 0;
    decrementCalls.length = 0;
    quotaAllowed = true;
    quotaUsage = 0;
    getUploadUrlCalled = false;

    const { filesRouter } = await import("../src/routes/files.js");
    app = new Hono();
    app.route("/v1/files", filesRouter);
  });

  it("checks the quota before issuing an upload URL and counts the upload after", async () => {
    const res = await app.request("/v1/files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "report.pdf", mimeType: "application/pdf", size: 1024 }),
    });

    expect(res.status).toBe(201);
    expect(quotaCalls).toEqual([{ accountId: ACCOUNT_ID, size: 1024 }]);
    expect(incrementCalls).toEqual([{ accountId: ACCOUNT_ID, size: 1024 }]);
  });

  it("rejects with 413 and never touches storage when the upload exceeds the plan limit", async () => {
    quotaAllowed = false;
    quotaUsage = QUOTA_LIMIT;

    const res = await app.request("/v1/files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "big.zip", mimeType: "application/zip", size: 50 * 1024 * 1024 }),
    });

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string; limitBytes: number } };
    expect(body.error.code).toBe("storage_quota_exceeded");
    expect(body.error.limitBytes).toBe(QUOTA_LIMIT);

    // The whole point: no presigned URL is minted and nothing is counted.
    expect(getUploadUrlCalled).toBe(false);
    expect(incrementCalls).toEqual([]);
  });

  it("decrements recorded usage by the deleted file's size", async () => {
    const res = await app.request("/v1/files/file_1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(decrementCalls).toEqual([{ accountId: ACCOUNT_ID, size: existingFile.size }]);
  });

  it("exposes the plan limit as maxSize so the usage bar and the 413 agree", async () => {
    const res = await app.request("/v1/files/stats");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { maxSize: number; planTier: string } };
    expect(body.data.maxSize).toBe(QUOTA_LIMIT);
    expect(body.data.planTier).toBe("free");
  });
});
