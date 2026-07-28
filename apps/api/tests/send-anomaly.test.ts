/**
 * Tests for send-volume anomaly detection (Known Issue #117).
 *
 * The only volume control on sending was a flat per-account rate limit sized
 * for legitimate heavy use. Nothing compared an account to its OWN history, so
 * a compromised account could send thousands of individually-permitted
 * messages and nothing would notice until a blocklisting arrived.
 *
 * The two failure modes here pull in opposite directions and both matter:
 *   - a real blast must trip the detector
 *   - a new or growing account must NOT trip it (a false positive here stops
 *     a paying customer's legitimate campaign dead)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Rows the mocked `emails` count query resolves to. */
let baselineTotal = 0;
let currentHourTotal = 0;
let dbThrows = false;
/** Which count query is being answered — baseline first, then current hour. */
let callIndex = 0;

const mockDb = {
  select: vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => {
        if (dbThrows) return Promise.reject(new Error("db down"));
        // getBaseline and getCurrentHourCount run concurrently; distinguish by
        // call order within a single checkSendAnomaly() invocation.
        const total = callIndex++ % 2 === 0 ? currentHourTotal : baselineTotal;
        return Promise.resolve([{ total }]);
      }),
    };
    return chain;
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

// No Redis in the test environment — ioredis is stubbed so the module takes
// its Postgres fallback path, which is the behaviour worth pinning anyway
// (a Redis outage must not blind this control).
vi.mock("ioredis", () => ({
  default: class {
    on(): void {
      /* never becomes ready, so getRedis() returns null */
    }
  },
}));

describe("send-volume anomaly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    baselineTotal = 0;
    currentHourTotal = 0;
    dbThrows = false;
    callIndex = 0;
  });

  afterEach(() => {
    delete process.env["SEND_ANOMALY_FLOOR"];
    delete process.env["SEND_ANOMALY_MULTIPLIER"];
  });

  it("allows a brand-new account with no sending history", async () => {
    // Baseline 0 — without a floor, ANY send would look infinitely anomalous.
    baselineTotal = 0;
    currentHourTotal = 3;

    const { checkSendAnomaly } = await import("../src/lib/send-anomaly.js");
    const r = await checkSendAnomaly("acct_new");

    expect(r.allowed).toBe(true);
    expect(r.degraded).toBe(false);
  });

  it("allows a first campaign that stays under the floor", async () => {
    baselineTotal = 0;
    currentHourTotal = 150; // under the 200 default floor

    const { checkSendAnomaly } = await import("../src/lib/send-anomaly.js");
    const r = await checkSendAnomaly("acct_new");

    expect(r.allowed).toBe(true);
    expect(r.threshold).toBe(200);
  });

  it("blocks a blast far above the account's own baseline", async () => {
    // 6,720 sends over 7 days = 40/hr baseline -> threshold 400.
    baselineTotal = 6720;
    currentHourTotal = 5000;

    const { checkSendAnomaly } = await import("../src/lib/send-anomaly.js");
    const r = await checkSendAnomaly("acct_busy");

    expect(r.allowed).toBe(false);
    expect(r.threshold).toBe(400);
    expect(r.currentHour).toBe(5000);
  });

  it("allows a high-volume account sending at its normal rate", async () => {
    // A genuine bulk sender: 168,000 over 7 days = 1000/hr -> threshold 10,000.
    baselineTotal = 168_000;
    currentHourTotal = 1200;

    const { checkSendAnomaly } = await import("../src/lib/send-anomaly.js");
    const r = await checkSendAnomaly("acct_bulk");

    expect(r.allowed).toBe(true);
    expect(r.threshold).toBe(10_000);
  });

  it("honours a tightened multiplier without a deploy", async () => {
    process.env["SEND_ANOMALY_MULTIPLIER"] = "2";
    process.env["SEND_ANOMALY_FLOOR"] = "10";
    baselineTotal = 1680; // 10/hr -> threshold max(10, 20) = 20
    currentHourTotal = 25;

    const { checkSendAnomaly } = await import("../src/lib/send-anomaly.js");
    const r = await checkSendAnomaly("acct_x");

    expect(r.threshold).toBe(20);
    expect(r.allowed).toBe(false);
  });

  it("fails open and flags degraded when the datastore is unreachable", async () => {
    // Refusing all mail because a counter is unreachable is a self-inflicted
    // outage; the hard controls still apply.
    dbThrows = true;

    const { checkSendAnomaly } = await import("../src/lib/send-anomaly.js");
    const r = await checkSendAnomaly("acct_x");

    expect(r.allowed).toBe(true);
    expect(r.degraded).toBe(true);
  });

  it("recordSend never throws when Redis is unavailable", async () => {
    const { recordSend } = await import("../src/lib/send-anomaly.js");
    await expect(recordSend("acct_x")).resolves.toBeUndefined();
  });
});
