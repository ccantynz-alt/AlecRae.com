import { describe, it, expect } from "vitest";
import { MimeParser } from "../src/parser/mime-parser.js";

const encoder = new TextEncoder();

function raw(text: string): Uint8Array {
  return encoder.encode(text);
}

describe("MimeParser", () => {
  const parser = new MimeParser();

  it("parses a basic plain-text email", async () => {
    const email = await parser.parse(
      raw(
        [
          "From: Alice <alice@example.com>",
          "To: Bob <bob@example.com>",
          "Subject: Hello",
          "Date: Mon, 01 Jan 2024 12:00:00 +0000",
          "Message-ID: <msg001@example.com>",
          "",
          "Hi Bob, this is a test.",
        ].join("\r\n"),
      ),
    );

    expect(email.messageId).toBe("msg001@example.com");
    expect(email.from).toEqual([{ name: "Alice", address: "alice@example.com" }]);
    expect(email.to).toEqual([{ name: "Bob", address: "bob@example.com" }]);
    expect(email.subject).toBe("Hello");
    expect(email.text).toBe("Hi Bob, this is a test.");
    expect(email.date).toBeInstanceOf(Date);
    expect(email.attachments).toHaveLength(0);
  });

  it("parses a multipart/alternative message with text and HTML", async () => {
    const boundary = "----=_Part_123";
    const email = await parser.parse(
      raw(
        [
          "From: sender@example.com",
          "To: recipient@example.com",
          "Subject: Multipart Test",
          "Message-ID: <multi01@example.com>",
          `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
          "",
          `--${boundary}`,
          "Content-Type: text/plain; charset=utf-8",
          "",
          "Plain text body.",
          `--${boundary}`,
          "Content-Type: text/html; charset=utf-8",
          "",
          "<p>HTML body.</p>",
          `--${boundary}--`,
        ].join("\r\n"),
      ),
    );

    expect(email.text).toBe("Plain text body.");
    expect(email.html).toBe("<p>HTML body.</p>");
  });

  it("parses an email with an attachment", async () => {
    const boundary = "----=_Attach_456";
    const base64Content = btoa("file contents here");
    const email = await parser.parse(
      raw(
        [
          "From: sender@example.com",
          "To: recipient@example.com",
          "Subject: With Attachment",
          "Message-ID: <attach01@example.com>",
          `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
          "",
          `--${boundary}`,
          "Content-Type: text/plain",
          "",
          "See attached.",
          `--${boundary}`,
          "Content-Type: application/pdf; name=\"report.pdf\"",
          "Content-Disposition: attachment; filename=\"report.pdf\"",
          "Content-Transfer-Encoding: base64",
          "",
          base64Content,
          `--${boundary}--`,
        ].join("\r\n"),
      ),
    );

    expect(email.text).toBe("See attached.");
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0]!.filename).toBe("report.pdf");
    expect(email.attachments[0]!.contentType).toBe("application/pdf");
    expect(email.attachments[0]!.contentDisposition).toBe("attachment");
    expect(email.attachments[0]!.size).toBeGreaterThan(0);
    expect(email.attachments[0]!.checksum).toBeTruthy();
  });

  it("decodes RFC 2047 encoded-word subjects", async () => {
    const email = await parser.parse(
      raw(
        [
          "From: sender@example.com",
          "To: recipient@example.com",
          "Subject: =?UTF-8?B?SGVsbG8gV29ybGQ=?=",
          "Message-ID: <enc01@example.com>",
          "",
          "Body text.",
        ].join("\r\n"),
      ),
    );

    expect(email.subject).toBe("Hello World");
  });

  it("handles quoted-printable body encoding", async () => {
    const email = await parser.parse(
      raw(
        [
          "From: sender@example.com",
          "To: recipient@example.com",
          "Subject: QP Test",
          "Message-ID: <qp01@example.com>",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: quoted-printable",
          "",
          "Hello=20World=0D=0ALine two.",
        ].join("\r\n"),
      ),
    );

    expect(email.text).toContain("Hello World");
    expect(email.text).toContain("Line two.");
  });

  it("parses multiple recipients in To and Cc", async () => {
    const email = await parser.parse(
      raw(
        [
          "From: sender@example.com",
          'To: \"Alice A\" <alice@example.com>, bob@example.com',
          "Cc: carol@example.com",
          "Subject: Multi-recipient",
          "Message-ID: <multi-recip@example.com>",
          "",
          "Body.",
        ].join("\r\n"),
      ),
    );

    expect(email.to).toHaveLength(2);
    expect(email.to[0]!.address).toBe("alice@example.com");
    expect(email.to[0]!.name).toBe("Alice A");
    expect(email.to[1]!.address).toBe("bob@example.com");
    expect(email.cc).toHaveLength(1);
    expect(email.cc[0]!.address).toBe("carol@example.com");
  });

  it("generates a message-id when none is present", async () => {
    const email = await parser.parse(
      raw(
        [
          "From: sender@example.com",
          "To: recipient@example.com",
          "Subject: No Message-ID",
          "",
          "Body.",
        ].join("\r\n"),
      ),
    );

    expect(email.messageId).toMatch(/^generated-\d+@emailed\.dev$/);
  });

  it("handles an email with no body", async () => {
    const email = await parser.parse(
      raw(
        [
          "From: sender@example.com",
          "To: recipient@example.com",
          "Subject: No body",
          "Message-ID: <nobody@example.com>",
        ].join("\r\n"),
      ),
    );

    expect(email.subject).toBe("No body");
    // No blank line separator means no body extracted
    expect(email.attachments).toHaveLength(0);
  });
});
