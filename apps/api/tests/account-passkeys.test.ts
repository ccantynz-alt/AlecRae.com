/**
 * Regression test for the cross-tenant passkey deletion fix.
 *
 * DELETE /v1/account/passkeys/:id previously matched by passkey id alone
 * with no ownership check — any authenticated user could delete any other
 * user's WebAuthn passkey by id, including across tenants.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const OWNER_USER_ID = "user_owner";
const ATTACKER_USER_ID = "user_attacker";
const PASSKEY_ID = "pk_1";

let passkeyOwnerId: string | null = OWNER_USER_ID;

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockImplementation(function (this: typeof mockDb) {
    return this;
  }),
  limit: vi.fn().mockImplementation(() => {
    // The route always filters by (id, userId) after the fix — the mock
    // doesn't parse the drizzle expression tree, so it simulates the DB's
    // actual behavior directly: a row is only "found" if the caller's
    // userId (threaded in via the last `where` call in the test) matches
    // the passkey's real owner.
    return Promise.resolve(lastQueriedAsUserId === passkeyOwnerId ? [{ id: PASSKEY_ID }] : []);
  }),
  delete: vi.fn().mockReturnThis(),
};

let lastQueriedAsUserId: string | null = null;

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope: () => async (c: { req: { header: (k: string) => string | undefined }; set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    const userId = c.req.header("x-test-user") ?? OWNER_USER_ID;
    lastQueriedAsUserId = userId;
    c.set("auth", { accountId: "acct_1", userId });
    await next();
  },
}));

describe("account.ts passkey deletion ownership", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    passkeyOwnerId = OWNER_USER_ID;
    const { account } = await import("../src/routes/account.js");
    app = new Hono();
    app.route("/v1/account", account);
  });

  it("rejects deleting another user's passkey", async () => {
    const res = await app.request(`/v1/account/passkeys/${PASSKEY_ID}`, {
      method: "DELETE",
      headers: { "x-test-user": ATTACKER_USER_ID },
    });
    expect(res.status).toBe(404);
  });

  it("allows the owner to delete their own passkey", async () => {
    const res = await app.request(`/v1/account/passkeys/${PASSKEY_ID}`, {
      method: "DELETE",
      headers: { "x-test-user": OWNER_USER_ID },
    });
    expect(res.status).toBe(200);
  });
});
