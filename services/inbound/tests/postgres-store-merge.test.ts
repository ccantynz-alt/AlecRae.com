/**
 * Tests for PostgresEmailStore.store():
 *
 *  - Multi-recipient delivery on ONE account no longer crashes on the
 *    (account_id, message_id) unique index: the insert targets the index
 *    with onConflictDoNothing and the conflicting delivery MERGES its
 *    mailbox tag into the existing row instead of throwing (which used to
 *    fail the whole delivery -> 451 -> the sender redelivered forever).
 *  - `source: "inbound"` is set on every stored row (the schema documents
 *    "inbound" for mail received via our MTA; it was previously omitted).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedEmail, FilterVerdict, ResolvedRecipient } from "../src/types.js";
// Static import, NOT a dynamic import inside the first test: vi.mock is
// hoisted above imports so the mock still applies, and the (slow) transitive
// load of @alecrae/db happens during collection rather than inside a test
// body — a dynamic import there ran ~4.6s cold and, under full-suite load,
// blew the 5s test timeout, letting the still-pending store() push its row
// into the NEXT test's freshly-reset mock state (flaky cross-test bleed).
import { PostgresEmailStore } from "../src/storage/postgres-store.js";

const storeMockState = vi.hoisted(() => ({
  queryTarget: "other" as "emails" | "domains" | "other",
  insertReturning: [] as { id: string }[],
  existingRow: null as { id: string; tags: string[] } | null,
  insertedValues: [] as Record<string, unknown>[],
  onConflictArgs: [] as unknown[],
  updateSets: [] as Record<string, unknown>[],
  emailsSelectCount: 0,
}));

const storeMockDb = vi.hoisted(() => ({
  select: (undefined as unknown) as ReturnType<typeof vi.fn>,
  from: (undefined as unknown) as ReturnType<typeof vi.fn>,
  where: (undefined as unknown) as ReturnType<typeof vi.fn>,
  limit: (undefined as unknown) as ReturnType<typeof vi.fn>,
  insert: (undefined as unknown) as ReturnType<typeof vi.fn>,
  values: (undefined as unknown) as ReturnType<typeof vi.fn>,
  update: (undefined as unknown) as ReturnType<typeof vi.fn>,
  set: (undefined as unknown) as ReturnType<typeof vi.fn>,
}));

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => storeMockDb };
});

vi.mock("@alecrae/shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/shared");
  return { ...actual, indexEmail: vi.fn().mockResolvedValue(undefined) };
});

function makeParsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: "<msg-42@remote.example>",
    from: [{ address: "sender@remote.example" }],
    to: [
      { address: "user1@customer.com" },
      { address: "user2@customer.com" },
    ],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: "hello",
    references: [],
    headers: [{ key: "Content-Type", value: "text/plain" }],
    text: "body",
    attachments: [],
    rawSize: 100,
    ...overrides,
  };
}

function makeVerdict(action: FilterVerdict["action"]): FilterVerdict {
  return { action, flags: new Set(), authResults: [] };
}

function makeRecipient(mailboxId: string, address: string): ResolvedRecipient {
  return {
    originalAddress: address,
    resolvedAddress: address,
    mailboxId,
    accountId: "acct-1",
    rule: {
      id: `mailbox:${mailboxId}`,
      pattern: address,
      type: "exact",
      action: "deliver",
      destination: mailboxId,
      priority: 0,
    },
  };
}

describe("PostgresEmailStore — same-account multi-recipient merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMockState.queryTarget = "other";
    storeMockState.insertReturning = [{ id: "ignored" }];
    storeMockState.existingRow = null;
    storeMockState.insertedValues = [];
    storeMockState.onConflictArgs = [];
    storeMockState.updateSets = [];
    storeMockState.emailsSelectCount = 0;

    Object.assign(storeMockDb, {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockImplementation(function (this: typeof storeMockDb, table: unknown) {
        storeMockState.queryTarget =
          table && typeof table === "object" && "fromAddress" in (table as Record<string, unknown>)
            ? "emails"
            : table && typeof table === "object" && "dkimSelector" in (table as Record<string, unknown>)
              ? "domains"
              : "other";
        return this;
      }),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        if (storeMockState.queryTarget === "domains") {
          return Promise.resolve([{ id: "dom-1" }]);
        }
        if (storeMockState.queryTarget === "emails") {
          storeMockState.emailsSelectCount++;
          return Promise.resolve(
            storeMockState.existingRow ? [storeMockState.existingRow] : [],
          );
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        storeMockState.insertedValues.push(vals);
        return {
          onConflictDoNothing: (args: unknown): { returning: () => Promise<{ id: string }[]> } => {
            storeMockState.onConflictArgs.push(args);
            return {
              returning: (): Promise<{ id: string }[]> =>
                Promise.resolve(storeMockState.insertReturning),
            };
          },
        };
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation(function (this: typeof storeMockDb, vals: Record<string, unknown>) {
        storeMockState.updateSets.push(vals);
        return this;
      }),
    });
  });

  async function storeOne(
    mailboxId: string,
    address: string,
    action: FilterVerdict["action"] = "accept",
  ): Promise<{ id: string }> {
    const store = new PostgresEmailStore();
    return store.store(makeParsed(), makeRecipient(mailboxId, address), makeVerdict(action));
  }

  it("inserts a fresh row with source 'inbound' and both folder + mailbox tags", async () => {
    storeMockState.insertReturning = [{ id: "whatever" }];
    await storeOne("mbx-1", "user1@customer.com");

    expect(storeMockState.insertedValues).toHaveLength(1);
    const row = storeMockState.insertedValues[0];
    expect(row?.["source"]).toBe("inbound");
    expect(row?.["folder"]).toBe("inbox");
    expect(row?.["tags"]).toEqual(["inbox", "mbx-1"]);
    expect(row?.["messageId"]).toBe("<msg-42@remote.example>");
    // The conflict target is declared, so a duplicate can never throw.
    expect(storeMockState.onConflictArgs).toHaveLength(1);
  });

  it("quarantined mail files under spam in both folder and tags", async () => {
    storeMockState.insertReturning = [{ id: "whatever" }];
    await storeOne("mbx-1", "user1@customer.com", "quarantine");

    const row = storeMockState.insertedValues[0];
    expect(row?.["folder"]).toBe("spam");
    expect(row?.["tags"]).toEqual(["spam", "mbx-1"]);
  });

  it("merges the second recipient's mailbox tag into the existing row on conflict", async () => {
    // Conflict: the insert is a no-op, an existing row is found.
    storeMockState.insertReturning = [];
    storeMockState.existingRow = { id: "existing-1", tags: ["inbox", "mbx-1"] };

    const stored = await storeOne("mbx-2", "user2@customer.com");

    // The delivery SUCCEEDS and reports the existing row.
    expect(stored.id).toBe("existing-1");
    // The new mailbox tag was merged, nothing duplicated.
    expect(storeMockState.updateSets).toHaveLength(1);
    expect(storeMockState.updateSets[0]?.["tags"]).toEqual(["inbox", "mbx-1", "mbx-2"]);
  });

  it("does not rewrite tags when the merged tag is already present", async () => {
    storeMockState.insertReturning = [];
    storeMockState.existingRow = { id: "existing-1", tags: ["inbox", "mbx-2"] };

    const stored = await storeOne("mbx-2", "user2@customer.com");

    expect(stored.id).toBe("existing-1");
    expect(storeMockState.updateSets).toHaveLength(0);
  });

  it("surfaces the impossible state (conflict but no row) instead of claiming delivery", async () => {
    storeMockState.insertReturning = [];
    storeMockState.existingRow = null;

    await expect(storeOne("mbx-2", "user2@customer.com")).rejects.toThrow(
      /no existing row/,
    );
  });
});
