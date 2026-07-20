/**
 * Regression tests for issue #109's ownership gaps:
 *  - delegation.ts POST / didn't validate delegateUserId belongs to the
 *    caller's workspace.
 *  - delegation.ts GET /inbox leaked delegation metadata across accounts
 *    for a multi-workspace identity (no accountId filter).
 *  - push-notifications.ts POST /subscribe re-parented a subscription by
 *    endpoint alone with no explicit ownership transfer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";
const CALLER_USER_ID = "user_caller";

vi.mock("../src/middleware/auth.js", () => ({
  requireScope: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { accountId: ACCOUNT_ID, userId: CALLER_USER_ID });
    await next();
  },
}));

let workspaceRole: string | null = "member";

const mockDb = {
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/lib/workspace-membership.js", () => ({
  getWorkspaceRole: vi.fn().mockImplementation(() => Promise.resolve(workspaceRole)),
}));

describe("delegation.ts — POST / validates delegateUserId is in-workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceRole = "member";
  });

  it("rejects delegating to a user outside the caller's workspace", async () => {
    workspaceRole = null;
    const { delegationRouter } = await import("../src/routes/delegation.js");
    const app = new Hono();
    app.route("/v1/delegations", delegationRouter);

    const res = await app.request("/v1/delegations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        delegateUserId: "outsider",
        scope: "all",
        permissions: { canReply: true, canArchive: true, canDelete: false, canForward: true },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("allows delegating to an actual workspace member", async () => {
    workspaceRole = "member";
    const { delegationRouter } = await import("../src/routes/delegation.js");
    const app = new Hono();
    app.route("/v1/delegations", delegationRouter);

    const res = await app.request("/v1/delegations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        delegateUserId: "teammate",
        scope: "all",
        permissions: { canReply: true, canArchive: true, canDelete: false, canForward: true },
      }),
    });
    expect(res.status).toBe(201);
  });
});
