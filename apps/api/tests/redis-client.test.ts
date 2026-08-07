/**
 * Tests for the shared Redis client (issue #111, final part).
 *
 * Eight modules each opened their own connection to the same Redis via a
 * private copy of `getRedis()`. Beyond 13-15 sockets where one would do, the
 * copies had drifted and four of them had no close path at all, so connections
 * survived shutdown.
 *
 * What matters most here is not that the code is tidier but that the
 * *contract* holds: a null return when Redis is unavailable is the normal,
 * documented path every caller already handles by falling back to in-process
 * state. If that contract slips, abuse controls silently change behaviour.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Minimal ioredis stand-in. Deliberately implements ONLY what the module under
 * test is allowed to touch — `on()`, `quit()`, `disconnect()`. If a future
 * change reaches for anything else (`.status`, `.connect()`), these tests fail
 * loudly, which is the same guarantee the existing suites in
 * login-protection.test.ts and send-anomaly.test.ts rely on.
 */
const instances: FakeRedis[] = [];

class FakeRedis {
  readonly url: string;
  readonly options: Record<string, unknown>;
  readonly handlers = new Map<string, ((arg?: unknown) => void)[]>();
  quitCalls = 0;
  disconnectCalls = 0;

  constructor(url: string, options: Record<string, unknown> = {}) {
    this.url = url;
    this.options = options;
    instances.push(this);
  }

  on(event: string, handler: (arg?: unknown) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, arg?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(arg);
  }

  async quit(): Promise<"OK"> {
    this.quitCalls++;
    return "OK";
  }

  disconnect(): void {
    this.disconnectCalls++;
  }
}

vi.mock("ioredis", () => ({ default: FakeRedis }));

const {
  getRedis,
  getRedisUrl,
  isRedisConfigured,
  createDedicatedRedis,
  createProbeRedis,
  closeAllRedis,
  __resetRedisForTests,
} = await import("../src/lib/redis.js");

beforeEach(() => {
  instances.length = 0;
  __resetRedisForTests();
  process.env["REDIS_URL"] = "redis://localhost:6379";
  delete process.env["UPSTASH_REDIS_URL"];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("reports not-configured and constructs nothing when no URL is set", () => {
    delete process.env["REDIS_URL"];
    expect(isRedisConfigured()).toBe(false);
    expect(getRedisUrl()).toBeNull();
    expect(getRedis()).toBeNull();
    // The important half: it must not open a socket to a guessed default.
    expect(instances).toHaveLength(0);
  });

  it("treats an empty or whitespace URL as unset", () => {
    process.env["REDIS_URL"] = "   ";
    expect(isRedisConfigured()).toBe(false);
    expect(getRedis()).toBeNull();
    expect(instances).toHaveLength(0);
  });

  it("does NOT fall back to UPSTASH_REDIS_URL — REDIS_URL is the only source", () => {
    // The MTA and every queue producer read REDIS_URL alone; honouring a
    // second var here would let this client point at a different Redis than
    // the queues (the #149 split-brain class, one module at a time).
    delete process.env["REDIS_URL"];
    process.env["UPSTASH_REDIS_URL"] = "redis://upstash.example:6379";
    expect(getRedisUrl()).toBeNull();
    expect(isRedisConfigured()).toBe(false);
  });

  it("reads the environment on every call, not at module load", () => {
    // Load-bearing: two existing suites delete REDIS_URL in beforeEach to
    // force the in-memory path, which only works if the read is deferred.
    delete process.env["REDIS_URL"];
    expect(getRedisUrl()).toBeNull();
    process.env["REDIS_URL"] = "redis://later.example:6379";
    expect(getRedisUrl()).toBe("redis://later.example:6379");
  });
});

describe("readiness gate", () => {
  it("withholds the client until the socket is ready", () => {
    // enableOfflineQueue is false, so a command issued before ready is
    // rejected outright. Returning null is what stops that race.
    expect(getRedis()).toBeNull();
    expect(instances).toHaveLength(1);

    instances[0]?.emit("ready");
    expect(getRedis()).toBe(instances[0]);
  });

  it("withdraws the client on error and RESTORES it on reconnect", () => {
    // The restore half is the bug this replaces: routes/uptime.ts latched its
    // availability flag false on the first error and never set it true again,
    // so one blip downgraded the ledger permanently.
    getRedis();
    const client = instances[0];
    client?.emit("ready");
    expect(getRedis()).not.toBeNull();

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    client?.emit("error", new Error("ECONNRESET"));
    expect(getRedis()).toBeNull();

    client?.emit("ready");
    expect(getRedis()).toBe(client);
  });

  it("goes unavailable when the connection ends", () => {
    getRedis();
    instances[0]?.emit("ready");
    instances[0]?.emit("end");
    expect(getRedis()).toBeNull();
  });

  it("passes the canonical options", () => {
    getRedis();
    expect(instances[0]?.options).toMatchObject({
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });
  });
});

describe("sharing", () => {
  it("hands every caller the same connection", () => {
    // The point of the exercise: proof that pooling happened, not merely that
    // the code reads more tidily.
    getRedis();
    instances[0]?.emit("ready");
    expect(getRedis()).toBe(getRedis());
    expect(instances).toHaveLength(1);
  });

  it("gives dedicated and probe clients their own connections", () => {
    getRedis();
    instances[0]?.emit("ready");
    createDedicatedRedis("subscriber");
    createProbeRedis();
    expect(instances).toHaveLength(3);
  });

  it("makes probe clients lazy so constructing one does not connect", () => {
    createProbeRedis();
    expect(instances[0]?.options).toMatchObject({ lazyConnect: true });
  });

  it("returns null from every factory when unconfigured", () => {
    delete process.env["REDIS_URL"];
    expect(getRedis()).toBeNull();
    expect(createDedicatedRedis("x")).toBeNull();
    expect(createProbeRedis()).toBeNull();
  });
});

describe("shutdown", () => {
  it("closes every client it handed out, of every kind", () => {
    getRedis();
    createDedicatedRedis("worker");
    createProbeRedis();
    expect(instances).toHaveLength(3);

    return closeAllRedis().then(() => {
      for (const client of instances) {
        expect(client.quitCalls).toBe(1);
        // disconnect() always follows, so a quit() that hangs on a
        // never-connected client cannot hold the shutdown timer open.
        expect(client.disconnectCalls).toBe(1);
      }
    });
  });

  it("does not throw when a client fails to quit", async () => {
    getRedis();
    const client = instances[0];
    if (client) {
      client.quit = () => Promise.reject(new Error("already closed"));
    }
    await expect(closeAllRedis()).resolves.toBeUndefined();
  });

  it("drops a client from the registry when it ends on its own", async () => {
    getRedis();
    const client = instances[0];
    client?.emit("end");
    await closeAllRedis();
    // Already gone, so shutdown must not have tried to quit it again.
    expect(client?.quitCalls).toBe(0);
  });

  it("starts clean after shutdown", async () => {
    getRedis();
    instances[0]?.emit("ready");
    await closeAllRedis();

    expect(getRedis()).toBeNull(); // new client, not yet ready
    expect(instances).toHaveLength(2);
  });
});
