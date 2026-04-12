/**
 * @emailed/analytics - Report Generation
 *
 * Daily/weekly/monthly reports. Deliverability rates, engagement metrics,
 * reputation trends. Export to multiple formats (JSON, CSV, HTML).
 */

import type {
  Report,
  ReportRequest,
  ReportSummary,
  ReportComparison,
  MetricChange,
  MetricType,
  TimeSeriesDataPoint,
  BreakdownEntry,
  GroupByDimension,
  ReportFilter,
  TrackingEvent,
  EventType,
  Result,
} from "../types";
import { ok, err } from "../types";

// ─── Event Store Interface ──────────────────────────────────────────────────

export interface EventStore {
  query(params: {
    accountId: string;
    startDate: Date;
    endDate: Date;
    eventTypes?: EventType[];
    filters?: ReportFilter[];
    limit?: number;
  }): Promise<TrackingEvent[]>;
}

// ─── Metric Computation ─────────────────────────────────────────────────────

interface ComputedMetrics {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalOpens: number;
  uniqueOpens: Set<string>; // unique by recipient
  totalClicks: number;
  uniqueClicks: Set<string>;
  totalComplaints: number;
  totalUnsubscribes: number;
  totalDeliveryTimeMs: number;
  deliveryCount: number;
}

function initMetrics(): ComputedMetrics {
  return {
    totalSent: 0,
    totalDelivered: 0,
    totalBounced: 0,
    totalOpens: 0,
    uniqueOpens: new Set(),
    totalClicks: 0,
    uniqueClicks: new Set(),
    totalComplaints: 0,
    totalUnsubscribes: 0,
    totalDeliveryTimeMs: 0,
    deliveryCount: 0,
  };
}

function accumulateEvent(metrics: ComputedMetrics, event: TrackingEvent): void {
  switch (event.eventType) {
    case "delivery":
      metrics.totalDelivered++;
      metrics.totalSent++;
      if (event.metadata.deliveryTimeMs) {
        metrics.totalDeliveryTimeMs += event.metadata.deliveryTimeMs;
        metrics.deliveryCount++;
      }
      break;
    case "bounce":
      metrics.totalBounced++;
      metrics.totalSent++;
      break;
    case "open":
      metrics.totalOpens++;
      metrics.uniqueOpens.add(`${event.messageId}:${event.recipient}`);
      break;
    case "click":
      metrics.totalClicks++;
      metrics.uniqueClicks.add(`${event.messageId}:${event.recipient}`);
      break;
    case "complaint":
      metrics.totalComplaints++;
      break;
    case "unsubscribe":
      metrics.totalUnsubscribes++;
      break;
    case "defer":
      metrics.totalSent++;
      break;
    case "drop":
      metrics.totalSent++;
      break;
  }
}

function computeSummary(metrics: ComputedMetrics): ReportSummary {
  const totalSent = Math.max(metrics.totalSent, 1);
  const totalDelivered = Math.max(metrics.totalDelivered, 1);
  const totalUniqueOpens = metrics.uniqueOpens.size;
  const totalUniqueClicks = metrics.uniqueClicks.size;

  return {
    totalSent: metrics.totalSent,
    totalDelivered: metrics.totalDelivered,
    totalBounced: metrics.totalBounced,
    totalOpens: metrics.totalOpens,
    totalUniqueOpens,
    totalClicks: metrics.totalClicks,
    totalUniqueClicks,
    totalComplaints: metrics.totalComplaints,
    totalUnsubscribes: metrics.totalUnsubscribes,
    deliveryRate: metrics.totalDelivered / totalSent,
    bounceRate: metrics.totalBounced / totalSent,
    openRate: totalUniqueOpens / totalDelivered,
    clickRate: totalUniqueClicks / totalDelivered,
    clickToOpenRate: totalUniqueOpens > 0 ? totalUniqueClicks / totalUniqueOpens : 0,
    complaintRate: metrics.totalComplaints / totalDelivered,
    unsubscribeRate: metrics.totalUnsubscribes / totalDelivered,
    avgDeliveryTimeMs:
      metrics.deliveryCount > 0
        ? metrics.totalDeliveryTimeMs / metrics.deliveryCount
        : 0,
  };
}

// ─── Time Series Generation ─────────────────────────────────────────────────

function generateTimeBuckets(
  startDate: Date,
  endDate: Date,
  granularity: "hour" | "day",
): Date[] {
  const buckets: Date[] = [];
  const current = new Date(startDate);

  if (granularity === "hour") {
    current.setMinutes(0, 0, 0);
  } else {
    current.setHours(0, 0, 0, 0);
  }

  while (current <= endDate) {
    buckets.push(new Date(current));
    if (granularity === "hour") {
      current.setHours(current.getHours() + 1);
    } else {
      current.setDate(current.getDate() + 1);
    }
  }

  return buckets;
}

function bucketKey(date: Date, granularity: "hour" | "day"): string {
  if (granularity === "hour") {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}`;
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function buildTimeSeries(
  events: TrackingEvent[],
  startDate: Date,
  endDate: Date,
  requestedMetrics: MetricType[],
): TimeSeriesDataPoint[] {
  // Choose granularity based on date range
  const rangeMs = endDate.getTime() - startDate.getTime();
  const granularity: "hour" | "day" = rangeMs <= 3 * 86_400_000 ? "hour" : "day";

  const buckets = generateTimeBuckets(startDate, endDate, granularity);
  const bucketMetrics = new Map<string, ComputedMetrics>();

  for (const bucket of buckets) {
    bucketMetrics.set(bucketKey(bucket, granularity), initMetrics());
  }

  // Distribute events into buckets
  for (const event of events) {
    const key = bucketKey(event.timestamp, granularity);
    const metrics = bucketMetrics.get(key);
    if (metrics) {
      accumulateEvent(metrics, event);
    }
  }

  // Convert to time series data points
  return buckets.map((bucket) => {
    const key = bucketKey(bucket, granularity);
    const metrics = bucketMetrics.get(key) ?? initMetrics();
    const summary = computeSummary(metrics);

    const metricValues: Partial<Record<MetricType, number>> = {};
    for (const metric of requestedMetrics) {
      metricValues[metric] = extractMetricValue(summary, metric);
    }

    return {
      timestamp: bucket,
      metrics: metricValues,
    };
  });
}

function extractMetricValue(summary: ReportSummary, metric: MetricType): number {
  switch (metric) {
    case "deliveries": return summary.totalDelivered;
    case "delivery_rate": return summary.deliveryRate;
    case "bounces": return summary.totalBounced;
    case "bounce_rate": return summary.bounceRate;
    case "opens": return summary.totalOpens;
    case "open_rate": return summary.openRate;
    case "unique_opens": return summary.totalUniqueOpens;
    case "clicks": return summary.totalClicks;
    case "click_rate": return summary.clickRate;
    case "unique_clicks": return summary.totalUniqueClicks;
    case "click_to_open_rate": return summary.clickToOpenRate;
    case "complaints": return summary.totalComplaints;
    case "complaint_rate": return summary.complaintRate;
    case "unsubscribes": return summary.totalUnsubscribes;
    case "unsubscribe_rate": return summary.unsubscribeRate;
    case "avg_delivery_time": return summary.avgDeliveryTimeMs;
  }
}

// ─── Breakdown Generation ───────────────────────────────────────────────────

function buildBreakdowns(
  events: TrackingEvent[],
  dimensions: GroupByDimension[],
  requestedMetrics: MetricType[],
): Record<string, BreakdownEntry[]> {
  const result: Record<string, BreakdownEntry[]> = {};

  for (const dimension of dimensions) {
    const groups = new Map<string, ComputedMetrics>();

    for (const event of events) {
      const dimValue = extractDimensionValue(event, dimension);
      if (!dimValue) continue;

      let metrics = groups.get(dimValue);
      if (!metrics) {
        metrics = initMetrics();
        groups.set(dimValue, metrics);
      }
      accumulateEvent(metrics, event);
    }

    // Convert to breakdown entries
    const totalEvents = events.length || 1;
    const entries: BreakdownEntry[] = [];

    for (const [value, metrics] of groups) {
      const summary = computeSummary(metrics);
      const metricValues: Partial<Record<MetricType, number>> = {};
      for (const metric of requestedMetrics) {
        metricValues[metric] = extractMetricValue(summary, metric);
      }

      entries.push({
        dimension,
        value,
        metrics: metricValues,
        percentage: metrics.totalSent / totalEvents,
      });
    }

    // Sort by volume descending
    entries.sort((a, b) => (b.metrics.deliveries ?? 0) - (a.metrics.deliveries ?? 0));
    result[dimension] = entries;
  }

  return result;
}

function extractDimensionValue(
  event: TrackingEvent,
  dimension: GroupByDimension,
): string | null {
  switch (dimension) {
    case "date":
      return event.timestamp.toISOString().split("T")[0] ?? null;
    case "hour":
      return `${event.timestamp.toISOString().split("T")[0]}T${pad2(event.timestamp.getHours())}`;
    case "domain":
      return event.recipient.split("@")[1] ?? null;
    case "campaign":
      return (event.metadata.campaignId as string) ?? "uncategorized";
    case "tag":
      return (event.metadata.tags as string[])?.[0] ?? "untagged";
    case "recipient_domain":
      return event.recipient.split("@")[1] ?? null;
    case "device_type":
      return event.metadata.deviceType ?? "unknown";
    case "country":
      return event.metadata.geolocation?.country ?? "unknown";
  }
}

// ─── Period Comparison ──────────────────────────────────────────────────────

function computeComparison(
  currentSummary: ReportSummary,
  previousSummary: ReportSummary,
  requestedMetrics: MetricType[],
): ReportComparison {
  const changes: Partial<Record<MetricType, MetricChange>> = {};

  for (const metric of requestedMetrics) {
    const current = extractMetricValue(currentSummary, metric);
    const previous = extractMetricValue(previousSummary, metric);
    const absoluteChange = current - previous;
    const percentChange = previous !== 0 ? (absoluteChange / previous) * 100 : current > 0 ? 100 : 0;

    // Statistical significance: at least 2% change and based on sufficient volume
    const significant =
      Math.abs(percentChange) >= 2 &&
      currentSummary.totalSent >= 100 &&
      previousSummary.totalSent >= 100;

    changes[metric] = {
      current,
      previous,
      absoluteChange,
      percentChange,
      trend: absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "stable",
      significant,
    };
  }

  return {
    previousPeriod: previousSummary,
    changes,
  };
}

// ─── Report Formatting ──────────────────────────────────────────────────────

export function formatReportAsCsv(report: Report): string {
  const lines: string[] = [];

  // Header section
  lines.push("Emailed Analytics Report");
  lines.push(`Period,${report.request.startDate.toISOString()},${report.request.endDate.toISOString()}`);
  lines.push(`Generated,${report.generatedAt.toISOString()}`);
  lines.push("");

  // Summary
  lines.push("Metric,Value");
  lines.push(`Total Sent,${report.summary.totalSent}`);
  lines.push(`Total Delivered,${report.summary.totalDelivered}`);
  lines.push(`Delivery Rate,${(report.summary.deliveryRate * 100).toFixed(2)}%`);
  lines.push(`Total Bounced,${report.summary.totalBounced}`);
  lines.push(`Bounce Rate,${(report.summary.bounceRate * 100).toFixed(2)}%`);
  lines.push(`Total Opens,${report.summary.totalOpens}`);
  lines.push(`Unique Opens,${report.summary.totalUniqueOpens}`);
  lines.push(`Open Rate,${(report.summary.openRate * 100).toFixed(2)}%`);
  lines.push(`Total Clicks,${report.summary.totalClicks}`);
  lines.push(`Unique Clicks,${report.summary.totalUniqueClicks}`);
  lines.push(`Click Rate,${(report.summary.clickRate * 100).toFixed(2)}%`);
  lines.push(`Click-to-Open Rate,${(report.summary.clickToOpenRate * 100).toFixed(2)}%`);
  lines.push(`Complaints,${report.summary.totalComplaints}`);
  lines.push(`Complaint Rate,${(report.summary.complaintRate * 100).toFixed(4)}%`);
  lines.push(`Avg Delivery Time,${report.summary.avgDeliveryTimeMs.toFixed(0)}ms`);
  lines.push("");

  // Time series
  const firstSeriesPoint = report.timeSeries[0];
  if (firstSeriesPoint) {
    const metricNames = Object.keys(firstSeriesPoint.metrics);
    lines.push(`Timestamp,${metricNames.join(",")}`);
    for (const point of report.timeSeries) {
      const values = metricNames.map((m) => point.metrics[m as MetricType] ?? 0);
      lines.push(`${point.timestamp.toISOString()},${values.join(",")}`);
    }
    lines.push("");
  }

  // Breakdowns
  for (const [dimension, entries] of Object.entries(report.breakdowns)) {
    const firstEntry = entries[0];
    if (!firstEntry) continue;
    const metricNames = Object.keys(firstEntry.metrics);
    lines.push(`Breakdown by ${dimension}`);
    lines.push(`Value,${metricNames.join(",")},Percentage`);
    for (const entry of entries) {
      const values = metricNames.map((m) => entry.metrics[m as MetricType] ?? 0);
      lines.push(`${entry.value},${values.join(",")},${(entry.percentage * 100).toFixed(1)}%`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatReportAsHtml(report: Report): string {
  const s = report.summary;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Emailed Analytics Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1a1a1a; }
  h1 { color: #0f172a; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  .metric-good { color: #16a34a; }
  .metric-warn { color: #ca8a04; }
  .metric-bad { color: #dc2626; }
  .period { color: #64748b; font-size: 14px; }
</style>
</head>
<body>
<h1>Analytics Report</h1>
<p class="period">${report.request.startDate.toLocaleDateString()} - ${report.request.endDate.toLocaleDateString()}</p>

<h2>Summary</h2>
<table>
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Emails Sent</td><td>${s.totalSent.toLocaleString()}</td></tr>
  <tr><td>Delivered</td><td>${s.totalDelivered.toLocaleString()} <span class="${s.deliveryRate >= 0.95 ? "metric-good" : s.deliveryRate >= 0.85 ? "metric-warn" : "metric-bad"}">(${(s.deliveryRate * 100).toFixed(1)}%)</span></td></tr>
  <tr><td>Bounced</td><td>${s.totalBounced.toLocaleString()} <span class="${s.bounceRate <= 0.02 ? "metric-good" : s.bounceRate <= 0.05 ? "metric-warn" : "metric-bad"}">(${(s.bounceRate * 100).toFixed(1)}%)</span></td></tr>
  <tr><td>Unique Opens</td><td>${s.totalUniqueOpens.toLocaleString()} (${(s.openRate * 100).toFixed(1)}%)</td></tr>
  <tr><td>Unique Clicks</td><td>${s.totalUniqueClicks.toLocaleString()} (${(s.clickRate * 100).toFixed(1)}%)</td></tr>
  <tr><td>Click-to-Open Rate</td><td>${(s.clickToOpenRate * 100).toFixed(1)}%</td></tr>
  <tr><td>Complaints</td><td>${s.totalComplaints.toLocaleString()} <span class="${s.complaintRate <= 0.001 ? "metric-good" : "metric-bad"}">(${(s.complaintRate * 100).toFixed(3)}%)</span></td></tr>
  <tr><td>Avg Delivery Time</td><td>${s.avgDeliveryTimeMs.toFixed(0)}ms</td></tr>
</table>

${report.comparison ? `
<h2>vs Previous Period</h2>
<table>
  <tr><th>Metric</th><th>Current</th><th>Previous</th><th>Change</th></tr>
  ${Object.entries(report.comparison.changes)
    .map(([metric, change]) => {
      if (!change) return "";
      const arrow = change.trend === "up" ? "&#9650;" : change.trend === "down" ? "&#9660;" : "&#9644;";
      return `<tr><td>${metric}</td><td>${formatMetricValue(change.current, metric as MetricType)}</td><td>${formatMetricValue(change.previous, metric as MetricType)}</td><td>${arrow} ${change.percentChange.toFixed(1)}%</td></tr>`;
    })
    .join("\n")}
</table>
` : ""}

<p style="color:#94a3b8;font-size:12px;">Generated ${report.generatedAt.toISOString()} in ${report.durationMs}ms</p>
</body>
</html>`;
}

function formatMetricValue(value: number, metric: MetricType): string {
  if (metric.endsWith("_rate")) return `${(value * 100).toFixed(2)}%`;
  if (metric === "avg_delivery_time") return `${value.toFixed(0)}ms`;
  return value.toLocaleString();
}

// ─── Report Generator ───────────────────────────────────────────────────────

export class ReportGenerator {
  private readonly eventStore: EventStore;

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Generate a comprehensive analytics report.
   */
  async generate(request: ReportRequest): Promise<Result<Report>> {
    const startTime = Date.now();

    try {
      // Fetch events for the requested period
      const events = await this.eventStore.query({
        accountId: request.accountId,
        startDate: request.startDate,
        endDate: request.endDate,
        ...(request.filters !== undefined ? { filters: request.filters } : {}),
      });

      // Compute overall summary metrics
      const overallMetrics = initMetrics();
      for (const event of events) {
        accumulateEvent(overallMetrics, event);
      }
      const summary = computeSummary(overallMetrics);

      // Build time series
      const timeSeries = buildTimeSeries(
        events,
        request.startDate,
        request.endDate,
        request.metrics,
      );

      // Build breakdowns
      const breakdowns = request.groupBy
        ? buildBreakdowns(events, request.groupBy, request.metrics)
        : {};

      // Compute comparison with previous period if requested
      let comparison: ReportComparison | undefined;
      if (request.includeComparison) {
        const periodMs = request.endDate.getTime() - request.startDate.getTime();
        const prevStart = new Date(request.startDate.getTime() - periodMs);
        const prevEnd = new Date(request.startDate.getTime());

        const prevEvents = await this.eventStore.query({
          accountId: request.accountId,
          startDate: prevStart,
          endDate: prevEnd,
          ...(request.filters !== undefined ? { filters: request.filters } : {}),
        });

        const prevMetrics = initMetrics();
        for (const event of prevEvents) {
          accumulateEvent(prevMetrics, event);
        }
        const prevSummary = computeSummary(prevMetrics);

        comparison = computeComparison(summary, prevSummary, request.metrics);
      }

      const report: Report = {
        id: `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        accountId: request.accountId,
        request,
        summary,
        timeSeries,
        breakdowns,
        ...(comparison !== undefined ? { comparison } : {}),
        generatedAt: new Date(),
        durationMs: Date.now() - startTime,
      };

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate a daily report for a specific date.
   */
  async generateDaily(accountId: string, date: Date): Promise<Result<Report>> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    return this.generate({
      accountId,
      period: "daily",
      startDate,
      endDate,
      metrics: [
        "deliveries", "delivery_rate", "bounces", "bounce_rate",
        "opens", "open_rate", "unique_opens",
        "clicks", "click_rate", "unique_clicks",
        "complaints", "complaint_rate",
        "avg_delivery_time",
      ],
      groupBy: ["hour", "recipient_domain"],
      format: "json",
      includeComparison: true,
    });
  }

  /**
   * Generate a weekly report starting from a given date.
   */
  async generateWeekly(accountId: string, weekStart: Date): Promise<Result<Report>> {
    const startDate = new Date(weekStart);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    return this.generate({
      accountId,
      period: "weekly",
      startDate,
      endDate,
      metrics: [
        "deliveries", "delivery_rate", "bounces", "bounce_rate",
        "opens", "open_rate", "unique_opens",
        "clicks", "click_rate", "unique_clicks", "click_to_open_rate",
        "complaints", "complaint_rate",
        "unsubscribes", "unsubscribe_rate",
        "avg_delivery_time",
      ],
      groupBy: ["date", "recipient_domain", "campaign", "device_type"],
      format: "json",
      includeComparison: true,
    });
  }

  /**
   * Generate a monthly report.
   */
  async generateMonthly(accountId: string, year: number, month: number): Promise<Result<Report>> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.generate({
      accountId,
      period: "monthly",
      startDate,
      endDate,
      metrics: [
        "deliveries", "delivery_rate", "bounces", "bounce_rate",
        "opens", "open_rate", "unique_opens",
        "clicks", "click_rate", "unique_clicks", "click_to_open_rate",
        "complaints", "complaint_rate",
        "unsubscribes", "unsubscribe_rate",
        "avg_delivery_time",
      ],
      groupBy: ["date", "recipient_domain", "campaign", "device_type", "country"],
      format: "json",
      includeComparison: true,
    });
  }

  /**
   * Format a generated report into the requested output format.
   */
  formatReport(report: Report, format: "json" | "csv" | "html"): string {
    switch (format) {
      case "json":
        return JSON.stringify(report, null, 2);
      case "csv":
        return formatReportAsCsv(report);
      case "html":
        return formatReportAsHtml(report);
    }
  }
}
