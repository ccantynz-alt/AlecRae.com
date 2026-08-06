/**
 * Header sanitisation shared by every outbound message builder (issue #124,
 * second path).
 *
 * The original fix covered `/v1/messages/send`: a subject like
 * `"Hi\r\nBcc: victim@example.com"` became a real Bcc header on a message we
 * DKIM-sign and relay from our own IP. It did not cover `lib/agent-send.ts`,
 * which has its own RFC-5322 builder and wrote every field straight through.
 *
 * That path matters because of where its subject comes from: the model
 * generates it from the content of an incoming email, so a newline in it is
 * reachable by prompt injection rather than requiring API access. Reasoning
 * about whether a particular producer *can* emit a newline is the analysis you
 * get wrong once — which is what happened.
 *
 * The false-positive direction is tested as hard as the attack: a guard that
 * mangles ordinary subjects would break every legitimate send, which is a
 * worse outcome than the bug.
 */

import { describe, it, expect } from "vitest";
import { headerValue } from "../src/lib/header-safety.js";

describe("injection attempts", () => {
  it("neutralises a CRLF-smuggled Bcc — the original attack", () => {
    const result = headerValue("Hi\r\nBcc: victim@example.com");
    expect(result).not.toContain("\r");
    expect(result).not.toContain("\n");
    expect(result.split("\n")).toHaveLength(1);
  });

  it("neutralises a bare LF, which some parsers accept alone", () => {
    expect(headerValue("Subject\nBcc: victim@example.com")).not.toContain("\n");
  });

  it("neutralises a bare CR", () => {
    expect(headerValue("Subject\rBcc: victim@example.com")).not.toContain("\r");
  });

  it("neutralises a NUL byte", () => {
    expect(headerValue("Subject\u0000injected")).not.toContain("\u0000");
  });

  it("handles repeated and mixed sequences", () => {
    const result = headerValue("A\r\n\r\nB\n\rC");
    expect(/[\r\n\u0000]/.test(result)).toBe(false);
  });

  it("keeps the words readable rather than joining them", () => {
    // Deleting the newline would silently produce "quarterlyreport". A space
    // preserves what the user actually wrote.
    expect(headerValue("quarterly\nreport")).toBe("quarterly report");
  });
});

describe("ordinary values pass through", () => {
  it("leaves a normal subject untouched", () => {
    expect(headerValue("Re: Tuesday's meeting")).toBe("Re: Tuesday's meeting");
  });

  it("preserves punctuation, unicode and emoji", () => {
    expect(headerValue("Café — 50% off! 🎉")).toBe("Café — 50% off! 🎉");
  });

  it("preserves internal spacing", () => {
    expect(headerValue("a  b   c")).toBe("a  b   c");
  });

  it("trims only the edges", () => {
    expect(headerValue("  padded  ")).toBe("padded");
  });

  it("handles an empty string", () => {
    expect(headerValue("")).toBe("");
  });
});
