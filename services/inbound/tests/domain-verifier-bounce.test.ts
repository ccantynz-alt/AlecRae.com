/**
 * Tests for VERP bounce-domain acceptance in the recipient-domain verifier.
 *
 * The MTA sends with envelope sender `bounces+<emailId>@bounce.<customer>`,
 * so async DSNs return addressed to `bounce.<customer>` — a name with no
 * `domains` row of its own. The verifier must accept it when (and ONLY when)
 * the remainder after the literal `bounce.` label exactly matches a hosted
 * domain; generic subdomain inheritance stays deliberately off so this does
 * not re-widen the relay.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifierMockState = vi.hoisted(() => ({
  /** Queue of result sets returned by successive `limit()` calls, in order. */
  resultQueue: [] as { isActive: boolean; verificationStatus: string }[][],
  selectCalls: 0,
}));

const verifierMockDb = vi.hoisted(() => ({
  select: (undefined as unknown) as ReturnType<typeof vi.fn>,
  from: (undefined as unknown) as ReturnType<typeof vi.fn>,
  where: (undefined as unknown) as ReturnType<typeof vi.fn>,
  limit: (undefined as unknown) as ReturnType<typeof vi.fn>,
}));

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => verifierMockDb };
});

const HOSTED_ROW = { isActive: true, verificationStatus: "verified" };

describe("createDomainVerifier — bounce-domain acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DATABASE_URL"] = "postgres://test/test";
    verifierMockState.resultQueue = [];
    verifierMockState.selectCalls = 0;

    Object.assign(verifierMockDb, {
      select: vi.fn().mockImplementation(function (this: typeof verifierMockDb) {
        verifierMockState.selectCalls++;
        return this;
      }),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() =>
        Promise.resolve(verifierMockState.resultQueue.shift() ?? []),
      ),
    });
  });

  async function verify(domain: string): Promise<{
    registered: boolean;
    active: boolean;
    dnsStale: boolean;
    bounceDomain?: boolean;
  }> {
    const { createDomainVerifier } = await import("../src/routing/domain-verifier.js");
    return createDomainVerifier()(domain);
  }

  it("accepts a hosted domain exactly, without the bounce flag", async () => {
    verifierMockState.resultQueue = [[HOSTED_ROW]];
    const result = await verify("customer.com");
    expect(result.registered).toBe(true);
    expect(result.active).toBe(true);
    expect(result.bounceDomain).toBe(false);
    expect(verifierMockState.selectCalls).toBe(1);
  });

  it("accepts bounce.<hosted-domain> and flags it as a bounce domain", async () => {
    // First lookup (bounce.customer.com) misses; second (customer.com) hits.
    verifierMockState.resultQueue = [[], [HOSTED_ROW]];
    const result = await verify("bounce.customer.com");
    expect(result.registered).toBe(true);
    expect(result.active).toBe(true);
    expect(result.bounceDomain).toBe(true);
    expect(verifierMockState.selectCalls).toBe(2);
  });

  it("refuses bounce.<unhosted-domain>", async () => {
    verifierMockState.resultQueue = [[], []];
    const result = await verify("bounce.not-ours.com");
    expect(result.registered).toBe(false);
  });

  it("refuses other subdomains of a hosted domain — no generic inheritance", async () => {
    // mail.customer.com does not start with "bounce.", so the parent is never
    // consulted: exactly one lookup, refused.
    verifierMockState.resultQueue = [[]];
    const result = await verify("mail.customer.com");
    expect(result.registered).toBe(false);
    expect(verifierMockState.selectCalls).toBe(1);
  });

  it("inherits the parent's verification state for the bounce domain (stale parent -> 450 path)", async () => {
    verifierMockState.resultQueue = [
      [],
      [{ isActive: true, verificationStatus: "pending" }],
    ];
    const result = await verify("bounce.customer.com");
    expect(result.registered).toBe(true);
    expect(result.dnsStale).toBe(true);
  });

  it("inherits the parent's active state for the bounce domain", async () => {
    verifierMockState.resultQueue = [
      [],
      [{ isActive: false, verificationStatus: "verified" }],
    ];
    const result = await verify("bounce.customer.com");
    expect(result.registered).toBe(true);
    expect(result.active).toBe(false);
  });

  it("does not treat a bare 'bounce.' prefix with empty remainder as anything", async () => {
    verifierMockState.resultQueue = [[]];
    const result = await verify("bounce.");
    expect(result.registered).toBe(false);
    // Only the exact lookup ran — no parent lookup for an empty remainder.
    expect(verifierMockState.selectCalls).toBe(1);
  });

  it("does not chain: bounce.bounce.customer.com is refused when bounce.customer.com is not hosted", async () => {
    // Exact miss, then parent lookup for "bounce.customer.com" (no domains
    // row) — the parent check is a direct lookup, never recursive.
    verifierMockState.resultQueue = [[], []];
    const result = await verify("bounce.bounce.customer.com");
    expect(result.registered).toBe(false);
    expect(verifierMockState.selectCalls).toBe(2);
  });
});
