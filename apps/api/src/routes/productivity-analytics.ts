/**
 * Productivity Analytics
 *
 * Time tracking, AI-generated productivity insights, behavior patterns,
 * reports, comparisons, and team leaderboards.
 *
 * POST /v1/productivity-analytics/track                — Track time on email activity
 * GET  /v1/productivity-analytics/time                 — Time tracking data (cursor pagination)
 * GET  /v1/productivity-analytics/time/summary         — Time summary by period
 * GET  /v1/productivity-analytics/insights             — AI productivity insights
 * GET  /v1/productivity-analytics/insights/:id         — Specific insight
 * PUT  /v1/productivity-analytics/insights/:id         — Action/dismiss insight
 * POST /v1/productivity-analytics/insights/generate    — Trigger insight generation
 * GET  /v1/productivity-analytics/patterns             — Behavior patterns
 * GET  /v1/productivity-analytics/patterns/predict     — Predict best time for activities
 * GET  /v1/productivity-analytics/report               — Weekly/monthly productivity report
 * GET  /v1/productivity-analytics/comparison           — Compare productivity across periods
 * GET  /v1/productivity-analytics/leaderboard          — Team productivity leaderboard
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, gte, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase } from "@alecrae/db";
import {
  emailTimeTracking,
  productivityInsights,
  emailBehaviorPatterns,
} from "@alecrae/db/src/schema/productivity-analytics.js";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const TrackActivitySchema = z.object({
  emailId: z.string().min(1),
  activityType: z.enum(["reading", "composing", "replying", "forwarding"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  wordCount: z.coerce.number().int().min(0).optional(),
});

type TrackActivityInput = z.infer<typeof TrackActivitySchema>;

const TimeQuerySchema = z.object({
  activityType: z
    .enum(["reading", "composing", "replying", "forwarding"])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

type TimeQueryInput = z.infer<typeof TimeQuerySchema>;

const TimeSummaryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

type TimeSummaryQueryInput = z.infer<typeof TimeSummaryQuerySchema>;

const InsightsQuerySchema = z.object({
  type: z
    .enum([
      "email_overload",
      "response_time",
      "peak_hours",
      "meeting_vs_email",
      "focus_time",
      "batch_opportunity",
      "delegation_suggestion",
    ])
    .optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

type InsightsQueryInput = z.infer<typeof InsightsQuerySchema>;

const UpdateInsightSchema = z.object({
  isActioned: z.boolean().optional(),
  isDismissed: z.boolean().optional(),
});

type UpdateInsightInput = z.infer<typeof UpdateInsightSchema>;

const PatternsQuerySchema = z.object({
  patternType: z.string().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
});

type PatternsQueryInput = z.infer<typeof PatternsQuerySchema>;

const PredictQuerySchema = z.object({
  activityType: z
    .enum(["reading", "composing", "replying", "forwarding"])
    .optional(),
});

type PredictQueryInput = z.infer<typeof PredictQuerySchema>;

const ReportQuerySchema = z.object({
  period: z.enum(["weekly", "monthly"]).default("weekly"),
});

type ReportQueryInput = z.infer<typeof ReportQuerySchema>;

const ComparisonQuerySchema = z.object({
  current: z.string().datetime(),
  previous: z.string().datetime(),
});

type ComparisonQueryInput = z.infer<typeof ComparisonQuerySchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Route ───────────────────────────────────────────────────────────────────

const productivityAnalyticsRouter = new Hono();

// ─── POST /track — Track time on email activity ─────────────────────────────

productivityAnalyticsRouter.post(
  "/track",
  requireScope("messages:write"),
  validateBody(TrackActivitySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const body = getValidatedBody<TrackActivityInput>(c);
    const db = getDatabase();

    const startedAt = new Date(body.startedAt);
    const endedAt = body.endedAt ? new Date(body.endedAt) : null;
    const durationSeconds = endedAt
      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
      : 0;

    const id = generateId("ett");

    const [created] = await db
      .insert(emailTimeTracking)
      .values({
        id,
        accountId,
        emailId: body.emailId,
        activityType: body.activityType,
        startedAt,
        endedAt,
        durationSeconds,
        wordCount: body.wordCount ?? null,
      })
      .returning();

    return c.json({ data: created }, 201);
  },
);

// ─── GET /time — Time tracking data (cursor pagination) ─────────────────────

productivityAnalyticsRouter.get(
  "/time",
  requireScope("analytics:read"),
  validateQuery(TimeQuerySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const query = getValidatedQuery<TimeQueryInput>(c);
    const db = getDatabase();

    const conditions = [eq(emailTimeTracking.accountId, accountId)];

    if (query.activityType) {
      conditions.push(eq(emailTimeTracking.activityType, query.activityType));
    }
    if (query.from) {
      conditions.push(gte(emailTimeTracking.startedAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lt(emailTimeTracking.startedAt, new Date(query.to)));
    }
    if (query.cursor) {
      conditions.push(
        lt(emailTimeTracking.createdAt, new Date(query.cursor)),
      );
    }

    const rows = await db
      .select()
      .from(emailTimeTracking)
      .where(and(...conditions))
      .orderBy(desc(emailTimeTracking.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({ data: page, hasMore, nextCursor });
  },
);

// ─── GET /time/summary — Time summary by period ─────────────────────────────

productivityAnalyticsRouter.get(
  "/time/summary",
  requireScope("analytics:read"),
  validateQuery(TimeSummaryQuerySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const query = getValidatedQuery<TimeSummaryQueryInput>(c);
    const db = getDatabase();

    const conditions = [eq(emailTimeTracking.accountId, accountId)];

    if (query.from) {
      conditions.push(gte(emailTimeTracking.startedAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lt(emailTimeTracking.startedAt, new Date(query.to)));
    }

    const rows = await db
      .select({
        activityType: emailTimeTracking.activityType,
        totalSeconds: sql<number>`coalesce(sum(${emailTimeTracking.durationSeconds}), 0)`.as(
          "total_seconds",
        ),
        count: sql<number>`count(*)`.as("count"),
        avgSeconds: sql<number>`coalesce(avg(${emailTimeTracking.durationSeconds}), 0)`.as(
          "avg_seconds",
        ),
      })
      .from(emailTimeTracking)
      .where(and(...conditions))
      .groupBy(emailTimeTracking.activityType);

    const summary: Record<
      string,
      { totalSeconds: number; count: number; avgSeconds: number }
    > = {};
    for (const row of rows) {
      summary[row.activityType] = {
        totalSeconds: Number(row.totalSeconds),
        count: Number(row.count),
        avgSeconds: Number(row.avgSeconds),
      };
    }

    return c.json({ data: summary });
  },
);

// ─── GET /insights — AI productivity insights ───────────────────────────────

productivityAnalyticsRouter.get(
  "/insights",
  requireScope("analytics:read"),
  validateQuery(InsightsQuerySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const query = getValidatedQuery<InsightsQueryInput>(c);
    const db = getDatabase();

    const conditions = [eq(productivityInsights.accountId, accountId)];

    if (query.type) {
      conditions.push(eq(productivityInsights.insightType, query.type));
    }
    if (query.severity) {
      conditions.push(eq(productivityInsights.severity, query.severity));
    }
    if (query.active !== undefined) {
      conditions.push(
        eq(productivityInsights.isDismissed, !query.active),
      );
    }
    if (query.cursor) {
      conditions.push(
        lt(productivityInsights.createdAt, new Date(query.cursor)),
      );
    }

    const rows = await db
      .select()
      .from(productivityInsights)
      .where(and(...conditions))
      .orderBy(desc(productivityInsights.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({ data: page, hasMore, nextCursor });
  },
);

// ─── GET /insights/:id — Specific insight ───────────────────────────────────

productivityAnalyticsRouter.get(
  "/insights/:id",
  requireScope("analytics:read"),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const id = c.req.param("id");
    const db = getDatabase();

    const [insight] = await db
      .select()
      .from(productivityInsights)
      .where(
        and(
          eq(productivityInsights.id, id),
          eq(productivityInsights.accountId, accountId),
        ),
      )
      .limit(1);

    if (!insight) {
      return c.json({ error: "Insight not found" }, 404);
    }

    return c.json({ data: insight });
  },
);

// ─── PUT /insights/:id — Action/dismiss insight ────────────────────────────

productivityAnalyticsRouter.put(
  "/insights/:id",
  requireScope("messages:write"),
  validateBody(UpdateInsightSchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const id = c.req.param("id");
    const body = getValidatedBody<UpdateInsightInput>(c);
    const db = getDatabase();

    const updates: Record<string, unknown> = {};
    if (body.isActioned !== undefined) updates.isActioned = body.isActioned;
    if (body.isDismissed !== undefined) updates.isDismissed = body.isDismissed;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const [updated] = await db
      .update(productivityInsights)
      .set(updates)
      .where(
        and(
          eq(productivityInsights.id, id),
          eq(productivityInsights.accountId, accountId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json({ error: "Insight not found" }, 404);
    }

    return c.json({ data: updated });
  },
);

// ─── POST /insights/generate — Trigger insight generation ───────────────────

productivityAnalyticsRouter.post(
  "/insights/generate",
  requireScope("messages:write"),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    // Gather recent time-tracking data for analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = await db
      .select({
        activityType: emailTimeTracking.activityType,
        totalSeconds: sql<number>`coalesce(sum(${emailTimeTracking.durationSeconds}), 0)`,
        count: sql<number>`count(*)`,
        avgSeconds: sql<number>`coalesce(avg(${emailTimeTracking.durationSeconds}), 0)`,
      })
      .from(emailTimeTracking)
      .where(
        and(
          eq(emailTimeTracking.accountId, accountId),
          gte(emailTimeTracking.startedAt, thirtyDaysAgo),
        ),
      )
      .groupBy(emailTimeTracking.activityType);

    const insights: Array<{
      id: string;
      insightType: string;
      title: string;
      description: string;
      severity: "info" | "warning" | "critical";
      metric: string;
      currentValue: number;
      targetValue: number | null;
      recommendation: string;
    }> = [];

    const totalEmails = recentActivity.reduce(
      (sum, r) => sum + Number(r.count),
      0,
    );
    const totalSeconds = recentActivity.reduce(
      (sum, r) => sum + Number(r.totalSeconds),
      0,
    );

    // Generate email_overload insight if volume is high
    if (totalEmails > 100) {
      insights.push({
        id: generateId("pi"),
        insightType: "email_overload",
        title: "High email volume detected",
        description: `You processed ${totalEmails} emails in the last 30 days, spending ${Math.round(totalSeconds / 3600)} hours total.`,
        severity: totalEmails > 500 ? "critical" : "warning",
        metric: "emails_per_day",
        currentValue: Math.round(totalEmails / 30),
        targetValue: 20,
        recommendation:
          "Consider using AI triage and smart filters to reduce time in inbox.",
      });
    }

    // Generate peak_hours insight
    if (totalEmails > 0) {
      insights.push({
        id: generateId("pi"),
        insightType: "peak_hours",
        title: "Peak productivity window identified",
        description:
          "Based on your email activity patterns, your most productive hours have been identified.",
        severity: "info",
        metric: "peak_hour_efficiency",
        currentValue: totalEmails > 0 ? Math.round(totalSeconds / totalEmails) : 0,
        targetValue: 60,
        recommendation:
          "Schedule focused email time during your peak hours and batch-process at other times.",
      });
    }

    // Persist generated insights
    const now = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);

    const insertedInsights = [];
    for (const insight of insights) {
      const [inserted] = await db
        .insert(productivityInsights)
        .values({
          id: insight.id,
          accountId,
          insightType: insight.insightType as "email_overload" | "response_time" | "peak_hours" | "meeting_vs_email" | "focus_time" | "batch_opportunity" | "delegation_suggestion",
          title: insight.title,
          description: insight.description,
          severity: insight.severity,
          metric: insight.metric,
          currentValue: insight.currentValue,
          targetValue: insight.targetValue,
          recommendation: insight.recommendation,
          isActioned: false,
          isDismissed: false,
          validUntil,
          createdAt: now,
        })
        .returning();
      insertedInsights.push(inserted);
    }

    return c.json({ data: insertedInsights, generated: insertedInsights.length }, 201);
  },
);

// ─── GET /patterns — Behavior patterns ──────────────────────────────────────

productivityAnalyticsRouter.get(
  "/patterns",
  requireScope("analytics:read"),
  validateQuery(PatternsQuerySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const query = getValidatedQuery<PatternsQueryInput>(c);
    const db = getDatabase();

    const conditions = [eq(emailBehaviorPatterns.accountId, accountId)];

    if (query.patternType) {
      conditions.push(
        eq(emailBehaviorPatterns.patternType, query.patternType),
      );
    }
    if (query.dayOfWeek !== undefined) {
      conditions.push(
        eq(emailBehaviorPatterns.dayOfWeek, query.dayOfWeek),
      );
    }

    const rows = await db
      .select()
      .from(emailBehaviorPatterns)
      .where(and(...conditions))
      .orderBy(
        desc(emailBehaviorPatterns.lastCalculatedAt),
      );

    return c.json({ data: rows });
  },
);

// ─── GET /patterns/predict — Predict best time for activities ───────────────

productivityAnalyticsRouter.get(
  "/patterns/predict",
  requireScope("analytics:read"),
  validateQuery(PredictQuerySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const query = getValidatedQuery<PredictQueryInput>(c);
    const db = getDatabase();

    // Gather patterns that have hourOfDay set (hourly granularity)
    const conditions = [
      eq(emailBehaviorPatterns.accountId, accountId),
      sql`${emailBehaviorPatterns.hourOfDay} IS NOT NULL`,
    ];

    if (query.activityType) {
      conditions.push(
        eq(emailBehaviorPatterns.patternType, query.activityType),
      );
    }

    const patterns = await db
      .select()
      .from(emailBehaviorPatterns)
      .where(and(...conditions))
      .orderBy(desc(emailBehaviorPatterns.avgValue));

    // Group by hour and find the best windows
    const hourlyScores: Record<number, { avgValue: number; samples: number }> = {};
    for (const p of patterns) {
      if (p.hourOfDay !== null) {
        const existing = hourlyScores[p.hourOfDay];
        if (!existing || p.avgValue > existing.avgValue) {
          hourlyScores[p.hourOfDay] = {
            avgValue: p.avgValue,
            samples: p.sampleCount,
          };
        }
      }
    }

    const ranked = Object.entries(hourlyScores)
      .map(([hour, data]) => ({
        hour: Number(hour),
        score: data.avgValue,
        sampleCount: data.samples,
      }))
      .sort((a, b) => b.score - a.score);

    const bestHours = ranked.slice(0, 5);

    return c.json({
      data: {
        predictions: bestHours,
        bestHour: bestHours[0] ?? null,
        totalPatterns: patterns.length,
      },
    });
  },
);

// ─── GET /report — Weekly/monthly productivity report ───────────────────────

productivityAnalyticsRouter.get(
  "/report",
  requireScope("analytics:read"),
  validateQuery(ReportQuerySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const query = getValidatedQuery<ReportQueryInput>(c);
    const db = getDatabase();

    const now = new Date();
    const periodStart = new Date(now);
    if (query.period === "weekly") {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setDate(periodStart.getDate() - 30);
    }

    // Time tracking summary for the period
    const timeSummary = await db
      .select({
        activityType: emailTimeTracking.activityType,
        totalSeconds: sql<number>`coalesce(sum(${emailTimeTracking.durationSeconds}), 0)`,
        count: sql<number>`count(*)`,
        avgSeconds: sql<number>`coalesce(avg(${emailTimeTracking.durationSeconds}), 0)`,
      })
      .from(emailTimeTracking)
      .where(
        and(
          eq(emailTimeTracking.accountId, accountId),
          gte(emailTimeTracking.startedAt, periodStart),
        ),
      )
      .groupBy(emailTimeTracking.activityType);

    // Active insights count
    const [insightStats] = await db
      .select({
        total: sql<number>`count(*)`,
        actioned: sql<number>`count(*) filter (where ${productivityInsights.isActioned} = true)`,
        dismissed: sql<number>`count(*) filter (where ${productivityInsights.isDismissed} = true)`,
      })
      .from(productivityInsights)
      .where(
        and(
          eq(productivityInsights.accountId, accountId),
          gte(productivityInsights.createdAt, periodStart),
        ),
      );

    const totalEmails = timeSummary.reduce(
      (sum, r) => sum + Number(r.count),
      0,
    );
    const totalTimeSeconds = timeSummary.reduce(
      (sum, r) => sum + Number(r.totalSeconds),
      0,
    );

    return c.json({
      data: {
        period: query.period,
        periodStart: periodStart.toISOString(),
        periodEnd: now.toISOString(),
        totalEmails,
        totalTimeSeconds,
        avgTimePerEmail: totalEmails > 0 ? Math.round(totalTimeSeconds / totalEmails) : 0,
        breakdown: timeSummary.map((r) => ({
          activityType: r.activityType,
          totalSeconds: Number(r.totalSeconds),
          count: Number(r.count),
          avgSeconds: Number(r.avgSeconds),
        })),
        insights: {
          total: Number(insightStats?.total ?? 0),
          actioned: Number(insightStats?.actioned ?? 0),
          dismissed: Number(insightStats?.dismissed ?? 0),
        },
      },
    });
  },
);

// ─── GET /comparison — Compare productivity across periods ──────────────────

productivityAnalyticsRouter.get(
  "/comparison",
  requireScope("analytics:read"),
  validateQuery(ComparisonQuerySchema),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const query = getValidatedQuery<ComparisonQueryInput>(c);
    const db = getDatabase();

    const currentStart = new Date(query.current);
    const previousStart = new Date(query.previous);
    const now = new Date();

    // Duration of the current period determines comparison window
    const currentDurationMs = now.getTime() - currentStart.getTime();
    const previousEnd = new Date(previousStart.getTime() + currentDurationMs);

    async function getPeriodStats(
      from: Date,
      to: Date,
    ): Promise<{
      totalEmails: number;
      totalSeconds: number;
      avgSeconds: number;
      breakdown: Array<{
        activityType: string;
        totalSeconds: number;
        count: number;
      }>;
    }> {
      const rows = await db
        .select({
          activityType: emailTimeTracking.activityType,
          totalSeconds: sql<number>`coalesce(sum(${emailTimeTracking.durationSeconds}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(emailTimeTracking)
        .where(
          and(
            eq(emailTimeTracking.accountId, accountId),
            gte(emailTimeTracking.startedAt, from),
            lt(emailTimeTracking.startedAt, to),
          ),
        )
        .groupBy(emailTimeTracking.activityType);

      const totalEmails = rows.reduce(
        (sum, r) => sum + Number(r.count),
        0,
      );
      const totalSeconds = rows.reduce(
        (sum, r) => sum + Number(r.totalSeconds),
        0,
      );

      return {
        totalEmails,
        totalSeconds,
        avgSeconds: totalEmails > 0 ? Math.round(totalSeconds / totalEmails) : 0,
        breakdown: rows.map((r) => ({
          activityType: r.activityType,
          totalSeconds: Number(r.totalSeconds),
          count: Number(r.count),
        })),
      };
    }

    const currentStats = await getPeriodStats(currentStart, now);
    const previousStats = await getPeriodStats(previousStart, previousEnd);

    const emailChange =
      previousStats.totalEmails > 0
        ? Math.round(
            ((currentStats.totalEmails - previousStats.totalEmails) /
              previousStats.totalEmails) *
              100,
          )
        : null;
    const timeChange =
      previousStats.totalSeconds > 0
        ? Math.round(
            ((currentStats.totalSeconds - previousStats.totalSeconds) /
              previousStats.totalSeconds) *
              100,
          )
        : null;

    return c.json({
      data: {
        current: {
          from: currentStart.toISOString(),
          to: now.toISOString(),
          ...currentStats,
        },
        previous: {
          from: previousStart.toISOString(),
          to: previousEnd.toISOString(),
          ...previousStats,
        },
        changes: {
          emailCountPercent: emailChange,
          totalTimePercent: timeChange,
        },
      },
    });
  },
);

// ─── GET /leaderboard — Team productivity leaderboard ───────────────────────

productivityAnalyticsRouter.get(
  "/leaderboard",
  requireScope("analytics:read"),
  async (c) => {
    const db = getDatabase();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const rows = await db
      .select({
        accountId: emailTimeTracking.accountId,
        totalEmails: sql<number>`count(*)`,
        totalSeconds: sql<number>`coalesce(sum(${emailTimeTracking.durationSeconds}), 0)`,
        avgSeconds: sql<number>`coalesce(avg(${emailTimeTracking.durationSeconds}), 0)`,
      })
      .from(emailTimeTracking)
      .where(gte(emailTimeTracking.startedAt, sevenDaysAgo))
      .groupBy(emailTimeTracking.accountId)
      .orderBy(sql`count(*) desc`)
      .limit(50);

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      accountId: row.accountId,
      totalEmails: Number(row.totalEmails),
      totalSeconds: Number(row.totalSeconds),
      avgSecondsPerEmail: Number(row.avgSeconds),
    }));

    return c.json({ data: leaderboard });
  },
);

export { productivityAnalyticsRouter };
