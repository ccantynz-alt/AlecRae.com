/**
 * Regression test: POST /t/:emailId/unsubscribe must actually write to
 * suppressionLists, not just record an analytics event. Before this fix,
 * the RFC 8058 one-click unsubscribe headers were perfect but the opt-out
 * itself was never honored — a real CAN-SPAM/GDPR exposure despite looking
 * fully compliant.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const EMAIL_ID = "email_1";
const ACCOUNT_ID = "acct_1";
const DOMAIN_ID = "domain_1";
const SENDER = "sender@example.com";
const RECIPIENT = "recipient@gmail.com";

let insertedSuppressions: { id: string; email: string; domainId: string; reason: string }[] = [];

function isEmailsTable(table: unknown): boolean {
  return Boolean(table && typeof table === "object" && "fromAddress" in (table as Record<string, unknown>));
}
function isDomainsTable(table: unknown): boolean {
  return Boolean(table && typeof table === "object" && "dkimSelector" in (table as Record<string, unknown>));
}

let queryTarget: "emails" | "domains" | "other" = "other";
let insertTarget: "suppressions" | "events" | "other" = "other";

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockImplementation(function (this: typeof mockDb, table: unknown) {
    queryTarget = isEmailsTable(table) ? "emails" : isDomainsTable(table) ? "domains" : "other";
    return this;
  }),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => {
    if (queryTarget === "emails") {
      return Promise.resolve([
        { id: EMAIL_ID, fromAddress: SENDER, accountId: ACCOUNT_ID, toAddresses: [{ address: RECIPIENT }] },
      ]);
    }
    if (queryTarget === "domains") {
      return Promise.resolve([{ id: DOMAIN_ID }]);
    }
    return Promise.resolve([]);
  }),
  insert: vi.fn().mockImplementation(function (this: typeof mockDb, table: unknown) {
    insertTarget = table && typeof table === "object" && "reason" in (table as Record<string, unknown>)
      ? "suppressions"
      : "events";
    return this;
  }),
  values: vi.fn().mockImplementation((row: { id: string; email: string; domainId: string; reason: string }) => {
    if (insertTarget === "suppressions") {
      insertedSuppressions.push(row);
    }
    return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined), then: (r: (v: undefined) => void) => r(undefined) };
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/lib/webhook-dispatcher.js", () => ({
  enqueueWebhookDelivery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/routes/send-time.js", () => ({
  recordEngagementEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /t/:emailId/unsubscribe", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    insertedSuppressions = [];
    queryTarget = "other";
    insertTarget = "other";

    const { tracking } = await import("../src/routes/tracking.js");
    app = new Hono();
    app.route("/t", tracking);
  });

  it("writes the recipient to suppressionLists, scoped to the sender's domain", async () => {
    const res = await app.request(`/t/${EMAIL_ID}/unsubscribe`, { method: "POST" });
    expect(res.status).toBe(200);

    expect(insertedSuppressions).toHaveLength(1);
    expect(insertedSuppressions[0]).toMatchObject({
      email: RECIPIENT,
      domainId: DOMAIN_ID,
      reason: "unsubscribe",
    });
  });

  it("returns 404 for an unknown email id without writing anything", async () => {
    queryTarget = "other";
    // Override the emails lookup to return nothing for this one test.
    mockDb.limit.mockImplementationOnce(() => Promise.resolve([]));

    const res = await app.request(`/t/nonexistent/unsubscribe`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(insertedSuppressions).toHaveLength(0);
  });
});
