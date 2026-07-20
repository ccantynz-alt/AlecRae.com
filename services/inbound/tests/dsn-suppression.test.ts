/**
 * Tests for DSN (bounce) detection and suppression wiring (Known Issue
 * #82(e)): an inbound async bounce (delivery-status-notification) must
 * actually suppress the recipient, not just land in the inbox unremarked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isDsnMessage } from "../src/dsn-suppression.js";
import type { MimeHeader } from "../src/types.js";

const RECIPIENT = "dead@example.net";
const SENDER_DOMAIN = "alecrae.com";
const ACCOUNT_ID = "acct_1";
const DOMAIN_ID = "domain_1";

const RAW_HARD_BOUNCE = `Content-Type: multipart/report; report-type=delivery-status; boundary="AA"

--AA
Content-Type: text/plain

Delivery failed.

--AA
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.net
Arrival-Date: Mon, 1 Jan 2026 00:00:00 +0000

Final-Recipient: rfc822;${RECIPIENT}
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown

--AA--`;

describe("isDsnMessage", () => {
  it("recognizes a standard RFC 3464 DSN content-type", () => {
    const headers: MimeHeader[] = [
      { key: "Content-Type", value: 'multipart/report; report-type=delivery-status; boundary="AA"' },
    ];
    expect(isDsnMessage(headers)).toBe(true);
  });

  it("does not misclassify a normal multipart email", () => {
    const headers: MimeHeader[] = [
      { key: "Content-Type", value: 'multipart/alternative; boundary="AA"' },
    ];
    expect(isDsnMessage(headers)).toBe(false);
  });

  it("does not misclassify a plain-text email even with a Status-like body", () => {
    const headers: MimeHeader[] = [{ key: "Content-Type", value: "text/plain" }];
    expect(isDsnMessage(headers)).toBe(false);
  });
});

const dsnMockState = vi.hoisted(() => ({
  insertedSuppressions: [] as { email: string; domainId: string; reason: string }[],
  queryTarget: "other" as "emails" | "domains" | "other",
}));

const dsnMockDb = vi.hoisted(() => {
  const db = {
    select: (undefined as unknown) as ReturnType<typeof vi.fn>,
    from: (undefined as unknown) as ReturnType<typeof vi.fn>,
    where: (undefined as unknown) as ReturnType<typeof vi.fn>,
    orderBy: (undefined as unknown) as ReturnType<typeof vi.fn>,
    limit: (undefined as unknown) as ReturnType<typeof vi.fn>,
    insert: (undefined as unknown) as ReturnType<typeof vi.fn>,
    values: (undefined as unknown) as ReturnType<typeof vi.fn>,
  };
  return db;
});

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => dsnMockDb };
});

describe("processInboundDsn — suppression writing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dsnMockState.insertedSuppressions = [];
    dsnMockState.queryTarget = "other";

    Object.assign(dsnMockDb, {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockImplementation(function (this: typeof dsnMockDb, table: unknown) {
        dsnMockState.queryTarget =
          table && typeof table === "object" && "fromAddress" in (table as Record<string, unknown>)
            ? "emails"
            : table && typeof table === "object" && "dkimSelector" in (table as Record<string, unknown>)
              ? "domains"
              : "other";
        return this;
      }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        if (dsnMockState.queryTarget === "emails") {
          return Promise.resolve([{ accountId: ACCOUNT_ID, fromAddress: `noreply@${SENDER_DOMAIN}` }]);
        }
        if (dsnMockState.queryTarget === "domains") {
          return Promise.resolve([{ id: DOMAIN_ID }]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockImplementation((row: { email: string; domainId: string; reason: string }) => {
        dsnMockState.insertedSuppressions.push(row);
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    });
  });

  it("suppresses a hard-bounced recipient scoped to the domain that sent to them", async () => {
    const { processInboundDsn } = await import("../src/dsn-suppression.js");
    await processInboundDsn(RAW_HARD_BOUNCE);

    expect(dsnMockState.insertedSuppressions).toHaveLength(1);
    expect(dsnMockState.insertedSuppressions[0]).toMatchObject({
      email: RECIPIENT,
      domainId: DOMAIN_ID,
      reason: "bounce",
    });
  });

  it("does not throw or suppress anything for an unparseable DSN", async () => {
    const { processInboundDsn } = await import("../src/dsn-suppression.js");
    await expect(processInboundDsn("not a dsn at all")).resolves.toBeUndefined();
    expect(dsnMockState.insertedSuppressions).toHaveLength(0);
  });
});
