/**
 * DNS Liveness Checker — Daily Re-verification Job
 *
 * Re-checks DNS records (SPF, DKIM, DMARC) for all verified domains.
 * If any record is missing or changed, the domain status is set to
 * `dns_stale` and sending is paused until the records are corrected.
 *
 * Designed to run as a BullMQ repeatable job at 03:00 UTC daily.
 */

import * as dns from "node:dns/promises";
import { eq } from "drizzle-orm";
import {
  getDatabase,
  domains as domainsTable,
} from "@alecrae/db";

// ─── Types ────────────────────────────────────────────────────────────────

export interface LivenessResult {
  domainId: string;
  domain: string;
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  staleRecords: string[];
  error: string | null;
}

export interface LivenessReport {
  checkedAt: Date;
  totalDomains: number;
  healthyDomains: number;
  staleDomains: number;
  results: LivenessResult[];
}

// ─── DNS Helpers ──────────────────────────────────────────────────────────

/**
 * Safely resolve DNS TXT records, returning null on failure.
 */
async function safeTxtResolve(hostname: string): Promise<string[] | null> {
  try {
    const records = await dns.resolveTxt(hostname);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return null;
  }
}

/**
 * Check if the SPF record for a domain includes our expected mechanism.
 */
async function checkSpf(domain: string): Promise<{ ok: boolean; detail: string }> {
  const txtRecords = await safeTxtResolve(domain);
  if (!txtRecords) {
    return { ok: false, detail: "DNS lookup failed for SPF" };
  }

  const spfRecords = txtRecords.filter((r) => r.startsWith("v=spf1"));
  if (spfRecords.length === 0) {
    return { ok: false, detail: "No SPF record found" };
  }

  const hasInclude = spfRecords.some((r) => r.includes("include:spf.alecrae.dev"));
  if (!hasInclude) {
    return { ok: false, detail: "SPF record does not include spf.alecrae.dev" };
  }

  return { ok: true, detail: "" };
}

/**
 * Check if the DKIM record exists at the expected selector.
 */
async function checkDkim(
  domain: string,
  selector: string | null,
): Promise<{ ok: boolean; detail: string }> {
  if (!selector) {
    return { ok: false, detail: "No DKIM selector configured" };
  }

  const dkimHost = `${selector}._domainkey.${domain}`;
  const txtRecords = await safeTxtResolve(dkimHost);

  if (!txtRecords) {
    return { ok: false, detail: `DNS lookup failed for ${dkimHost}` };
  }

  const dkimRecords = txtRecords.filter((r) => r.startsWith("v=DKIM1"));
  if (dkimRecords.length === 0) {
    return { ok: false, detail: `No DKIM record found at ${dkimHost}` };
  }

  return { ok: true, detail: "" };
}

/**
 * Check if a valid DMARC record exists for the domain.
 */
async function checkDmarc(domain: string): Promise<{ ok: boolean; detail: string }> {
  const dmarcHost = `_dmarc.${domain}`;
  const txtRecords = await safeTxtResolve(dmarcHost);

  if (!txtRecords) {
    return { ok: false, detail: "DNS lookup failed for DMARC" };
  }

  const dmarcRecords = txtRecords.filter((r) => r.startsWith("v=DMARC1"));
  if (dmarcRecords.length === 0) {
    return { ok: false, detail: "No DMARC record found" };
  }

  // Verify it has a valid policy
  const record = dmarcRecords[0]!;
  const policyMatch = record.match(/;\s*p=(none|quarantine|reject)/);
  if (!policyMatch) {
    return { ok: false, detail: "DMARC record missing valid policy" };
  }

  return { ok: true, detail: "" };
}

// ─── Domain Liveness Checker ──────────────────────────────────────────────

/**
 * Check DNS liveness for a single domain. Returns which records are stale.
 */
export async function checkDomainLiveness(
  domainId: string,
  domain: string,
  dkimSelector: string | null,
): Promise<LivenessResult> {
  const staleRecords: string[] = [];

  const [spfResult, dkimResult, dmarcResult] = await Promise.all([
    checkSpf(domain),
    checkDkim(domain, dkimSelector),
    checkDmarc(domain),
  ]);

  if (!spfResult.ok) staleRecords.push(`SPF: ${spfResult.detail}`);
  if (!dkimResult.ok) staleRecords.push(`DKIM: ${dkimResult.detail}`);
  if (!dmarcResult.ok) staleRecords.push(`DMARC: ${dmarcResult.detail}`);

  return {
    domainId,
    domain,
    spfOk: spfResult.ok,
    dkimOk: dkimResult.ok,
    dmarcOk: dmarcResult.ok,
    staleRecords,
    error: null,
  };
}

/**
 * Run the full liveness check for ALL verified domains.
 *
 * For each verified domain:
 *  1. Re-check SPF, DKIM, DMARC via DNS
 *  2. If any record is missing/changed, mark domain as `dns_stale`
 *  3. Set `isActive = false` to pause sending
 *
 * Returns a report summarising all results.
 */
export async function runLivenessCheck(): Promise<LivenessReport> {
  const db = getDatabase();
  const checkedAt = new Date();
  const results: LivenessResult[] = [];

  // Fetch all domains currently marked as verified and active
  const verifiedDomains = await db
    .select({
      id: domainsTable.id,
      domain: domainsTable.domain,
      dkimSelector: domainsTable.dkimSelector,
    })
    .from(domainsTable)
    .where(eq(domainsTable.verificationStatus, "verified"));

  for (const domainRecord of verifiedDomains) {
    try {
      const result = await checkDomainLiveness(
        domainRecord.id,
        domainRecord.domain,
        domainRecord.dkimSelector,
      );
      results.push(result);

      if (result.staleRecords.length > 0) {
        // Mark domain as stale and pause sending
        await db
          .update(domainsTable)
          .set({
            verificationStatus: "failed" as const,
            isActive: false,
            spfVerified: result.spfOk,
            dkimVerified: result.dkimOk,
            dmarcVerified: result.dmarcOk,
            lastVerificationAttempt: checkedAt,
            updatedAt: checkedAt,
          })
          .where(eq(domainsTable.id, domainRecord.id));

        console.warn(
          `[dns-liveness] Domain ${domainRecord.domain} (${domainRecord.id}) marked stale:`,
          result.staleRecords.join("; "),
        );
      } else {
        // Domain is healthy — update the last verification timestamp
        await db
          .update(domainsTable)
          .set({
            lastVerificationAttempt: checkedAt,
            updatedAt: checkedAt,
          })
          .where(eq(domainsTable.id, domainRecord.id));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        domainId: domainRecord.id,
        domain: domainRecord.domain,
        spfOk: false,
        dkimOk: false,
        dmarcOk: false,
        staleRecords: [],
        error: errorMessage,
      });
      console.error(
        `[dns-liveness] Error checking domain ${domainRecord.domain}:`,
        errorMessage,
      );
    }
  }

  const staleDomains = results.filter((r) => r.staleRecords.length > 0).length;
  const healthyDomains = results.filter((r) => r.staleRecords.length === 0 && !r.error).length;

  console.log(
    `[dns-liveness] Check complete: ${results.length} domains checked, ` +
    `${healthyDomains} healthy, ${staleDomains} stale`,
  );

  return {
    checkedAt,
    totalDomains: results.length,
    healthyDomains,
    staleDomains,
    results,
  };
}
