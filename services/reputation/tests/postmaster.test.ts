import { describe, it, expect } from "bun:test";
import {
  buildVerificationTxtRecord,
  normalizeReputationCategory,
  alertLevelForReputation,
} from "../src/postmaster/index.js";

describe("buildVerificationTxtRecord", () => {
  it("errors when GOOGLE_POSTMASTER_VERIFICATION_TOKEN is unset", () => {
    delete process.env["GOOGLE_POSTMASTER_VERIFICATION_TOKEN"];
    const result = buildVerificationTxtRecord("alecrae.com");
    expect(result.ok).toBe(false);
  });

  it("formats a bare token with the google-site-verification= prefix", () => {
    process.env["GOOGLE_POSTMASTER_VERIFICATION_TOKEN"] = "abc123";
    const result = buildVerificationTxtRecord("alecrae.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe("google-site-verification=abc123");
      expect(result.value.recordType).toBe("TXT");
    }
    delete process.env["GOOGLE_POSTMASTER_VERIFICATION_TOKEN"];
  });

  it("does not double-prefix a token that already has the prefix", () => {
    process.env["GOOGLE_POSTMASTER_VERIFICATION_TOKEN"] = "google-site-verification=abc123";
    const result = buildVerificationTxtRecord("alecrae.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe("google-site-verification=abc123");
    }
    delete process.env["GOOGLE_POSTMASTER_VERIFICATION_TOKEN"];
  });
});

describe("normalizeReputationCategory", () => {
  it("accepts the real bare enum values", () => {
    expect(normalizeReputationCategory("HIGH")).toBe("HIGH");
    expect(normalizeReputationCategory("MEDIUM")).toBe("MEDIUM");
    expect(normalizeReputationCategory("LOW")).toBe("LOW");
    expect(normalizeReputationCategory("BAD")).toBe("BAD");
  });

  it("also accepts a REPUTATION_ prefixed form defensively", () => {
    expect(normalizeReputationCategory("REPUTATION_HIGH")).toBe("HIGH");
    expect(normalizeReputationCategory("REPUTATION_LOW")).toBe("LOW");
  });

  it("falls back to UNSPECIFIED for unknown/missing values", () => {
    expect(normalizeReputationCategory(undefined)).toBe("UNSPECIFIED");
    expect(normalizeReputationCategory("REPUTATION_CATEGORY_UNSPECIFIED")).toBe("UNSPECIFIED");
    expect(normalizeReputationCategory("something-else")).toBe("UNSPECIFIED");
  });
});

describe("alertLevelForReputation", () => {
  it("maps HIGH -> info, MEDIUM -> warning, LOW -> critical, BAD -> page", () => {
    expect(alertLevelForReputation("HIGH")).toBe("info");
    expect(alertLevelForReputation("MEDIUM")).toBe("warning");
    expect(alertLevelForReputation("LOW")).toBe("critical");
    expect(alertLevelForReputation("BAD")).toBe("page");
  });

  it("treats UNSPECIFIED as a warning, not silent", () => {
    expect(alertLevelForReputation("UNSPECIFIED")).toBe("warning");
  });
});
