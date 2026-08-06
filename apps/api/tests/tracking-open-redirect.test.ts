/**
 * Regression tests for the click-tracking open redirect.
 *
 * `GET /t/:emailId/click?url=…` used to redirect anywhere, checking only that
 * the protocol was http(s) — under a comment claiming it prevented an open
 * redirect. Anyone could hand api.alecrae.com an arbitrary https URL and get a
 * 302 to it from our domain, which is the primitive phishers harvest to
 * launder links past URL-reputation filters. The cost lands on the host:
 * Safe Browsing flags the domain, blocklists follow, and for a mail sender
 * that is the whole business.
 *
 * Verified here:
 *  1. A link we minted verifies and is accepted
 *  2. An attacker-supplied URL with no signature is refused
 *  3. A signature from a DIFFERENT url does not transfer
 *  4. A signature from a DIFFERENT email does not transfer (per-message
 *     binding, so one leaked link is not a universal redirector)
 *  5. Tampering with any part of the signature fails
 *  6. Malformed input is refused rather than throwing — this endpoint is
 *     unauthenticated and reachable by anyone
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  signTrackedUrl,
  verifyTrackedUrl,
  buildTrackedUrl,
  SIGNATURE_PARAM,
} from "../src/lib/tracking-link.js";

const EMAIL_ID = "eml_01HZY8QK3M4N5P6R7S8T9V0W1X";
const OTHER_EMAIL_ID = "eml_01HZY8QK3M4N5P6R7S8T9V0W2Y";
const REAL_URL = "https://customer.example.com/offer?id=42";
const ATTACKER_URL = "https://phishing.example/login";

beforeAll(() => {
  process.env["JWT_SECRET"] = "a".repeat(48);
});

describe("tracked link signing", () => {
  it("accepts a link this server actually minted", () => {
    const signature = signTrackedUrl(EMAIL_ID, REAL_URL);
    expect(verifyTrackedUrl(EMAIL_ID, REAL_URL, signature)).toBe(true);
  });

  it("embeds a verifiable signature in the rewritten href", () => {
    const tracked = buildTrackedUrl("https://api.alecrae.com", EMAIL_ID, REAL_URL);
    const parsed = new URL(tracked);

    const url = parsed.searchParams.get("url");
    const signature = parsed.searchParams.get(SIGNATURE_PARAM);
    expect(url).toBe(REAL_URL);
    expect(signature).toBeTruthy();
    expect(verifyTrackedUrl(EMAIL_ID, url ?? "", signature ?? undefined)).toBe(true);
  });

  it("keeps the original URL intact through encoding, query string and all", () => {
    const tricky = "https://example.com/a?b=c&d=e%20f#frag";
    const tracked = buildTrackedUrl("https://api.alecrae.com", EMAIL_ID, tricky);
    const url = new URL(tracked).searchParams.get("url");
    expect(url).toBe(tricky);
  });
});

describe("open-redirect refusal", () => {
  it("refuses a URL with no signature — the original bug", () => {
    expect(verifyTrackedUrl(EMAIL_ID, ATTACKER_URL, undefined)).toBe(false);
    expect(verifyTrackedUrl(EMAIL_ID, ATTACKER_URL, "")).toBe(false);
  });

  it("refuses an attacker URL carrying a signature for a different URL", () => {
    // The realistic attack: take a legitimate tracked link out of a real
    // email, swap the destination, keep the signature.
    const stolen = signTrackedUrl(EMAIL_ID, REAL_URL);
    expect(verifyTrackedUrl(EMAIL_ID, ATTACKER_URL, stolen)).toBe(false);
  });

  it("does not let a signature transfer between messages", () => {
    const forThisEmail = signTrackedUrl(EMAIL_ID, REAL_URL);
    expect(verifyTrackedUrl(OTHER_EMAIL_ID, REAL_URL, forThisEmail)).toBe(false);
  });

  it("refuses a tampered signature", () => {
    const signature = signTrackedUrl(EMAIL_ID, REAL_URL);
    const flipped =
      (signature[0] === "a" ? "b" : "a") + signature.slice(1);
    expect(verifyTrackedUrl(EMAIL_ID, REAL_URL, flipped)).toBe(false);
  });

  it("refuses a truncated or overlong signature without throwing", () => {
    const signature = signTrackedUrl(EMAIL_ID, REAL_URL);
    // A length mismatch makes timingSafeEqual throw; it must be caught and
    // reported as an ordinary failure, not a 500 on a public endpoint.
    expect(verifyTrackedUrl(EMAIL_ID, REAL_URL, signature.slice(0, 8))).toBe(false);
    expect(verifyTrackedUrl(EMAIL_ID, REAL_URL, `${signature}extra`)).toBe(false);
    expect(verifyTrackedUrl(EMAIL_ID, REAL_URL, "%%%%")).toBe(false);
  });
});

describe("signature construction", () => {
  it("is stable for the same inputs", () => {
    expect(signTrackedUrl(EMAIL_ID, REAL_URL)).toBe(
      signTrackedUrl(EMAIL_ID, REAL_URL),
    );
  });

  it("does not leak the key length or shape", () => {
    const signature = signTrackedUrl(EMAIL_ID, REAL_URL);
    expect(signature).toMatch(/^[0-9a-f]{32}$/);
    expect(signature).not.toContain(process.env["JWT_SECRET"] ?? "unset");
  });
});
