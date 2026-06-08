/**
 * SSRF Guard — protects server-side URL fetching from Server-Side Request Forgery.
 *
 * Used by the link-preview route (and any other code that fetches user-supplied
 * URLs) to ensure a fetch never reaches internal services, cloud metadata
 * endpoints, loopback, or other reserved network ranges.
 *
 * The guard:
 *   1. Enforces http/https scheme only.
 *   2. Resolves the hostname via DNS (A + AAAA) and rejects if ANY resolved
 *      IP falls in a private/loopback/link-local/unique-local/multicast/
 *      reserved range (IPv4 AND IPv6), including the cloud-metadata IP
 *      169.254.169.254.
 *   3. Fetches with redirects DISABLED and re-validates every redirect hop's
 *      URL before following it (capped), so a public URL cannot redirect into
 *      an internal one.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { err, ok, type Result } from "@alecrae/shared";

// ─── Block reasons ──────────────────────────────────────────────────────────

export type SsrfBlockReason =
  | "invalid_url"
  | "scheme_not_allowed"
  | "dns_resolution_failed"
  | "ip_blocked"
  | "too_many_redirects"
  | "redirect_missing_location";

/** A typed description of why a URL (or one of its redirect hops) was blocked. */
export interface SsrfBlock {
  readonly reason: SsrfBlockReason;
  /** The URL that triggered the block. */
  readonly url: string;
  /** The offending IP, when the block was caused by a resolved address. */
  readonly ip?: string;
  /** Human-readable detail for logging. */
  readonly detail: string;
}

/** Result of an SSRF validation: ok with the validated absolute URL, or a typed block. */
export type SsrfResult<T> = Result<T, SsrfBlock>;

// ─── Configuration ────────────────────────────────────────────────────────────

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/** Maximum number of redirect hops to follow before giving up. */
const DEFAULT_MAX_REDIRECTS = 3;

// ─── IP range checks ──────────────────────────────────────────────────────────

/**
 * Parse a dotted-quad IPv4 string into its 4 octets, or null if malformed.
 */
function parseIpv4Octets(ip: string): readonly [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  const [a, b, c, d] = octets;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return null;
  }
  return [a, b, c, d];
}

/**
 * Returns true if the given IPv4 address is in a private, loopback, link-local,
 * multicast, or otherwise reserved range that must never be reachable via SSRF.
 *
 * Blocked IPv4 ranges:
 *   0.0.0.0/8          "this host" / unspecified
 *   10.0.0.0/8         RFC1918 private
 *   100.64.0.0/10      RFC6598 carrier-grade NAT
 *   127.0.0.0/8        loopback
 *   169.254.0.0/16     link-local (incl. cloud metadata 169.254.169.254)
 *   172.16.0.0/12      RFC1918 private
 *   192.0.0.0/24       IETF protocol assignments
 *   192.0.2.0/24       TEST-NET-1
 *   192.88.99.0/24     6to4 relay anycast
 *   192.168.0.0/16     RFC1918 private
 *   198.18.0.0/15      benchmarking
 *   198.51.100.0/24    TEST-NET-2
 *   203.0.113.0/24     TEST-NET-3
 *   224.0.0.0/4        multicast
 *   240.0.0.0/4        reserved (incl. 255.255.255.255 broadcast)
 */
function isBlockedIpv4(ip: string): boolean {
  const octets = parseIpv4Octets(ip);
  if (octets === null) return true; // fail closed on unparseable
  const [a, b] = octets;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && octets[2] === 2) return true; // 192.0.2.0/24
  if (a === 192 && b === 88 && octets[2] === 99) return true; // 192.88.99.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51 && octets[2] === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && octets[2] === 113) return true; // 203.0.113.0/24
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved

  return false;
}

/**
 * Expand an IPv6 address string into its 8 16-bit groups, handling "::"
 * compression and embedded IPv4 (e.g. ::ffff:1.2.3.4). Returns null on malformed.
 */
function parseIpv6Groups(ip: string): number[] | null {
  let address = ip;
  // Strip zone id (e.g. fe80::1%eth0)
  const zoneIdx = address.indexOf("%");
  if (zoneIdx !== -1) address = address.slice(0, zoneIdx);

  // Handle embedded IPv4 tail (::ffff:1.2.3.4 or 64:ff9b::1.2.3.4)
  const lastColon = address.lastIndexOf(":");
  const tail = lastColon === -1 ? "" : address.slice(lastColon + 1);
  let ipv4Tail: readonly [number, number, number, number] | null = null;
  if (tail.includes(".")) {
    ipv4Tail = parseIpv4Octets(tail);
    if (ipv4Tail === null) return null;
    address = address.slice(0, lastColon + 1);
  }

  const hasCompression = address.includes("::");
  const compressionParts = hasCompression ? address.split("::", 2) : [address, ""];
  const headStr = compressionParts[0] ?? "";
  const tailStr = compressionParts[1] ?? "";

  function toGroups(segment: string): number[] | null {
    if (segment === "") return [];
    const groups: number[] = [];
    for (const part of segment.split(":")) {
      if (part === "") return null;
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
      groups.push(parseInt(part, 16));
    }
    return groups;
  }

  const head = toGroups(headStr.replace(/:$/, ""));
  const tailGroups = toGroups(tailStr.replace(/^:/, ""));
  if (head === null || tailGroups === null) return null;

  const ipv4Groups: number[] = ipv4Tail
    ? [(ipv4Tail[0] << 8) | ipv4Tail[1], (ipv4Tail[2] << 8) | ipv4Tail[3]]
    : [];

  const fixedCount = head.length + tailGroups.length + ipv4Groups.length;

  if (hasCompression) {
    const zeros = 8 - fixedCount;
    if (zeros < 0) return null;
    const result = [...head, ...new Array<number>(zeros).fill(0), ...tailGroups, ...ipv4Groups];
    return result.length === 8 ? result : null;
  }

  const result = [...head, ...ipv4Groups];
  return result.length === 8 ? result : null;
}

/**
 * Returns true if the given IPv6 address is loopback, unspecified, link-local,
 * unique-local, multicast, or an IPv4-mapped/translated address pointing at a
 * blocked IPv4 range.
 *
 * Blocked IPv6 ranges:
 *   ::/128             unspecified
 *   ::1/128            loopback
 *   ::ffff:0:0/96      IPv4-mapped (delegated to IPv4 check)
 *   64:ff9b::/96       IPv4/IPv6 translation (delegated to IPv4 check)
 *   100::/64           discard-only
 *   2001:db8::/32      documentation
 *   fc00::/7           unique local (fc00::/8 + fd00::/8)
 *   fe80::/10          link-local
 *   ff00::/8           multicast
 */
function isBlockedIpv6(ip: string): boolean {
  const groups = parseIpv6Groups(ip);
  if (groups === null) return true; // fail closed on unparseable
  const [g0, g1] = groups;

  // ::/128 unspecified and ::1/128 loopback
  const allButLastZero = groups.slice(0, 7).every((g) => g === 0);
  if (allButLastZero && (groups[7] === 0 || groups[7] === 1)) return true;

  // IPv4-mapped ::ffff:0:0/96 → check the embedded IPv4
  const isV4Mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  // 64:ff9b::/96 translation
  const isV4Translated =
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0;
  if (isV4Mapped || isV4Translated) {
    const g6 = groups[6];
    const g7 = groups[7];
    if (g6 === undefined || g7 === undefined) return true; // fail closed
    const v4a = (g6 >> 8) & 0xff;
    const v4b = g6 & 0xff;
    const v4c = (g7 >> 8) & 0xff;
    const v4d = g7 & 0xff;
    return isBlockedIpv4(`${v4a}.${v4b}.${v4c}.${v4d}`);
  }

  if (g0 === undefined) return true;
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // 2001:db8::/32 documentation
  if (g0 === 0x0100 && g1 === 0 && groups[2] === 0 && groups[3] === 0) return true; // 100::/64 discard

  return false;
}

/**
 * Returns true if the given IP literal (v4 or v6) is in a blocked range.
 * Exported for testing.
 */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal → fail closed
}

// ─── URL validation ───────────────────────────────────────────────────────────

/**
 * Validate a single absolute URL: scheme + DNS resolution + IP range checks.
 * Returns the parsed URL on success, or a typed SsrfBlock.
 */
export async function validateUrl(rawUrl: string): Promise<SsrfResult<URL>> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return err({
      reason: "invalid_url",
      url: rawUrl,
      detail: "URL could not be parsed",
    });
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return err({
      reason: "scheme_not_allowed",
      url: rawUrl,
      detail: `Scheme "${parsed.protocol}" is not http/https`,
    });
  }

  const hostname = parsed.hostname;

  // If the hostname is already an IP literal, check it directly (strip brackets
  // from IPv6 literals like [::1]).
  const literal = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (isIP(literal) !== 0) {
    if (isBlockedIp(literal)) {
      return err({
        reason: "ip_blocked",
        url: rawUrl,
        ip: literal,
        detail: `IP literal ${literal} is in a blocked range`,
      });
    }
    return ok(parsed);
  }

  // Resolve all A and AAAA records; reject if ANY is blocked.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return err({
      reason: "dns_resolution_failed",
      url: rawUrl,
      detail: `DNS resolution failed for ${hostname}`,
    });
  }

  if (addresses.length === 0) {
    return err({
      reason: "dns_resolution_failed",
      url: rawUrl,
      detail: `No addresses resolved for ${hostname}`,
    });
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      return err({
        reason: "ip_blocked",
        url: rawUrl,
        ip: address,
        detail: `${hostname} resolves to blocked IP ${address}`,
      });
    }
  }

  return ok(parsed);
}

// ─── Safe fetch ─────────────────────────────────────────────────────────────

export interface SafeFetchOptions {
  /** Standard fetch headers to send. */
  readonly headers?: Record<string, string>;
  /** AbortSignal for timeout/cancellation. */
  readonly signal?: AbortSignal;
  /** Maximum redirect hops to follow (default 3). */
  readonly maxRedirects?: number;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Fetch a user-supplied URL with SSRF protection.
 *
 * Redirects are followed manually: each hop is re-validated through
 * {@link validateUrl} before the next request is made, so a public URL cannot
 * redirect into an internal target. Returns the final Response on success, or a
 * typed SsrfBlock if the original URL or any hop is blocked / the redirect chain
 * is too long.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SsrfResult<Response>> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = rawUrl;
  let hops = 0;

  for (;;) {
    const validation = await validateUrl(currentUrl);
    if (!validation.ok) return validation;

    const fetchInit: RequestInit = {
      redirect: "manual",
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };

    const response = await fetch(validation.value.href, fetchInit);

    if (!isRedirectStatus(response.status)) {
      return ok(response);
    }

    if (hops >= maxRedirects) {
      return err({
        reason: "too_many_redirects",
        url: currentUrl,
        detail: `Exceeded ${maxRedirects} redirect hops`,
      });
    }

    const location = response.headers.get("location");
    if (location === null || location.length === 0) {
      return err({
        reason: "redirect_missing_location",
        url: currentUrl,
        detail: `Redirect status ${response.status} with no Location header`,
      });
    }

    // Resolve relative redirects against the current URL.
    let nextUrl: string;
    try {
      nextUrl = new URL(location, validation.value).href;
    } catch {
      return err({
        reason: "invalid_url",
        url: location,
        detail: "Redirect Location is not a valid URL",
      });
    }

    currentUrl = nextUrl;
    hops += 1;
  }
}
