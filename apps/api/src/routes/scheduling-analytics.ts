/**
 * Email Scheduling Analytics Route — Data-driven send time insights
 *
 * GET /v1/analytics/scheduling              — Opens/clicks by hour and day
 * GET /v1/analytics/scheduling/best-times   — Recommended best send times
 * GET /v1/analytics/scheduling/recipient/:email — Recipient engagement patterns
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, sql, gte } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateQuery,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, events, emails, recipientEngagement } from "@alecrae/db";

const PeriodQuery = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

const schedulingAnalyticsRouter = new Hono();

schedulingAnalyticsRouter.get(
  "/",
  requireScope("analytics:read"),
  validateQuery(PeriodQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof PeriodQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

    const hourlyData = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${events.createdAt})`.as("hour"),
        opens: sql<number>`COUNT(*) FILTER (WHERE ${events.type} = 'open')`.as("opens"),
        clicks: sql<number>`COUNT(*) FILTER (WHERE ${events.type} = 'click')`.as("clicks"),
        total: sql<number>`COUNT(*)`.as("total"),
      })
      .from(events)
      .innerJoin(emails, eq(events.emailId, emails.id))
      .where(and(eq(emails.accountId, auth.accountId), gte(events.createdAt, since)))
      .groupBy(sql`EXTRACT(HOUR FROM ${events.createdAt})`)
      .orderBy(sql`hour`);

    const dailyData = await db
      .select({
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${events.createdAt})`.as("day_of_week"),
        opens: sql<number>`COUNT(*) FILTER (WHERE ${events.type} = 'open')`.as("opens"),
        clicks: sql<number>`COUNT(*) FILTER (WHERE ${events.type} = 'click')`.as("clicks"),
        total: sql<number>`COUNT(*)`.as("total"),
      })
      .from(events)
      .innerJoin(emails, eq(events.emailId, emails.id))
      .where(and(eq(emails.accountId, auth.accountId), gte(events.createdAt, since)))
      .groupBy(sql`EXTRACT(DOW FROM ${events.createdAt})`)
      .orderBy(sql`day_of_week`);

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return c.json({
      data: {
        period: { days: query.days, since: since.toISOString() },
        hourly: hourlyData.map((h) => ({
          hour: Number(h.hour), opens: Number(h.opens), clicks: Number(h.clicks), total: Number(h.total),
        })),
        daily: dailyData.map((d) => ({
          dayOfWeek: Number(d.dayOfWeek), dayName: dayNames[Number(d.dayOfWeek)] ?? "Unknown",
          opens: Number(d.opens), clicks: Number(d.clicks), total: Number(d.total),
        })),
      },
    });
  },
);

schedulingAnalyticsRouter.get(
  "/best-times",
  requireScope("analytics:read"),
  validateQuery(PeriodQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof PeriodQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

    const hourDayData = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${events.createdAt})`.as("hour"),
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${events.createdAt})`.as("day_of_week"),
        opens: sql<number>`COUNT(*) FILTER (WHERE ${events.type} = 'open')`.as("opens"),
        sent: sql<number>`COUNT(*) FILTER (WHERE ${events.type} = 'delivered')`.as("sent"),
      })
      .from(events)
      .innerJoin(emails, eq(events.emailId, emails.id))
      .where(and(eq(emails.accountId, auth.accountId), gte(events.createdAt, since)))
      .groupBy(sql`EXTRACT(HOUR FROM ${events.createdAt})`, sql`EXTRACT(DOW FROM ${events.createdAt})`)
      .orderBy(sql`opens DESC`)
      .limit(10);

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const bestTimes = hourDayData.map((r) => ({
      hour: Number(r.hour),
      dayOfWeek: Number(r.dayOfWeek),
      dayName: dayNames[Number(r.dayOfWeek)] ?? "Unknown",
      opens: Number(r.opens),
      sent: Number(r.sent),
      openRate: Number(r.sent) > 0 ? Number(r.opens) / Number(r.sent) : 0,
    }));

    return c.json({
      data: {
        period: { days: query.days, since: since.toISOString() },
        bestTimes: bestTimes.slice(0, 5),
        allSlots: bestTimes,
      },
    });
  },
);

schedulingAnalyticsRouter.get(
  "/recipient/:email",
  requireScope("analytics:read"),
  async (c) => {
    const recipientEmail = c.req.param("email");
    const auth = c.get("auth");
    const db = getDatabase();

    const [engagement] = await db
      .select()
      .from(recipientEngagement)
      .where(and(
        eq(recipientEngagement.accountId, auth.accountId),
        eq(recipientEngagement.recipientEmail, recipientEmail),
      ))
      .limit(1);

    if (!engagement) {
      return c.json({ data: { recipientEmail, found: false, message: "No engagement data for this recipient yet" } });
    }

    return c.json({
      data: {
        recipientEmail,
        found: true,
        totalSent: engagement.totalSent,
        totalOpened: engagement.totalOpened,
        totalClicked: engagement.totalClicked,
        totalReplied: engagement.totalReplied,
        avgOpenTimeMinutes: engagement.avgOpenTimeMinutes,
        hourlyDistribution: engagement.hourlyDistribution,
        dailyDistribution: engagement.dailyDistribution,
        bestHour: engagement.bestHour,
        bestDay: engagement.bestDay,
        lastEngagedAt: engagement.lastEngagedAt?.toISOString() ?? null,
        updatedAt: engagement.updatedAt.toISOString(),
      },
    });
  },
);

export { schedulingAnalyticsRouter };
