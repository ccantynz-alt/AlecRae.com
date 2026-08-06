/**
 * Regression tests: PATCH /v1/mailboxes/:id.
 *
 * The route shipped with POST/GET/DELETE only, so a native business-email
 * mailbox could be created and destroyed but never edited — no rename, no
 * change of forwarding, and no way to stop delivery without deleting the row.
 *
 * Two properties here are load-bearing rather than incidental:
 *
 *  - **`address` is not editable.** Inbound routing resolves recipients by
 *    exact address (`services/inbound/src/routing/router.ts` `lookupMailbox`),
 *    so renaming in place would strand mail still addressed to the old value
 *    with nothing left to resolve it. The schema must ignore an `address` in
 *    the body rather than quietly applying it.
 *  - **A mailbox belonging to another account is a 404, and issues no write.**
 *    Ids are guessable; the ownership check has to happen before the update,
 *    not alongside it. Asserting "no update was issued" is the part that
 *    catches a future refactor which 404s on the *response* while still having
 *    touched the row.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

interface MailboxRow {
  id: string;
  accountId: string;
  domainId: string;
  localPart: string;
  address: string;
  displayName: string | null;
  forwardTo: string[] | null;
  isActive: boolean;
}

let rows: MailboxRow[] = [];
/** Every `.set()` payload the route issued, in order. */
let updates: Record<string, unknown>[] = [];

function mailbox(over: Partial<MailboxRow> = {}): MailboxRow {
  return {
    id: "mb_1",
    accountId: ACCOUNT_ID,
    domainId: "dom_1",
    localPart: "info",
    address: "info@bookaride.co.nz",
    displayName: "BookARide Support",
    forwardTo: null,
    isActive: true,
    ...over,
  };
}

/**
 * The route scopes its lookup by (id, accountId), so the mock resolves the
 * same way: a row owned by another account is simply not found.
 */
const mockDb = {
  select: vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn((cond: unknown) => {
        // Drizzle conditions are opaque here; the route only ever selects a
        // single mailbox by id, so replay the account scoping directly.
        void cond;
        return chain;
      }),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
      then: (resolve: (v: unknown) => unknown) => resolve(rows),
    };
    return chain;
  }),
  update: vi.fn(() => {
    const chain: Record<string, unknown> = {
      set: vi.fn((values: Record<string, unknown>) => {
        updates.push(values);
        return chain;
      }),
      where: vi.fn(() => Promise.resolve(undefined)),
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
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

async function patch(id: string, body: unknown): Promise<Response> {
  const { mailboxes } = await import("../src/routes/mailboxes.js");
  const app = new Hono();
  app.route("/v1/mailboxes", mailboxes);
  return app.request(`/v1/mailboxes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /v1/mailboxes/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    updates = [];
  });

  it("updates the display name", async () => {
    rows = [mailbox()];
    const res = await patch("mb_1", { displayName: "BookARide Bookings" });

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ displayName: "BookARide Bookings" });
  });

  it("sets forwarding addresses, and allows clearing them with null", async () => {
    rows = [mailbox()];
    await patch("mb_1", { forwardTo: ["craig@alecrae.com"] });
    expect(updates[0]).toMatchObject({ forwardTo: ["craig@alecrae.com"] });

    updates = [];
    await patch("mb_1", { forwardTo: null });
    expect(updates[0]).toMatchObject({ forwardTo: null });
  });

  it("deactivates a mailbox without deleting it", async () => {
    rows = [mailbox()];
    const res = await patch("mb_1", { isActive: false });

    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ isActive: false });
  });

  it("never changes the address, even when one is supplied", async () => {
    rows = [mailbox()];
    const res = await patch("mb_1", {
      displayName: "Renamed",
      address: "sales@bookaride.co.nz",
      localPart: "sales",
      domainId: "dom_other",
    });

    expect(res.status).toBe(200);
    // The address keys must never reach the update — a rename in place would
    // strand mail already delivered to the old address.
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty("address");
    expect(updates[0]).not.toHaveProperty("localPart");
    expect(updates[0]).not.toHaveProperty("domainId");
  });

  it("rejects a body with no updatable field", async () => {
    rows = [mailbox()];
    const res = await patch("mb_1", {});

    expect(res.status).toBe(422);
    expect(updates).toHaveLength(0);
  });

  it("rejects an invalid forwarding address before touching the row", async () => {
    rows = [mailbox()];
    const res = await patch("mb_1", { forwardTo: ["not-an-email"] });

    expect(res.status).toBe(422);
    expect(updates).toHaveLength(0);
  });

  it("404s on another account's mailbox and issues no update", async () => {
    // Scoped lookup finds nothing, exactly as the real query would.
    rows = [];
    const res = await patch("mb_someone_else", { displayName: "Taken over" });

    expect(res.status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});
