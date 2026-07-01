/**
 * @alecrae/reputation — Google Postmaster Tools Monitor
 *
 * Polls the Gmail Postmaster Tools API for domain + IP reputation and wires
 * bad signals into the warm-up orchestrator's hard-pause path. Intended to
 * run on a schedule (see docs/infra/deliverability.md for the systemd timer)
 * every 6 hours, and can also be run directly:
 *
 *   bun run services/reputation/src/postmaster/index.ts
 *
 * ── Corrections vs. the original spec (verified against Google's live API
 *    reference at developers.google.com/gmail/postmaster/reference/rest) ──
 *
 *  1. Reputation enum values are bare `HIGH` / `MEDIUM` / `LOW` / `BAD`, NOT
 *     `REPUTATION_HIGH` etc. `normalizeReputationCategory()` strips an
 *     optional `REPUTATION_`/`CATEGORY_` prefix defensively either way.
 *  2. There is no separate `GET /v1/domains/{domain}/ipReputations`
 *     endpoint — `ipReputations` is a field *inside* each `trafficStats`
 *     entry, not its own resource. `fetchLatestTrafficStats()` returns it
 *     as part of the traffic-stats payload.
 *  3. The API is read-only (scope `postmaster.readonly`) — there is no
 *     "register domain" call. Domain verification is a one-time manual step
 *     in the postmaster.google.com UI; `buildVerificationTxtRecord()` below
 *     only formats the TXT record once you have that token, it does not
 *     fetch one.
 *
 * This has been built against Google's documented schema but NOT exercised
 * against a live account (no service-account credentials were available at
 * write time) — re-verify the first real response against
 * `GoogleTrafficStats` below before trusting it in an incident.
 */

import { eq } from "drizzle-orm";
import { ok, err, type Result } from "@alecrae/shared";
import { getDatabase, domains as domainsTable } from "@alecrae/db";
import {
  postSlackAlert,
  pauseWarmupForDomain,
  pauseAllActiveWarmups,
  type ReputationAlertLevel,
} from "../alerts/slack.js";
import { getAccessToken, POSTMASTER_SCOPES, monitoredDomainsFromEnv } from "./auth.js";

// ---------------------------------------------------------------------------
// 1. Domain verification helper
// ---------------------------------------------------------------------------

export interface DomainVerificationRecord {
  domain: string;
  recordType: "TXT";
  /** DNS record name — root of the domain (varies by provider: "@", blank, or the bare domain). */
  name: string;
  value: string;
  instructions: string;
}

/**
 * Format the TXT record needed to verify a domain with Google Postmaster
 * Tools. The verification TOKEN itself is obtained once, manually, from
 * postmaster.google.com → Add domain → "Verify domain ownership" → TXT
 * record — the Postmaster Tools API has no endpoint to generate one. Store
 * that token as GOOGLE_POSTMASTER_VERIFICATION_TOKEN and this just formats
 * it consistently.
 */
export function buildVerificationTxtRecord(domain: string): Result<DomainVerificationRecord> {
  const token = process.env["GOOGLE_POSTMASTER_VERIFICATION_TOKEN"];
  if (!token) {
    return err(
      new Error(
        "GOOGLE_POSTMASTER_VERIFICATION_TOKEN is not set. Get this token from " +
          "postmaster.google.com → Add domain → Verify via TXT record, then set it in .env.",
      ),
    );
  }

  const value = token.startsWith("google-site-verification=")
    ? token
    : `google-site-verification=${token}`;

  return ok({
    domain,
    recordType: "TXT",
    name: "@",
    value,
    instructions: `Add a TXT record at the root of ${domain} (name "@" or blank, depending on your DNS provider) with value: ${value}`,
  });
}

// ---------------------------------------------------------------------------
// 2. API poller — trafficStats fetch (auth handled by ./auth.js)
// ---------------------------------------------------------------------------

const API_BASE = "https://gmailpostmastertools.googleapis.com/v1";

export interface GoogleIpReputationEntry {
  reputation: string;
  ipCount: string;
  sampleIps: string[];
}

export interface GoogleDeliveryError {
  errorClass: string;
  errorType: string;
  errorRatio: number;
}

export interface GoogleTrafficStats {
  name: string;
  userReportedSpamRatio?: number;
  userReportedSpamRatioLowerBound?: number;
  userReportedSpamRatioUpperBound?: number;
  ipReputations?: GoogleIpReputationEntry[];
  domainReputation?: string;
  spammyFeedbackLoops?: { id: string; spamRatio: number }[];
  spfSuccessRatio?: number;
  dkimSuccessRatio?: number;
  dmarcSuccessRatio?: number;
  outboundEncryptionRatio?: number;
  inboundEncryptionRatio?: number;
  deliveryErrors?: GoogleDeliveryError[];
}

/**
 * Fetch the most recent trafficStats entry for a domain. Google does not
 * document the sort order of the list response; `name` embeds the date as
 * `domains/{domain}/trafficStats/{date}`, which sorts correctly as a plain
 * string for ISO-style dates, so the lexicographically greatest `name` wins.
 */
export async function fetchLatestTrafficStats(
  domain: string,
  fetchFn: typeof fetch = fetch,
): Promise<Result<GoogleTrafficStats | null>> {
  const tokenResult = await getAccessToken(POSTMASTER_SCOPES.reputationReadonly, fetchFn);
  if (!tokenResult.ok) return tokenResult;

  const url = `${API_BASE}/domains/${encodeURIComponent(domain)}/trafficStats?pageSize=30`;
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${tokenResult.value}` },
  });

  if (!res.ok) {
    return err(
      new Error(
        `Postmaster Tools trafficStats fetch failed (${res.status}): ${await res.text().catch(() => "")}`,
      ),
    );
  }

  const body = (await res.json()) as { trafficStats?: GoogleTrafficStats[] };
  const stats = body.trafficStats ?? [];
  if (stats.length === 0) return ok(null);

  const latest = [...stats].sort((a, b) => (a.name > b.name ? -1 : 1))[0] ?? null;
  return ok(latest);
}

// ---------------------------------------------------------------------------
// 3. Reputation parser
// ---------------------------------------------------------------------------

export type NormalizedReputation = "HIGH" | "MEDIUM" | "LOW" | "BAD" | "UNSPECIFIED";

/** Strips an optional REPUTATION_/CATEGORY_ prefix so both real (`HIGH`) and spec'd (`REPUTATION_HIGH`) forms map correctly. */
export function normalizeReputationCategory(raw: string | undefined): NormalizedReputation {
  const cleaned = (raw ?? "")
    .toUpperCase()
    .replace(/^REPUTATION_/, "")
    .replace(/^CATEGORY_/, "");
  if (cleaned.startsWith("HIGH")) return "HIGH";
  if (cleaned.startsWith("MEDIUM")) return "MEDIUM";
  if (cleaned.startsWith("LOW")) return "LOW";
  if (cleaned.startsWith("BAD")) return "BAD";
  return "UNSPECIFIED";
}

/**
 * HIGH   → log only
 * MEDIUM → Slack warning
 * LOW    → pause THIS domain's outbound immediately, Slack critical
 * BAD    → emergency pause ALL sends, Slack page
 */
export function alertLevelForReputation(category: NormalizedReputation): ReputationAlertLevel {
  switch (category) {
    case "HIGH":
      return "info";
    case "MEDIUM":
      return "warning";
    case "LOW":
      return "critical";
    case "BAD":
      return "page";
    case "UNSPECIFIED":
      return "warning"; // unknown is not "safe" — surface it, don't page on it.
  }
}

function recommendedActionFor(level: ReputationAlertLevel): string {
  switch (level) {
    case "info":
      return "No action needed.";
    case "warning":
      return "Review recent sending patterns and content; monitor closely.";
    case "critical":
      return "Outbound warm-up paused for this domain. Investigate root cause before resuming.";
    case "page":
      return "EMERGENCY — outbound paused for every domain. Page on-call and investigate immediately.";
  }
}

// ---------------------------------------------------------------------------
// Orchestration — check one domain, alert, pause if needed
// ---------------------------------------------------------------------------

export interface PostmasterCheckOutcome {
  domain: string;
  domainId: string | null;
  level: ReputationAlertLevel;
  domainReputation: NormalizedReputation;
  spamRatePercent: number | null;
  flaggedIps: string[];
  pausedWarmup: boolean;
}

/**
 * `domainId` is nullable: GOOGLE_POSTMASTER_DOMAIN (AlecRae's own sending
 * domain) is not necessarily a row in the `domains` table, which only models
 * customer-provisioned domains. When there's no domainId to target, "pause
 * this domain" degrades to "pause everything" — there's no warm-up session
 * to look up for a domain with no DB row anyway.
 */
export async function checkDomainReputation(
  domain: string,
  domainId: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<Result<PostmasterCheckOutcome>> {
  const statsResult = await fetchLatestTrafficStats(domain, fetchFn);
  if (!statsResult.ok) return statsResult;

  const stats = statsResult.value;
  if (!stats) {
    // New domains take a few days before Postmaster Tools reports data.
    // Not an error — nothing to alert on yet.
    return ok({
      domain,
      domainId,
      level: "info",
      domainReputation: "UNSPECIFIED",
      spamRatePercent: null,
      flaggedIps: [],
      pausedWarmup: false,
    });
  }

  const category = normalizeReputationCategory(stats.domainReputation);
  const level = alertLevelForReputation(category);
  const spamRatePercent =
    stats.userReportedSpamRatio !== undefined ? stats.userReportedSpamRatio * 100 : null;
  const flaggedIps = (stats.ipReputations ?? [])
    .filter((entry: GoogleIpReputationEntry) => {
      const c = normalizeReputationCategory(entry.reputation);
      return c === "LOW" || c === "BAD";
    })
    .flatMap((entry: GoogleIpReputationEntry) => entry.sampleIps);

  let pausedWarmup = false;
  if (level === "critical") {
    if (domainId) {
      await pauseWarmupForDomain(domainId);
    } else {
      await pauseAllActiveWarmups();
    }
    pausedWarmup = true;
  } else if (level === "page") {
    await pauseAllActiveWarmups();
    pausedWarmup = true;
  }

  await postSlackAlert(
    {
      source: "google-postmaster",
      category: "reputation",
      level,
      domain,
      ...(spamRatePercent !== null ? { spamRatePercent } : {}),
      ...(flaggedIps.length > 0 ? { flaggedIps } : {}),
      message: `Domain reputation: ${category}${spamRatePercent !== null ? `, spam rate ${spamRatePercent.toFixed(3)}%` : ""}`,
      recommendedAction: recommendedActionFor(level),
    },
    fetchFn,
  );

  return ok({ domain, domainId, level, domainReputation: category, spamRatePercent, flaggedIps, pausedWarmup });
}

/**
 * Check GOOGLE_POSTMASTER_DOMAIN (if set) plus every `verified` domain in
 * the account's `domains` table, deduplicated. Errors on one domain don't
 * stop the others.
 */
export async function pollAllDomains(fetchFn: typeof fetch = fetch): Promise<PostmasterCheckOutcome[]> {
  const db = getDatabase();
  const dbRows = await db
    .select({ id: domainsTable.id, domain: domainsTable.domain })
    .from(domainsTable)
    .where(eq(domainsTable.verificationStatus, "verified"));

  const byDomain = new Map<string, string | null>();
  for (const envDomain of monitoredDomainsFromEnv()) {
    byDomain.set(envDomain, null);
  }
  for (const row of dbRows) {
    byDomain.set(row.domain, row.id); // DB row wins if the env domain also has one.
  }

  const outcomes: PostmasterCheckOutcome[] = [];
  for (const [domain, domainId] of byDomain) {
    const result = await checkDomainReputation(domain, domainId, fetchFn);
    if (result.ok) {
      outcomes.push(result.value);
    } else {
      console.error(`[postmaster] Failed to check ${domain}: ${result.error.message}`);
    }
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// 5. Entrypoint — invoked directly by the alecrae-postmaster.timer/.service
// ---------------------------------------------------------------------------

if (import.meta.main) {
  pollAllDomains()
    .then((outcomes) => {
      console.log(`[postmaster] Checked ${outcomes.length} domain(s).`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[postmaster] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
