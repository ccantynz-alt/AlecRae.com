/**
 * Regression tests for the chat channel IDOR fix.
 *
 * Before this fix, every channel-scoped route (get channel, send message,
 * list messages, add/remove members, mark read) trusted the :id URL param
 * alone — any authenticated user from any tenant could read/write/manage
 * any channel by guessing its id. These tests assert that a non-member is
 * always rejected (404, indistinguishable from a channel that doesn't
 * exist) and a real member is allowed through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../src/lib/workspace-membership.js", () => ({
  getWorkspaceRole: vi.fn().mockResolvedValue("member"),
}));

const CHANNEL_ID = "chan_1";
const MEMBER_USER_ID = "user_member";
const OUTSIDER_USER_ID = "user_outsider";
const ACCOUNT_ID = "acct_1";

let channelExists = true;
let memberRows: { role: string; userId?: string; joinedAt?: Date }[] = [];

function membership(role: string): { role: string; userId: string; joinedAt: Date } {
  return { role, userId: MEMBER_USER_ID, joinedAt: new Date("2026-01-01T00:00:00Z") };
}

function isChannelsTable(table: unknown): boolean {
  return Boolean(table && typeof table === "object" && "topic" in (table as Record<string, unknown>));
}
function isMembersTable(table: unknown): boolean {
  return Boolean(table && typeof table === "object" && "joinedAt" in (table as Record<string, unknown>));
}

let queryTarget: "channels" | "members" | "other" = "other";

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockImplementation(function (this: typeof mockDb, table: unknown) {
    queryTarget = isChannelsTable(table) ? "channels" : isMembersTable(table) ? "members" : "other";
    return this;
  }),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => {
    if (queryTarget === "channels") {
      return Promise.resolve(
        channelExists
          ? [
              {
                id: CHANNEL_ID,
                accountId: ACCOUNT_ID,
                type: "group",
                name: "test",
                topic: null,
                createdAt: new Date("2026-01-01T00:00:00Z"),
                updatedAt: new Date("2026-01-01T00:00:00Z"),
              },
            ]
          : [],
      );
    }
    if (queryTarget === "members") {
      return Promise.resolve(memberRows);
    }
    return Promise.resolve([]);
  }),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnValue({
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    then: (resolve: (v: undefined) => void) => resolve(undefined),
  }),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  // Some queries (e.g. the members-list in GET /channels/:id) `await` right
  // after `.where()` with no `.limit()` — make the builder itself thenable
  // so that case resolves too, without disturbing chains that DO call
  // `.limit()` afterward (JS only invokes `.then` when nothing else chains).
  then: (resolve: (v: unknown[]) => void) => resolve(queryTarget === "members" ? memberRows : []),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return {
    ...actual,
    getDatabase: () => mockDb,
  };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { accountId: ACCOUNT_ID, userId: c.req?.header?.("x-test-user") ?? MEMBER_USER_ID });
    await next();
  },
}));

describe("chat.ts channel authorization", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    channelExists = true;
    memberRows = [];
    queryTarget = "other";

    const { chatRouter } = await import("../src/routes/chat.js");
    app = new Hono();
    app.route("/v1/chat", chatRouter);
  });

  it("rejects GET /channels/:id for a non-member with 404, not channel data", async () => {
    memberRows = []; // caller is not a member
    const res = await app.request(`/v1/chat/channels/${CHANNEL_ID}`, {
      headers: { "x-test-user": OUTSIDER_USER_ID },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("channel_not_found");
  });

  it("allows GET /channels/:id for an actual member", async () => {
    memberRows = [membership("member")];
    const res = await app.request(`/v1/chat/channels/${CHANNEL_ID}`, {
      headers: { "x-test-user": MEMBER_USER_ID },
    });
    expect(res.status).toBe(200);
  });

  it("rejects POST /channels/:id/messages for a non-member", async () => {
    memberRows = [];
    const res = await app.request(`/v1/chat/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": OUTSIDER_USER_ID },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a non-admin member from adding channel members", async () => {
    memberRows = [membership("member")]; // member, not admin
    const res = await app.request(`/v1/chat/channels/${CHANNEL_ID}/members`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": MEMBER_USER_ID },
      body: JSON.stringify({ userIds: ["some_user"] }),
    });
    expect(res.status).toBe(403);
  });

  it("allows an admin member to add channel members", async () => {
    memberRows = [membership("admin")];
    const res = await app.request(`/v1/chat/channels/${CHANNEL_ID}/members`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": MEMBER_USER_ID },
      body: JSON.stringify({ userIds: ["some_user"] }),
    });
    expect(res.status).toBe(201);
  });

  it("rejects removing another member when caller is not an admin", async () => {
    memberRows = [membership("member")];
    const res = await app.request(`/v1/chat/channels/${CHANNEL_ID}/members/${OUTSIDER_USER_ID}`, {
      method: "DELETE",
      headers: { "x-test-user": MEMBER_USER_ID },
    });
    expect(res.status).toBe(403);
  });

  it("allows a member to remove themselves without admin role", async () => {
    memberRows = [membership("member")];
    const res = await app.request(`/v1/chat/channels/${CHANNEL_ID}/members/${MEMBER_USER_ID}`, {
      method: "DELETE",
      headers: { "x-test-user": MEMBER_USER_ID },
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 (not leaking existence) for a channel that doesn't exist at all", async () => {
    channelExists = false;
    memberRows = [];
    const res = await app.request(`/v1/chat/channels/nonexistent`, {
      headers: { "x-test-user": OUTSIDER_USER_ID },
    });
    expect(res.status).toBe(404);
  });
});
