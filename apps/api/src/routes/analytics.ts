import { Hono } from "hono";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateQuery, getValidatedQuery } from "../middleware/validator.js";
import { AnalyticsQuerySchema } from "../types.js";
import type {
  AnalyticsQuery,
  OverviewStats,
  DeliverabilityPoint,
  EngagementPoint,
} from "../types.js";
import { getDatabase, emails, events } from "@emailed/db";

const analytics = new Hono();

function parseTimeRange(query: AnalyticsQuery): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

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

// GET /v1/analytics/overview - Aggregated stats from real email data
analytics.get(
  "/overview",
  requireScope("analytics:read"),
  validateQuery(AnalyticsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<AnalyticsQuery>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const { from, to } = parseTimeRange(query);

    const conditions = [
      eq(emails.accountId, auth.accountId),
      gte(emails.createdAt, from),
      lte(emails.createdAt, to),
    ];

    // Count emails by status
    const statusCounts = await db
      .select({
        status: emails.status,
        count: count(),
      })
      .from(emails)
      .where(and(...conditions))
      .groupBy(emails.status);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = row.count;
    }

    const sent =
      (counts["sent"] ?? 0) +
      (counts["delivered"] ?? 0) +
      (counts["bounced"] ?? 0) +
      (counts["complained"] ?? 0);
    const delivered = counts["delivered"] ?? 0;
    const bounced = counts["bounced"] ?? 0;
    const complained = counts["complained"] ?? 0;

    // Count engagement events (opens/clicks) from the events table
    const engagementCounts = await db
      .select({
        type: events.type,
        count: count(),
      })
      .from(events)
      .where(
        and(
          eq(events.accountId, auth.accountId),
          gte(events.timestamp, from),
          lte(events.timestamp, to),
          sql`${events.type} IN ('email.opened', 'email.clicked')`,
        ),
      )
      .groupBy(events.type);

    const engagementMap: Record<string, number> = {};
    for (const row of engagementCounts) {
      engagementMap[row.type] = row.count;
    }

    const opened = engagementMap["email.opened"] ?? 0;
    const clicked = engagementMap["email.clicked"] ?? 0;

    const stats: OverviewStats = {
      sent,
      delivered,
      bounced,
      complained,
      opened,
      clicked,
      deliveryRate: sent > 0 ? delivered / sent : 0,
      bounceRate: sent > 0 ? bounced / sent : 0,
      openRate: delivered > 0 ? opened / delivered : 0,
      clickRate: delivered > 0 ? clicked / delivered : 0,
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
    const auth = c.get("auth");
    const db = getDatabase();
    const { from, to } = parseTimeRange(query);
    const buckets = generateBuckets(from, to, query.granularity);

    // Query email counts grouped by date truncated to granularity
    const truncExpr =
      query.granularity === "hour"
        ? sql`date_trunc('hour', ${emails.createdAt})`
        : query.granularity === "week"
          ? sql`date_trunc('week', ${emails.createdAt})`
          : query.granularity === "month"
            ? sql`date_trunc('month', ${emails.createdAt})`
            : sql`date_trunc('day', ${emails.createdAt})`;

    const rows = await db
      .select({
        bucket: truncExpr.as("bucket"),
        status: emails.status,
        count: count(),
      })
      .from(emails)
      .where(
        and(
          eq(emails.accountId, auth.accountId),
          gte(emails.createdAt, from),
          lte(emails.createdAt, to),
        ),
      )
      .groupBy(sql`bucket`, emails.status);

    // Build a lookup map: "bucket_iso" → { status → count }
    const bucketMap = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const key = String(row.bucket);
      const existing = bucketMap.get(key) ?? {};
      existing[row.status] = row.count;
      bucketMap.set(key, existing);
    }

    const series: DeliverabilityPoint[] = buckets.map((ts) => {
      const key = ts.toISOString();
      const data = bucketMap.get(key) ?? {};
      const sent =
        (data["sent"] ?? 0) +
        (data["delivered"] ?? 0) +
        (data["bounced"] ?? 0);
      const delivered = data["delivered"] ?? 0;

      return {
        timestamp: ts.toISOString(),
        sent,
        delivered,
        bounced: data["bounced"] ?? 0,
        deferred: data["deferred"] ?? 0,
        deliveryRate: sent > 0 ? delivered / sent : 0,
      };
    });

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

    // Engagement data (opens/clicks) will be populated once tracking pixels
    // and click tracking are wired up. For now return the time series skeleton.
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
