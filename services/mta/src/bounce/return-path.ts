/**
 * Return-Path (envelope sender) construction — VERP for bounce correlation.
 *
 * WHY (Known Issue #82(a))
 * ------------------------
 * The worker passed the message's own `From:` address as the SMTP envelope
 * sender (MAIL FROM). Asynchronous bounces — the DSN a receiving server sends
 * back minutes or hours after it accepted the message — are delivered to the
 * envelope sender, so every one of them went to the CUSTOMER's own inbox and
 * never reached our bounce processor.
 *
 * The consequence is the single biggest driver of a blocklisting: our
 * suppression list only ever learned about *synchronous* rejections, so we
 * would keep sending to addresses we had already been told are dead. Mailbox
 * providers read repeat delivery to dead addresses as a spammer signature.
 *
 * The DNS layer already builds and verifies the record this depends on —
 * `bounce.<customer-domain>` CNAME'd to our return-path host (see
 * services/dns/src/auto-config.ts, which even exposes `returnPathDomain`).
 * Nothing ever used it. This module closes that gap.
 *
 * WHY THIS SHAPE OF ADDRESS
 * -------------------------
 *   bounces+<emailId>@bounce.<sender-domain>
 *
 * The emailId is carried in the local part, so an incoming DSN identifies the
 * exact message that bounced without any lookup table. Plus-addressing is the
 * widely-supported form and survives the intermediaries that mangle other VERP
 * encodings.
 *
 * Using the CUSTOMER's `bounce.<domain>` rather than a single shared
 * `bounce.alecrae.com` matters for authentication:
 *
 *   - SPF authenticates the MAIL FROM domain. `bounce.customer.com` CNAMEs to
 *     our return-path host, so it resolves to our SPF record and passes.
 *   - DMARC needs the From: domain to align with SPF or DKIM.
 *     `bounce.customer.com` and `customer.com` share an organizational domain,
 *     so SPF aligns under the relaxed policy — on top of the DKIM alignment we
 *     already get from signing with the customer's key. Both legs pass rather
 *     than just one.
 *
 * A single shared bounce domain would have broken SPF alignment for every
 * customer, leaving DKIM as the only DMARC leg.
 */

/** Local-part prefix. Kept short and static so parsing is unambiguous. */
const VERP_PREFIX = "bounces";

/** Subdomain the customer CNAMEs to our return-path host. */
const BOUNCE_SUBDOMAIN = "bounce";

/**
 * Build the envelope sender for a message.
 *
 * Falls back to the supplied `fallbackFrom` when no sender domain is known —
 * an envelope sender is mandatory for delivery, so this must never return an
 * empty string or throw. A message sent without VERP still delivers; it just
 * loses async-bounce correlation, which is strictly better than not sending.
 */
export function buildReturnPath(
  emailId: string,
  senderDomain: string | null | undefined,
  fallbackFrom: string,
): string {
  const domain = (senderDomain ?? "").trim().toLowerCase();
  if (!domain || !emailId) return fallbackFrom;

  // Guard against a domain that already carries the bounce subdomain, so a
  // requeued message cannot accumulate `bounce.bounce.<domain>`.
  const base = domain.startsWith(`${BOUNCE_SUBDOMAIN}.`)
    ? domain.slice(BOUNCE_SUBDOMAIN.length + 1)
    : domain;

  // The emailId is a UUID in practice; strip anything that would need quoting
  // in a local part rather than emitting an address a remote MTA may reject.
  const safeId = emailId.replace(/[^A-Za-z0-9._-]/g, "");
  if (!safeId) return fallbackFrom;

  return `${VERP_PREFIX}+${safeId}@${BOUNCE_SUBDOMAIN}.${base}`;
}

export interface ParsedReturnPath {
  /** The email id encoded in the local part. */
  emailId: string;
  /** The customer domain the bounce subdomain belongs to. */
  senderDomain: string;
}

/**
 * Recover the email id from a VERP envelope sender.
 *
 * Used by the inbound path to attribute an incoming DSN to the message that
 * caused it. Returns null for anything that is not one of our VERP addresses,
 * so a non-VERP bounce falls through to the existing content-based parsing.
 */
export function parseReturnPath(address: string): ParsedReturnPath | null {
  const trimmed = address.trim().replace(/^<|>$/g, "").toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;

  const localPart = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (!domain.startsWith(`${BOUNCE_SUBDOMAIN}.`)) return null;

  const plus = localPart.indexOf("+");
  if (plus <= 0) return null;
  if (localPart.slice(0, plus) !== VERP_PREFIX) return null;

  const emailId = localPart.slice(plus + 1);
  if (!emailId) return null;

  return {
    emailId,
    senderDomain: domain.slice(BOUNCE_SUBDOMAIN.length + 1),
  };
}
