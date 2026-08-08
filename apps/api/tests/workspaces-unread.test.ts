/**
 * Regression tests: GET /v1/workspaces/unread.
 *
 * Unread inbox count per workspace the caller belongs to, for the switcher
 * badge — WITHOUT switching into each workspace. The load-bearing property is
 * the scoping: the account set is derived from the caller's own
 * `workspaceMembers` rows, so a non-member's total can never be emitted. These
 * tests pin that a membership with no matching count still reports 0, and that
 * a count for an account the caller is NOT a member of never appears in the
 * response.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const USER_ID = "user_1";
const ACTIVE_ACCOUNT = "acct_1";

let membershipAccountIds: string[] = [];
/** Grouped unread counts the emails query resolves to. */
let unreadCounts: { accountId: string; unreadCount: number }[] = [];

const mockDb = {
  select: vi.fn((projection?: Record<string, unknown>) => {
    const proj = projection ?? {};
    const kind: "memberships" | "counts" | "unknown" =
      "unreadCount" in proj ? "counts" : "accountId" in proj ? "memberships" : "unknown";

    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      groupBy: vi.fn(() => Promise.resolve(unreadCounts)),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(
          kind === "memberships"
            ? membershipAccountIds.map((accountId) => ({ accountId }))
            : [],
        ),
    };
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
    async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("auth", { accountId: ACTIVE_ACCOUNT, userId: USER_ID });
      await next();
    },
}));

async function getUnread(): Promise<Response> {
  const { workspacesRouter } = await import("../src/routes/workspaces.js");
  const app = new Hono();
  app.route("/v1/workspaces", workspacesRouter);
  return app.request("/v1/workspaces/unread");
}

describe("GET /v1/workspaces/unread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipAccountIds = [];
    unreadCounts = [];
  });

  it("counts unread per membership, defaulting a workspace with no unread to 0", async () => {
    membershipAccountIds = ["acct_1", "acct_2"];
    unreadCounts = [{ accountId: "acct_1", unreadCount: 4 }];

    const res = await getUnread();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toEqual([
      { accountId: "acct_1", unreadCount: 4 },
      { accountId: "acct_2", unreadCount: 0 },
    ]);
  });

  it("never leaks a total for an account the caller is not a member of", async () => {
    membershipAccountIds = ["acct_1"];
    // Even if the count query somehow returned a foreign account, the handler
    // only emits rows for the caller's own memberships.
    unreadCounts = [
      { accountId: "acct_1", unreadCount: 2 },
      { accountId: "acct_secret", unreadCount: 99 },
    ];

    const res = await getUnread();
    const body = await res.json();

    expect(body.data).toEqual([{ accountId: "acct_1", unreadCount: 2 }]);
    expect(
      body.data.some((r: { accountId: string }) => r.accountId === "acct_secret"),
    ).toBe(false);
  });

  it("returns an empty list when the caller belongs to no workspaces", async () => {
    membershipAccountIds = [];
    const res = await getUnread();
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
