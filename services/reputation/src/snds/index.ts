/**
 * @alecrae/reputation — Microsoft SNDS Monitor
 *
 * Polls Smart Network Data Services for per-IP reputation and wires bad
 * signals into the warm-up orchestrator's hard-pause path. Intended to run
 * every 24 hours (see docs/infra/deliverability.md for the systemd timer),
 * and can also be run directly:
 *
 *   bun run services/reputation/src/snds/index.ts
 *
 * ── Caveat — verified via live docs search, unlike the Postmaster module ──
 *
 * Unlike Gmail Postmaster Tools, SNDS has NO publicly documented wire
 * format for `data.aspx` — Microsoft's own SNDS pages describe the
 * dashboard UI and an "Automated Data Access" feature, but not a JSON
 * schema, auth header, or response format. `fetchSndsData()` and
 * `parseSndsResponse()` below are a best-effort implementation against the
 * classic per-IP status-color export (IP address + GREEN/YELLOW/RED +
 * optional percentage per line) and send the access token as both a query
 * param and a cookie to cover the two most common patterns for token-gated
 * legacy portals. **This must be re-verified against a real response once
 * SNDS_ACCESS_TOKEN is provisioned** — treat the first live poll as a test,
 * not a production signal, until then.
 */

import { ok, err, type Result } from "@alecrae/shared";
import {
  postSlackAlert,
  pauseAllActiveWarmups,
  type ReputationAlertLevel,
} from "../alerts/slack.js";

const SNDS_DATA_URL = "https://sendersupport.olc.protection.outlook.com/snds/data.aspx";

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchSndsData(fetchFn: typeof fetch = fetch): Promise<Result<string>> {
  const token = process.env["SNDS_ACCESS_TOKEN"];
  if (!token) {
    return err(new Error("SNDS_ACCESS_TOKEN is not set"));
  }

  const url = `${SNDS_DATA_URL}?token=${encodeURIComponent(token)}`;
  const res = await fetchFn(url, {
    headers: { Cookie: `snds_token=${token}` },
  });

  if (!res.ok) {
    return err(
      new Error(`SNDS data.aspx fetch failed (${res.status}): ${await res.text().catch(() => "")}`),
    );
  }

  return ok(await res.text());
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export type SndsColor = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

export interface SndsIpStatus {
  ip: string;
  color: SndsColor;
  complaintRatePercent: number | null;
  raw: string;
}

function normalizeSndsColor(raw: string): SndsColor {
  const upper = raw.trim().toUpperCase();
  if (upper.includes("GREEN")) return "GREEN";
  if (upper.includes("YELLOW")) return "YELLOW";
  if (upper.includes("RED")) return "RED";
  return "UNKNOWN";
}

/**
 * Best-effort parser — see the file-level caveat. Scans each line for an
 * IPv4 address, a GREEN/YELLOW/RED status word, and an optional percentage;
 * lines matching neither an IP nor a color are skipped rather than failing
 * the whole batch (defensive against header rows, blank lines, HTML wrapper
 * markup, etc.).
 */
export function parseSndsResponse(body: string): SndsIpStatus[] {
  const results: SndsIpStatus[] = [];
  const ipPattern = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
  const colorPattern = /GREEN|YELLOW|RED/i;
  const percentPattern = /(\d+(?:\.\d+)?)\s*%/;

  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const ipMatch = ipPattern.exec(line);
    if (!ipMatch || !ipMatch[1]) continue;

    const colorMatch = colorPattern.exec(line);
    if (!colorMatch) continue;

    const percentMatch = percentPattern.exec(line);

    results.push({
      ip: ipMatch[1],
      color: normalizeSndsColor(colorMatch[0]),
      complaintRatePercent: percentMatch?.[1] ? Number.parseFloat(percentMatch[1]) : null,
      raw: line.trim(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Reputation mapping — same alert scale as Postmaster
// ---------------------------------------------------------------------------

/**
 * GREEN  → log only
 * YELLOW → Slack warning
 * RED    → emergency pause ALL sends, Slack page (SNDS has no 4th tier
 *          equivalent to Postmaster's LOW/BAD split — RED is the worst
 *          signal available, treated as the BAD-equivalent emergency case)
 */
export function alertLevelForSndsColor(color: SndsColor): ReputationAlertLevel {
  switch (color) {
    case "GREEN":
      return "info";
    case "YELLOW":
      return "warning";
    case "RED":
      return "page";
    case "UNKNOWN":
      return "warning";
  }
}

function recommendedActionFor(level: ReputationAlertLevel): string {
  switch (level) {
    case "info":
      return "No action needed.";
    case "warning":
      return "Review recent sending patterns from this IP; monitor closely.";
    case "critical":
      return "Outbound warm-up paused. Investigate root cause before resuming.";
    case "page":
      return "EMERGENCY — outbound paused for all domains sharing this IP. Page on-call and investigate immediately.";
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface SndsCheckOutcome {
  ip: string;
  color: SndsColor;
  level: ReputationAlertLevel;
  complaintRatePercent: number | null;
  pausedAllWarmups: boolean;
}

export async function checkSndsReputation(
  fetchFn: typeof fetch = fetch,
): Promise<Result<SndsCheckOutcome[]>> {
  const dataResult = await fetchSndsData(fetchFn);
  if (!dataResult.ok) return dataResult;

  const statuses = parseSndsResponse(dataResult.value);
  const outcomes: SndsCheckOutcome[] = [];

  for (const status of statuses) {
    const level = alertLevelForSndsColor(status.color);
    let pausedAllWarmups = false;

    if (level === "page") {
      await pauseAllActiveWarmups();
      pausedAllWarmups = true;
    }

    await postSlackAlert(
      {
        source: "microsoft-snds",
        category: "reputation",
        level,
        ip: status.ip,
        ...(status.complaintRatePercent !== null
          ? { spamRatePercent: status.complaintRatePercent }
          : {}),
        message: `SNDS status: ${status.color}${status.complaintRatePercent !== null ? `, complaint rate ${status.complaintRatePercent}%` : ""}`,
        recommendedAction: recommendedActionFor(level),
      },
      fetchFn,
    );

    outcomes.push({
      ip: status.ip,
      color: status.color,
      level,
      complaintRatePercent: status.complaintRatePercent,
      pausedAllWarmups,
    });
  }

  return ok(outcomes);
}

// ---------------------------------------------------------------------------
// Entrypoint — invoked directly by the alecrae-snds.timer/.service
// ---------------------------------------------------------------------------

if (import.meta.main) {
  checkSndsReputation()
    .then((result) => {
      if (!result.ok) {
        console.error(`[snds] ${result.error.message}`);
        process.exit(1);
      }
      console.log(`[snds] Checked ${result.value.length} IP(s).`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[snds] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
