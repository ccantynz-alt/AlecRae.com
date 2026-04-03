import { Hono } from "hono";
import { requireScope } from "../middleware/auth.js";
import { validateQuery, getValidatedQuery } from "../middleware/validator.js";
import { AnalyticsQuerySchema } from "../types.js";
import type { AnalyticsQuery, OverviewStats, DeliverabilityPoint, EngagementPoint } from "../types.js";

const analytics = new Hono();

/**
 * Parse time range from query, defaulting to last 30 days.
 */
function parseTimeRange(query: AnalyticsQuery): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * Generate time series buckets for the given range and granularity.
 */
function generateBuckets(from: Date, to: Date, granularity: string): Date[] {
  const buckets: Date[] = [];
  const current = new Date(from);

  const incrementMap: Record<string, () => void> = {
    hour: () => current.setHours(current.getHours() + 1),
    day: () => current.setDate(current.getDate() + 1),
    week: () => current.setDate(current.getDate() + 7),
    month: () => current.setMonth(current.getMonth() + 1),
  };

  const increment = incrementMap[granularity] ?? incrementMap["day"]!;

  while (current <= to) {
    buckets.push(new Date(current));
    increment();
  }

  return buckets;
}

// GET /v1/analytics/overview - Aggregated stats
analytics.get(
  "/overview",
  requireScope("analytics:read"),
  validateQuery(AnalyticsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<AnalyticsQuery>(c);
    const { from, to } = parseTimeRange(query);

    // In production: query from ClickHouse / TimescaleDB aggregate tables
    // filtered by account, time range, and optional tags.
    const stats: OverviewStats = {
      sent: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
      opened: 0,
      clicked: 0,
      deliveryRate: 0,
      bounceRate: 0,
      openRate: 0,
      clickRate: 0,
    };

    return c.json({
      data: stats,
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        tags: query.tags?.split(",").filter(Boolean) ?? [],
      },
    });
  },
);

// GET /v1/analytics/deliverability - Deliverability time series
analytics.get(
  "/deliverability",
  requireScope("analytics:read"),
  validateQuery(AnalyticsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<AnalyticsQuery>(c);
    const { from, to } = parseTimeRange(query);
    const buckets = generateBuckets(from, to, query.granularity);

    // In production: query time-bucketed delivery data
    const series: DeliverabilityPoint[] = buckets.map((ts) => ({
      timestamp: ts.toISOString(),
      sent: 0,
      delivered: 0,
      bounced: 0,
      deferred: 0,
      deliveryRate: 0,
    }));

    return c.json({
      data: series,
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        granularity: query.granularity,
      },
    });
  },
);

// GET /v1/analytics/engagement - Engagement time series
analytics.get(
  "/engagement",
  requireScope("analytics:read"),
  validateQuery(AnalyticsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<AnalyticsQuery>(c);
    const { from, to } = parseTimeRange(query);
    const buckets = generateBuckets(from, to, query.granularity);

    // In production: query time-bucketed engagement data from analytics store
    const series: EngagementPoint[] = buckets.map((ts) => ({
      timestamp: ts.toISOString(),
      delivered: 0,
      opened: 0,
      uniqueOpens: 0,
      clicked: 0,
      uniqueClicks: 0,
      openRate: 0,
      clickRate: 0,
      clickToOpenRate: 0,
    }));

    return c.json({
      data: series,
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        granularity: query.granularity,
      },
    });
  },
);

export { analytics };
