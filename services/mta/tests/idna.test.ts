/**
 * Internationalized address handling (Known Issue #113b).
 *
 * There was no SMTPUTF8 or punycode handling anywhere in the outbound path.
 * `supportsSmtpUtf8` is declared on every ISP profile in the delivery
 * optimizer and was read by nothing, so an address like `user@例え.jp` went
 * straight into `dns.resolveMx()` — which resolves nothing — and into the SMTP
 * envelope.
 *
 * The two halves of an address need opposite treatment, and that distinction
 * is what these tests pin:
 *   - a DOMAIN always has an ASCII form, so punycode it and delivery works
 *     against every server ever written
 *   - a LOCAL PART has no ASCII form, so a receiver without SMTPUTF8 cannot
 *     accept it by any encoding, and pretending otherwise just earns a
 *     rejection that counts against our sending reputation
 */

import { describe, it, expect } from "vitest";
import {
  toAsciiDomain,
  normalizeAddress,
  smtpUtf8Blocker,
} from "../src/address/idna.js";

describe("toAsciiDomain", () => {
  it("converts an internationalized domain to its A-label", () => {
    expect(toAsciiDomain("例え.jp")).toBe("xn--r8jz45g.jp");
    expect(toAsciiDomain("münchen.de")).toBe("xn--mnchen-3ya.de");
  });

  it("leaves an ASCII domain alone apart from case", () => {
    expect(toAsciiDomain("Example.COM")).toBe("example.com");
    expect(toAsciiDomain("mail.example.co.uk")).toBe("mail.example.co.uk");
  });

  it("passes through an already-punycoded domain unchanged", () => {
    expect(toAsciiDomain("xn--r8jz45g.jp")).toBe("xn--r8jz45g.jp");
  });

  it("returns the input rather than an empty string when conversion fails", () => {
    // domainToASCII answers "" for input it cannot handle. Substituting that
    // would turn a bad address into a lookup against nothing, which is a
    // worse and much more confusing failure than a normal DNS error.
    expect(toAsciiDomain("..")).not.toBe("");
  });

  it("handles an empty domain without throwing", () => {
    expect(toAsciiDomain("")).toBe("");
    expect(toAsciiDomain("   ")).toBe("");
  });
});

describe("normalizeAddress", () => {
  it("puts the domain in ASCII while leaving the local part alone", () => {
    const normalized = normalizeAddress("user@例え.jp");
    expect(normalized.address).toBe("user@xn--r8jz45g.jp");
    expect(normalized.localPart).toBe("user");
    expect(normalized.domain).toBe("xn--r8jz45g.jp");
    expect(normalized.requiresSmtpUtf8).toBe(false);
  });

  it("flags a non-ASCII local part as needing SMTPUTF8", () => {
    const normalized = normalizeAddress("héllo@example.com");
    expect(normalized.requiresSmtpUtf8).toBe(true);
    // The domain is still normalized even though the address is unsendable
    // to a non-SMTPUTF8 host — the two halves are independent.
    expect(normalized.domain).toBe("example.com");
  });

  it("splits on the LAST @, since a local part may contain one when quoted", () => {
    const normalized = normalizeAddress('"odd@name"@example.com');
    expect(normalized.domain).toBe("example.com");
    expect(normalized.localPart).toBe('"odd@name"');
  });

  it("does not throw on an address with no @", () => {
    // This runs per recipient in the delivery path; a malformed address
    // should fail at the SMTP conversation with a real remote response.
    expect(() => normalizeAddress("not-an-address")).not.toThrow();
  });
});

describe("smtpUtf8Blocker", () => {
  it("allows an ordinary address anywhere", () => {
    expect(smtpUtf8Blocker("user@example.com", false)).toBeNull();
    expect(smtpUtf8Blocker("user@example.com", true)).toBeNull();
  });

  it("allows an internationalized DOMAIN even without SMTPUTF8", () => {
    // The whole point of punycode: this needs no extension at all.
    expect(smtpUtf8Blocker("user@例え.jp", false)).toBeNull();
  });

  it("blocks a non-ASCII LOCAL PART when the server lacks SMTPUTF8", () => {
    const reason = smtpUtf8Blocker("héllo@example.com", false);
    expect(reason).toContain("SMTPUTF8");
  });

  it("allows a non-ASCII local part when the server advertises SMTPUTF8", () => {
    expect(smtpUtf8Blocker("héllo@example.com", true)).toBeNull();
  });
});
