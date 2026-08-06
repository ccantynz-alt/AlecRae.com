/**
 * Regression test: unbounded AI spend on the mail-ingestion path.
 *
 * `storeReceivedEmail()` runs once per MESSAGE — for every message of an
 * initial Gmail/Outlook sync and every message of an MBOX/EML import. It fired
 * a Claude call per message with:
 *
 *   - no AI-quota check. The per-account quota (issue #102) is enforced by
 *     middleware on HTTP routes; this is an internal path no middleware sees,
 *     so it spent against a plan's allowance without checking OR recording it.
 *   - no backfill guard. Connecting a 50,000-message mailbox meant 50,000
 *     unbounded Claude calls, invisible until the bill arrived.
 *
 * Both are closed. These tests pin the two properties that keep the cost
 * bounded, and the one that keeps the feature useful — mail arriving NOW is
 * still triaged.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const ACCOUNT_ID = "acct_1";

let aiCalls = 0;
let quotaAllowed = true;
let quotaEnforced = true;
let incrementCalls = 0;

vi.mock("../src/lib/ai.js", () => ({
  aiComplete: vi.fn(async () => {
    aiCalls++;
    return {
      text: JSON.stringify({
        priority: "normal",
        category: "work",
        actionRequired: false,
        summary: "ok",
      }),
      provider: "claude",
    };
  }),
}));

vi.mock("../src/lib/ai-quota.js", () => ({
  checkAiQuota: vi.fn(async () => ({
    allowed: quotaAllowed,
    enforced: quotaEnforced,
    plan: "free",
    limit: 100,
    used: quotaAllowed ? 5 : 100,
    resetsAt: "2026-09-01T00:00:00.000Z",
  })),
  incrementAiQuota: vi.fn(async () => {
    incrementCalls++;
  }),
}));

// Everything else the store fans out to is irrelevant here and must not run.
// These return resolved promises because the store chains .catch() on them.
vi.mock("../src/lib/rule-engine.js", () => ({
  runRulesForEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock("../src/lib/webhook-dispatcher.js", () => ({
  enqueueWebhookDelivery: vi.fn(() => Promise.resolve()),
}));
vi.mock("@alecrae/ai-engine/embeddings/auto-indexer", () => ({
  enqueueEmail: vi.fn(() => Promise.resolve()),
}));

const mockDb = {
  select: vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve([])),
    };
    return chain;
  }),
  // The store dedupes with .onConflictDoNothing() and reads back the inserted
  // row, so the insert chain has to model both.
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "em_1" }])),
      })),
      returning: vi.fn(() => Promise.resolve([{ id: "em_1" }])),
    })),
  })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

function message(over: Record<string, unknown> = {}) {
  return {
    accountId: ACCOUNT_ID,
    source: "gmail",
    from: { address: "sender@example.com" },
    to: [{ address: "me@alecrae.com" }],
    subject: "Hello",
    textBody: "body",
    messageId: `<${Math.random()}@example.com>`,
    ...over,
  };
}

/** The triage call is fire-and-forget; let its microtasks settle. */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20));
}

describe("mail ingestion — AI spend is bounded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiCalls = 0;
    incrementCalls = 0;
    quotaAllowed = true;
    quotaEnforced = true;
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
  });

  it("triages mail that is arriving now", async () => {
    const { storeReceivedEmail } = await import("../src/lib/received-email-store.js");
    await storeReceivedEmail(message({ backfill: false }));
    await settle();

    expect(aiCalls).toBe(1);
  });

  it("does NOT triage backfilled mail — the 50,000-message import case", async () => {
    const { storeReceivedEmail } = await import("../src/lib/received-email-store.js");

    for (let i = 0; i < 25; i++) {
      await storeReceivedEmail(message({ backfill: true }));
    }
    await settle();

    expect(aiCalls).toBe(0);
  });

  it("treats an archive import as backfill via parsedToReceived", async () => {
    const { parsedToReceived } = await import("../src/lib/received-email-store.js");
    const mapped = parsedToReceived(
      {
        from: { address: "a@b.com", name: null },
        to: [{ address: "me@alecrae.com", name: null }],
        cc: [],
        subject: "Archived",
        textBody: "old mail",
        htmlBody: null,
        messageId: "<old@example.com>",
        inReplyTo: null,
        references: [],
      } as never,
      ACCOUNT_ID,
      "mbox",
    );

    expect(mapped.backfill).toBe(true);
  });

  it("skips the AI call when the account's monthly quota is exhausted", async () => {
    quotaAllowed = false;
    const { storeReceivedEmail } = await import("../src/lib/received-email-store.js");
    await storeReceivedEmail(message({ backfill: false }));
    await settle();

    expect(aiCalls).toBe(0);
  });

  it("still triages when quota is not enforced (Redis down) — fail open", async () => {
    // Refusing to triage because a counter is unreachable would be a
    // self-inflicted outage; the spend is still bounded by the backfill guard.
    quotaAllowed = false;
    quotaEnforced = false;
    const { storeReceivedEmail } = await import("../src/lib/received-email-store.js");
    await storeReceivedEmail(message({ backfill: false }));
    await settle();

    expect(aiCalls).toBe(1);
  });

  it("records the spend against the account's quota", async () => {
    const { storeReceivedEmail } = await import("../src/lib/received-email-store.js");
    await storeReceivedEmail(message({ backfill: false }));
    await settle();

    expect(incrementCalls).toBe(1);
  });

  it("makes no AI call at all without an API key", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const { storeReceivedEmail } = await import("../src/lib/received-email-store.js");
    await storeReceivedEmail(message({ backfill: false }));
    await settle();

    expect(aiCalls).toBe(0);
  });
});
