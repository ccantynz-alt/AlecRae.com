/**
 * Tests for the email.received event/webhook emitter (events/received-event.ts):
 *
 *  - A fresh delivery writes exactly ONE events row (dotted type
 *    "email.received", the dispatcher's exact column shape) and enqueues one
 *    "deliver" job per matching active webhook onto "alecrae-webhooks" with
 *    the dispatcher's exact WebhookJobData shape ({ webhookId, eventId,
 *    accountId }) and jobId (`wh_<webhookId>_<eventId>`).
 *  - eventTypes filtering follows the dispatcher's own convention
 *    (apps/api/src/lib/webhook-dispatcher.ts): NULL or EMPTY array = all
 *    events; a non-empty array must contain "email.received".
 *  - A MERGED delivery (multi-recipient on one account — the store returned
 *    the existing row) emits nothing: no second event for the same
 *    (accountId, messageId).
 *  - No REDIS_URL: the events row is still written, no queue is ever
 *    constructed, nothing is enqueued.
 *  - The emitter NEVER throws — DB or enqueue failure resolves quietly (the
 *    message is already stored; the sender's 250 must not become a 451).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── bullmq mock ─────────────────────────────────────────────────────────────

const queueState = vi.hoisted(() => ({
  constructed: [] as { name: string; opts: Record<string, unknown> }[],
  added: [] as { name: string; data: unknown; opts: Record<string, unknown> }[],
  addImpl: null as (() => Promise<unknown>) | null,
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    constructor(name: string, opts: Record<string, unknown>) {
      queueState.constructed.push({ name, opts });
    }
    add(name: string, data: unknown, opts: Record<string, unknown>): Promise<unknown> {
      queueState.added.push({ name, data, opts });
      return queueState.addImpl ? queueState.addImpl() : Promise.resolve({});
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

// ── @alecrae/db mock ────────────────────────────────────────────────────────

const dbState = vi.hoisted(() => ({
  insertedEvents: [] as Record<string, unknown>[],
  webhookRows: [] as { id: string; eventTypes: string[] | null }[],
  insertImpl: null as (() => Promise<void>) | null,
  selectImpl: null as (() => Promise<{ id: string; eventTypes: string[] | null }[]>) | null,
}));

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  const db = {
    insert: (): { values: (vals: Record<string, unknown>) => Promise<void> } => ({
      values: (vals: Record<string, unknown>): Promise<void> => {
        if (dbState.insertImpl) return dbState.insertImpl();
        dbState.insertedEvents.push(vals);
        return Promise.resolve();
      },
    }),
    select: (): {
      from: () => { where: () => Promise<{ id: string; eventTypes: string[] | null }[]> };
    } => ({
      from: () => ({
        where: (): Promise<{ id: string; eventTypes: string[] | null }[]> =>
          dbState.selectImpl ? dbState.selectImpl() : Promise.resolve(dbState.webhookRows),
      }),
    }),
  };
  return { ...actual, getDatabase: (): typeof db => db };
});

import {
  emitReceivedEvent,
  resetReceivedEventStateForTests,
} from "../src/events/received-event.js";
import type { StoredEmail, ResolvedRecipient } from "../src/types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeStored(overrides: Partial<StoredEmail> = {}): StoredEmail {
  return {
    id: "email-1",
    accountId: "acct-1",
    mailboxId: "inbox",
    messageId: "<msg-1@remote.example>",
    from: [{ address: "sender@remote.example" }],
    to: [{ address: "user@customer.com" }],
    cc: [],
    subject: "hello",
    snippet: "",
    size: 100,
    flags: new Set<string>(),
    labels: [],
    receivedAt: new Date(),
    internalDate: new Date(),
    ...overrides,
  };
}

function makeRecipient(overrides: Partial<ResolvedRecipient> = {}): ResolvedRecipient {
  return {
    originalAddress: "user@customer.com",
    resolvedAddress: "user@customer.com",
    mailboxId: "inbox",
    accountId: "acct-1",
    rule: {
      id: "mailbox:inbox",
      pattern: "user@customer.com",
      type: "exact",
      action: "deliver",
      destination: "inbox",
      priority: 0,
    },
    ...overrides,
  };
}

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  queueState.constructed = [];
  queueState.added = [];
  queueState.addImpl = null;
  dbState.insertedEvents = [];
  dbState.webhookRows = [];
  dbState.insertImpl = null;
  dbState.selectImpl = null;
  resetReceivedEventStateForTests();

  savedEnv["DATABASE_URL"] = process.env["DATABASE_URL"];
  savedEnv["REDIS_URL"] = process.env["REDIS_URL"];
  process.env["DATABASE_URL"] = "postgres://test/db";
  process.env["REDIS_URL"] = "redis://test:6379";
});

afterEach(() => {
  for (const key of ["DATABASE_URL", "REDIS_URL"]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("emitReceivedEvent — fresh delivery", () => {
  it("writes exactly one events row in the dispatcher's shape and enqueues per matching webhook", async () => {
    dbState.webhookRows = [
      { id: "wh-all", eventTypes: null }, // null = all events
      { id: "wh-received", eventTypes: ["email.received", "email.opened"] },
    ];

    await emitReceivedEvent(makeStored(), makeRecipient());

    // Exactly one events row, with the columns webhook-dispatcher.ts reads
    // back when building the payload (eventId lookup + emailId/messageId/
    // recipient in the payload's data object).
    expect(dbState.insertedEvents).toHaveLength(1);
    const event = dbState.insertedEvents[0];
    expect(event?.["type"]).toBe("email.received");
    expect(event?.["accountId"]).toBe("acct-1");
    expect(event?.["emailId"]).toBe("email-1");
    expect(event?.["messageId"]).toBe("<msg-1@remote.example>");
    expect(event?.["recipient"]).toBe("user@customer.com");
    expect(typeof event?.["id"]).toBe("string");

    // The queue is the shared one the API-side worker consumes.
    expect(queueState.constructed).toHaveLength(1);
    expect(queueState.constructed[0]?.name).toBe("alecrae-webhooks");

    // One job per matching webhook, in the consumer's exact WebhookJobData
    // shape (webhook-dispatcher.ts:57-61) with the shared jobId convention
    // (worker.ts:953 / webhook-dispatcher.ts:163).
    expect(queueState.added).toHaveLength(2);
    const eventId = event?.["id"] as string;
    for (const [i, webhookId] of ["wh-all", "wh-received"].entries()) {
      expect(queueState.added[i]?.name).toBe("deliver");
      expect(queueState.added[i]?.data).toEqual({
        webhookId,
        eventId,
        accountId: "acct-1",
      });
      expect(queueState.added[i]?.opts).toEqual({ jobId: `wh_${webhookId}_${eventId}` });
    }
  });

  it("treats an EMPTY eventTypes array as subscribe-to-all (the dispatcher's convention)", async () => {
    dbState.webhookRows = [{ id: "wh-empty", eventTypes: [] }];

    await emitReceivedEvent(makeStored(), makeRecipient());

    expect(queueState.added).toHaveLength(1);
    expect(
      (queueState.added[0]?.data as { webhookId: string }).webhookId,
    ).toBe("wh-empty");
  });

  it("skips webhooks whose non-empty filter does not include email.received", async () => {
    dbState.webhookRows = [
      { id: "wh-opened-only", eventTypes: ["email.opened", "email.clicked"] },
      { id: "wh-received", eventTypes: ["email.received"] },
    ];

    await emitReceivedEvent(makeStored(), makeRecipient());

    expect(queueState.added).toHaveLength(1);
    expect(
      (queueState.added[0]?.data as { webhookId: string }).webhookId,
    ).toBe("wh-received");
  });

  it("constructs no queue at all when the account has no active webhooks", async () => {
    dbState.webhookRows = [];

    await emitReceivedEvent(makeStored(), makeRecipient());

    expect(dbState.insertedEvents).toHaveLength(1);
    expect(queueState.constructed).toHaveLength(0);
    expect(queueState.added).toHaveLength(0);
  });
});

describe("emitReceivedEvent — merge deduplication", () => {
  it("emits nothing for a MERGED delivery (no duplicate event for the same message)", async () => {
    dbState.webhookRows = [{ id: "wh-all", eventTypes: null }];

    await emitReceivedEvent(makeStored({ merged: true }), makeRecipient());

    expect(dbState.insertedEvents).toHaveLength(0);
    expect(queueState.constructed).toHaveLength(0);
    expect(queueState.added).toHaveLength(0);
  });
});

describe("emitReceivedEvent — no Redis configured", () => {
  it("still writes the events row but skips webhook enqueue entirely", async () => {
    delete process.env["REDIS_URL"];
    dbState.webhookRows = [{ id: "wh-all", eventTypes: null }];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await emitReceivedEvent(makeStored(), makeRecipient());

    // Event recorded (DB is mandatory for inbound anyway)...
    expect(dbState.insertedEvents).toHaveLength(1);
    // ...but no queue was ever touched.
    expect(queueState.constructed).toHaveLength(0);
    expect(queueState.added).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("REDIS_URL"));

    warnSpy.mockRestore();
  });
});

describe("emitReceivedEvent — never throws", () => {
  it("resolves and logs when the events insert fails", async () => {
    dbState.insertImpl = (): Promise<void> => Promise.reject(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      emitReceivedEvent(makeStored(), makeRecipient()),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("email.received"),
      expect.stringContaining("db down"),
    );
    expect(queueState.added).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("resolves and logs when the queue enqueue fails (event row already written)", async () => {
    dbState.webhookRows = [{ id: "wh-all", eventTypes: null }];
    queueState.addImpl = (): Promise<unknown> => Promise.reject(new Error("redis gone"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      emitReceivedEvent(makeStored(), makeRecipient()),
    ).resolves.toBeUndefined();

    // The event row survives even though delivery jobs could not be enqueued.
    expect(dbState.insertedEvents).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
