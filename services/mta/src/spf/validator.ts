/**
 * SPF (Sender Policy Framework) Validator
 * Implements RFC 7208 — validates that sending IPs are authorized by domain SPF records.
 */

import * as dns from "node:dns/promises";
import * as net from "node:net";
import type {
  SpfResult,
  SpfCheckResult,
  SpfMechanism,
  SpfRecord,
  SpfQualifier,
  SpfMechanismType,
  Result,
} from "../types.js";
import { ok, err } from "../types.js";

const SPF_VERSION_TAG = "v=spf1";
const MAX_DNS_LOOKUPS = 10; // RFC 7208 Section 4.6.4 — void-lookup limit
const MAX_VOID_LOOKUPS = 2; // RFC 7208 Section 4.6.4
const MAX_RECURSION_DEPTH = 10; // safety net against pathological nesting

/**
 * Injectable DNS resolver — lets tests short-circuit real DNS calls without
 * any new third-party dependency. Production code uses `node:dns/promises`.
 */
export interface SpfDnsResolver {
  resolveTxt: (domain: string) => Promise<string[][]>;
  resolve4?: (domain: string) => Promise<string[]>;
  resolve6?: (domain: string) => Promise<string[]>;
  resolveMx?: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;
  reverse?: (ip: string) => Promise<string[]>;
}

const DEFAULT_RESOLVER: SpfDnsResolver = {
  resolveTxt: (d) => dns.resolveTxt(d),
  resolve4: (d) => dns.resolve4(d),
  resolve6: (d) => dns.resolve6(d),
  resolveMx: (d) => dns.resolveMx(d),
  reverse: (ip) => dns.reverse(ip),
};

interface SpfContext {
  senderIp: string;
  senderDomain: string;
  ehloIdentity: string;
  dnsLookupCount: number;
  voidLookupCount: number;
  resolver: SpfDnsResolver;
  /**
   * Set of domains currently being evaluated on the recursion stack.
   * Used to short-circuit circular include: / redirect= chains to permerror
   * per RFC 7208 §4.6.4 and §10.1 (processing limits).
   */
  visited: Set<string>;
  depth: number;
}

/**
 * Sentinel error thrown inside the SPF evaluator to escape a deep recursion
 * with a permanent error state. Caller maps to `permerror`.
 */
class SpfPermError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpfPermError";
  }
}

/**
 * Perform an SPF check for the given sender IP and domain.
 */
export async function checkSpf(
  senderIp: string,
  senderDomain: string,
  ehloIdentity: string = senderDomain,
  resolver: SpfDnsResolver = DEFAULT_RESOLVER,
): Promise<SpfCheckResult> {
  const ctx: SpfContext = {
    senderIp,
    senderDomain,
    ehloIdentity,
    dnsLookupCount: 0,
    voidLookupCount: 0,
    resolver,
    visited: new Set<string>(),
    depth: 0,
  };

  try {
    return await evaluateSpf(ctx, senderDomain);
  } catch (error) {
    // Permanent errors escape to here via SpfPermError so that deep
    // recursion can short-circuit without cascading try/catch noise.
    if (error instanceof SpfPermError) {
      return {
        result: "permerror",
        domain: senderDomain,
        explanation: error.message,
      };
    }
    // Any other exception is logged and treated as "fail" gracefully so
    // the inbound pipeline never crashes on a DNS hiccup. Callers see
    // "fail" — which is conservative and reputation-safe.
    // eslint-disable-next-line no-console
    console.warn(
      `[spf] evaluation failed for ${senderDomain}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      result: "temperror",
      domain: senderDomain,
      explanation: error instanceof Error ? error.message : "SPF evaluation failed",
    };
  }
}

/**
 * Parse an SPF record string into a structured SpfRecord.
 */
export function parseSpfRecord(txt: string): Result<SpfRecord> {
  const trimmed = txt.trim();
  if (!trimmed.toLowerCase().startsWith(SPF_VERSION_TAG)) {
    return err(new Error("Not a valid SPF record — missing v=spf1 tag"));
  }

  const parts = trimmed.substring(SPF_VERSION_TAG.length).trim().split(/\s+/);
  const mechanisms: SpfMechanism[] = [];

  for (const part of parts) {
    if (!part) continue;

    const parsed = parseMechanism(part);
    if (!parsed) {
      return err(new Error(`Invalid SPF mechanism: ${part}`));
    }
    mechanisms.push(parsed);
  }

  return ok({
    version: "spf1",
    mechanisms,
    raw: trimmed,
  });
}

async function evaluateSpf(ctx: SpfContext, domain: string): Promise<SpfCheckResult> {
  const normalized = domain.toLowerCase();

  // Circular include/redirect detection — RFC 7208 §10.1. If we're already
  // in the middle of evaluating this domain up the call stack, the chain is
  // circular and must short-circuit to permerror.
  if (ctx.visited.has(normalized)) {
    throw new SpfPermError(`Circular SPF reference detected: ${domain}`);
  }

  if (ctx.depth >= MAX_RECURSION_DEPTH) {
    throw new SpfPermError(`SPF recursion depth exceeded (${MAX_RECURSION_DEPTH})`);
  }

  ctx.visited.add(normalized);
  ctx.depth += 1;

  try {
    // Fetch SPF record for the domain
    const record = await fetchSpfRecord(ctx, domain);
    if (!record) {
      return { result: "none", domain };
    }

    const parsed = parseSpfRecord(record);
    if (!parsed.ok) {
      return {
        result: "permerror",
        domain,
        explanation: parsed.error.message,
      };
    }

    // Evaluate each mechanism in order
    for (const mechanism of parsed.value.mechanisms) {
      // Handle redirect modifier (RFC 7208 §6.1) — counts as a DNS lookup.
      // `redirect=` only applies if NO other mechanism matched, which is
      // true here because we reached the end of the loop without matching.
      // However, per RFC, redirect= is consumed at the end, so we defer it.
      if (mechanism.type === "redirect") {
        continue;
      }

      // Handle exp modifier (explanation — skip, just informational)
      if (mechanism.type === "exp") {
        continue;
      }

      const matches = await matchesMechanism(ctx, mechanism, domain);
      if (matches) {
        return {
          result: qualifierToResult(mechanism.qualifier),
          domain,
          mechanismMatched: formatMechanism(mechanism),
        };
      }
    }

    // No mechanism matched. Apply redirect= if present (RFC 7208 §6.1).
    const redirect = parsed.value.mechanisms.find((m) => m.type === "redirect");
    if (redirect) {
      ctx.dnsLookupCount += 1;
      if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
        throw new SpfPermError(
          `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at redirect=${redirect.value}`,
        );
      }
      // redirect replaces the current domain context entirely
      return evaluateSpf(ctx, redirect.value);
    }

    // Default result is "neutral" (RFC 7208 §4.7)
    return { result: "neutral", domain };
  } finally {
    // Pop off the visited set so siblings (not ancestors) can reference
    // the same domain legitimately. Only ancestors form a cycle.
    ctx.visited.delete(normalized);
    ctx.depth -= 1;
  }
}

async function fetchSpfRecord(ctx: SpfContext, domain: string): Promise<string | null> {
  ctx.dnsLookupCount += 1;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new SpfPermError(
      `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} fetching ${domain}`,
    );
  }

  try {
    const txtRecords = await ctx.resolver.resolveTxt(domain);
    const spfRecords = txtRecords
      .map((parts) => parts.join(""))
      .filter((txt) => txt.toLowerCase().startsWith(SPF_VERSION_TAG));

    if (spfRecords.length === 0) {
      // Void lookup: DNS responded but no SPF record found.
      ctx.voidLookupCount += 1;
      if (ctx.voidLookupCount > MAX_VOID_LOOKUPS) {
        throw new SpfPermError(
          `Too many void DNS lookups (${ctx.voidLookupCount}) — RFC 7208 §4.6.4`,
        );
      }
      return null;
    }

    if (spfRecords.length > 1) {
      // RFC 7208 §4.5 — multiple SPF records = permerror
      throw new SpfPermError(`Multiple SPF records found for ${domain}`);
    }

    return spfRecords[0]!;
  } catch (error) {
    if (error instanceof SpfPermError) throw error;

    // DNS errors: ENOTFOUND / ENODATA are void lookups.
    const dnsErr = error as NodeJS.ErrnoException;
    if (dnsErr.code === "ENOTFOUND" || dnsErr.code === "ENODATA") {
      ctx.voidLookupCount += 1;
      if (ctx.voidLookupCount > MAX_VOID_LOOKUPS) {
        throw new SpfPermError(
          `Too many void DNS lookups (${ctx.voidLookupCount}) — RFC 7208 §4.6.4`,
        );
      }
      return null;
    }
    // Transient DNS error — bubble up to produce temperror.
    throw error;
  }
}

async function matchesMechanism(
  ctx: SpfContext,
  mechanism: SpfMechanism,
  currentDomain: string,
): Promise<boolean> {
  switch (mechanism.type) {
    case "all":
      return true;

    case "ip4":
      return matchIpCidr(ctx.senderIp, mechanism.value, 4);

    case "ip6":
      return matchIpCidr(ctx.senderIp, mechanism.value, 6);

    case "a":
      return matchAMechanism(ctx, mechanism.value || currentDomain);

    case "mx":
      return matchMxMechanism(ctx, mechanism.value || currentDomain);

    case "include": {
      // RFC 7208 §5.2 — include: counts as one DNS lookup, then recursively
      // evaluates the target domain's SPF record with the same sender IP.
      // Result translation table (RFC 7208 §5.2):
      //   pass            → match (caller applies qualifier)
      //   fail/softfail/neutral → no match (continue to next mechanism)
      //   temperror       → temperror (propagate)
      //   permerror/none  → permerror (propagate — "no record" on an include
      //                     chain is a hard configuration error, not a miss)
      if (!mechanism.value) {
        throw new SpfPermError("include: mechanism requires a domain");
      }
      ctx.dnsLookupCount += 1;
      if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
        throw new SpfPermError(
          `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at include:${mechanism.value}`,
        );
      }
      const includeResult = await evaluateSpf(ctx, mechanism.value);
      switch (includeResult.result) {
        case "pass":
          return true;
        case "fail":
        case "softfail":
        case "neutral":
          return false;
        case "temperror":
          // Bubble up by throwing a non-perm error — the outer handler
          // converts unknown errors into temperror.
          throw new Error(
            `include:${mechanism.value} returned temperror: ${includeResult.explanation ?? ""}`,
          );
        case "none":
        case "permerror":
          throw new SpfPermError(
            `include:${mechanism.value} returned ${includeResult.result}: ${includeResult.explanation ?? "no valid SPF record"}`,
          );
      }
      return false;
    }

    case "exists": {
      ctx.dnsLookupCount += 1;
      if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
        throw new SpfPermError(
          `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at exists:${mechanism.value}`,
        );
      }
      try {
        const resolve4 = ctx.resolver.resolve4 ?? dns.resolve4;
        const addresses = await resolve4(mechanism.value);
        return addresses.length > 0;
      } catch {
        return false;
      }
    }

    case "ptr":
      // RFC 7208 Section 5.5: PTR is discouraged but must be supported
      return matchPtrMechanism(ctx, mechanism.value || currentDomain);

    default:
      return false;
  }
}

function matchIpCidr(ip: string, cidr: string, family: 4 | 6): boolean {
  const isIpv4 = net.isIPv4(ip);
  const isIpv6 = net.isIPv6(ip);

  if (family === 4 && !isIpv4) return false;
  if (family === 6 && !isIpv6) return false;

  // Parse CIDR notation
  const slashIndex = cidr.indexOf("/");
  const networkAddr = slashIndex === -1 ? cidr : cidr.substring(0, slashIndex);
  const prefixLength = slashIndex === -1
    ? (family === 4 ? 32 : 128)
    : parseInt(cidr.substring(slashIndex + 1), 10);

  if (family === 4) {
    return ipv4InSubnet(ip, networkAddr, prefixLength);
  }
  return ipv6InSubnet(ip, networkAddr, prefixLength);
}

function ipv4InSubnet(ip: string, network: string, prefix: number): boolean {
  const ipNum = ipv4ToNumber(ip);
  const netNum = ipv4ToNumber(network);
  if (ipNum === null || netNum === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (Number.isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0;
}

function ipv6InSubnet(ip: string, network: string, prefix: number): boolean {
  const ipBytes = ipv6ToBytes(ip);
  const netBytes = ipv6ToBytes(network);
  if (!ipBytes || !netBytes) return false;

  let bitsToCheck = prefix;
  for (let i = 0; i < 16 && bitsToCheck > 0; i++) {
    const bitsInByte = Math.min(bitsToCheck, 8);
    const mask = (~0 << (8 - bitsInByte)) & 0xff;
    if ((ipBytes[i]! & mask) !== (netBytes[i]! & mask)) return false;
    bitsToCheck -= 8;
  }
  return true;
}

function ipv6ToBytes(ip: string): number[] | null {
  // Expand :: shorthand
  let expanded = ip;
  if (expanded.includes("::")) {
    const halves = expanded.split("::");
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill("0");
    expanded = [...left, ...middle, ...right].join(":");
  }

  const groups = expanded.split(":");
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    const value = parseInt(group, 16);
    if (Number.isNaN(value)) return null;
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

async function matchAMechanism(ctx: SpfContext, domain: string): Promise<boolean> {
  ctx.dnsLookupCount += 1;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new SpfPermError(
      `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at a:${domain}`,
    );
  }

  const resolve4 = ctx.resolver.resolve4 ?? dns.resolve4;
  const resolve6 = ctx.resolver.resolve6 ?? dns.resolve6;

  // Parse optional CIDR from domain
  const { hostname, cidr4, cidr6 } = parseDomainCidr(domain);

  try {
    if (net.isIPv4(ctx.senderIp)) {
      const addresses = await resolve4(hostname);
      return addresses.some((addr) => ipv4InSubnet(ctx.senderIp, addr, cidr4));
    }
    if (net.isIPv6(ctx.senderIp)) {
      const addresses = await resolve6(hostname);
      return addresses.some((addr) => ipv6InSubnet(ctx.senderIp, addr, cidr6));
    }
  } catch {
    return false;
  }
  return false;
}

async function matchMxMechanism(ctx: SpfContext, domain: string): Promise<boolean> {
  ctx.dnsLookupCount += 1;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new SpfPermError(
      `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at mx:${domain}`,
    );
  }

  const resolve4 = ctx.resolver.resolve4 ?? dns.resolve4;
  const resolve6 = ctx.resolver.resolve6 ?? dns.resolve6;
  const resolveMx = ctx.resolver.resolveMx ?? dns.resolveMx;

  const { hostname, cidr4, cidr6 } = parseDomainCidr(domain);

  try {
    const mxRecords = await resolveMx(hostname);

    for (const mx of mxRecords) {
      ctx.dnsLookupCount += 1;
      if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
        throw new SpfPermError(
          `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at mx lookup ${mx.exchange}`,
        );
      }

      try {
        if (net.isIPv4(ctx.senderIp)) {
          const addresses = await resolve4(mx.exchange);
          if (addresses.some((addr) => ipv4InSubnet(ctx.senderIp, addr, cidr4))) {
            return true;
          }
        } else if (net.isIPv6(ctx.senderIp)) {
          const addresses = await resolve6(mx.exchange);
          if (addresses.some((addr) => ipv6InSubnet(ctx.senderIp, addr, cidr6))) {
            return true;
          }
        }
      } catch {
        // Individual MX resolution failure — continue with others
        continue;
      }
    }
  } catch {
    return false;
  }

  return false;
}

async function matchPtrMechanism(ctx: SpfContext, domain: string): Promise<boolean> {
  ctx.dnsLookupCount += 1;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new SpfPermError(
      `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at ptr`,
    );
  }

  const reverse = ctx.resolver.reverse ?? dns.reverse;
  const resolve4 = ctx.resolver.resolve4 ?? dns.resolve4;
  const resolve6 = ctx.resolver.resolve6 ?? dns.resolve6;

  try {
    const hostnames = await reverse(ctx.senderIp);
    const targetDomain = domain.toLowerCase();

    for (const hostname of hostnames) {
      const normalized = hostname.toLowerCase();
      // Must match the domain exactly or be a subdomain
      if (normalized === targetDomain || normalized.endsWith(`.${targetDomain}`)) {
        // Validate the reverse — the hostname must resolve back to the sender IP
        ctx.dnsLookupCount += 1;
        if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
          throw new SpfPermError(
            `Too many DNS lookups — exceeded limit of ${MAX_DNS_LOOKUPS} at ptr reverse`,
          );
        }

        try {
          const addresses = net.isIPv4(ctx.senderIp)
            ? await resolve4(hostname)
            : await resolve6(hostname);

          if (addresses.includes(ctx.senderIp)) {
            return true;
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    return false;
  }

  return false;
}

function parseDomainCidr(value: string): {
  hostname: string;
  cidr4: number;
  cidr6: number;
} {
  // Format: domain/cidr4//cidr6 or domain/cidr4 or domain
  const dualCidr = value.match(/^(.+?)\/(\d+)\/\/(\d+)$/);
  if (dualCidr) {
    return {
      hostname: dualCidr[1]!,
      cidr4: parseInt(dualCidr[2]!, 10),
      cidr6: parseInt(dualCidr[3]!, 10),
    };
  }

  const singleCidr = value.match(/^(.+?)\/(\d+)$/);
  if (singleCidr) {
    return {
      hostname: singleCidr[1]!,
      cidr4: parseInt(singleCidr[2]!, 10),
      cidr6: 128,
    };
  }

  return { hostname: value, cidr4: 32, cidr6: 128 };
}

function parseMechanism(part: string): SpfMechanism | null {
  let qualifier: SpfQualifier = "+";
  let rest = part;

  // Check for qualifier prefix
  if (rest.startsWith("+") || rest.startsWith("-") || rest.startsWith("~") || rest.startsWith("?")) {
    qualifier = rest[0] as SpfQualifier;
    rest = rest.substring(1);
  }

  // Handle redirect and exp modifiers
  const modifierMatch = rest.match(/^(redirect|exp)=(.+)$/i);
  if (modifierMatch) {
    return {
      qualifier: "+",
      type: modifierMatch[1]!.toLowerCase() as SpfMechanismType,
      value: modifierMatch[2]!,
    };
  }

  // Parse mechanism type and value
  const colonIndex = rest.indexOf(":");
  const slashIndex = rest.indexOf("/");

  let type: string;
  let value: string;

  if (colonIndex !== -1) {
    type = rest.substring(0, colonIndex).toLowerCase();
    value = rest.substring(colonIndex + 1);
  } else if (slashIndex !== -1 && !rest.substring(0, slashIndex).includes(".")) {
    // Mechanism with CIDR but no value (e.g., "a/24")
    type = rest.substring(0, slashIndex).toLowerCase();
    value = "/" + rest.substring(slashIndex + 1);
  } else {
    type = rest.toLowerCase();
    value = "";
  }

  const validTypes: SpfMechanismType[] = [
    "all", "include", "a", "mx", "ptr", "ip4", "ip6", "exists",
  ];

  if (!validTypes.includes(type as SpfMechanismType)) {
    return null;
  }

  return { qualifier, type: type as SpfMechanismType, value };
}

function qualifierToResult(qualifier: SpfQualifier): SpfResult {
  switch (qualifier) {
    case "+": return "pass";
    case "-": return "fail";
    case "~": return "softfail";
    case "?": return "neutral";
  }
}

function formatMechanism(mechanism: SpfMechanism): string {
  const prefix = mechanism.qualifier === "+" ? "" : mechanism.qualifier;
  if (mechanism.value) {
    return `${prefix}${mechanism.type}:${mechanism.value}`;
  }
  return `${prefix}${mechanism.type}`;
}
