/**
 * Regression test: the Security Center's Overview tab 404'd for every user.
 *
 * The default tab — the first thing anyone sees on that page — called
 * `GET /v1/security` and `GET /v1/security/events`. Neither existed. (A third,
 * `PATCH /v1/security/settings`, also did not exist; its toggles were removed
 * rather than backed, because they controlled nothing: attachment scanning
 * already runs unconditionally and the inbox strips all HTML, so an
 * "external images" switch could not change anything.)
 *
 * Both endpoints now count real rows. The property worth pinning hardest is
 * that no security SCORE is invented: nothing computes one, and filling a
 * gauge with a made-up number is the fabrication already removed from the
 * threat-scanning endpoints (issue #84).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

interface ThreatRow {
  id: string;
  threatType: string;
  severity: string;
  aiExplanation: string;
  createdAt: Date;
}
interface PhishingRow {
  id: string;
  fromAddress: string;
  subject: string;
  reportedAt: Date;
}

let threats: ThreatRow[] = [];
let phishing: PhishingRow[] = [];
/** Table identity is resolved by which columns the route selected. */
let selectedIsPhishing = false;

const mockDb = {
  select: vi.fn((cols: Record<string, unknown>) => {
    selectedIsPhishing = "fromAddress" in cols;
    const isPhishing = selectedIsPhishing;
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((n: number) =>
        Promise.resolve(isPhishing ? phishing.slice(0, n) : threats.slice(0, n)),
      ),
      then: (resolve: (v: unknown) => unknown) => resolve(isPhishing ? phishing : threats),
    };
    return chain;
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

function threat(over: Partial<ThreatRow> = {}): ThreatRow {
  return {
    id: "th_1",
    threatType: "phishing",
    severity: "high",
    aiExplanation: "Link points at a lookalike domain",
    createdAt: new Date("2026-07-27T10:00:00.000Z"),
    ...over,
  };
}

function report(over: Partial<PhishingRow> = {}): PhishingRow {
  return {
    id: "pr_1",
    fromAddress: "attacker@evil.test",
    subject: "Urgent invoice",
    reportedAt: new Date("2026-07-28T10:00:00.000Z"),
    ...over,
  };
}

describe("GET /v1/security (overview)", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    threats = [];
    phishing = [];
    selectedIsPhishing = false;

    const { security } = await import("../src/routes/security.js");
    app = new Hono();
    app.route("/v1/security", security);
  });

  it("never invents a security score", async () => {
    threats = [threat()];
    const res = await app.request("/v1/security");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { score: number | null; scoreAvailable: boolean };
    };
    expect(body.data.score).toBeNull();
    expect(body.data.scoreAvailable).toBe(false);
  });

  it("counts real threats and phishing reports", async () => {
    threats = [threat(), threat({ id: "th_2" })];
    phishing = [report(), report({ id: "pr_2" })];

    const res = await app.request("/v1/security");
    const body = (await res.json()) as {
      data: { threatsDetected: number; phishingReported: number };
    };

    expect(body.data.threatsDetected).toBe(2);
    expect(body.data.phishingReported).toBe(2);
  });

  it("counts DISTINCT senders as suspicious, not repeat reports", async () => {
    // Three reports, two senders — reporting the same address twice does not
    // make it two suspicious senders.
    phishing = [
      report({ id: "pr_1", fromAddress: "a@evil.test" }),
      report({ id: "pr_2", fromAddress: "A@EVIL.TEST" }),
      report({ id: "pr_3", fromAddress: "b@evil.test" }),
    ];

    const res = await app.request("/v1/security");
    const body = (await res.json()) as { data: { suspiciousSenders: number } };
    expect(body.data.suspiciousSenders).toBe(2);
  });

  it("returns zeroes rather than failing for an account with no activity", async () => {
    const res = await app.request("/v1/security");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { threatsDetected: number; suspiciousSenders: number };
    };
    expect(body.data.threatsDetected).toBe(0);
    expect(body.data.suspiciousSenders).toBe(0);
  });
});

describe("GET /v1/security/events", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    threats = [];
    phishing = [];

    const { security } = await import("../src/routes/security.js");
    app = new Hono();
    app.route("/v1/security", security);
  });

  it("merges threats and phishing reports, newest first", async () => {
    threats = [threat({ createdAt: new Date("2026-07-20T00:00:00.000Z") })];
    phishing = [report({ reportedAt: new Date("2026-07-25T00:00:00.000Z") })];

    const res = await app.request("/v1/security/events");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { id: string; createdAt: string }[] };
    expect(body.data).toHaveLength(2);
    expect(body.data[0]!.id).toBe("pr_1"); // the newer of the two
    expect(body.data[1]!.id).toBe("th_1");
  });

  it("describes a threat with its real AI explanation and severity", async () => {
    threats = [threat()];

    const res = await app.request("/v1/security/events");
    const body = (await res.json()) as {
      data: { type: string; description: string; severity: string }[];
    };

    expect(body.data[0]).toMatchObject({
      type: "phishing",
      description: "Link points at a lookalike domain",
      severity: "high",
    });
  });

  it("rejects an out-of-range limit", async () => {
    const res = await app.request("/v1/security/events?limit=9999");
    expect(res.status).toBe(400);
  });

  it("returns an empty list, not an error, when there is no activity", async () => {
    const res = await app.request("/v1/security/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});
