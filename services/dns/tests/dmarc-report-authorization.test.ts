/**
 * Tests for the DMARC External Destination Verification record (RFC 7489 §7.1).
 *
 * We publish `_dmarc.customer.com` with `rua=mailto:dmarc@alecrae.com`. That
 * crosses an organizational boundary, so the receiving domain must opt in with
 * a `_report._dmarc` record before a reporter will send anything — Google,
 * Microsoft and Yahoo all enforce this. Without it every customer domain
 * publishes DMARC and we receive no aggregate reports at all, silently.
 *
 * Aggregate reports are how we learn who is spoofing a customer's domain and
 * whether our mail passes SPF/DKIM alignment in the wild, so losing them means
 * losing the signal that turns a deliverability problem into something we
 * notice before receivers start rejecting.
 */

import { describe, it, expect } from "vitest";
import { deriveDmarcReportAuthorization, getDnsConfig } from "../src/config";

describe("deriveDmarcReportAuthorization", () => {
  it("derives the wildcard record from a mailto: rua", () => {
    const auth = deriveDmarcReportAuthorization("mailto:dmarc@alecrae.com");
    expect(auth).toEqual({
      name: "*._report._dmarc.alecrae.com",
      type: "TXT",
      value: "v=DMARC1",
      publishOn: "alecrae.com",
    });
  });

  it("accepts a rua given without the mailto: prefix", () => {
    const auth = deriveDmarcReportAuthorization("dmarc@alecrae.com");
    expect(auth?.name).toBe("*._report._dmarc.alecrae.com");
  });

  it("lower-cases the host so the record name is canonical", () => {
    const auth = deriveDmarcReportAuthorization("mailto:DMARC@AlecRae.COM");
    expect(auth?.name).toBe("*._report._dmarc.alecrae.com");
  });

  it("uses a wildcard rather than one record per customer domain", () => {
    // A per-domain record would mean a DNS write in our zone on every
    // onboarding — a step that would be forgotten, and whose absence is
    // invisible until someone notices reports never arrived.
    const auth = deriveDmarcReportAuthorization("mailto:dmarc@alecrae.com");
    expect(auth?.name.startsWith("*.")).toBe(true);
  });

  it("returns null when no host can be derived, rather than a bad record", () => {
    expect(deriveDmarcReportAuthorization("not-an-address")).toBeNull();
    expect(deriveDmarcReportAuthorization("mailto:")).toBeNull();
    expect(deriveDmarcReportAuthorization("")).toBeNull();
  });
});

describe("getDnsConfig", () => {
  it("exposes the authorization record alongside the DMARC value it depends on", () => {
    const config = getDnsConfig({});
    expect(config.dmarcValue).toContain("rua=mailto:dmarc@alecrae.com");
    expect(config.dmarcReportAuthorization?.name).toBe(
      "*._report._dmarc.alecrae.com",
    );
  });

  it("tracks a custom rua so the two can never disagree", () => {
    const config = getDnsConfig({ DNS_DMARC_RUA: "reports@mail.example.net" });
    expect(config.dmarcValue).toContain("rua=mailto:reports@mail.example.net");
    expect(config.dmarcReportAuthorization?.publishOn).toBe("mail.example.net");
    expect(config.dmarcReportAuthorization?.name).toBe(
      "*._report._dmarc.mail.example.net",
    );
  });
});
