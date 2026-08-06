/**
 * Signed click-tracking links.
 *
 * `GET /t/:emailId/click?url=…` redirects the recipient to the original link.
 * It used to accept ANY url, checking only that the protocol was http(s) —
 * under a comment that read "Validate URL to prevent open redirect". It did
 * not: `https://api.alecrae.com/t/anything/click?url=https://phishing.example`
 * returned a 302 to anywhere, from our own domain.
 *
 * That is not a theoretical problem for a mail sender. Open redirects on
 * reputable domains are actively harvested and used to launder phishing links
 * past URL-reputation filters, and the cost lands on the host: Google Safe
 * Browsing and Microsoft SmartScreen flag the domain, and blocklists follow.
 * For a product whose entire deliverability depends on domain reputation, an
 * open redirect is a self-inflicted blocklisting waiting to happen.
 *
 * The fix is to make the redirect target unforgeable: every tracked link
 * carries an HMAC over (emailId, url) that only this server can produce, and
 * the redirect refuses anything that does not verify. A URL we never put in an
 * email cannot be signed, so it cannot be redirected to.
 *
 * Keyed on JWT_SECRET — required and length-checked in production by
 * lib/env.ts — with a purpose string mixed in so a tracking signature can
 * never be confused with, or replayed as, an auth token.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Domain separator: keeps this HMAC distinct from every other JWT_SECRET use. */
const SIGNATURE_PURPOSE = "alecrae.click-tracking.v1";

/**
 * Truncated to 128 bits. Forging one still requires the key; the shorter tag
 * just keeps the rewritten links from bloating the message body, and 128 bits
 * is far beyond brute-forcing a per-link signature.
 */
const SIGNATURE_LENGTH = 32;

/** Query-parameter name carrying the signature. */
export const SIGNATURE_PARAM = "s";

function secret(): string {
  const value = process.env["JWT_SECRET"];
  if (!value) {
    // Dev/test only: production boot fails without JWT_SECRET (lib/env.ts), so
    // this branch cannot ship. A fixed fallback keeps local dev working
    // without making an unsigned link verifiable in production.
    return "alecrae-development-only-tracking-key";
  }
  return value;
}

/** Compute the signature for one (emailId, url) pair. */
export function signTrackedUrl(emailId: string, url: string): string {
  return createHmac("sha256", secret())
    .update(`${SIGNATURE_PURPOSE}:${emailId}:${url}`)
    .digest("hex")
    .slice(0, SIGNATURE_LENGTH);
}

/**
 * Verify a signature against the (emailId, url) it claims to cover.
 *
 * Compared in constant time. Returns false rather than throwing on any
 * malformed input — this runs on an unauthenticated endpoint that anyone on
 * the internet can call with arbitrary values.
 */
export function verifyTrackedUrl(
  emailId: string,
  url: string,
  signature: string | undefined,
): boolean {
  if (!signature) return false;

  const expected = signTrackedUrl(emailId, url);
  // timingSafeEqual throws on a length mismatch, which would itself leak
  // length — check first and bail with the same `false` as any other failure.
  if (signature.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Build the tracked replacement for one link in an outbound message.
 *
 * `apiBaseUrl` is the public API origin — validated in production by
 * lib/env.ts to be https and not localhost, because it ends up in real mail.
 */
export function buildTrackedUrl(
  apiBaseUrl: string,
  emailId: string,
  url: string,
): string {
  const signature = signTrackedUrl(emailId, url);
  return (
    `${apiBaseUrl}/t/${encodeURIComponent(emailId)}/click` +
    `?url=${encodeURIComponent(url)}&${SIGNATURE_PARAM}=${signature}`
  );
}
