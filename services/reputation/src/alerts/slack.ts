/**
 * @alecrae/reputation — Reputation Alerting
 *
 * Shared Slack webhook poster + hard-pause path used by both the Google
 * Postmaster Tools and Microsoft SNDS pollers. Both external signals answer
 * the same question — "is it still safe to send?" — so they share one alert
 * scale, one Slack message format, and one pause path into the warm-up
 * orchestrator.
 */

import { inArray } from "drizzle-orm";
import { getDatabase, warmupSessions } from "@alecrae/db";
import { getWarmupOrchestrator } from "../warmup/orchestrator.js";

// ---------------------------------------------------------------------------
// Alert levels
// ---------------------------------------------------------------------------

/**
 * info     — logged only, no action
 * warning  — Slack warning, sending continues
 * critical — Slack critical alert + this domain's warm-up is hard-paused
 * page     — Slack page + ALL active/paused warm-ups are hard-paused
 */
export type ReputationAlertLevel = "info" | "warning" | "critical" | "page";

export interface ReputationAlert {
  source: "google-postmaster" | "microsoft-snds";
  /** Which check produced this alert — tags the Slack message [REPUTATION] or [COMPLIANCE] so both checks can share one channel unambiguously. */
  category: "reputation" | "compliance";
  level: ReputationAlertLevel;
  domain?: string;
  ip?: string;
  spamRatePercent?: number;
  flaggedIps?: string[];
  message: string;
  recommendedAction: string;
}

const CATEGORY_TAG: Record<ReputationAlert["category"], string> = {
  reputation: "[REPUTATION]",
  compliance: "[COMPLIANCE]",
};

const LEVEL_EMOJI: Record<ReputationAlertLevel, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🔴",
  page: "🚨",
};

// ---------------------------------------------------------------------------
// Slack webhook
// ---------------------------------------------------------------------------

/**
 * POST a structured reputation alert to Slack. Monitoring must never crash
 * because alerting is unconfigured — if SLACK_WEBHOOK_URL is unset, this
 * logs a warning and returns instead of throwing.
 */
export async function postSlackAlert(
  alert: ReputationAlert,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const webhookUrl = process.env["SLACK_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.warn(
      `[reputation-alert] SLACK_WEBHOOK_URL not set — alert not delivered: ${alert.message}`,
    );
    return;
  }

  const sourceLabel =
    alert.source === "google-postmaster" ? "Google Postmaster Tools" : "Microsoft SNDS";

  const lines = [
    `${LEVEL_EMOJI[alert.level]} ${CATEGORY_TAG[alert.category]} *${sourceLabel} — ${alert.level.toUpperCase()}*`,
    alert.domain ? `*Domain:* ${alert.domain}` : undefined,
    alert.ip ? `*IP:* ${alert.ip}` : undefined,
    alert.spamRatePercent !== undefined
      ? `*Spam/complaint rate:* ${alert.spamRatePercent.toFixed(3)}%`
      : undefined,
    alert.flaggedIps && alert.flaggedIps.length > 0
      ? `*Flagged IPs:* ${alert.flaggedIps.join(", ")}`
      : undefined,
    `*Detail:* ${alert.message}`,
    `*Recommended action:* ${alert.recommendedAction}`,
  ].filter((line): line is string => line !== undefined);

  try {
    const res = await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });

    if (!res.ok) {
      console.error(
        `[reputation-alert] Slack webhook returned ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
  } catch (error) {
    console.error(
      `[reputation-alert] Failed to reach Slack webhook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Hard-pause path
// ---------------------------------------------------------------------------

/** Pause warm-up for a single domain (Google LOW-reputation path). */
export async function pauseWarmupForDomain(domainId: string): Promise<void> {
  const result = await getWarmupOrchestrator().pauseWarmup(domainId);
  if (!result.ok) {
    // Already paused/completed/cancelled — nothing to do, not an error.
    console.warn(`[reputation-alert] pauseWarmupForDomain(${domainId}): ${result.error}`);
  }
}

/**
 * Pause warm-up for every domain currently sending (Google BAD / SNDS RED
 * path). AlecRae does not yet provision dedicated IPs per domain (see
 * CLAUDE.md's Layer 5 deliverability gap), so a shared-IP reputation crash
 * threatens every domain sending from that IP — pause all of them, not just
 * the one that triggered the alert.
 */
export async function pauseAllActiveWarmups(): Promise<string[]> {
  const db = getDatabase();
  const rows = await db
    .select({ domainId: warmupSessions.domainId })
    .from(warmupSessions)
    .where(inArray(warmupSessions.status, ["active", "paused"]));

  const orchestrator = getWarmupOrchestrator();
  const paused: string[] = [];
  for (const row of rows) {
    const result = await orchestrator.pauseWarmup(row.domainId);
    if (result.ok) paused.push(row.domainId);
  }
  return paused;
}
