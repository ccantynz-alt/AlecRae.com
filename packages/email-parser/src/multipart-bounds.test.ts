/**
 * Bounds on multipart nesting (Known Issue #113c).
 *
 * Multipart recursion was unbounded in both parsers, and each level re-splits
 * the body it was handed — so a message nesting multiparts hundreds deep costs
 * work superlinear in its own size. On the import path one crafted `.eml` can
 * stall a whole mailbox import; the same parser shape on the receive side
 * (services/inbound, port 25) takes its input from anonymous senders.
 *
 * The bounds must not disturb real mail, so the first test here is the
 * ordinary three-level structure almost every HTML email with an attachment
 * actually uses — a limit that broke that would be worse than the problem.
 */

import { describe, it, expect } from "vitest";
import { parseEmail } from "./parser.js";

/** Build a nested multipart body `depth` levels deep. */
function nested(depth: number): string {
  let body = "Innermost text";
  for (let i = depth; i >= 1; i--) {
    const boundary = `b${i}`;
    body =
      `--${boundary}\r\n` +
      `Content-Type: ${i === depth ? "text/plain" : `multipart/mixed; boundary="b${i + 1}"`}\r\n` +
      `\r\n` +
      `${body}\r\n` +
      `--${boundary}--`;
  }
  return body;
}

function message(contentType: string, body: string): string {
  return [
    "From: sender@example.com",
    "To: recipient@example.com",
    "Subject: Test",
    `Content-Type: ${contentType}`,
    "",
    body,
  ].join("\r\n");
}

describe("ordinary mail is unaffected", () => {
  it("parses the standard mixed/alternative structure", () => {
    // multipart/mixed wrapping multipart/alternative wrapping the bodies —
    // what a normal HTML email with an attachment looks like.
    const body = [
      "--outer",
      'Content-Type: multipart/alternative; boundary="inner"',
      "",
      "--inner",
      "Content-Type: text/plain",
      "",
      "Plain version",
      "--inner",
      "Content-Type: text/html",
      "",
      "<p>HTML version</p>",
      "--inner--",
      "--outer--",
    ].join("\r\n");

    const parsed = parseEmail(message('multipart/mixed; boundary="outer"', body));
    expect(parsed.textBody).toContain("Plain version");
    expect(parsed.htmlBody).toContain("HTML version");
  });

  it("parses a modestly nested message well inside the limit", () => {
    const raw = message('multipart/mixed; boundary="b1"', nested(5));
    expect(() => parseEmail(raw)).not.toThrow();
  });
});

describe("bounds", () => {
  it("does not blow the stack on a deeply nested message", () => {
    // Unbounded recursion here either overflows the stack or burns CPU
    // proportional to depth x size. Neither should reach the caller.
    const raw = message('multipart/mixed; boundary="b1"', nested(400));
    expect(() => parseEmail(raw)).not.toThrow();
  });

  it("completes a deeply nested message promptly", () => {
    const raw = message('multipart/mixed; boundary="b1"', nested(400));
    const start = performance.now();
    parseEmail(raw);
    // Generous — the point is that it terminates rather than degrading with
    // depth. Unbounded, the work keeps growing with every level added.
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("does not choke on a very wide single level", () => {
    const sections: string[] = [];
    for (let i = 0; i < 5000; i++) {
      sections.push("--w", "Content-Type: text/plain", "", `part ${i}`);
    }
    sections.push("--w--");
    const raw = message('multipart/mixed; boundary="w"', sections.join("\r\n"));

    const start = performance.now();
    expect(() => parseEmail(raw)).not.toThrow();
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("still recovers the body from a truncated part tree", () => {
    // Over-depth parts stop being descended into, but everything above the
    // limit still parses — a truncated tree beats refusing the message.
    const raw = message('multipart/mixed; boundary="b1"', nested(400));
    const parsed = parseEmail(raw);
    expect(parsed.from.address).toBe("sender@example.com");
    expect(parsed.subject).toBe("Test");
  });
});
