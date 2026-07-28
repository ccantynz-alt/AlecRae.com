/**
 * @alecrae/mta — Internationalized address handling (IDNA / SMTPUTF8).
 *
 * There was no handling of internationalized addresses anywhere in the
 * outbound path. `supportsSmtpUtf8` is declared on every ISP profile in
 * delivery/optimizer.ts and read by nothing, and no punycode conversion
 * existed, so an address like `user@例え.jp` was passed straight to
 * `dns.resolveMx()` and into the SMTP envelope.
 *
 * The two halves of an address have very different answers:
 *
 * **The domain** always has an ASCII form. IDNA punycode (`例え.jp` →
 * `xn--r8jz45g.jp`) is exactly what DNS and SMTP expect, works against every
 * server ever written, and needs no extension negotiation. There is no reason
 * not to do it, and not doing it means the MX lookup fails outright.
 *
 * **The local part** has no ASCII form. `héllo@example.com` genuinely
 * requires the SMTPUTF8 extension, and a receiver without it cannot accept
 * that address by any encoding. The honest move is to detect it and say so,
 * rather than send something we know will be rejected — a rejection we caused
 * still counts against our sending reputation.
 */

import { domainToASCII } from "node:url";

export interface NormalizedAddress {
  /** The address with its domain converted to an ASCII A-label. */
  readonly address: string;
  /** Local part, unchanged. */
  readonly localPart: string;
  /** Domain as an ASCII A-label. */
  readonly domain: string;
  /**
   * True when the local part contains non-ASCII characters, which cannot be
   * encoded and so require the receiver to advertise SMTPUTF8.
   */
  readonly requiresSmtpUtf8: boolean;
}

/**
 * Convert a domain to its ASCII A-label form.
 *
 * Returns the input lower-cased when it is already ASCII, and when conversion
 * fails — `domainToASCII` answers `""` for input it cannot handle, and
 * silently replacing a domain with the empty string would turn a bad address
 * into a lookup against nothing.
 */
export function toAsciiDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (trimmed === "") return trimmed;

  // Matching control characters is intentional: this detects anything
  // outside the ASCII range, control characters included.
  // eslint-disable-next-line no-control-regex
  if (/^[\u0000-\u007F]*$/.test(trimmed)) return trimmed;

  const ascii = domainToASCII(trimmed);
  return ascii === "" ? trimmed : ascii;
}

/**
 * Split an address and put its domain into ASCII form.
 *
 * Never throws: this runs per recipient in the delivery path, and an address
 * malformed enough to have no `@` should fail at the SMTP conversation with a
 * real remote response, not here.
 */
export function normalizeAddress(address: string): NormalizedAddress {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf("@");

  if (at === -1) {
    return {
      address: trimmed,
      localPart: trimmed,
      domain: "",
      requiresSmtpUtf8: hasNonAscii(trimmed),
    };
  }

  const localPart = trimmed.slice(0, at);
  const domain = toAsciiDomain(trimmed.slice(at + 1));

  return {
    address: `${localPart}@${domain}`,
    localPart,
    domain,
    requiresSmtpUtf8: hasNonAscii(localPart),
  };
}

function hasNonAscii(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- see toAsciiDomain.
  return !/^[\u0000-\u007F]*$/.test(value);
}

/**
 * Can this recipient be delivered to a server with the given SMTPUTF8
 * support? Returns null when it can, or a human-readable reason when it
 * cannot.
 *
 * Only the local part can make delivery impossible — the domain is always
 * encodable, so an internationalized domain never blocks a send.
 */
export function smtpUtf8Blocker(
  address: string,
  remoteSupportsSmtpUtf8: boolean,
): string | null {
  if (remoteSupportsSmtpUtf8) return null;

  const normalized = normalizeAddress(address);
  if (!normalized.requiresSmtpUtf8) return null;

  return (
    `Recipient local part requires the SMTPUTF8 extension, which this server ` +
    `does not advertise. There is no ASCII encoding for a non-ASCII local part, ` +
    `so the address cannot be delivered to this host.`
  );
}
