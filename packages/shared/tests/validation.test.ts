import { describe, it, expect } from "bun:test";
import {
  isValidEmail,
  isValidDomain,
  isValidHostname,
  emailSchema,
  domainSchema,
  apiKeyFormatSchema,
  tagSchema,
  metadataSchema,
  paginationSchema,
} from "../src/utils/validation.js";

describe("isValidEmail", () => {
  it("should accept a standard email address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("should accept addresses with dots in the local part", () => {
    expect(isValidEmail("first.last@example.com")).toBe(true);
  });

  it("should accept addresses with plus tags", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("should reject addresses without an @ sign", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("should reject addresses with no local part", () => {
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("should reject addresses with no domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("should reject addresses exceeding the maximum length (254)", () => {
    const longLocal = "a".repeat(64);
    const longDomain = "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(63) + ".com";
    // Just make sure a really long one is rejected
    const tooLong = longLocal + "@" + longDomain;
    if (tooLong.length > 254) {
      expect(isValidEmail(tooLong)).toBe(false);
    }
  });

  it("should reject addresses with a local part exceeding 64 characters", () => {
    const longLocal = "a".repeat(65);
    expect(isValidEmail(`${longLocal}@example.com`)).toBe(false);
  });

  it("should reject domains with all-numeric TLD", () => {
    expect(isValidEmail("user@example.123")).toBe(false);
  });

  it("should reject addresses with spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });
});

describe("isValidDomain", () => {
  it("should accept a standard domain", () => {
    expect(isValidDomain("example.com")).toBe(true);
  });

  it("should accept subdomains", () => {
    expect(isValidDomain("sub.example.com")).toBe(true);
  });

  it("should reject single-label domains", () => {
    expect(isValidDomain("localhost")).toBe(false);
  });

  it("should reject empty strings", () => {
    expect(isValidDomain("")).toBe(false);
  });

  it("should reject domains with labels starting with a hyphen", () => {
    expect(isValidDomain("-example.com")).toBe(false);
  });

  it("should reject domains with labels ending with a hyphen", () => {
    expect(isValidDomain("example-.com")).toBe(false);
  });

  it("should reject domains with all-numeric TLD", () => {
    expect(isValidDomain("example.123")).toBe(false);
  });

  it("should accept domains with hyphens in the middle of labels", () => {
    expect(isValidDomain("my-domain.example.com")).toBe(true);
  });
});

describe("isValidHostname", () => {
  it("should accept a regular domain", () => {
    expect(isValidHostname("example.com")).toBe(true);
  });

  it("should accept an IPv4 literal in brackets", () => {
    expect(isValidHostname("[192.168.1.1]")).toBe(true);
  });

  it("should accept an IPv6 literal in brackets", () => {
    expect(isValidHostname("[IPv6:2001:db8::1]")).toBe(true);
  });

  it("should reject invalid IPv4 in brackets", () => {
    expect(isValidHostname("[999.999.999.999]")).toBe(false);
  });
});

describe("emailSchema (Zod)", () => {
  it("should parse a valid email", () => {
    const result = emailSchema.safeParse("test@example.com");
    expect(result.success).toBe(true);
  });

  it("should reject an invalid email", () => {
    const result = emailSchema.safeParse("not-an-email");
    expect(result.success).toBe(false);
  });
});

describe("apiKeyFormatSchema", () => {
  it("should accept a valid live API key", () => {
    const key = "em_live_" + "a".repeat(32);
    expect(apiKeyFormatSchema.safeParse(key).success).toBe(true);
  });

  it("should accept a valid test API key", () => {
    const key = "em_test_" + "b".repeat(32);
    expect(apiKeyFormatSchema.safeParse(key).success).toBe(true);
  });

  it("should reject a key with invalid prefix", () => {
    const key = "em_staging_" + "c".repeat(32);
    expect(apiKeyFormatSchema.safeParse(key).success).toBe(false);
  });

  it("should reject a key that is too short", () => {
    expect(apiKeyFormatSchema.safeParse("em_live_abc").success).toBe(false);
  });
});

describe("tagSchema", () => {
  it("should accept a valid tag", () => {
    expect(tagSchema.safeParse("welcome-email").success).toBe(true);
  });

  it("should reject tags with spaces", () => {
    expect(tagSchema.safeParse("not valid").success).toBe(false);
  });
});

describe("paginationSchema", () => {
  it("should apply default limit of 20", () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("should reject limit above 100", () => {
    const result = paginationSchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });

  it("should accept a valid cursor", () => {
    const result = paginationSchema.parse({ cursor: "abc123", limit: 10 });
    expect(result.cursor).toBe("abc123");
    expect(result.limit).toBe(10);
  });
});
