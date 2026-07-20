/**
 * Regression test for issue #116(d): no GDPR Article 15 self-service export
 * existed at all. Verifies POST /v1/account/gdpr/export requires a real user
 * session (not just an API key), assembles the expected shape from each
 * scoped table, and is honest about coverage — an omitted table shows up in
 * `coverage.notYetIncluded`/`excludedByDesign` rather than silently missing,
 * and a table over the row cap sets `coverage.truncated` rather than quietly
 * dropping rows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";
const USER_ID = "user_1";

let tableData = new Map<unknown, unknown[]>();
let tables: Record<string, unknown> = {};

const mockDb = {
  select: vi.fn(() => {
    let currentTable: unknown = null;
    const chain = {
      from: vi.fn((table: unknown) => {
        currentTable = table;
        return chain;
      }),
      where: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(tableData.get(currentTable) ?? [])),
    };
    return chain;
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  tables = actual;
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope: () => async (c: { set: (k: string, v: unknown) => void; req: { header: (k: string) => string | undefined } }, next: () => Promise<void>) => {
    const noUser = c.req.header("x-test-no-user") === "1";
    c.set("auth", noUser ? { accountId: ACCOUNT_ID } : { accountId: ACCOUNT_ID, userId: USER_ID });
    await next();
  },
}));

describe("POST /v1/account/gdpr/export", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    tableData = new Map();

    const { gdprRouter } = await import("../src/routes/gdpr.js");
    app = new Hono();
    app.route("/v1/account/gdpr", gdprRouter);
  });

  it("requires a user-authenticated session, not just an API key", async () => {
    const res = await app.request("/v1/account/gdpr/export", {
      method: "POST",
      headers: { "x-test-no-user": "1" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("user_session_required");
  });

  it("returns account/user/contacts data and an honest coverage report", async () => {
    tableData.set(tables["accounts"], [{ id: ACCOUNT_ID, name: "Acme", planTier: "starter" }]);
    tableData.set(tables["users"], [{ id: USER_ID, email: "a@b.com", name: "Alice" }]);
    tableData.set(tables["contacts"], [{ id: "c1", email: "x@y.com", name: "X" }]);

    const res = await app.request("/v1/account/gdpr/export", { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { account: { id: string } | null; user: { id: string } | null; contacts: unknown[] };
      coverage: { complete: boolean; excludedByDesign: string[]; truncated: string[] };
    };

    expect(body.data.account?.id).toBe(ACCOUNT_ID);
    expect(body.data.user?.id).toBe(USER_ID);
    expect(body.data.contacts).toHaveLength(1);
    expect(body.coverage.complete).toBe(false);
    expect(body.coverage.excludedByDesign.join(" ")).toMatch(/token/i);
    expect(body.coverage.truncated).toEqual([]);
  });

  it("flags truncation honestly instead of silently dropping rows over the cap", async () => {
    const manyContacts = Array.from({ length: 10_001 }, (_, i) => ({ id: `c${i}`, email: `${i}@x.com` }));
    tableData.set(tables["contacts"], manyContacts);

    const res = await app.request("/v1/account/gdpr/export", { method: "POST" });
    const body = (await res.json()) as {
      data: { contacts: unknown[] };
      coverage: { truncated: string[] };
    };

    expect(body.data.contacts).toHaveLength(10_000);
    expect(body.coverage.truncated).toContain("contacts");
  });
});
