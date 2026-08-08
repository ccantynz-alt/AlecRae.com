/**
 * Regression tests: GET /v1/messages — `deliveredTo` resolution and the
 * per-mailbox / unrouted filter.
 *
 * The inbound store records `tags` as `[folder, mailboxRowId?]`
 * (services/inbound/src/storage/postgres-store.ts). These tests pin that:
 *
 *  - a message whose tags carry a provisioned mailbox id reports
 *    `deliveredTo: { mailboxId, address }`, resolved from the `mailboxes` table
 *    scoped to the caller's account;
 *  - a message with no mailbox tag (catch-all) reports `deliveredTo: null`;
 *  - `?mailboxId=<id>` adds a jsonb-containment WHERE condition for that id, and
 *    `?mailboxId=unrouted` forces folder=inbox and excludes every mailbox id.
 *
 * The DB is mocked table-by-table so no Postgres is needed. Because a mock
 * cannot actually evaluate SQL, the filter assertions render the WHERE clause
 * the handler built (via drizzle's PgDialect) and check the bound parameters —
 * which proves the right mailbox id and folder reached the query, the part a
 * regression would break.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";

const ACCOUNT_ID = "acct_1";

interface EmailRow {
  id: string;
  messageId: string;
  inReplyTo: string | null;
  references: string[] | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: { address: string; name?: string }[];
  ccAddresses: { address: string; name?: string }[] | null;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  status: string;
  tags: string[];
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

interface MailboxRow {
  id: string;
  address: string;
  accountId: string;
}

let emailRows: EmailRow[] = [];
let mailboxRows: MailboxRow[] = [];
/** The combined WHERE SQL handed to the emails query, for filter assertions. */
let lastEmailWhere: unknown = null;

function email(over: Partial<EmailRow> = {}): EmailRow {
  const now = new Date("2026-08-01T00:00:00.000Z");
  return {
    id: "em_1",
    messageId: "<a@x>",
    inReplyTo: null,
    references: null,
    fromAddress: "sender@example.com",
    fromName: "Sender",
    toAddresses: [{ address: "info@bookaride.co.nz" }],
    ccAddresses: null,
    subject: "Hi",
    textBody: "body",
    htmlBody: null,
    status: "delivered",
    tags: ["inbox"],
    isRead: false,
    isStarred: false,
    folder: "inbox",
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...over,
  };
}

/**
 * A chainable query stub. The route builds several different reads; we key off
 * the `select({...})` projection shape to return the right rows:
 *   emails    — has messageId + tags
 *   events    — has firstOpenedAt
 *   labels    — has name (+ color)
 *   mailboxes — has id, none of the above (both {id,address} and {id} projections)
 */
const mockDb = {
  select: vi.fn((projection?: Record<string, unknown>) => {
    const proj = projection ?? {};
    let table: "emails" | "mailboxes" | "events" | "labels" | "unknown" =
      "unknown";
    if ("messageId" in proj && "tags" in proj) table = "emails";
    else if ("firstOpenedAt" in proj) table = "events";
    else if ("name" in proj) table = "labels";
    else if ("id" in proj) table = "mailboxes";

    const resolveFor = (): unknown[] => {
      if (table === "emails") return emailRows;
      if (table === "mailboxes")
        return mailboxRows.map((m) => ({ id: m.id, address: m.address }));
      return [];
    };

    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn((cond: unknown) => {
        if (table === "emails") lastEmailWhere = cond;
        return chain;
      }),
      orderBy: vi.fn(() => chain),
      groupBy: vi.fn(() => Promise.resolve([])),
      limit: vi.fn(() => Promise.resolve(resolveFor())),
      // reads awaited directly off `.where(...)` (mailboxes, labels)
      then: (resolve: (v: unknown) => unknown) => resolve(resolveFor()),
    };
    return chain;
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/lib/queue.js", () => ({
  getSendQueue: () => ({ add: vi.fn() }),
}));

function renderedWhere(): { sql: string; params: unknown[] } {
  if (!lastEmailWhere) return { sql: "", params: [] };
  const q = new PgDialect().sqlToQuery(lastEmailWhere as never);
  return { sql: q.sql, params: q.params };
}

async function listRequest(qs: string): Promise<Response> {
  const { messages } = await import("../src/routes/messages.js");
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth" as never, {
      accountId: ACCOUNT_ID,
      scopes: ["messages:read"],
    } as never);
    await next();
  });
  app.route("/v1/messages", messages);
  return app.request(`/v1/messages${qs}`);
}

describe("GET /v1/messages — deliveredTo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailRows = [];
    mailboxRows = [];
    lastEmailWhere = null;
  });

  it("resolves the mailbox address from a tagged message", async () => {
    mailboxRows = [
      { id: "mb_info", address: "info@bookaride.co.nz", accountId: ACCOUNT_ID },
    ];
    emailRows = [email({ id: "em_routed", tags: ["inbox", "mb_info"] })];

    const res = await listRequest("");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].deliveredTo).toEqual({
      mailboxId: "mb_info",
      address: "info@bookaride.co.nz",
    });
  });

  it("returns deliveredTo: null for an untagged (catch-all) message", async () => {
    mailboxRows = [
      { id: "mb_info", address: "info@bookaride.co.nz", accountId: ACCOUNT_ID },
    ];
    emailRows = [email({ id: "em_catchall", tags: ["inbox"] })];

    const res = await listRequest("");
    const body = await res.json();
    expect(body.data[0].deliveredTo).toBeNull();
  });

  it("does not resolve a mailbox id belonging to another account", async () => {
    // The scoped lookup returns nothing, so a foreign tag stays unresolved.
    mailboxRows = [];
    emailRows = [
      email({ id: "em_foreign", tags: ["inbox", "mb_other_tenant"] }),
    ];

    const res = await listRequest("");
    const body = await res.json();
    expect(body.data[0].deliveredTo).toBeNull();
  });
});

describe("GET /v1/messages — mailbox filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailRows = [email()];
    mailboxRows = [];
    lastEmailWhere = null;
  });

  it("?mailboxId=<id> adds a containment condition for that mailbox", async () => {
    await listRequest("?mailboxId=mb_info");
    const { params } = renderedWhere();
    expect(params).toContain(JSON.stringify(["mb_info"]));
  });

  it("?mailboxId=unrouted forces folder=inbox and excludes every mailbox id", async () => {
    mailboxRows = [
      { id: "mb_info", address: "info@bookaride.co.nz", accountId: ACCOUNT_ID },
      { id: "mb_sales", address: "sales@bookaride.co.nz", accountId: ACCOUNT_ID },
    ];

    await listRequest("?mailboxId=unrouted&folder=all");
    const { sql, params } = renderedWhere();

    // folder pinned to inbox despite folder=all …
    expect(params).toContain("inbox");
    // … and each mailbox id negated.
    expect(sql.toLowerCase()).toContain("not (");
    expect(params).toContain(JSON.stringify(["mb_info"]));
    expect(params).toContain(JSON.stringify(["mb_sales"]));
  });
});
