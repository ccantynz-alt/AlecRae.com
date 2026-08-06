/**
 * Charset handling in the import parser (Known Issue #113a).
 *
 * The parser read the declared charset into a variable and then decoded
 * everything as UTF-8 anyway — every decode path used a bare
 * `new TextDecoder()`. A message declaring `iso-8859-1` or `shift_jis`, which
 * is routine in an archive old enough to be worth importing, came out
 * mojibake with no error anywhere.
 *
 * Three distinct bugs lived here, all covered below:
 *  1. base64 bodies decoded as UTF-8 regardless of the declared charset
 *  2. RFC 2047 encoded words ignored the charset named in the word itself —
 *     the parameter was called `_charset` to mark it unused — so subject
 *     lines, the most visible field in the product, mis-decoded
 *  3. quoted-printable produced one code unit per byte, so a UTF-8 QP body
 *     (the most common encoding for European-language mail) read as latin1
 */

import { describe, it, expect } from "vitest";
import { parseEmail, decodeEncodedWords } from "./parser.js";

/** Build a minimal RFC 5322 message. */
function message(headers: string[], body: string): string {
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

/** Base64 of the given bytes. */
function b64(bytes: number[]): string {
  return Buffer.from(Uint8Array.from(bytes)).toString("base64");
}

describe("RFC 2047 encoded words — subject lines", () => {
  it("decodes a UTF-8 base64 word", () => {
    // "Café" in UTF-8
    const encoded = `=?UTF-8?B?${b64([0x43, 0x61, 0x66, 0xc3, 0xa9])}?=`;
    expect(decodeEncodedWords(encoded)).toBe("Café");
  });

  it("decodes an ISO-8859-1 base64 word — the case that used to mojibake", () => {
    // "Café" in latin1: é is a single byte 0xE9, which is invalid UTF-8.
    const encoded = `=?ISO-8859-1?B?${b64([0x43, 0x61, 0x66, 0xe9])}?=`;
    expect(decodeEncodedWords(encoded)).toBe("Café");
  });

  it("decodes a UTF-8 Q-encoded word", () => {
    // The bytes of "é" are C3 A9; reading them as code points gives "Ã©".
    expect(decodeEncodedWords("=?UTF-8?Q?Caf=C3=A9?=")).toBe("Café");
  });

  it("decodes an ISO-8859-1 Q-encoded word", () => {
    expect(decodeEncodedWords("=?ISO-8859-1?Q?Caf=E9?=")).toBe("Café");
  });

  it("treats underscore as space, per RFC 2047", () => {
    expect(decodeEncodedWords("=?UTF-8?Q?Hello_World?=")).toBe("Hello World");
  });

  it("leaves an unknown charset readable rather than throwing", () => {
    // An import must never abort mid-mailbox because one message declared a
    // charset label we do not recognise.
    const encoded = `=?x-not-a-charset?B?${b64([0x48, 0x69])}?=`;
    expect(() => decodeEncodedWords(encoded)).not.toThrow();
    expect(decodeEncodedWords(encoded)).toBe("Hi");
  });

  it("passes through text with no encoded words untouched", () => {
    expect(decodeEncodedWords("Plain subject")).toBe("Plain subject");
  });
});

describe("message bodies", () => {
  it("decodes a base64 ISO-8859-1 body", () => {
    const raw = message(
      [
        "From: a@example.com",
        "To: b@example.com",
        "Subject: Test",
        "Content-Type: text/plain; charset=iso-8859-1",
        "Content-Transfer-Encoding: base64",
      ],
      b64([0x43, 0x61, 0x66, 0xe9]),
    );
    expect(parseEmail(raw).textBody).toBe("Café");
  });

  it("decodes a quoted-printable UTF-8 body", () => {
    const raw = message(
      [
        "From: a@example.com",
        "To: b@example.com",
        "Subject: Test",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: quoted-printable",
      ],
      "Caf=C3=A9",
    );
    expect(parseEmail(raw).textBody).toBe("Café");
  });

  it("decodes a quoted-printable ISO-8859-1 body", () => {
    const raw = message(
      [
        "From: a@example.com",
        "To: b@example.com",
        "Subject: Test",
        "Content-Type: text/plain; charset=iso-8859-1",
        "Content-Transfer-Encoding: quoted-printable",
      ],
      "Caf=E9",
    );
    expect(parseEmail(raw).textBody).toBe("Café");
  });

  it("still handles a plain ASCII body with no charset declared", () => {
    const raw = message(
      [
        "From: a@example.com",
        "To: b@example.com",
        "Subject: Test",
        "Content-Type: text/plain",
      ],
      "Hello there",
    );
    expect(parseEmail(raw).textBody).toBe("Hello there");
  });

  it("honours a quoted charset parameter", () => {
    const raw = message(
      [
        "From: a@example.com",
        "To: b@example.com",
        "Subject: Test",
        'Content-Type: text/plain; charset="ISO-8859-1"; format=flowed',
        "Content-Transfer-Encoding: base64",
      ],
      b64([0x43, 0x61, 0x66, 0xe9]),
    );
    expect(parseEmail(raw).textBody).toBe("Café");
  });
});
