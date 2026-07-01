/**
 * @alecrae/reputation — Google Postmaster Tools v2: Bulk Sender Compliance
 *
 * Separate from index.ts (v1 reputation scale). v2's getComplianceStatus is
 * a pass/fail checklist against Gmail's bulk-sender requirements (SPF/DKIM
 * alignment, DMARC, one-click unsubscribe, honoring unsubscribes) — a
 * different shape than v1's HIGH/MEDIUM/LOW/BAD reputation score, so it gets
 * its own alert logic and its own timer (compliance status changes slowly;
 * polling every 24h is enough, vs. v1's 6h reputation poll).
 *
 * Verified against developers.google.com/gmail/postmaster/reference/rest/v2 —
 * HTTP path, State enum (COMPLIANT/NEEDS_WORK — NOT pass/fail strings), and
 * ComplianceRequirement enum values are all confirmed live. The OAuth scope
 * for this method (`postmaster`, the full scope — narrower
 * `postmaster.traffic.readonly` is for v1 trafficStats, not compliance) has
 * lower confidence; if `getAccessToken` returns a 403, that's the first
 * thing to check.
 *
 * Can be run directly:
 *   bun run services/reputation/src/postmaster/compliance.ts
 */

import { eq } from "drizzle-orm";
import { ok, err, type Result } from "@alecrae/shared";
import { getDatabase, domains as domainsTable } from "@alecrae/db";
import { postSlackAlert, type ReputationAlertLevel } from "../alerts/slack.js";
import { getAccessToken, POSTMASTER_SCOPES, monitoredDomainsFromEnv } from "./auth.js";

const API_BASE = "https://gmailpostmastertools.googleapis.com/v2";

// ---------------------------------------------------------------------------
// Response schema (verified live — see file header)
// ---------------------------------------------------------------------------

export type ComplianceState = "STATE_UNSPECIFIED" | "COMPLIANT" | "NEEDS_WORK";

export type ComplianceRequirement =
  | "COMPLIANCE_REQUIREMENT_UNSPECIFIED"
  | "SPF"
  | "DKIM"
  | "SPF_AND_DKIM"
  | "DMARC_POLICY"
  | "DMARC_ALIGNMENT"
  | "MESSAGE_FORMATTING"
  | "DNS_RECORDS"
  | "ENCRYPTION"
  | "USER_REPORTED_SPAM_RATE"
  | "ONE_CLICK_UNSUBSCRIBE"
  | "HONOR_UNSUBSCRIBE";

export interface ComplianceRow {
  requirement: ComplianceRequirement;
  status: { status: ComplianceState };
}

export interface ComplianceVerdict {
  status?: { status: ComplianceState };
  state?: { status: ComplianceState }; // deliverabilityStatusVerdict uses `state` instead of `status`
  reason?: string;
}

export interface ComplianceData {
  domainId: string;
  rowData: ComplianceRow[];
  oneClickUnsubscribeVerdict?: ComplianceVerdict;
  honorUnsubscribeVerdict?: ComplianceVerdict;
  deliverabilityStatusVerdict?: ComplianceVerdict;
}

export interface ComplianceStatusResponse {
  name: string;
  complianceData?: ComplianceData;
  subdomainComplianceData?: ComplianceData;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchComplianceStatus(
  domain: string,
  fetchFn: typeof fetch = fetch,
): Promise<Result<ComplianceStatusResponse>> {
  const tokenResult = await getAccessToken(POSTMASTER_SCOPES.full, fetchFn);
  if (!tokenResult.ok) return tokenResult;

  const url = `${API_BASE}/domains/${encodeURIComponent(domain)}/complianceStatus`;
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${tokenResult.value}` },
  });

  if (!res.ok) {
    return err(
      new Error(
        `Postmaster Tools v2 getComplianceStatus failed (${res.status}): ${await res.text().catch(() => "")}`,
      ),
    );
  }

  return ok((await res.json()) as ComplianceStatusResponse);
}

// ---------------------------------------------------------------------------
// Parser — every failing row → named + remediation; all compliant → silent
// ---------------------------------------------------------------------------

export interface ComplianceFailure {
  requirement: string;
  reason: string | undefined;
  remediation: string;
}

const REMEDIATION: Record<ComplianceRequirement, string> = {
  COMPLIANCE_REQUIREMENT_UNSPECIFIED: "Unrecognized requirement — check the Postmaster Tools dashboard directly.",
  SPF: "Publish an SPF record authorizing your sending IPs (see docs/infra/dns-zone-alecrae.md).",
  DKIM: "Sign outbound mail with a DKIM key published in DNS (services/mta/src/dkim/signer.ts handles signing — check the DNS record is live).",
  SPF_AND_DKIM: "Both SPF and DKIM must pass — check each individually.",
  DMARC_POLICY: "Publish a DMARC policy (`_dmarc` TXT record) — start at p=quarantine, move to p=reject once clean.",
  DMARC_ALIGNMENT: "Align the DKIM signing domain and/or SPF domain with the From: header domain.",
  MESSAGE_FORMATTING: "Ensure outbound messages follow RFC 5322 formatting — check for malformed MIME or headers.",
  DNS_RECORDS: "One or more required DNS records are missing or misconfigured — re-run domain verification.",
  ENCRYPTION: "Enforce TLS on outbound delivery (services/mta/src/smtp/client.ts already negotiates STARTTLS — check it isn't falling back to plaintext).",
  USER_REPORTED_SPAM_RATE: "Spam rate is too high — see the v1 reputation poller for the live rate, review recent send content/targeting.",
  ONE_CLICK_UNSUBSCRIBE: "Add RFC 8058 one-click unsubscribe (List-Unsubscribe + List-Unsubscribe-Post headers) to bulk mail.",
  HONOR_UNSUBSCRIBE: "Unsubscribe requests must be honored within 2 days — check the suppression pipeline (apps/api/src/routes/suppressions.ts) is actually wired to outbound sends.",
};

/** Returns one entry per failing (NEEDS_WORK) row/verdict. Empty array = fully compliant. */
export function parseComplianceFailures(data: ComplianceData): ComplianceFailure[] {
  const failures: ComplianceFailure[] = [];

  for (const row of data.rowData ?? []) {
    if (row.status?.status === "NEEDS_WORK") {
      failures.push({
        requirement: row.requirement,
        reason: undefined,
        remediation: REMEDIATION[row.requirement] ?? "Check the Postmaster Tools dashboard for details.",
      });
    }
  }

  const namedVerdicts: [string, ComplianceVerdict | undefined, ComplianceRequirement][] = [
    ["ONE_CLICK_UNSUBSCRIBE", data.oneClickUnsubscribeVerdict, "ONE_CLICK_UNSUBSCRIBE"],
    ["HONOR_UNSUBSCRIBE", data.honorUnsubscribeVerdict, "HONOR_UNSUBSCRIBE"],
  ];
  for (const [label, verdict, requirement] of namedVerdicts) {
    const state = verdict?.status?.status;
    if (state === "NEEDS_WORK") {
      failures.push({
        requirement: label,
        reason: verdict?.reason,
        remediation: REMEDIATION[requirement],
      });
    }
  }

  // deliverabilityStatusVerdict uses `state` instead of `status` per the schema.
  const deliverabilityState = data.deliverabilityStatusVerdict?.state?.status;
  if (deliverabilityState === "NEEDS_WORK") {
    failures.push({
      requirement: "DELIVERABILITY",
      reason: data.deliverabilityStatusVerdict?.reason,
      remediation: "Deliverability is degraded — check the v1 reputation poller for spam rate and IP reputation detail.",
    });
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Orchestration — any failing row = warning; all compliant = silent
// ---------------------------------------------------------------------------

export interface ComplianceCheckOutcome {
  domain: string;
  level: ReputationAlertLevel;
  failures: ComplianceFailure[];
}

export async function checkDomainCompliance(
  domain: string,
  fetchFn: typeof fetch = fetch,
): Promise<Result<ComplianceCheckOutcome>> {
  const statusResult = await fetchComplianceStatus(domain, fetchFn);
  if (!statusResult.ok) return statusResult;

  const data = statusResult.value.complianceData;
  if (!data) {
    // No compliance data yet — same "too new to have data" case as v1.
    return ok({ domain, level: "info", failures: [] });
  }

  const failures = parseComplianceFailures(data);

  if (failures.length === 0) {
    // All passing → log only, no Slack alert (per spec).
    console.log(`[postmaster-compliance] ${domain}: fully compliant.`);
    return ok({ domain, level: "info", failures: [] });
  }

  const level: ReputationAlertLevel = "warning";
  const failureList = failures
    .map((f) => `${f.requirement}${f.reason ? ` (${f.reason})` : ""} → ${f.remediation}`)
    .join("\n  ");

  await postSlackAlert(
    {
      source: "google-postmaster",
      category: "compliance",
      level,
      domain,
      message: `${failures.length} compliance check(s) failing:\n  ${failureList}`,
      recommendedAction: "Fix each failing requirement — Gmail can silently degrade or block delivery for non-compliant bulk senders even when the v1 reputation score looks fine.",
    },
    fetchFn,
  );

  return ok({ domain, level, failures });
}

/**
 * Check GOOGLE_POSTMASTER_DOMAIN (if set) plus every `verified` domain in
 * the account's `domains` table, deduplicated. Errors on one domain don't
 * stop the others.
 */
export async function pollAllDomainsCompliance(
  fetchFn: typeof fetch = fetch,
): Promise<ComplianceCheckOutcome[]> {
  const db = getDatabase();
  const dbRows = await db
    .select({ domain: domainsTable.domain })
    .from(domainsTable)
    .where(eq(domainsTable.verificationStatus, "verified"));

  const domainSet = new Set<string>([
    ...monitoredDomainsFromEnv(),
    ...dbRows.map((row: { domain: string }) => row.domain),
  ]);

  const outcomes: ComplianceCheckOutcome[] = [];
  for (const domain of domainSet) {
    const result = await checkDomainCompliance(domain, fetchFn);
    if (result.ok) {
      outcomes.push(result.value);
    } else {
      console.error(`[postmaster-compliance] Failed to check ${domain}: ${result.error.message}`);
    }
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// Entrypoint — invoked directly by the alecrae-postmaster-compliance.timer/.service
// ---------------------------------------------------------------------------

if (import.meta.main) {
  pollAllDomainsCompliance()
    .then((outcomes) => {
      const failing = outcomes.filter((o) => o.failures.length > 0).length;
      console.log(`[postmaster-compliance] Checked ${outcomes.length} domain(s), ${failing} with failures.`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[postmaster-compliance] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
