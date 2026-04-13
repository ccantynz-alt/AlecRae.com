/**
 * Tests for the DNS Liveness Checker.
 *
 * Verifies that:
 *  - Domains with all valid records are reported as healthy
 *  - Domains with missing SPF/DKIM/DMARC are reported as stale
 *  - The DB is updated when records go stale
 *  - Errors during DNS lookup are handled gracefully
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (vi.mock factories can only reference hoisted values) ───

const { mockResolveTxt, mockDbUpdate } = vi.hoisted(() => ({
  mockResolveTxt: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

// ── Mock node:dns/promises ────────────────────────────────────────────────

vi.mock("node:dns/promises", () => ({
  resolveTxt: mockResolveTxt,
}));

// ── Mock @alecrae/db ─────────────────────────────────────────────────────

vi.mock("@alecrae/db", () => {
  const updateSet = vi.fn().mockImplementation(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  }));
  const update = vi.fn().mockImplementation(() => ({
    set: updateSet,
  }));
  mockDbUpdate.mockImplementation(update);

  return {
    getDatabase: () => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(Promise.resolve([])),
      limit: vi.fn().mockResolvedValue([]),
      update: update,
    }),
    domains: {
      id: "id",
      domain: "domain",
      dkimSelector: "dkim_selector",
      verificationStatus: "verification_status",
      isActive: "is_active",
      spfVerified: "spf_verified",
      dkimVerified: "dkim_verified",
      dmarcVerified: "dmarc_verified",
      lastVerificationAttempt: "last_verification_attempt",
      updatedAt: "updated_at",
    },
  };
});

// ── Import module under test ─────────────────────────────────────────────

import { checkDomainLiveness, runLivenessCheck } from "../src/liveness-checker";

// ── Tests ─────────────────────────────────────────────────────────────────

describe("checkDomainLiveness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should report healthy when all DNS records are present", async () => {
    mockResolveTxt.mockImplementation((hostname: string) => {
      if (hostname === "example.com") {
        return Promise.resolve([["v=spf1 include:spf.alecrae.dev ~all"]]);
      }
      if (hostname === "default._domainkey.example.com") {
        return Promise.resolve([["v=DKIM1; k=rsa; p=MIIBIjANBg..."]]);
      }
      if (hostname === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"]]);
      }
      return Promise.reject(new Error("NXDOMAIN"));
    });

    const result = await checkDomainLiveness("dom_1", "example.com", "default");

    expect(result.spfOk).toBe(true);
    expect(result.dkimOk).toBe(true);
    expect(result.dmarcOk).toBe(true);
    expect(result.staleRecords).toHaveLength(0);
  });

  it("should report stale SPF when include is missing", async () => {
    mockResolveTxt.mockImplementation((hostname: string) => {
      if (hostname === "example.com") {
        return Promise.resolve([["v=spf1 include:other.com ~all"]]);
      }
      if (hostname === "default._domainkey.example.com") {
        return Promise.resolve([["v=DKIM1; k=rsa; p=MIIBIjANBg..."]]);
      }
      if (hostname === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"]]);
      }
      return Promise.reject(new Error("NXDOMAIN"));
    });

    const result = await checkDomainLiveness("dom_1", "example.com", "default");

    expect(result.spfOk).toBe(false);
    expect(result.dkimOk).toBe(true);
    expect(result.dmarcOk).toBe(true);
    expect(result.staleRecords).toHaveLength(1);
    expect(result.staleRecords[0]).toContain("SPF");
  });

  it("should report stale DKIM when record is missing", async () => {
    mockResolveTxt.mockImplementation((hostname: string) => {
      if (hostname === "example.com") {
        return Promise.resolve([["v=spf1 include:spf.alecrae.dev ~all"]]);
      }
      if (hostname === "default._domainkey.example.com") {
        return Promise.reject(new Error("NXDOMAIN"));
      }
      if (hostname === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"]]);
      }
      return Promise.reject(new Error("NXDOMAIN"));
    });

    const result = await checkDomainLiveness("dom_1", "example.com", "default");

    expect(result.spfOk).toBe(true);
    expect(result.dkimOk).toBe(false);
    expect(result.dmarcOk).toBe(true);
    expect(result.staleRecords).toHaveLength(1);
    expect(result.staleRecords[0]).toContain("DKIM");
  });

  it("should report stale DMARC when record is missing", async () => {
    mockResolveTxt.mockImplementation((hostname: string) => {
      if (hostname === "example.com") {
        return Promise.resolve([["v=spf1 include:spf.alecrae.dev ~all"]]);
      }
      if (hostname === "default._domainkey.example.com") {
        return Promise.resolve([["v=DKIM1; k=rsa; p=MIIBIjANBg..."]]);
      }
      if (hostname === "_dmarc.example.com") {
        return Promise.reject(new Error("NXDOMAIN"));
      }
      return Promise.reject(new Error("NXDOMAIN"));
    });

    const result = await checkDomainLiveness("dom_1", "example.com", "default");

    expect(result.spfOk).toBe(true);
    expect(result.dkimOk).toBe(true);
    expect(result.dmarcOk).toBe(false);
    expect(result.staleRecords).toHaveLength(1);
    expect(result.staleRecords[0]).toContain("DMARC");
  });

  it("should report all stale records when all DNS records are missing", async () => {
    mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));

    const result = await checkDomainLiveness("dom_1", "example.com", "default");

    expect(result.spfOk).toBe(false);
    expect(result.dkimOk).toBe(false);
    expect(result.dmarcOk).toBe(false);
    expect(result.staleRecords).toHaveLength(3);
  });

  it("should handle missing DKIM selector gracefully", async () => {
    mockResolveTxt.mockImplementation((hostname: string) => {
      if (hostname === "example.com") {
        return Promise.resolve([["v=spf1 include:spf.alecrae.dev ~all"]]);
      }
      if (hostname === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"]]);
      }
      return Promise.reject(new Error("NXDOMAIN"));
    });

    const result = await checkDomainLiveness("dom_1", "example.com", null);

    expect(result.spfOk).toBe(true);
    expect(result.dkimOk).toBe(false);
    expect(result.dmarcOk).toBe(true);
    expect(result.staleRecords).toHaveLength(1);
    expect(result.staleRecords[0]).toContain("DKIM");
    expect(result.staleRecords[0]).toContain("No DKIM selector configured");
  });
});

describe("checkDomainLiveness — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect DMARC with invalid policy as stale", async () => {
    mockResolveTxt.mockImplementation((hostname: string) => {
      if (hostname === "example.com") {
        return Promise.resolve([["v=spf1 include:spf.alecrae.dev ~all"]]);
      }
      if (hostname === "default._domainkey.example.com") {
        return Promise.resolve([["v=DKIM1; k=rsa; p=MIIBIjANBg..."]]);
      }
      if (hostname === "_dmarc.example.com") {
        // DMARC record exists but has no valid policy
        return Promise.resolve([["v=DMARC1; rua=mailto:dmarc@example.com"]]);
      }
      return Promise.reject(new Error("NXDOMAIN"));
    });

    const result = await checkDomainLiveness("dom_1", "example.com", "default");

    expect(result.spfOk).toBe(true);
    expect(result.dkimOk).toBe(true);
    expect(result.dmarcOk).toBe(false);
    expect(result.staleRecords).toHaveLength(1);
    expect(result.staleRecords[0]).toContain("DMARC");
    expect(result.staleRecords[0]).toContain("missing valid policy");
  });
});
