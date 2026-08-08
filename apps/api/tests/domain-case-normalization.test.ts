/**
 * Domain names are case-insensitive (DNS + email), but the add path stored
 * them verbatim while every consumer (mailbox provisioning, the send path,
 * inbound routing) extracts a lowercase domain from an email address and
 * compared it case-sensitively. Result: a domain added as "Davenroe.com"
 * could never have a mailbox provisioned on it (`info@davenroe.com` →
 * "davenroe.com" ≠ "Davenroe.com"), and its sends/receives would fail the
 * same comparison. This pins both halves of the fix:
 *   (1) AddDomainSchema normalises to lowercase on write, and
 *   (2) the lookups compare case-insensitively so a pre-existing mixed-case
 *       row still resolves.
 */

import { describe, it, expect } from "vitest";
import { AddDomainSchema } from "../src/types.js";

describe("AddDomainSchema — lowercase normalisation on write", () => {
  it("lowercases a mixed-case domain", () => {
    const parsed = AddDomainSchema.parse({ domain: "Davenroe.com" });
    expect(parsed.domain).toBe("davenroe.com");
  });

  it("lowercases an all-caps domain and trims whitespace", () => {
    const parsed = AddDomainSchema.parse({ domain: "  GATETEST.IO  " });
    expect(parsed.domain).toBe("gatetest.io");
  });

  it("leaves an already-lowercase domain unchanged", () => {
    const parsed = AddDomainSchema.parse({ domain: "gluecron.com" });
    expect(parsed.domain).toBe("gluecron.com");
  });

  it("still rejects a structurally invalid domain", () => {
    expect(() => AddDomainSchema.parse({ domain: "not a domain" })).toThrow();
    expect(() => AddDomainSchema.parse({ domain: "" })).toThrow();
  });
});
