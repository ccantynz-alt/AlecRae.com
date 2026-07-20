/**
 * Regression tests for account deletion honoring a real 30-day soft-delete
 * window (CLAUDE.md Forbidden List rule #13). DELETE /v1/account used to
 * hard-delete the account row immediately.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let accountStatus: string = "active";
let deleteCalled = false;
let updateSetArgs: Record<string, unknown> | null = null;

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => Promise.resolve([{ status: accountStatus }])),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockImplementation((args: Record<string, unknown>) => {
    updateSetArgs = args;
    return mockDb;
  }),
  delete: vi.fn().mockImplementation(() => {
    deleteCalled = true;
    return mockDb;
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1", role: "owner" });
    await next();
  },
}));

describe("DELETE /v1/account — 30-day soft-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountStatus = "active";
    deleteCalled = false;
    updateSetArgs = null;
  });

  it("does not hard-delete — schedules deletion 30 days out instead", async () => {
    const { account } = await import("../src/routes/account.js");
    const app = new Hono();
    app.route("/v1/account", account);

    const res = await app.request("/v1/account", { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { deleted: boolean; scheduledForDeletionAt: string } };
    expect(body.data.deleted).toBe(false);
    expect(deleteCalled).toBe(false);

    expect(updateSetArgs).toMatchObject({ status: "scheduled_for_deletion" });
    const scheduledAt = new Date(body.data.scheduledForDeletionAt).getTime();
    const expectedAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(scheduledAt - expectedAt)).toBeLessThan(5000);
  });

  it("POST /restore cancels a pending scheduled deletion", async () => {
    accountStatus = "scheduled_for_deletion";
    const { account } = await import("../src/routes/account.js");
    const app = new Hono();
    app.route("/v1/account", account);

    const res = await app.request("/v1/account/restore", { method: "POST" });
    expect(res.status).toBe(200);
    expect(updateSetArgs).toMatchObject({ status: "active", scheduledDeletionAt: null });
  });

  it("POST /restore rejects when the account isn't scheduled for deletion", async () => {
    accountStatus = "active";
    const { account } = await import("../src/routes/account.js");
    const app = new Hono();
    app.route("/v1/account", account);

    const res = await app.request("/v1/account/restore", { method: "POST" });
    expect(res.status).toBe(400);
  });
});
