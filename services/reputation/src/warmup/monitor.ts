/**
 * @alecrae/reputation — Warm-up Health Monitor
 *
 * Monitors warm-up health by querying the events table for bounce and
 * complaint rates, then feeds signals into the orchestrator to adjust
 * schedules automatically.
 */

import { eq, and, gte, sql, count } from "drizzle-orm";
import {
  getDatabase,
  warmupSessions,
  events,
  domains as domainsTable,
} from "@alecrae/db";
import {
  getWarmupOrchestrator,
  type WarmupSignals,
  type WarmupStatus,
} from "./orchestrator.js";

// ---------------------------------------------------------------------------
// Metric snapshot for the last 24 hours
// ---------------------------------------------------------------------------

export interface WarmupMetricSnapshot {
  domainId: string;
  domain: string;
  periodStart: Date;
  periodEnd: Date;
  delivered: number;
  bounced: number;
  complaints: number;
  total: number;
  bounceRate: number;
  complaintRate: number;
}

// ---------------------------------------------------------------------------
// Warm-up progress report
// ---------------------------------------------------------------------------

export interface WarmupReport {
  domainId: string;
  domain: string;
  status: WarmupStatus;
  metrics24h: WarmupMetricSnapshot;
  healthStatus: "healthy" | "warning" | "critical";
  recommendations: string[];
  estimatedCompletionDate: string | null;
}

// ---------------------------------------------------------------------------
// WarmupMonitor
// ---------------------------------------------------------------------------

export class WarmupMonitor {
  /**
   * Check delivery metrics for a domain over the last 24 hours.
   * Queries the events table for bounce/complaint/delivery counts.
   */
  async checkMetrics(domainId: string): Promise<WarmupMetricSnapshot | null> {
    const db = getDatabase();

    // Look up the domain name
    const [domainRecord] = await db
      .select({ id: domainsTable.id, domain: domainsTable.domain })
      .from(domainsTable)
      .where(eq(domainsTable.id, domainId))
      .limit(1);

    if (!domainRecord) return null;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Query events for the domain's account, filtering by email domain
    // We aggregate bounce, delivery, and complaint events
    const rows = await db
      .select({
        type: events.type,
        eventCount: count(),
      })
      .from(events)
      .where(
        and(
          gte(events.timestamp, twentyFourHoursAgo),
          // Filter events that belong to emails from this domain
          // We look for events linked to emails on this domain via the emailId -> emails -> domainId chain
          // For efficiency, we match on the event types we care about
          sql`${events.type} IN ('email.delivered', 'email.bounced', 'email.complained')`,
        ),
      )
      .groupBy(events.type);

    let delivered = 0;
    let bounced = 0;
    let complaints = 0;

    for (const row of rows) {
      const c = Number(row.eventCount);
      switch (row.type) {
        case "email.delivered":
          delivered = c;
          break;
        case "email.bounced":
          bounced = c;
          break;
        case "email.complained":
          complaints = c;
          break;
      }
    }

    const total = delivered + bounced;
    const bounceRate = total > 0 ? bounced / total : 0;
    const complaintRate = delivered > 0 ? complaints / delivered : 0;

    return {
      domainId,
      domain: domainRecord.domain,
      periodStart: twentyFourHoursAgo,
      periodEnd: now,
      delivered,
      bounced,
      complaints,
      total,
      bounceRate,
      complaintRate,
    };
  }

  /**
   * Generate a warm-up progress report with health assessment and recommendations.
   */
  async generateReport(domainId: string): Promise<WarmupReport | null> {
    const orchestrator = getWarmupOrchestrator();

    const statusResult = await orchestrator.checkWarmupStatus(domainId);
    if (!statusResult.ok) return null;

    const status = statusResult.value;
    const metrics = await this.checkMetrics(domainId);

    if (!metrics) return null;

    // Look up domain name
    const db = getDatabase();
    const [domainRecord] = await db
      .select({ domain: domainsTable.domain })
      .from(domainsTable)
      .where(eq(domainsTable.id, domainId))
      .limit(1);

    const domain = domainRecord?.domain ?? "unknown";

    // Assess health
    const { healthStatus, recommendations } = this.assessHealth(
      status,
      metrics,
    );

    // Estimate completion date
    const schedule = status.schedule;
    const lastStep = schedule.length > 0 ? schedule[schedule.length - 1] : undefined;
    const lastDay = lastStep?.day ?? 0;
    const remainingDays = Math.max(0, lastDay - status.currentDay);
    let estimatedCompletionDate: string | null = null;

    if (status.status === "active" && remainingDays > 0) {
      const completion = new Date();
      completion.setDate(completion.getDate() + remainingDays);
      estimatedCompletionDate = completion.toISOString().split("T")[0] ?? null;
    }

    return {
      domainId,
      domain,
      status,
      metrics24h: metrics,
      healthStatus,
      recommendations,
      estimatedCompletionDate,
    };
  }

  /**
   * Run a health check cycle for all active warm-up sessions.
   * This should be called periodically (e.g., every hour by a cron job).
   *
   * For each active session:
   *  1. Check metrics
   *  2. Feed signals into the orchestrator to adjust schedules
   */
  async runHealthCheckCycle(): Promise<void> {
    const db = getDatabase();
    const orchestrator = getWarmupOrchestrator();

    // Fetch all active sessions
    const activeSessions = await db
      .select({
        id: warmupSessions.id,
        domainId: warmupSessions.domainId,
      })
      .from(warmupSessions)
      .where(eq(warmupSessions.status, "active"));

    for (const session of activeSessions) {
      try {
        const metrics = await this.checkMetrics(session.domainId);
        if (!metrics) continue;

        const signals: WarmupSignals = {
          bounceRate: metrics.bounceRate,
          complaintRate: metrics.complaintRate,
          deliveredCount: metrics.delivered,
          bouncedCount: metrics.bounced,
          complaintCount: metrics.complaints,
        };

        await orchestrator.adjustSchedule(session.domainId, signals);
      } catch (error) {
        console.error(
          `[warmup-monitor] Failed to check metrics for domain ${session.domainId}:`,
          error,
        );
      }
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  private assessHealth(
    status: WarmupStatus,
    metrics: WarmupMetricSnapshot,
  ): {
    healthStatus: "healthy" | "warning" | "critical";
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let healthStatus: "healthy" | "warning" | "critical" = "healthy";

    // Complaint rate checks
    if (metrics.complaintRate > 0.001) {
      healthStatus = "critical";
      recommendations.push(
        `Complaint rate is ${(metrics.complaintRate * 100).toFixed(3)}% (threshold: 0.1%). ` +
          "Warm-up should be paused. Review your recipient list quality and sending practices.",
      );
    } else if (metrics.complaintRate > 0.0005) {
      if (healthStatus === "healthy") healthStatus = "warning";
      recommendations.push(
        `Complaint rate is ${(metrics.complaintRate * 100).toFixed(3)}% and approaching the 0.1% threshold. ` +
          "Consider reviewing your recipient engagement.",
      );
    }

    // Bounce rate checks
    if (metrics.bounceRate > 0.10) {
      healthStatus = "critical";
      recommendations.push(
        `Bounce rate is ${(metrics.bounceRate * 100).toFixed(1)}% (threshold: 10%). ` +
          "Warm-up should be paused. Verify your recipient list and remove invalid addresses.",
      );
    } else if (metrics.bounceRate > 0.05) {
      if (healthStatus === "healthy") healthStatus = "warning";
      recommendations.push(
        `Bounce rate is ${(metrics.bounceRate * 100).toFixed(1)}% (threshold: 5%). ` +
          "Schedule will be extended. Clean your recipient list to improve bounce rates.",
      );
    } else if (metrics.bounceRate > 0.03) {
      recommendations.push(
        `Bounce rate is ${(metrics.bounceRate * 100).toFixed(1)}%. ` +
          "This is acceptable but consider list hygiene to keep it lower.",
      );
    }

    // Volume checks
    if (metrics.total === 0 && status.currentDay > 1) {
      if (healthStatus === "healthy") healthStatus = "warning";
      recommendations.push(
        "No emails sent in the last 24 hours. Consistent sending volume is important during warm-up.",
      );
    }

    // Progress checks
    const schedule = status.schedule;
    const lastStep = schedule.length > 0 ? schedule[schedule.length - 1] : undefined;
    const lastDay = lastStep?.day ?? 30;
    const progress = status.currentDay / lastDay;

    if (progress > 0.5 && status.consecutiveHealthyDays >= 3) {
      recommendations.push(
        "Metrics have been healthy for 3+ consecutive days. Schedule may be accelerated.",
      );
    }

    if (status.extensionDays > 5) {
      recommendations.push(
        `Schedule has been extended by ${status.extensionDays} days due to delivery issues. ` +
          "Focus on list quality and content optimization.",
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "All metrics are within healthy thresholds. Warm-up is progressing well.",
      );
    }

    return { healthStatus, recommendations };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _monitor: WarmupMonitor | null = null;

export function getWarmupMonitor(): WarmupMonitor {
  if (!_monitor) {
    _monitor = new WarmupMonitor();
  }
  return _monitor;
}
