import { describe, it, expect } from "bun:test";
import {
  dkimDnsName,
  formatDkimDnsRecord,
  generateDkimKeyPair,
  createRotationPlan,
  generateSelector,
} from "../src/dkim.js";

describe("dkimDnsName", () => {
  it("should format the DNS TXT record name correctly", () => {
    expect(dkimDnsName("sel1", "example.com")).toBe("sel1._domainkey.example.com");
  });

  it("should handle selectors with numbers", () => {
    expect(dkimDnsName("202604", "mail.example.com")).toBe("202604._domainkey.mail.example.com");
  });
});

describe("formatDkimDnsRecord", () => {
  it("should format an RSA DKIM DNS record", () => {
    const fakePem = "-----BEGIN PUBLIC KEY-----\nTUlH\n-----END PUBLIC KEY-----";
    const record = formatDkimDnsRecord(fakePem, "rsa-sha256");
    expect(record).toBe("v=DKIM1; k=rsa; p=TUlH");
  });

  it("should format an Ed25519 DKIM DNS record", () => {
    const fakePem = "-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----";
    const record = formatDkimDnsRecord(fakePem, "ed25519-sha256");
    expect(record).toContain("k=ed25519");
    expect(record).toContain("v=DKIM1");
  });

  it("should strip PEM headers and whitespace from the key", () => {
    const pem = "-----BEGIN PUBLIC KEY-----\nYWJj\nZGVm\n-----END PUBLIC KEY-----\n";
    const record = formatDkimDnsRecord(pem, "rsa-sha256");
    expect(record).toBe("v=DKIM1; k=rsa; p=YWJjZGVm");
  });
});

describe("generateDkimKeyPair", () => {
  it("should generate an RSA key pair by default", async () => {
    const result = await generateDkimKeyPair({
      selector: "test",
      domain: "example.com",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.selector).toBe("test");
    expect(result.value.domain).toBe("example.com");
    expect(result.value.algorithm).toBe("rsa-sha256");
    expect(result.value.privateKey).toContain("-----BEGIN PRIVATE KEY-----");
    expect(result.value.publicKey).toContain("-----BEGIN PUBLIC KEY-----");
    expect(result.value.dnsRecord).toContain("v=DKIM1; k=rsa; p=");
    expect(result.value.dnsName).toBe("test._domainkey.example.com");
    expect(result.value.createdAt).toBeInstanceOf(Date);
  });

  it("should generate an Ed25519 key pair when requested", async () => {
    const result = await generateDkimKeyPair({
      selector: "ed-test",
      domain: "example.com",
      algorithm: "ed25519-sha256",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.algorithm).toBe("ed25519-sha256");
    expect(result.value.dnsRecord).toContain("k=ed25519");
  });

  it("should include the correct dnsName in the result", async () => {
    const result = await generateDkimKeyPair({
      selector: "202604",
      domain: "mail.example.org",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dnsName).toBe("202604._domainkey.mail.example.org");
    }
  });
});

describe("createRotationPlan", () => {
  it("should return a rotation plan with current and next selectors", () => {
    const plan = createRotationPlan("old-sel", "example.com");
    expect(plan.currentSelector).toBe("old-sel");
    expect(plan.nextSelector).toContain("examplecom-");
    expect(plan.domain).toBe("example.com");
    expect(plan.algorithm).toBe("rsa-sha256");
    expect(plan.overlapSeconds).toBe(86400);
    expect(plan.rotateAt).toBeInstanceOf(Date);
  });

  it("should respect custom overlap seconds", () => {
    const plan = createRotationPlan("sel", "example.com", "rsa-sha256", 3600);
    expect(plan.overlapSeconds).toBe(3600);
    const expectedRotation = Date.now() + 3600 * 1000;
    // Allow 2 seconds tolerance
    expect(Math.abs(plan.rotateAt.getTime() - expectedRotation)).toBeLessThan(2000);
  });

  it("should strip dots from domain for next selector", () => {
    const plan = createRotationPlan("sel", "sub.example.com");
    expect(plan.nextSelector).toMatch(/^subexamplecom-\d+$/);
  });
});

describe("generateSelector", () => {
  it("should generate a YYYYMM format selector", () => {
    const selector = generateSelector();
    expect(selector).toMatch(/^\d{6}$/);
  });

  it("should include a prefix when provided", () => {
    const selector = generateSelector("dkim");
    expect(selector).toMatch(/^dkim-\d{6}$/);
  });

  it("should reflect the current year and month", () => {
    const now = new Date();
    const expectedYear = now.getFullYear().toString();
    const selector = generateSelector();
    expect(selector.slice(0, 4)).toBe(expectedYear);
  });
});
