/**
 * DMARC (Domain-based Message Authentication, Reporting, and Conformance) Enforcer
 * Implements RFC 7489 — evaluates DMARC policies using SPF and DKIM results.
 */

import * as dns from "node:dns/promises";
import type {
  DmarcRecord,
  DmarcPolicy,
  DmarcAlignment,
  DmarcEvaluationResult,
  SpfCheckResult,
  DkimVerificationResult,
  Result,
} from "../types.js";
import { ok, err } from "../types.js";

/**
 * Evaluate DMARC policy for an email message.
 * Combines SPF and DKIM results with DMARC alignment checks.
 */
export async function evaluateDmarc(
  fromDomain: string,
  spfResult: SpfCheckResult,
  dkimResult: DkimVerificationResult,
): Promise<DmarcEvaluationResult> {
  // Fetch DMARC record for the From domain
  const dmarcRecord = await fetchDmarcRecord(fromDomain);

  if (!dmarcRecord) {
    return {
      result: "none",
      policy: "none",
      appliedPolicy: "none",
      spfResult,
      dkimResult,
      spfAligned: false,
      dkimAligned: false,
      fromDomain,
    };
  }

  // Check DKIM alignment
  const dkimAligned = dkimResult.status === "pass"
    && checkAlignment(fromDomain, dkimResult.domain, dmarcRecord.dkimAlignment);

  // Check SPF alignment
  const spfAligned = spfResult.result === "pass"
    && checkAlignment(fromDomain, spfResult.domain, dmarcRecord.spfAlignment);

  // DMARC passes if either DKIM or SPF is aligned
  const passes = dkimAligned || spfAligned;

  // Determine the applied policy
  const isSubdomain = fromDomain.toLowerCase() !== extractOrgDomain(fromDomain).toLowerCase();
  const basePolicy = isSubdomain && dmarcRecord.subdomainPolicy
    ? dmarcRecord.subdomainPolicy
    : dmarcRecord.policy;

  // Apply pct (percentage) — if random exceeds pct, downgrade to "none"
  const appliedPolicy = passes
    ? "none" as DmarcPolicy
    : applyPercentage(basePolicy, dmarcRecord.percentage);

  return {
    result: passes ? "pass" : "fail",
    policy: dmarcRecord.policy,
    appliedPolicy,
    spfResult,
    dkimResult,
    spfAligned,
    dkimAligned,
    fromDomain,
  };
}

/**
 * Fetch and parse the DMARC record for a domain.
 * Looks up _dmarc.<domain> TXT record per RFC 7489 Section 6.6.3.
 */
export async function fetchDmarcRecord(domain: string): Promise<DmarcRecord | null> {
  // Try the exact domain first
  const orgDomain = extractOrgDomain(domain);
  let record = await lookupDmarcTxt(`_dmarc.${domain}`);

  // If no record found and domain is a subdomain, try the organizational domain
  if (!record && domain.toLowerCase() !== orgDomain.toLowerCase()) {
    record = await lookupDmarcTxt(`_dmarc.${orgDomain}`);
  }

  if (!record) {
    return null;
  }

  const parsed = parseDmarcRecord(record);
  return parsed.ok ? parsed.value : null;
}

/**
 * Parse a DMARC TXT record string into a structured DmarcRecord.
 */
export function parseDmarcRecord(txt: string): Result<DmarcRecord> {
  const trimmed = txt.trim();
  if (!trimmed.startsWith("v=DMARC1")) {
    return err(new Error("Not a valid DMARC record — missing v=DMARC1 tag"));
  }

  const tags = parseDmarcTags(trimmed);

  const policy = tags.get("p");
  if (!policy || !isValidPolicy(policy)) {
    return err(new Error("DMARC record missing required 'p' tag or has invalid policy"));
  }

  const sp = tags.get("sp");
  const pct = tags.get("pct");
  const adkim = tags.get("adkim");
  const aspf = tags.get("aspf");
  const rua = tags.get("rua");
  const ruf = tags.get("ruf");
  const ri = tags.get("ri");
  const fo = tags.get("fo");

  return ok({
    version: "DMARC1",
    policy: policy as DmarcPolicy,
    subdomainPolicy: sp && isValidPolicy(sp) ? (sp as DmarcPolicy) : undefined,
    percentage: pct ? clamp(parseInt(pct, 10), 0, 100) : 100,
    dkimAlignment: adkim === "s" ? "strict" : "relaxed",
    spfAlignment: aspf === "s" ? "strict" : "relaxed",
    reportingUris: rua ? parseUriList(rua) : [],
    forensicUris: ruf ? parseUriList(ruf) : [],
    reportInterval: ri ? parseInt(ri, 10) || 86400 : 86400,
    failureOptions: fo ?? "0",
    raw: trimmed,
  });
}

/**
 * Generate a DMARC Authentication-Results header value.
 */
export function formatAuthResults(
  hostname: string,
  evaluation: DmarcEvaluationResult,
): string {
  const parts = [hostname];

  parts.push(`dmarc=${evaluation.result} (p=${evaluation.policy}) header.from=${evaluation.fromDomain}`);
  parts.push(`dkim=${evaluation.dkimResult.status} header.d=${evaluation.dkimResult.domain}`);
  parts.push(`spf=${evaluation.spfResult.result} smtp.mailfrom=${evaluation.spfResult.domain}`);

  return parts.join(";\r\n\t");
}

/**
 * Determine the action to take based on the DMARC evaluation result.
 */
export function determineAction(
  evaluation: DmarcEvaluationResult,
): "accept" | "quarantine" | "reject" {
  if (evaluation.result === "pass" || evaluation.result === "none") {
    return "accept";
  }

  switch (evaluation.appliedPolicy) {
    case "reject":
      return "reject";
    case "quarantine":
      return "quarantine";
    case "none":
    default:
      return "accept";
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function lookupDmarcTxt(domain: string): Promise<string | null> {
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const dmarcRecords = txtRecords
      .map((parts) => parts.join(""))
      .filter((txt) => txt.startsWith("v=DMARC1"));

    return dmarcRecords[0] ?? null;
  } catch {
    return null;
  }
}

function parseDmarcTags(record: string): Map<string, string> {
  const tags = new Map<string, string>();
  const parts = record.split(";");

  for (const part of parts) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim().toLowerCase();
    const value = trimmed.substring(eqIndex + 1).trim();
    tags.set(key, value);
  }

  return tags;
}

function checkAlignment(
  fromDomain: string,
  authDomain: string,
  mode: DmarcAlignment,
): boolean {
  const from = fromDomain.toLowerCase();
  const auth = authDomain.toLowerCase();

  if (mode === "strict") {
    return from === auth;
  }

  // Relaxed alignment — organizational domains must match
  const fromOrg = extractOrgDomain(from);
  const authOrg = extractOrgDomain(auth);
  return fromOrg === authOrg;
}

/**
 * Extract the organizational domain from a given domain.
 * Simple heuristic: take the last two labels (or last three for known two-part TLDs).
 */
function extractOrgDomain(domain: string): string {
  const parts = domain.toLowerCase().split(".");

  // Two-part TLDs (e.g., co.uk, com.au)
  const twoPartTlds = new Set([
    "co.uk", "org.uk", "ac.uk", "gov.uk",
    "com.au", "net.au", "org.au",
    "co.nz", "net.nz", "org.nz",
    "co.jp", "or.jp", "ne.jp",
    "com.br", "org.br", "net.br",
    "co.in", "net.in", "org.in",
    "co.za",
  ]);

  if (parts.length >= 3) {
    const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (twoPartTlds.has(lastTwo)) {
      return parts.slice(-3).join(".");
    }
  }

  return parts.slice(-2).join(".");
}

function isValidPolicy(value: string): boolean {
  return value === "none" || value === "quarantine" || value === "reject";
}

function parseUriList(value: string): string[] {
  return value.split(",").map((uri) => {
    const trimmed = uri.trim();
    // Remove size limit suffix (e.g., "mailto:dmarc@example.com!10m")
    const bangIndex = trimmed.indexOf("!");
    return bangIndex !== -1 ? trimmed.substring(0, bangIndex) : trimmed;
  });
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return max;
  return Math.min(Math.max(value, min), max);
}

function applyPercentage(policy: DmarcPolicy, percentage: number): DmarcPolicy {
  if (percentage >= 100) return policy;
  // Roll a random number — if it exceeds the percentage, downgrade to "none"
  const roll = Math.random() * 100;
  return roll <= percentage ? policy : "none";
}
