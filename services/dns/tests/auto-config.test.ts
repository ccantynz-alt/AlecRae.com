/**
 * Tests for the DNS auto-config module.
 *
 * Covers: SPF, DKIM, DMARC, and MX record generation, domain verification
 * logic, health-check scoring, and DKIM key rotation.
 *
 * All database operations and DNS lookups are mocked so these tests
 * run without external dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  DomainConfigResult,
  VerificationStatus,
  HealthReport,
} from "../src/auto-config";

// ---------------------------------------------------------------------------
// Mocks -- must be set up before the module under test is imported
// ---------------------------------------------------------------------------

// Shared mutable DB state that tests can configure before each call.
// getDatabase() always returns this same object so mutations are visible
// inside the module under test.
//
// The real Drizzle select chain supports two patterns:
//   1. db.select().from(t).where(c).limit(n)  -- returns Promise<Row[]>
//   2. db.select().from(t).where(c)            -- directly awaitable as Row[]
//
// We model this by making the object returned by .where() both a thenable
// (so `await` works) and equipped with a .limit() method.
const mockSelectResults = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);

function makeWhereResult() {
  // Each call consumes one value from mockSelectResults
  const promise = mockSelectResults();
  return {
    limit: (_n: unknown) => promise,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      promise.then(resolve, reject),
  };
}

const sharedDb = {
  insert: (_table: unknown) => ({
    values: vi.fn().mockResolvedValue(undefined),
  }),
  update: (_table: unknown) => ({
    set: (_vals: unknown) => ({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  select: () => ({
    from: (_table: unknown) => ({
      where: (_cond: unknown) => makeWhereResult(),
    }),
  }),
};

vi.mock("@emailed/db", () => {
  const domainsTable = { id: "id", domain: "domain" };
  const dnsRecordsTable = { id: "id", domainId: "domainId" };

  return {
    getDatabase: () => sharedDb,
    domains: domainsTable,
    dnsRecords: dnsRecordsTable,
    eq: (_a: unknown, _b: unknown) => true,
    and: (...args: unknown[]) => args,
  };
});

// Mock node:dns/promises so no real DNS queries happen
const mockResolveTxt = vi.fn();
const mockResolveMx = vi.fn();
const mockResolveCname = vi.fn();

vi.mock("node:dns/promises", () => ({
  resolveTxt: (...args: unknown[]) => mockResolveTxt(...args),
  resolveMx: (...args: unknown[]) => mockResolveMx(...args),
  resolveCname: (...args: unknown[]) => mockResolveCname(...args),
}));

// Mock crypto.generateKeyPair to avoid slow RSA generation in tests.
// Node's crypto.generateKeyPair has a custom util.promisify implementation
// that returns { publicKey, privateKey }. We replicate that behaviour.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const { promisify } = await import("node:util");

  const fakePub =
    "-----BEGIN PUBLIC KEY-----\nTUVTVEtFWQ==\n-----END PUBLIC KEY-----\n";
  const fakePriv =
    "-----BEGIN PRIVATE KEY-----\nUFJJVkFURUtFWQ==\n-----END PRIVATE KEY-----\n";

  // Build a callback-style function with a custom promisify symbol
  const generateKeyPair = (
    _type: string,
    _opts: unknown,
    cb: (err: Error | null, pub: string, priv: string) => void,
  ) => {
    cb(null, fakePub, fakePriv);
  };

  // Attach the custom promisify implementation (same as real Node)
  (generateKeyPair as any)[promisify.custom] = () =>
    Promise.resolve({ publicKey: fakePub, privateKey: fakePriv });

  return {
    ...actual,
    generateKeyPair,
    randomBytes: (n: number) => Buffer.alloc(n, 0xab),
  };
});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const {
  generateDomainConfig,
  verifyDomainConfig,
  checkDomainHealth,
} = await import("../src/auto-config");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure the mock DB to return `domainRow` for the first select().limit()
 * call (the domain lookup) and an empty array for subsequent calls (dns_records
 * lookup used in verifyDomainConfig).
 */
function setDomainRow(domainRow: Record<string, unknown>) {
  // Each call to .limit() alternates: first returns the domain, then dns rows
  mockSelectResults
    .mockResolvedValueOnce([domainRow]) // domain lookup
    .mockResolvedValueOnce([domainRow]) // second domain lookup inside checkDomainHealth -> verifyDomainConfig
    .mockResolvedValue([]); // dns_records lookup
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DNS Auto-Config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTxt.mockReset();
    mockResolveMx.mockReset();
    mockResolveCname.mockReset();
    mockSelectResults.mockReset().mockResolvedValue([]);
  });

  // =========================================================================
  // 1. Record generation -- generateDomainConfig
  // =========================================================================

  describe("generateDomainConfig", () => {
    it("should generate all required DNS record types (SPF, DKIM, DMARC, MX, Return-Path)", async () => {
      const result: DomainConfigResult = await generateDomainConfig(
        "example.com",
        "acc-1",
      );

      expect(result.domain).toBe("example.com");
      expect(result.domainId).toBeTruthy();
      expect(result.dkimSelector).toMatch(/^emailed\d{6}$/);
      expect(result.dkimPrivateKey).toContain("PRIVATE KEY");
      expect(result.dkimPublicKey).toContain("PUBLIC KEY");

      // Should produce exactly 6 records: 2 MX + SPF + DKIM + DMARC + return-path
      expect(result.records).toHaveLength(6);

      const purposes = result.records.map((r) => r.purpose);
      expect(purposes.filter((p) => p === "mx")).toHaveLength(2);
      expect(purposes).toContain("spf");
      expect(purposes).toContain("dkim");
      expect(purposes).toContain("dmarc");
      expect(purposes).toContain("return-path");
    });

    it("should generate a correct SPF TXT record", async () => {
      const result = await generateDomainConfig("test.io", "acc-2");
      const spf = result.records.find((r) => r.purpose === "spf")!;

      expect(spf.type).toBe("TXT");
      expect(spf.name).toBe("test.io");
      expect(spf.value).toBe("v=spf1 include:spf.emailed.dev ~all");
      expect(spf.ttl).toBe(3600);
    });

    it("should generate a DKIM TXT record with the correct selector subdomain", async () => {
      const result = await generateDomainConfig("mail.org", "acc-3");
      const dkim = result.records.find((r) => r.purpose === "dkim")!;

      expect(dkim.type).toBe("TXT");
      expect(dkim.name).toBe(`${result.dkimSelector}._domainkey.mail.org`);
      expect(dkim.value).toMatch(/^v=DKIM1; k=rsa; p=.+/);
      // The public key in the DNS record should be base64 without PEM headers
      expect(dkim.value).not.toContain("-----BEGIN");
    });

    it("should generate a DMARC TXT record at _dmarc subdomain", async () => {
      const result = await generateDomainConfig("corp.dev", "acc-4");
      const dmarc = result.records.find((r) => r.purpose === "dmarc")!;

      expect(dmarc.type).toBe("TXT");
      expect(dmarc.name).toBe("_dmarc.corp.dev");
      expect(dmarc.value).toContain("v=DMARC1");
      expect(dmarc.value).toContain("p=quarantine");
      expect(dmarc.value).toContain("rua=mailto:dmarc-reports@emailed.dev");
    });

    it("should generate two MX records with correct priorities", async () => {
      const result = await generateDomainConfig("mx-test.com", "acc-5");
      const mxRecords = result.records.filter((r) => r.purpose === "mx");

      expect(mxRecords).toHaveLength(2);

      const primary = mxRecords.find((r) => r.priority === 10)!;
      expect(primary.type).toBe("MX");
      expect(primary.value).toBe("mx1.emailed.dev");

      const secondary = mxRecords.find((r) => r.priority === 20)!;
      expect(secondary.type).toBe("MX");
      expect(secondary.value).toBe("mx2.emailed.dev");
    });

    it("should generate a Return-Path CNAME record at the bounce subdomain", async () => {
      const result = await generateDomainConfig("bounce-test.com", "acc-6");
      const rp = result.records.find((r) => r.purpose === "return-path")!;

      expect(rp.type).toBe("CNAME");
      expect(rp.name).toBe("bounce.bounce-test.com");
      expect(rp.value).toBe("bounce.emailed.dev");
    });

    it("should mark all generated records as unverified initially", async () => {
      const result = await generateDomainConfig("fresh.dev", "acc-7");
      for (const record of result.records) {
        expect(record.verified).toBe(false);
      }
    });
  });

  // =========================================================================
  // 2. Domain verification -- verifyDomainConfig
  // =========================================================================

  describe("verifyDomainConfig", () => {
    it("should return 'verified' when all DNS records match", async () => {
      const fakeDomain = {
        id: "dom-1",
        domain: "verified.com",
        dkimSelector: "emailed202604",
        dkimPublicKey:
          "-----BEGIN PUBLIC KEY-----\nTUVTVEtFWQ==\n-----END PUBLIC KEY-----\n",
        verificationAttempts: 0,
        lastVerificationAttempt: null,
        verifiedAt: null,
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        createdAt: new Date("2026-01-01"),
      };

      mockSelectResults
        .mockResolvedValueOnce([fakeDomain]) // domain lookup
        .mockResolvedValue([]); // dns_records lookup

      // Set up DNS mocks for a fully verified domain
      mockResolveTxt.mockImplementation((hostname: string) => {
        if (hostname === "verified.com") {
          return Promise.resolve([["v=spf1 include:spf.emailed.dev ~all"]]);
        }
        if (hostname === "emailed202604._domainkey.verified.com") {
          return Promise.resolve([["v=DKIM1; k=rsa; p=TUVTVEtFWQ=="]]);
        }
        if (hostname === "_dmarc.verified.com") {
          return Promise.resolve([
            ["v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@emailed.dev"],
          ]);
        }
        return Promise.reject(new Error("NXDOMAIN"));
      });

      mockResolveMx.mockResolvedValue([
        { priority: 10, exchange: "mx1.emailed.dev" },
        { priority: 20, exchange: "mx2.emailed.dev" },
      ]);

      mockResolveCname.mockResolvedValue(["bounce.emailed.dev"]);

      const result: VerificationStatus = await verifyDomainConfig("dom-1");

      expect(result.overall).toBe("verified");
      expect(result.spf.verified).toBe(true);
      expect(result.dkim.verified).toBe(true);
      expect(result.dmarc.verified).toBe(true);
      expect(result.mx.verified).toBe(true);
      expect(result.returnPath.verified).toBe(true);
    });

    it("should return 'partial' when some records are missing", async () => {
      const fakeDomain = {
        id: "dom-2",
        domain: "partial.com",
        dkimSelector: "emailed202604",
        dkimPublicKey: null,
        verificationAttempts: 1,
        lastVerificationAttempt: null,
        verifiedAt: null,
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        createdAt: new Date("2026-01-01"),
      };

      mockSelectResults
        .mockResolvedValueOnce([fakeDomain])
        .mockResolvedValue([]);

      // SPF present but DKIM/DMARC missing
      mockResolveTxt.mockImplementation((hostname: string) => {
        if (hostname === "partial.com") {
          return Promise.resolve([["v=spf1 include:spf.emailed.dev ~all"]]);
        }
        return Promise.reject(new Error("NXDOMAIN"));
      });

      mockResolveMx.mockResolvedValue([
        { priority: 10, exchange: "mx1.emailed.dev" },
      ]);

      mockResolveCname.mockRejectedValue(new Error("NXDOMAIN"));

      const result: VerificationStatus = await verifyDomainConfig("dom-2");

      expect(result.overall).toBe("partial");
      expect(result.spf.verified).toBe(true);
      expect(result.dkim.verified).toBe(false);
      expect(result.dmarc.verified).toBe(false);
      expect(result.mx.verified).toBe(true);
      expect(result.returnPath.verified).toBe(false);
    });

    it("should return 'failed' when no DNS records are found", async () => {
      const fakeDomain = {
        id: "dom-3",
        domain: "failed.com",
        dkimSelector: null,
        dkimPublicKey: null,
        verificationAttempts: 2,
        lastVerificationAttempt: null,
        verifiedAt: null,
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        createdAt: new Date("2026-03-01"),
      };

      mockSelectResults
        .mockResolvedValueOnce([fakeDomain])
        .mockResolvedValue([]);

      // All DNS lookups fail
      mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));
      mockResolveMx.mockRejectedValue(new Error("NXDOMAIN"));
      mockResolveCname.mockRejectedValue(new Error("NXDOMAIN"));

      const result: VerificationStatus = await verifyDomainConfig("dom-3");

      expect(result.overall).toBe("failed");
      expect(result.spf.verified).toBe(false);
      expect(result.dkim.verified).toBe(false);
      expect(result.dmarc.verified).toBe(false);
      expect(result.mx.verified).toBe(false);
      expect(result.returnPath.verified).toBe(false);
    });
  });

  // =========================================================================
  // 3. Health check -- checkDomainHealth
  // =========================================================================

  describe("checkDomainHealth", () => {
    it("should score 100 for a fully verified domain with fresh DKIM key", async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days old

      const fakeDomain = {
        id: "dom-h1",
        domain: "healthy.com",
        dkimSelector: "emailed202604",
        dkimPublicKey:
          "-----BEGIN PUBLIC KEY-----\nTUVTVEtFWQ==\n-----END PUBLIC KEY-----\n",
        verificationAttempts: 0,
        lastVerificationAttempt: null,
        verifiedAt: null,
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        createdAt: recentDate,
      };

      // checkDomainHealth calls getDatabase() once for its own domain lookup,
      // then calls verifyDomainConfig which does another domain lookup + dns_records select
      mockSelectResults
        .mockResolvedValueOnce([fakeDomain]) // checkDomainHealth domain lookup
        .mockResolvedValueOnce([fakeDomain]) // verifyDomainConfig domain lookup
        .mockResolvedValue([]); // dns_records lookup

      // All records present and correct
      mockResolveTxt.mockImplementation((hostname: string) => {
        if (hostname === "healthy.com") {
          return Promise.resolve([["v=spf1 include:spf.emailed.dev ~all"]]);
        }
        if (hostname === "emailed202604._domainkey.healthy.com") {
          return Promise.resolve([["v=DKIM1; k=rsa; p=TUVTVEtFWQ=="]]);
        }
        if (hostname === "_dmarc.healthy.com") {
          return Promise.resolve([["v=DMARC1; p=quarantine; rua=mailto:x@y.com"]]);
        }
        return Promise.reject(new Error("NXDOMAIN"));
      });

      mockResolveMx.mockResolvedValue([
        { priority: 10, exchange: "mx1.emailed.dev" },
        { priority: 20, exchange: "mx2.emailed.dev" },
      ]);

      mockResolveCname.mockResolvedValue(["bounce.emailed.dev"]);

      const report: HealthReport = await checkDomainHealth("dom-h1");

      expect(report.score).toBe(100);
      expect(report.dkimRotationNeeded).toBe(false);
      expect(report.spfTooManyLookups).toBe(false);
      expect(report.recommendations).toHaveLength(0);
    });

    it("should recommend DKIM rotation when key is older than 90 days", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 120); // 120 days old

      const fakeDomain = {
        id: "dom-h2",
        domain: "stale-dkim.com",
        dkimSelector: "emailed202601",
        dkimPublicKey:
          "-----BEGIN PUBLIC KEY-----\nTUVTVEtFWQ==\n-----END PUBLIC KEY-----\n",
        verificationAttempts: 0,
        lastVerificationAttempt: null,
        verifiedAt: null,
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        createdAt: oldDate,
      };

      mockSelectResults
        .mockResolvedValueOnce([fakeDomain])
        .mockResolvedValueOnce([fakeDomain])
        .mockResolvedValue([]);

      mockResolveTxt.mockImplementation((hostname: string) => {
        if (hostname === "stale-dkim.com") {
          return Promise.resolve([["v=spf1 include:spf.emailed.dev ~all"]]);
        }
        if (hostname === "emailed202601._domainkey.stale-dkim.com") {
          return Promise.resolve([["v=DKIM1; k=rsa; p=TUVTVEtFWQ=="]]);
        }
        if (hostname === "_dmarc.stale-dkim.com") {
          return Promise.resolve([["v=DMARC1; p=reject"]]);
        }
        return Promise.reject(new Error("NXDOMAIN"));
      });

      mockResolveMx.mockResolvedValue([
        { priority: 10, exchange: "mx1.emailed.dev" },
      ]);

      mockResolveCname.mockResolvedValue(["bounce.emailed.dev"]);

      const report: HealthReport = await checkDomainHealth("dom-h2");

      expect(report.dkimRotationNeeded).toBe(true);
      expect(report.dkimKeyAge).toBeGreaterThanOrEqual(119);
      // Score should be < 100 because DKIM rotation is needed (loses 15 rotation points)
      expect(report.score).toBeLessThan(100);
      expect(
        report.recommendations.some((r) => r.includes("DKIM key")),
      ).toBe(true);
    });

    it("should flag SPF record with too many DNS lookups", async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);

      const fakeDomain = {
        id: "dom-h3",
        domain: "manyspf.com",
        dkimSelector: "emailed202604",
        dkimPublicKey:
          "-----BEGIN PUBLIC KEY-----\nTUVTVEtFWQ==\n-----END PUBLIC KEY-----\n",
        verificationAttempts: 0,
        lastVerificationAttempt: null,
        verifiedAt: null,
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        createdAt: recentDate,
      };

      mockSelectResults
        .mockResolvedValueOnce([fakeDomain])
        .mockResolvedValueOnce([fakeDomain])
        .mockResolvedValue([]);

      // SPF with way too many includes (>10 lookups)
      const bigSpf =
        "v=spf1 include:a.com include:b.com include:c.com include:d.com include:e.com include:f.com include:g.com include:h.com include:i.com include:j.com include:k.com include:spf.emailed.dev ~all";

      mockResolveTxt.mockImplementation((hostname: string) => {
        if (hostname === "manyspf.com") {
          return Promise.resolve([[bigSpf]]);
        }
        if (hostname === "emailed202604._domainkey.manyspf.com") {
          return Promise.resolve([["v=DKIM1; k=rsa; p=TUVTVEtFWQ=="]]);
        }
        if (hostname === "_dmarc.manyspf.com") {
          return Promise.resolve([["v=DMARC1; p=quarantine"]]);
        }
        return Promise.reject(new Error("NXDOMAIN"));
      });

      mockResolveMx.mockResolvedValue([
        { priority: 10, exchange: "mx1.emailed.dev" },
      ]);

      mockResolveCname.mockResolvedValue(["bounce.emailed.dev"]);

      const report: HealthReport = await checkDomainHealth("dom-h3");

      expect(report.spfTooManyLookups).toBe(true);
      expect(report.spfLookupCount).toBeGreaterThan(10);
      expect(
        report.recommendations.some((r) => r.includes("SPF record has")),
      ).toBe(true);
    });
  });
});
