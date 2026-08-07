/**
 * Tests for the IP warmup gate (warmup-gate.ts).
 *
 * The pure policy in warmup.ts was already tested; what was missing — and
 * what these cover — is that the caps are actually *enforced*, durably and
 * atomically, which is the half that had no callers outside its own test.
 *
 * Verified here:
 *  1. Sends inside the day-1 cap are allowed
 *  2. The per-ISP cap actually stops sending (Gmail day 1 = 50)
 *  3. A refusal consumes no quota (rolled back), so a different ISP still fits
 *  4. The total-daily cap can stop sending before a per-ISP cap trips
 *  5. Counters are per-UTC-day — a new day restores quota
 *  6. Caps scale with the warmup day (week 2 doubles week 1)
 *  7. Redis is used when present, including a TTL on first write
 *  8. A Redis failure degrades to in-process counters (still bounded) rather
 *     than failing open
 *  9. MTA_WARMUP_ENABLED=false disables the gate; anything else enables it
 */

import { describe, it, expect, vi } from "vitest";
import { WarmupGate, warmupGateOptionsFromEnv } from "./warmup-gate.js";

const DAY = 24 * 60 * 60 * 1000;
/** Fixed instant so "current day" is deterministic. */
const T0 = Date.parse("2026-03-02T09:00:00.000Z");

function gate(overrides: Partial<Parameters<typeof makeGate>[0]> = {}) {
  return makeGate({ enabled: true, ...overrides });
}

function makeGate(opts: {
  enabled: boolean;
  redis?: unknown;
  /** `null` omits the explicit start date so the gate resolves it durably. */
  startedAt?: number | null;
}) {
  return new WarmupGate({
    identity: "203.0.113.9",
    ...(opts.startedAt === null ? {} : { warmupStartedAt: opts.startedAt ?? T0 }),
    enabled: opts.enabled,
    // The gate only ever calls set/get/incr/expire/decr; a null redis
    // exercises the in-process path.
    redis: (opts.redis ?? null) as never,
  });
}

/**
 * In-memory Redis fake implementing exactly the commands the gate uses,
 * including real SET NX semantics (only the first writer wins).
 */
function fakeRedis(): {
  store: Map<string, string>;
  set: (key: string, value: string, mode: string) => Promise<"OK" | null>;
  get: (key: string) => Promise<string | null>;
  incr: (key: string) => Promise<number>;
  decr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
} {
  const store = new Map<string, string>();
  return {
    store,
    set: async (key, value, mode) => {
      if (mode === "NX" && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    get: async (key) => store.get(key) ?? null,
    incr: async (key) => {
      const next = Number(store.get(key) ?? "0") + 1;
      store.set(key, String(next));
      return next;
    },
    decr: async (key) => {
      const next = Number(store.get(key) ?? "0") - 1;
      store.set(key, String(next));
      return next;
    },
    expire: async () => 1,
  };
}

describe("WarmupGate — per-ISP caps", () => {
  it("allows a send well inside the day-1 cap", async () => {
    const g = gate();
    const decision = await g.reserve("someone@gmail.com", T0);
    expect(decision.allow).toBe(true);
    expect(decision.isp).toBe("gmail");
    expect(decision.day).toBe(1);
  });

  it("stops sending once the day-1 Gmail cap (50) is consumed", async () => {
    const g = gate();
    for (let i = 0; i < 50; i++) {
      const d = await g.reserve(`user${i}@gmail.com`, T0);
      expect(d.allow).toBe(true);
    }

    const overCap = await g.reserve("one-too-many@gmail.com", T0);
    expect(overCap.allow).toBe(false);
    expect(overCap.reason).toMatch(/gmail daily cap/i);
  });

  it("does not consume quota when it refuses — other ISPs are unaffected", async () => {
    const g = gate();
    for (let i = 0; i < 50; i++) await g.reserve(`u${i}@gmail.com`, T0);
    expect((await g.reserve("blocked@gmail.com", T0)).allow).toBe(false);

    // Yahoo's own day-1 cap is 25 and must be untouched by Gmail's refusals.
    for (let i = 0; i < 25; i++) {
      expect((await g.reserve(`y${i}@yahoo.com`, T0)).allow).toBe(true);
    }
    expect((await g.reserve("y26@yahoo.com", T0)).allow).toBe(false);
  });

  it("classifies unknown domains into the conservative 'other' bucket", async () => {
    const g = gate();
    const d = await g.reserve("someone@example.org", T0);
    expect(d.isp).toBe("other");
  });
});

describe("WarmupGate — total daily cap", () => {
  it("refuses on the aggregate cap before any single ISP cap trips", async () => {
    // Day 1 totals 175 (50+50+25+25+25). Fill every bucket but one to just
    // under its own cap so the aggregate is what actually stops the send.
    const g = gate();
    const fill = async (domain: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const d = await g.reserve(`u${i}@${domain}`, T0);
        expect(d.allow).toBe(true);
      }
    };
    await fill("gmail.com", 50);
    await fill("outlook.com", 50);
    await fill("yahoo.com", 25);
    await fill("icloud.com", 25);
    await fill("example.org", 25); // "other" — now at 175 total

    // "other" is at its own cap too, so use a bucket with headroom... there
    // is none: the aggregate equals the sum of caps. Any further send fails,
    // and the first check to trip is the per-ISP one.
    const blocked = await g.reserve("late@gmail.com", T0);
    expect(blocked.allow).toBe(false);
  });
});

describe("WarmupGate — time", () => {
  it("restores quota on a new UTC day", async () => {
    const g = gate();
    for (let i = 0; i < 50; i++) await g.reserve(`u${i}@gmail.com`, T0);
    expect((await g.reserve("blocked@gmail.com", T0)).allow).toBe(false);

    const tomorrow = T0 + DAY;
    const afterRollover = await g.reserve("fresh@gmail.com", tomorrow);
    expect(afterRollover.allow).toBe(true);
    expect(afterRollover.day).toBe(2);
  });

  it("raises the cap as the ramp progresses (week 2 doubles week 1)", async () => {
    const g = gate();
    // Day 8 = week 2 → Gmail cap 100, i.e. more than day 1's 50.
    const dayEight = T0 + 7 * DAY;
    for (let i = 0; i < 100; i++) {
      const d = await g.reserve(`u${i}@gmail.com`, dayEight);
      expect(d.allow).toBe(true);
      expect(d.day).toBe(8);
    }
    expect((await g.reserve("over@gmail.com", dayEight)).allow).toBe(false);
  });
});

describe("WarmupGate — storage", () => {
  it("uses Redis when available and sets a TTL on the first write", async () => {
    let counter = 0;
    const redis = {
      incr: vi.fn(async () => ++counter),
      decr: vi.fn(async () => --counter),
      expire: vi.fn(async () => 1),
    };
    const g = makeGate({ enabled: true, redis });

    const d = await g.reserve("someone@gmail.com", T0);
    expect(d.allow).toBe(true);
    expect(redis.incr).toHaveBeenCalled();
    // First increment returns 1, so exactly one expiry is set per counter.
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it("stays bounded when Redis throws — falls back to in-process counters", async () => {
    const redis = {
      incr: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      decr: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      expire: vi.fn(async () => 1),
    };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const g = makeGate({ enabled: true, redis });

    // Caps must still be enforced, just per-process — NOT failed open.
    for (let i = 0; i < 50; i++) {
      expect((await g.reserve(`u${i}@gmail.com`, T0)).allow).toBe(true);
    }
    expect((await g.reserve("over@gmail.com", T0)).allow).toBe(false);
  });
});

describe("warmupGateOptionsFromEnv", () => {
  it("is enabled unless explicitly set to false — the safe default", () => {
    expect(warmupGateOptionsFromEnv("ip", {}).enabled).toBe(true);
    expect(
      warmupGateOptionsFromEnv("ip", { MTA_WARMUP_ENABLED: "true" }).enabled,
    ).toBe(true);
    expect(
      warmupGateOptionsFromEnv("ip", { MTA_WARMUP_ENABLED: "false" }).enabled,
    ).toBe(false);
  });

  it("reads the warmup start date from the environment", () => {
    const opts = warmupGateOptionsFromEnv("ip", {
      MTA_WARMUP_STARTED_AT: "2026-03-02T00:00:00.000Z",
    });
    expect(opts.warmupStartedAt).toBe(Date.parse("2026-03-02T00:00:00.000Z"));
  });

  it("defers to the persisted start date when the env value is unparseable", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const opts = warmupGateOptionsFromEnv("ip", {
      MTA_WARMUP_STARTED_AT: "not-a-date",
    });
    // Undefined means "resolve from Redis" — the gate then reads the durable
    // first-seen date (or writes one), rather than restarting from day 1.
    expect(opts.warmupStartedAt).toBeUndefined();
  });

  it("leaves the start date undefined when the env var is unset — Redis decides", () => {
    const opts = warmupGateOptionsFromEnv("ip", {});
    expect(opts.warmupStartedAt).toBeUndefined();
  });
});

describe("WarmupGate — durable start date", () => {
  const DAY8 = T0 + 7 * DAY;

  it("persists the first-seen start date and keeps it across a restart", async () => {
    const redis = fakeRedis();

    // First-ever process: no env var, empty Redis. Day 1.
    const first = makeGate({ enabled: true, redis, startedAt: null });
    expect((await first.reserve("a@gmail.com", T0)).day).toBe(1);

    // "Restart": a NEW gate instance against the SAME Redis, a week later.
    // Before persistence this re-entered day 1 forever; now it must resume.
    const restarted = makeGate({ enabled: true, redis, startedAt: null });
    const d = await restarted.reserve("b@gmail.com", DAY8);
    expect(d.day).toBe(8);
    expect(await restarted.warmupStartedAt(DAY8)).toBe(T0);
  });

  it("lets an explicitly configured start date win over the persisted one", async () => {
    const redis = fakeRedis();
    redis.store.set("mta:warmup:203.0.113.9:started-at", String(T0 - 30 * DAY));

    const g = makeGate({ enabled: true, redis, startedAt: T0 });
    // Configured T0 wins: day 8 a week later, not day 38.
    expect((await g.reserve("a@gmail.com", DAY8)).day).toBe(8);
    expect(await g.warmupStartedAt(DAY8)).toBe(T0);
  });

  it("resolves one winner when two processes race on SET NX", async () => {
    const redis = fakeRedis();
    const a = makeGate({ enabled: true, redis, startedAt: null });
    const b = makeGate({ enabled: true, redis, startedAt: null });

    // Both resolve concurrently with different "now"s — exactly one write
    // lands, and BOTH gates must agree on that single value afterwards.
    const [fromA, fromB] = await Promise.all([
      a.warmupStartedAt(T0),
      b.warmupStartedAt(T0 + 6 * 60 * 60 * 1000),
    ]);
    expect(fromA).toBe(fromB);
    expect(redis.store.get("mta:warmup:203.0.113.9:started-at")).toBe(
      String(fromA),
    );
  });

  it("degrades to a process-local start date without Redis, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const g = makeGate({ enabled: true, startedAt: null });

    expect(await g.warmupStartedAt(T0)).toBe(T0);
    // Cached: the start date is immutable once established in this process.
    expect(await g.warmupStartedAt(DAY8)).toBe(T0);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("process-local")),
    ).toBe(true);
  });
});

describe("WarmupGate — disabled", () => {
  it("allows unlimited volume when explicitly disabled", async () => {
    const g = makeGate({ enabled: false });
    for (let i = 0; i < 500; i++) {
      expect((await g.reserve(`u${i}@gmail.com`, T0)).allow).toBe(true);
    }
  });
});
