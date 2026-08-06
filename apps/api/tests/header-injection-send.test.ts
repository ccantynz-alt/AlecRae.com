/**
 * Regression test: header injection via `subject` and recipient display names.
 *
 * `buildRawMessage()` writes subject and display names directly into the
 * `Subject:`, `From:`, `To:`, `Cc:` and `Reply-To:` header lines. The raw
 * message is then DKIM-signed and relayed from our own sending IP, or
 * base64url-encoded and pushed through the customer's Gmail on the
 * connected-account path.
 *
 * `SendMessageSchema` accepted `z.string().max(998)` for subject and a bare
 * `z.string()` for display names, so a subject containing CRLF injected real
 * headers — e.g. a hidden `Bcc:` — into a message signed as us. That is the
 * classic route to a blocklisting, and it bypassed `validateCustomHeaders()`
 * entirely, since that validator only ever guarded the `headers` object.
 *
 * Two layers are asserted here:
 *   1. the schema rejects the input outright (the real gate — clear 422)
 *   2. even if something reaches the builder another way, the value is
 *      flattened rather than becoming a new header line
 */

import { describe, it, expect } from "vitest";
import { SendMessageSchema } from "../src/types.js";

const BASE = {
  from: { email: "sender@alecrae.com" },
  to: [{ email: "recipient@example.com" }],
  text: "hello",
};

describe("send schema — header injection", () => {
  it("accepts an ordinary subject with spaces and punctuation", () => {
    // Guards against an over-broad character class breaking every real send.
    const r = SendMessageSchema.safeParse({
      ...BASE,
      subject: "Your invoice #1234 is ready — thanks!",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an ordinary display name", () => {
    const r = SendMessageSchema.safeParse({
      ...BASE,
      from: { email: "sender@alecrae.com", name: "Craig O'Brien-Smith, Jr." },
      subject: "Hi",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a CRLF Bcc injection in the subject", () => {
    const r = SendMessageSchema.safeParse({
      ...BASE,
      subject: "Hi\r\nBcc: victim@example.com",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bare LF injection in the subject", () => {
    const r = SendMessageSchema.safeParse({
      ...BASE,
      subject: "Hi\nX-Spoofed: yes",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bare CR in the subject", () => {
    const r = SendMessageSchema.safeParse({ ...BASE, subject: "Hi\rthere" });
    expect(r.success).toBe(false);
  });

  it("rejects a NUL byte in the subject", () => {
    const r = SendMessageSchema.safeParse({ ...BASE, subject: "Hi\u0000there" });
    expect(r.success).toBe(false);
  });

  it("rejects injection through the sender display name", () => {
    const r = SendMessageSchema.safeParse({
      ...BASE,
      from: { email: "sender@alecrae.com", name: "Real\r\nBcc: victim@example.com" },
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });

  it("rejects injection through a recipient display name", () => {
    const r = SendMessageSchema.safeParse({
      ...BASE,
      to: [{ email: "recipient@example.com", name: "Bob\r\nBcc: victim@example.com" }],
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });

  it("rejects injection through a cc display name", () => {
    const r = SendMessageSchema.safeParse({
      ...BASE,
      cc: [{ email: "cc@example.com", name: "X\nX-Injected: 1" }],
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });

  it("rejects injection through the replyTo display name", () => {
    const r = SendMessageSchema.safeParse({
      ...BASE,
      replyTo: { email: "reply@example.com", name: "Y\r\nSubject: spoofed" },
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });
});
