import { describe, it, expect } from "bun:test";
import { parseEmail, parseAddressList, decodeEncodedWords } from "../src/parser.js";

describe("parseEmail — simple text message", () => {
  const raw = [
    "From: sender@example.com",
    "To: recipient@example.com",
    "Subject: Hello",
    "Date: Tue, 01 Apr 2026 10:00:00 +0000",
    "Message-ID: <abc123@example.com>",
    "",
    "This is the body.",
  ].join("\r\n");

  it("should extract the subject", () => {
    const email = parseEmail(raw);
    expect(email.subject).toBe("Hello");
  });

  it("should extract the from address", () => {
    const email = parseEmail(raw);
    expect(email.from.address).toBe("sender@example.com");
  });

  it("should extract the to address", () => {
    const email = parseEmail(raw);
    expect(email.to).toHaveLength(1);
    expect(email.to[0]!.address).toBe("recipient@example.com");
  });

  it("should extract the message ID without angle brackets", () => {
    const email = parseEmail(raw);
    expect(email.messageId).toBe("abc123@example.com");
  });

  it("should parse the date", () => {
    const email = parseEmail(raw);
    expect(email.date).toBeInstanceOf(Date);
  });

  it("should extract the text body", () => {
    const email = parseEmail(raw);
    expect(email.textBody).toBe("This is the body.");
  });

  it("should have no HTML body for a plain text message", () => {
    const email = parseEmail(raw);
    expect(email.htmlBody).toBeUndefined();
  });
});

describe("parseEmail — multipart/alternative", () => {
  const boundary = "boundary123";
  const raw = [
    "From: Alice <alice@example.com>",
    "To: Bob <bob@example.com>",
    "Subject: Multipart test",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "Message-ID: <multi@example.com>",
    "",
    `--${boundary}`,
    "Content-Type: text/plain",
    "",
    "Plain text version",
    `--${boundary}`,
    "Content-Type: text/html",
    "",
    "<p>HTML version</p>",
    `--${boundary}--`,
  ].join("\r\n");

  it("should extract the plain text body", () => {
    const email = parseEmail(raw);
    expect(email.textBody).toBe("Plain text version");
  });

  it("should extract the HTML body", () => {
    const email = parseEmail(raw);
    expect(email.htmlBody).toBe("<p>HTML version</p>");
  });

  it("should parse the from address with display name", () => {
    const email = parseEmail(raw);
    expect(email.from.name).toBe("Alice");
    expect(email.from.address).toBe("alice@example.com");
  });
});

describe("parseEmail — attachment handling", () => {
  const boundary = "attach-boundary";
  const raw = [
    "From: sender@example.com",
    "To: recipient@example.com",
    "Subject: With attachment",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "Message-ID: <attach@example.com>",
    "",
    `--${boundary}`,
    "Content-Type: text/plain",
    "",
    "See attached.",
    `--${boundary}`,
    'Content-Type: application/pdf; name="doc.pdf"',
    'Content-Disposition: attachment; filename="doc.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    "SGVsbG8gV29ybGQ=",
    `--${boundary}--`,
  ].join("\r\n");

  it("should extract the text body", () => {
    const email = parseEmail(raw);
    expect(email.textBody).toBe("See attached.");
  });

  it("should extract the attachment with correct filename", () => {
    const email = parseEmail(raw);
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0]!.filename).toBe("doc.pdf");
  });

  it("should decode base64 attachment content", () => {
    const email = parseEmail(raw);
    const content = new TextDecoder().decode(email.attachments[0]!.content);
    expect(content).toBe("Hello World");
  });

  it("should set the correct content type on the attachment", () => {
    const email = parseEmail(raw);
    expect(email.attachments[0]!.contentType).toBe("application/pdf");
  });
});

describe("parseEmail — quoted-printable encoding", () => {
  const raw = [
    "From: test@example.com",
    "To: dest@example.com",
    "Subject: QP test",
    "Content-Type: text/plain",
    "Content-Transfer-Encoding: quoted-printable",
    "Message-ID: <qp@example.com>",
    "",
    "Soft=\r\nline break and =C3=A9 encoded char",
  ].join("\r\n");

  it("should decode quoted-printable soft line breaks", () => {
    const email = parseEmail(raw);
    expect(email.textBody).toContain("Softline break");
  });
});

describe("parseEmail — references and in-reply-to", () => {
  const raw = [
    "From: a@example.com",
    "To: b@example.com",
    "Subject: Re: Thread",
    "Message-ID: <msg3@example.com>",
    "In-Reply-To: <msg2@example.com>",
    "References: <msg1@example.com> <msg2@example.com>",
    "",
    "Reply body",
  ].join("\r\n");

  it("should extract in-reply-to", () => {
    const email = parseEmail(raw);
    expect(email.inReplyTo).toBe("msg2@example.com");
  });

  it("should extract references as an array", () => {
    const email = parseEmail(raw);
    expect(email.references).toEqual(["msg1@example.com", "msg2@example.com"]);
  });
});

describe("parseAddressList", () => {
  it("should parse a bare email address", () => {
    const result = parseAddressList("user@example.com");
    expect(result).toHaveLength(1);
    expect(result[0]!.address).toBe("user@example.com");
  });

  it("should parse an address with display name", () => {
    const result = parseAddressList("John Doe <john@example.com>");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("John Doe");
    expect(result[0]!.address).toBe("john@example.com");
  });

  it("should parse multiple comma-separated addresses", () => {
    const result = parseAddressList("a@example.com, b@example.com");
    expect(result).toHaveLength(2);
  });

  it("should return empty array for empty input", () => {
    expect(parseAddressList("")).toEqual([]);
  });
});

describe("decodeEncodedWords", () => {
  it("should decode base64-encoded words", () => {
    // "Hello" in base64
    const input = "=?UTF-8?B?SGVsbG8=?=";
    expect(decodeEncodedWords(input)).toBe("Hello");
  });

  it("should decode Q-encoded words", () => {
    const input = "=?UTF-8?Q?Hello_World?=";
    expect(decodeEncodedWords(input)).toBe("Hello World");
  });

  it("should pass through non-encoded text unchanged", () => {
    expect(decodeEncodedWords("plain text")).toBe("plain text");
  });
});
