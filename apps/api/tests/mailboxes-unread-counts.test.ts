/**
 * Regression tests: GET /v1/mailboxes/unread-counts.
 *
 * Per-mailbox unread-inbox badge counts plus an "unrouted" (catch-all) bucket.
 * The route runs two bounded queries — a mailbox-driven LEFT JOIN grouped by
 * mailbox, and one count for the catch-all — never one-per-mailbox. These tests
 * pin the response shape the switcher builds against and that the unrouted
 * bucket is reported alongside the per-mailbox numbers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let perMailboxRows: { mailboxId: string; address: string; unreadCount: number }[] =
  [];
let unroutedCount = 0;

const mockDb = {
  select: vi.fn((projection?: Record<string, unknown>) => {
    const proj = projection ?? {};
    const kind: "perMailbox" | "count" | "unknown" =
      "unreadCount" in proj ? "perMailbox" : "count" in proj ? "count" : "unknown";

    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      groupBy: vi.fn(() => Promise.resolve(perMailboxRows)),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(kind === "count" ? [{ count: unroutedCount }] : []),
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
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

async function getUnreadCounts(): Promise<Response> {
  const { mailboxes } = await import("../src/routes/mailboxes.js");
  const app = new Hono();
  app.route("/v1/mailboxes", mailboxes);
  return app.request("/v1/mailboxes/unread-counts");
}

describe("GET /v1/mailboxes/unread-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perMailboxRows = [];
    unroutedCount = 0;
  });

  it("returns per-mailbox unread counts plus an unrouted bucket", async () => {
    perMailboxRows = [
      { mailboxId: "mb_info", address: "info@bookaride.co.nz", unreadCount: 3 },
      { mailboxId: "mb_sales", address: "sales@bookaride.co.nz", unreadCount: 0 },
    ];
    unroutedCount = 5;

    const res = await getUnreadCounts();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.mailboxes).toEqual([
      { mailboxId: "mb_info", address: "info@bookaride.co.nz", unreadCount: 3 },
      { mailboxId: "mb_sales", address: "sales@bookaride.co.nz", unreadCount: 0 },
    ]);
    expect(body.data.unrouted).toBe(5);
  });

  it("returns an empty mailbox list and the unrouted count when no mailboxes exist", async () => {
    perMailboxRows = [];
    unroutedCount = 2;

    const res = await getUnreadCounts();
    const body = await res.json();

    expect(body.data.mailboxes).toEqual([]);
    // All inbox unread is unrouted when the account has no provisioned mailboxes.
    expect(body.data.unrouted).toBe(2);
  });
});
