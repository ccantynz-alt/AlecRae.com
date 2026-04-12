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
const MAX_DNS_LOOKUPS = 10; // RFC 7208 Section 4.6.4
const MAX_VOID_LOOKUPS = 2; // RFC 7208 Section 4.6.4

interface SpfContext {
  senderIp: string;
  senderDomain: string;
  ehloIdentity: string;
  dnsLookupCount: number;
  voidLookupCount: number;
}

/**
 * Perform an SPF check for the given sender IP and domain.
 */
export async function checkSpf(
  senderIp: string,
  senderDomain: string,
  ehloIdentity: string = senderDomain,
): Promise<SpfCheckResult> {
  const ctx: SpfContext = {
    senderIp,
    senderDomain,
    ehloIdentity,
    dnsLookupCount: 0,
    voidLookupCount: 0,
  };

  try {
    return await evaluateSpf(ctx, senderDomain);
  } catch (error) {
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
    // Handle redirect modifier
    if (mechanism.type === "redirect") {
      if (ctx.dnsLookupCount >= MAX_DNS_LOOKUPS) {
        return { result: "permerror", domain, explanation: "Too many DNS lookups" };
      }
      return evaluateSpf(ctx, mechanism.value);
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

  // No mechanism matched — default result is "neutral" (RFC 7208 Section 4.7)
  return { result: "neutral", domain };
}

async function fetchSpfRecord(ctx: SpfContext, domain: string): Promise<string | null> {
  ctx.dnsLookupCount++;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new Error("Too many DNS lookups — SPF evaluation limit exceeded");
  }

  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spfRecords = txtRecords
      .map((parts) => parts.join(""))
      .filter((txt) => txt.toLowerCase().startsWith(SPF_VERSION_TAG));

    if (spfRecords.length === 0) {
      return null;
    }

    if (spfRecords.length > 1) {
      // RFC 7208 Section 4.5 — multiple SPF records = permerror
      throw new Error(`Multiple SPF records found for ${domain}`);
    }

    return spfRecords[0] ?? null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Multiple SPF")) {
      throw error;
    }
    // DNS errors
    const dnsErr = error as NodeJS.ErrnoException;
    if (dnsErr.code === "ENOTFOUND" || dnsErr.code === "ENODATA") {
      ctx.voidLookupCount++;
      if (ctx.voidLookupCount > MAX_VOID_LOOKUPS) {
        throw new Error("Too many void DNS lookups", { cause: error });
      }
      return null;
    }
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
      ctx.dnsLookupCount++;
      if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
        throw new Error("Too many DNS lookups");
      }
      const includeResult = await evaluateSpf(ctx, mechanism.value);
      return includeResult.result === "pass";
    }

    case "exists": {
      ctx.dnsLookupCount++;
      if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
        throw new Error("Too many DNS lookups");
      }
      try {
        const addresses = await dns.resolve4(mechanism.value);
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
    const ipByte = ipBytes[i];
    const netByte = netBytes[i];
    if (ipByte === undefined || netByte === undefined) return false;
    const bitsInByte = Math.min(bitsToCheck, 8);
    const mask = (~0 << (8 - bitsInByte)) & 0xff;
    if ((ipByte & mask) !== (netByte & mask)) return false;
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
  ctx.dnsLookupCount++;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new Error("Too many DNS lookups");
  }

  // Parse optional CIDR from domain
  const { hostname, cidr4, cidr6 } = parseDomainCidr(domain);

  try {
    if (net.isIPv4(ctx.senderIp)) {
      const addresses = await dns.resolve4(hostname);
      return addresses.some((addr) => ipv4InSubnet(ctx.senderIp, addr, cidr4));
    }
    if (net.isIPv6(ctx.senderIp)) {
      const addresses = await dns.resolve6(hostname);
      return addresses.some((addr) => ipv6InSubnet(ctx.senderIp, addr, cidr6));
    }
  } catch {
    return false;
  }
  return false;
}

async function matchMxMechanism(ctx: SpfContext, domain: string): Promise<boolean> {
  ctx.dnsLookupCount++;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new Error("Too many DNS lookups");
  }

  const { hostname, cidr4, cidr6 } = parseDomainCidr(domain);

  try {
    const mxRecords = await dns.resolveMx(hostname);

    for (const mx of mxRecords) {
      ctx.dnsLookupCount++;
      if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
        throw new Error("Too many DNS lookups");
      }

      try {
        if (net.isIPv4(ctx.senderIp)) {
          const addresses = await dns.resolve4(mx.exchange);
          if (addresses.some((addr) => ipv4InSubnet(ctx.senderIp, addr, cidr4))) {
            return true;
          }
        } else if (net.isIPv6(ctx.senderIp)) {
          const addresses = await dns.resolve6(mx.exchange);
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
  ctx.dnsLookupCount++;
  if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
    throw new Error("Too many DNS lookups");
  }

  try {
    const hostnames = await dns.reverse(ctx.senderIp);
    const targetDomain = domain.toLowerCase();

    for (const hostname of hostnames) {
      const normalized = hostname.toLowerCase();
      // Must match the domain exactly or be a subdomain
      if (normalized === targetDomain || normalized.endsWith(`.${targetDomain}`)) {
        // Validate the reverse — the hostname must resolve back to the sender IP
        ctx.dnsLookupCount++;
        if (ctx.dnsLookupCount > MAX_DNS_LOOKUPS) {
          throw new Error("Too many DNS lookups");
        }

        try {
          const addresses = net.isIPv4(ctx.senderIp)
            ? await dns.resolve4(hostname)
            : await dns.resolve6(hostname);

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
  const dualCidr = /^(.+?)\/(\d+)\/\/(\d+)$/.exec(value);
  if (dualCidr?.[1] !== undefined && dualCidr[2] !== undefined && dualCidr[3] !== undefined) {
    return {
      hostname: dualCidr[1],
      cidr4: parseInt(dualCidr[2], 10),
      cidr6: parseInt(dualCidr[3], 10),
    };
  }

  const singleCidr = /^(.+?)\/(\d+)$/.exec(value);
  if (singleCidr?.[1] !== undefined && singleCidr[2] !== undefined) {
    return {
      hostname: singleCidr[1],
      cidr4: parseInt(singleCidr[2], 10),
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
  const modifierMatch = /^(redirect|exp)=(.+)$/i.exec(rest);
  if (modifierMatch?.[1] !== undefined && modifierMatch[2] !== undefined) {
    return {
      qualifier: "+",
      type: modifierMatch[1].toLowerCase() as SpfMechanismType,
      value: modifierMatch[2],
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
