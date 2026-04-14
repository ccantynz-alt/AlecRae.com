/**
 * Tests for the FBL (Feedback Loop) complaint processing endpoint.
 *
 * Validates ARF parsing, suppression list insertion, event logging,
 * and complaint rate calculation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock DB ──────────────────────────────────────────────────────────────────

let queryCallIndex = 0;
let queryResults: Array<Array<Record<string, unknown>>> = [];

function nextResult() {
  const result = queryResults[queryCallIndex] ?? [];
  queryCallIndex++;
  return result;
}

function createMockDb() {
  // A single recursive proxy-like chain object where every method returns
  // the chain itself, and it's also thenable (resolves with the next result).
  // This mirrors Drizzle's fluent query builder.
  const chain: Record<string, unknown> = {};

  const makeThennable = (obj: Record<string, unknown>) => {
    obj.then = (resolve: (value: unknown) => void) => {
      resolve(nextResult());
    };
    return obj;
  };

  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(() => Promise.resolve(nextResult()));
  chain.orderBy = vi.fn().mockReturnValue(chain);

  // Make the chain itself thenable
  makeThennable(chain);

  chain.insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue(
      makeThennable({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    ),
  });

  chain.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  return chain;
}

let mockDb = createMockDb();

vi.mock("@alecrae/db", () => ({
  getDatabase: () => mockDb,
  events: {
    id: "id",
    accountId: "account_id",
    type: "type",
    recipient: "recipient",
    feedbackType: "feedback_type",
    feedbackProvider: "feedback_provider",
    ipAddress: "ip_address",
    timestamp: "timestamp",
    metadata: "metadata",
    createdAt: "created_at",
  },
  suppressionLists: {
    id: "id",
    email: "email",
    domainId: "domain_id",
    reason: "reason",
    createdAt: "created_at",
  },
  domains: {
    id: "id",
    domain: "domain",
    accountId: "account_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ _eq: val })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  gte: vi.fn((_col, val) => ({ _gte: val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      _sql: strings.join("?"),
    }),
    { raw: (s: string) => ({ _raw: s }) },
  ),
}));

// ── Test setup ──────────────────────────────────────────────────────────────

describe("POST /v1/fbl/report", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    queryCallIndex = 0;
    queryResults = [];
    mockDb = createMockDb();

    const { fbl } = await import("../src/routes/fbl.js");
    app = new Hono();
    app.route("/v1/fbl", fbl);
  });

  it("should parse a JSON FBL report and return processed status", async () => {
    // Query order:
    // 1. Domain lookup (.limit) -> domain found
    // 2. Suppression insert (onConflictDoNothing — no consume)
    // 3. Event insert (.values() thenable — consumes a slot)
    // 4. getComplaintRate complaint count (.where thenable)
    // 5. getComplaintRate delivered count (.where thenable)
    queryResults = [
      [{ id: "domain_1", accountId: "account_1" }], // domain lookup
      [],               // event insert (consumed by thenable)
      [{ count: 0 }],    // complaint count
      [{ count: 1000 }], // delivered count
    ];

    const res = await app.request("/v1/fbl/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalMailFrom: "sender@example.com",
        originalRcptTo: "recipient@gmail.com",
        feedbackType: "abuse",
        sourceIp: "203.0.113.1",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("processed");
    expect(body.complaintId).toBeDefined();
    expect(body.suppressionId).toBeDefined();
    expect(body.complaintRate.isHealthy).toBe(true);
  });

  it("should return 400 for an invalid/empty report", async () => {
    const res = await app.request("/v1/fbl/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_arf_report");
  });

  it("should return ignored status for unknown domains", async () => {
    queryResults = [
      [], // no domain found
    ];

    const res = await app.request("/v1/fbl/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalMailFrom: "sender@unknown-domain.com",
        originalRcptTo: "recipient@gmail.com",
        feedbackType: "abuse",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ignored");
    expect(body.reason).toBe("unknown_domain");
  });

  it("should parse a text/plain ARF report body", async () => {
    queryResults = [
      [{ id: "domain_1", accountId: "account_1" }], // domain lookup
      [],               // event insert
      [{ count: 2 }],    // complaint count
      [{ count: 1000 }], // delivered count
    ];

    const arfBody = [
      "Feedback-Type: abuse",
      "User-Agent: ISP-FBL/1.0",
      "Version: 1",
      "Original-Mail-From: sender@example.com",
      "Original-Rcpt-To: complainer@isp.com",
      "Source-IP: 198.51.100.1",
      "Reported-Domain: example.com",
    ].join("\n");

    const res = await app.request("/v1/fbl/report", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: arfBody,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("processed");
    expect(body.complaintRate).toBeDefined();
  });

  it("should flag unhealthy complaint rate when threshold exceeded", async () => {
    queryResults = [
      [{ id: "domain_1", accountId: "account_1" }], // domain lookup
      [],               // event insert
      [{ count: 20 }],   // complaint count (high)
      [{ count: 1000 }], // delivered count
    ];

    const res = await app.request("/v1/fbl/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalMailFrom: "sender@example.com",
        originalRcptTo: "unhappy@gmail.com",
        feedbackType: "abuse",
        sourceIp: "203.0.113.1",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("processed");
    expect(body.complaintRate.isHealthy).toBe(false);
    expect(body.complaintRate.throttled).toBe(true);
  });
});
