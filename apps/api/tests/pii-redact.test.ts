/**
 * Tests for the PII redaction utility (apps/api/src/lib/pii-redact.ts).
 * A real minimization gate before content reaches a third-party AI
 * provider — previously nothing redacted anything anywhere in the AI
 * pipeline.
 */

import { describe, it, expect } from "vitest";
import { redactPii } from "../src/lib/pii-redact.js";

describe("redactPii", () => {
  it("redacts a US SSN", () => {
    const result = redactPii("My SSN is 123-45-6789, please update your records.");
    expect(result.text).not.toContain("123-45-6789");
    expect(result.text).toContain("[REDACTED-SSN]");
    expect(result.redactedTypes).toContain("ssn");
  });

  it("redacts a 16-digit credit card number", () => {
    const result = redactPii("Card: 4111 1111 1111 1111 exp 12/28");
    expect(result.text).not.toContain("4111 1111 1111 1111");
    expect(result.text).toContain("[REDACTED-CARD]");
    expect(result.redactedTypes).toContain("credit_card");
  });

  it("redacts an Anthropic-style API key", () => {
    const result = redactPii("Here's my key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result.text).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result.text).toContain("[REDACTED-KEY:");
    expect(result.redactedTypes).toContain("api_key");
  });

  it("redacts a GitHub personal access token", () => {
    const result = redactPii("token=ghp_1234567890abcdefghijklmnopqrstuvwxyz");
    expect(result.text).toContain("[REDACTED-KEY:");
  });

  it("does not touch ordinary text with no PII", () => {
    const text = "Hi Alice, can we move our 1pm meeting to 3pm tomorrow? Thanks, Bob";
    const result = redactPii(text);
    expect(result.text).toBe(text);
    expect(result.redactedTypes).toHaveLength(0);
  });

  it("does not misfire on an ordinary phone-number-length digit run", () => {
    // 10-digit phone number should not trip the 13-19 digit card pattern.
    const result = redactPii("Call me at 555-123-4567.");
    expect(result.text).toContain("555-123-4567");
    expect(result.redactedTypes).not.toContain("credit_card");
  });

  it("redacts multiple distinct PII types in one pass", () => {
    const result = redactPii("SSN 123-45-6789 and card 4111111111111111 in the same email.");
    expect(result.redactedTypes.sort()).toEqual(["credit_card", "ssn"]);
  });
});
