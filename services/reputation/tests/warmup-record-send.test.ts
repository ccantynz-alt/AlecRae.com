/**
 * `recordSend` volume accounting (issue #159c).
 *
 * Two defects, both of which made the warm-up counter under-report exactly
 * when volume was highest:
 *
 *  1. It counted MESSAGES, not recipients. One POST /v1/messages can address
 *     500 people; recording it as 1 meant a day-one cap of ~20 was satisfied
 *     by 20 calls carrying ten thousand recipients. ISP volume caps are
 *     per-recipient, so the ramp was measuring the wrong quantity entirely.
 *  2. It wrote `session.sentToday + 1` from a value read a moment earlier —
 *     a classic lost update. Concurrent sends overwrote each other's
 *     increments. The fix moves the arithmetic into SQL, so the test asserts
 *     the payload is a SQL expression and NOT a pre-computed number: that is
 *     the property a well-meaning "simplification" would undo.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";

interface CapturedUpdate {
  sentToday: unknown;
  totalSent: unknown;
}

let captured: CapturedUpdate[] = [];

const SESSION = {
  id: "wu_1",
  domainId: "dom_1",
  status: "active",
  sentToday: 5,
  totalSent: 50,
  currentDay: 2,
  dailyLimit: 100,
  lastResetAt: new Date(),
  startedAt: new Date(),
};

mock.module("@alecrae/db", () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([SESSION]),
          orderBy: () => ({ limit: () => Promise.resolve([SESSION]) }),
        }),
      }),
    }),
    update: () => ({
      set: (values: CapturedUpdate) => {
        captured.push(values);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  }),
  warmupSessions: {
    id: { name: "id" },
    domainId: { name: "domain_id" },
    status: { name: "status" },
    sentToday: { name: "sent_today" },
    totalSent: { name: "total_sent" },
  },
  domains: { id: { name: "id" } },
  emails: {},
  deliveryResults: {},
}));

describe("WarmupOrchestrator.recordSend", () => {
  beforeEach(() => {
    captured = [];
  });

  /** The volume write, as opposed to the daily-counter reset that precedes it. */
  function volumeUpdate(): CapturedUpdate {
    const hit = captured.filter((u) => u.totalSent !== undefined);
    expect(hit.length).toBe(1);
    return hit[0]!;
  }

  it("increments in SQL rather than from a stale read", async () => {
    const { WarmupOrchestrator } = await import("../src/warmup/orchestrator.js");
    await new WarmupOrchestrator().recordSend("dom_1", 3);

    const update = volumeUpdate();
    // A plain number here would mean the value was computed from the row we
    // read — the lost-update bug. A SQL fragment means the database does the
    // arithmetic, so concurrent sends compose instead of clobbering.
    expect(typeof update.sentToday).not.toBe("number");
    expect(typeof update.totalSent).not.toBe("number");
    expect(update.sentToday).toBeDefined();
  });

  it("does nothing for a zero or negative count", async () => {
    const { WarmupOrchestrator } = await import("../src/warmup/orchestrator.js");
    await new WarmupOrchestrator().recordSend("dom_1", 0);
    await new WarmupOrchestrator().recordSend("dom_1", -5);

    // Not even the daily-counter reset should run — it returns before that.
    expect(captured.length).toBe(0);
  });

  it("defaults to 1 so existing callers keep working", async () => {
    const { WarmupOrchestrator } = await import("../src/warmup/orchestrator.js");
    await new WarmupOrchestrator().recordSend("dom_1");

    expect(captured.filter((u) => u.totalSent !== undefined).length).toBe(1);
  });
});
