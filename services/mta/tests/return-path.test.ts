/**
 * Tests for VERP envelope-sender construction/parsing (Known Issue #82(a)).
 *
 * The worker used the message's own From: address as MAIL FROM, so
 * asynchronous bounce DSNs were delivered to the customer's inbox and never
 * reached our bounce processor. Suppression therefore only ever learned about
 * synchronous rejections, and we would keep mailing addresses already reported
 * dead — the clearest blocklisting signal there is.
 *
 * The round trip is what matters: an address we emit must be one we can later
 * attribute back to the exact message that bounced.
 */

import { describe, it, expect } from 'vitest';
import { buildReturnPath, parseReturnPath } from '../src/bounce/return-path.js';

const EMAIL_ID = '018f2c3d-4b5a-7c8d-9e0f-1a2b3c4d5e6f';

describe('buildReturnPath', () => {
  it('builds a VERP address on the customer bounce subdomain', () => {
    const rp = buildReturnPath(EMAIL_ID, 'customer.com', 'craig@customer.com');
    expect(rp).toBe(`bounces+${EMAIL_ID}@bounce.customer.com`);
  });

  it('uses the customer domain, not a shared one, so SPF and DMARC align', () => {
    // bounce.customer.com shares an organizational domain with customer.com, so
    // SPF aligns under the relaxed policy on top of DKIM. A single shared
    // bounce.alecrae.com would break SPF alignment for every customer.
    const rp = buildReturnPath(EMAIL_ID, 'customer.com', 'craig@customer.com');
    expect(rp.endsWith('@bounce.customer.com')).toBe(true);
    expect(rp).not.toContain('alecrae.com');
  });

  it('lowercases and trims the sender domain', () => {
    const rp = buildReturnPath(EMAIL_ID, '  CUSTOMER.COM  ', 'craig@customer.com');
    expect(rp).toBe(`bounces+${EMAIL_ID}@bounce.customer.com`);
  });

  it('does not double-prefix a domain that already carries the bounce subdomain', () => {
    const rp = buildReturnPath(EMAIL_ID, 'bounce.customer.com', 'craig@customer.com');
    expect(rp).toBe(`bounces+${EMAIL_ID}@bounce.customer.com`);
  });

  it('falls back to the From: address when no sender domain is known', () => {
    // An envelope sender is mandatory. Losing bounce correlation is strictly
    // better than failing to send.
    expect(buildReturnPath(EMAIL_ID, null, 'craig@customer.com')).toBe('craig@customer.com');
    expect(buildReturnPath(EMAIL_ID, '', 'craig@customer.com')).toBe('craig@customer.com');
    expect(buildReturnPath(EMAIL_ID, '   ', 'craig@customer.com')).toBe('craig@customer.com');
  });

  it('falls back when the email id is missing or unusable', () => {
    expect(buildReturnPath('', 'customer.com', 'craig@customer.com')).toBe('craig@customer.com');
    // An id of only characters that need quoting leaves nothing safe to encode.
    expect(buildReturnPath('@@@', 'customer.com', 'craig@customer.com')).toBe('craig@customer.com');
  });

  it('strips characters that would require quoting in a local part', () => {
    const rp = buildReturnPath('abc<>"def', 'customer.com', 'craig@customer.com');
    expect(rp).toBe('bounces+abcdef@bounce.customer.com');
  });
});

describe('parseReturnPath', () => {
  it('recovers the email id and customer domain', () => {
    const parsed = parseReturnPath(`bounces+${EMAIL_ID}@bounce.customer.com`);
    expect(parsed).toEqual({ emailId: EMAIL_ID, senderDomain: 'customer.com' });
  });

  it('round-trips whatever buildReturnPath emits', () => {
    const rp = buildReturnPath(EMAIL_ID, 'sub.customer.co.uk', 'craig@sub.customer.co.uk');
    expect(parseReturnPath(rp)).toEqual({
      emailId: EMAIL_ID,
      senderDomain: 'sub.customer.co.uk',
    });
  });

  it('tolerates angle brackets and surrounding whitespace', () => {
    // MAIL FROM values arrive wrapped in <> off the wire.
    const parsed = parseReturnPath(`  <bounces+${EMAIL_ID}@bounce.customer.com>  `);
    expect(parsed?.emailId).toBe(EMAIL_ID);
  });

  it('returns null for a non-VERP address so other bounce parsing still runs', () => {
    expect(parseReturnPath('craig@customer.com')).toBeNull();
    expect(parseReturnPath('postmaster@customer.com')).toBeNull();
  });

  it('returns null for a bounce subdomain without our prefix', () => {
    expect(parseReturnPath('someoneelse+123@bounce.customer.com')).toBeNull();
  });

  it('returns null for our prefix outside a bounce subdomain', () => {
    expect(parseReturnPath('bounces+123@customer.com')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseReturnPath('')).toBeNull();
    expect(parseReturnPath('not-an-address')).toBeNull();
    expect(parseReturnPath('@bounce.customer.com')).toBeNull();
    expect(parseReturnPath('bounces+@bounce.customer.com')).toBeNull();
  });
});
