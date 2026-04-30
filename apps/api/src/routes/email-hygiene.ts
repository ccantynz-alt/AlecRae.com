/**
 * Email Hygiene & Productivity Insights Route
 *
 * GET    /v1/hygiene/habits              — Get email habits over time
 * GET    /v1/hygiene/habits/today        — Get today's habits
 * GET    /v1/hygiene/productivity-score  — Get current productivity score with breakdown
 * GET    /v1/hygiene/subscriptions       — List all newsletter/marketing subscriptions
 * POST   /v1/hygiene/subscriptions/:id/wanted — Mark subscription as wanted/unwanted
 * POST   /v1/hygiene/subscriptions/audit — AI audit of all subscriptions
 * GET    /v1/hygiene/response-time       — Response time analytics by sender/category
 * POST   /v1/hygiene/inbox-cleanup       — AI inbox cleanup suggestions
 * GET    /v1/hygiene/email-volume        — Email volume trends
 * GET    /v1/hygiene/top-senders         — Top senders by volume with engagement stats
 * POST   /v1/hygiene/goals              — Set email productivity goals
 * GET    /v1/hygiene/goals              — Get current goals and progress
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, gte, lte, lt, like } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  emailHabits,
  subscriptionTracker,
  emailProductivityGoals,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PeriodQuerySchema = z.object({
  period: z.enum(["week", "month", "quarter"]).default("week"),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  category: z.string().optional(),
  wanted: z.coerce.boolean().optional(),
});

const VolumeQuerySchema = z.object({
  period: z.enum(["week", "month", "quarter"]).default("week"),
});

const TopSendersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const MarkWantedSchema = z.object({
  isWanted: z.boolean(),
});

const SetGoalsSchema = z.object({
  maxDailyChecks: z.number().int().min(1).max(100).optional(),
  targetResponseTimeMinutes: z.number().min(1).max(10080).optional(),
  inboxZeroGoal: z.boolean().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getDateRange(period: "week" | "month" | "quarter"): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0]!;
  const startDate = new Date(now);

  switch (period) {
    case "week":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "quarter":
      startDate.setMonth(startDate.getMonth() - 3);
      break;
  }

  const start = startDate.toISOString().split("T")[0]!;
  return { start, end };
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]!;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const hygieneRouter = new Hono();

// GET /habits — Get email habits over time
hygieneRouter.get(
  "/habits",
  requireScope("analytics:read"),
  validateQuery(PeriodQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof PeriodQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const { start, end } = getDateRange(query.period);

    const rows = await db
      .select()
      .from(emailHabits)
      .where(
        and(
          eq(emailHabits.accountId, auth.accountId),
          gte(emailHabits.date, start),
          lte(emailHabits.date, end),
        ),
      )
      .orderBy(desc(emailHabits.date));

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        date: row.date,
        emailsSent: row.emailsSent,
        emailsReceived: row.emailsReceived,
        emailsArchived: row.emailsArchived,
        avgResponseTimeMinutes: row.avgResponseTimeMinutes,
        peakHour: row.peakHour,
        productivityScore: row.productivityScore,
        inboxZeroAchieved: row.inboxZeroAchieved,
      })),
      period: query.period,
      dateRange: { start, end },
    });
  },
);

// GET /habits/today — Get today's habits
hygieneRouter.get(
  "/habits/today",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();
    const today = getTodayDate();

    const [todayHabits] = await db
      .select()
      .from(emailHabits)
      .where(
        and(
          eq(emailHabits.accountId, auth.accountId),
          eq(emailHabits.date, today),
        ),
      )
      .limit(1);

    if (!todayHabits) {
      return c.json({
        data: {
          date: today,
          emailsSent: 0,
          emailsReceived: 0,
          emailsArchived: 0,
          avgResponseTimeMinutes: null,
          peakHour: null,
          productivityScore: null,
          inboxZeroAchieved: false,
        },
      });
    }

    return c.json({
      data: {
        id: todayHabits.id,
        date: todayHabits.date,
        emailsSent: todayHabits.emailsSent,
        emailsReceived: todayHabits.emailsReceived,
        emailsArchived: todayHabits.emailsArchived,
        avgResponseTimeMinutes: todayHabits.avgResponseTimeMinutes,
        peakHour: todayHabits.peakHour,
        productivityScore: todayHabits.productivityScore,
        inboxZeroAchieved: todayHabits.inboxZeroAchieved,
      },
    });
  },
);

// GET /productivity-score — Get current productivity score with breakdown
hygieneRouter.get(
  "/productivity-score",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Get last 7 days of habits for scoring
    const { start, end } = getDateRange("week");

    const recentHabits = await db
      .select()
      .from(emailHabits)
      .where(
        and(
          eq(emailHabits.accountId, auth.accountId),
          gte(emailHabits.date, start),
          lte(emailHabits.date, end),
        ),
      )
      .orderBy(desc(emailHabits.date));

    if (recentHabits.length === 0) {
      return c.json({
        data: {
          overallScore: null,
          breakdown: {
            responseTime: null,
            inboxZeroRate: null,
            archiveRate: null,
            consistency: null,
          },
          daysAnalyzed: 0,
          message: "Not enough data to calculate productivity score",
        },
      });
    }

    // Calculate breakdown
    const totalDays = recentHabits.length;
    const inboxZeroDays = recentHabits.filter((h) => h.inboxZeroAchieved).length;
    const inboxZeroRate = (inboxZeroDays / totalDays) * 100;

    const responseTimes = recentHabits
      .map((h) => h.avgResponseTimeMinutes)
      .filter((t): t is number => t !== null);
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        : null;

    // Response time score: <30min = 100, <60min = 80, <120min = 60, <240min = 40, else 20
    let responseTimeScore: number | null = null;
    if (avgResponseTime !== null) {
      if (avgResponseTime < 30) responseTimeScore = 100;
      else if (avgResponseTime < 60) responseTimeScore = 80;
      else if (avgResponseTime < 120) responseTimeScore = 60;
      else if (avgResponseTime < 240) responseTimeScore = 40;
      else responseTimeScore = 20;
    }

    const totalReceived = recentHabits.reduce((sum, h) => sum + h.emailsReceived, 0);
    const totalArchived = recentHabits.reduce((sum, h) => sum + h.emailsArchived, 0);
    const archiveRate = totalReceived > 0 ? (totalArchived / totalReceived) * 100 : 0;

    // Consistency: how many days out of last 7 had activity
    const consistencyScore = (totalDays / 7) * 100;

    // Overall score: weighted average
    const weights = { responseTime: 0.3, inboxZero: 0.3, archive: 0.2, consistency: 0.2 };
    const scoreParts: number[] = [];
    if (responseTimeScore !== null) {
      scoreParts.push(responseTimeScore * weights.responseTime);
    }
    scoreParts.push(inboxZeroRate * weights.inboxZero);
    scoreParts.push(Math.min(archiveRate, 100) * weights.archive);
    scoreParts.push(consistencyScore * weights.consistency);

    const totalWeight = responseTimeScore !== null ? 1.0 : 0.7;
    const overallScore = Math.round(scoreParts.reduce((sum, s) => sum + s, 0) / totalWeight);

    return c.json({
      data: {
        overallScore: Math.min(overallScore, 100),
        breakdown: {
          responseTime: responseTimeScore !== null
            ? { score: responseTimeScore, avgMinutes: Math.round(avgResponseTime!) }
            : null,
          inboxZeroRate: { score: Math.round(inboxZeroRate), days: inboxZeroDays, total: totalDays },
          archiveRate: { score: Math.round(Math.min(archiveRate, 100)), archived: totalArchived, received: totalReceived },
          consistency: { score: Math.round(consistencyScore), activeDays: totalDays },
        },
        daysAnalyzed: totalDays,
      },
    });
  },
);

// GET /subscriptions — List all newsletter/marketing subscriptions
hygieneRouter.get(
  "/subscriptions",
  requireScope("analytics:read"),
  validateQuery(ListQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(subscriptionTracker.accountId, auth.accountId)];

    if (query.wanted !== undefined) {
      conditions.push(eq(subscriptionTracker.isWanted, query.wanted));
    }

    if (query.category) {
      conditions.push(like(subscriptionTracker.category, `%${query.category}%`));
    }

    if (query.cursor) {
      conditions.push(lt(subscriptionTracker.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(subscriptionTracker)
      .where(and(...conditions))
      .orderBy(desc(subscriptionTracker.totalReceived))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        senderEmail: row.senderEmail,
        senderName: row.senderName,
        frequency: row.frequency,
        lastReceived: row.lastReceived?.toISOString() ?? null,
        totalReceived: row.totalReceived,
        totalOpened: row.totalOpened,
        openRate: row.openRate,
        isWanted: row.isWanted,
        category: row.category,
        unsubscribeUrl: row.unsubscribeUrl,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// POST /subscriptions/:id/wanted — Mark subscription as wanted/unwanted
hygieneRouter.post(
  "/subscriptions/:id/wanted",
  requireScope("account:manage"),
  validateBody(MarkWantedSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof MarkWantedSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: subscriptionTracker.id })
      .from(subscriptionTracker)
      .where(
        and(
          eq(subscriptionTracker.id, id),
          eq(subscriptionTracker.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Subscription ${id} not found`,
            code: "subscription_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(subscriptionTracker)
      .set({ isWanted: input.isWanted, updatedAt: now })
      .where(eq(subscriptionTracker.id, id));

    return c.json({
      data: {
        id,
        isWanted: input.isWanted,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /subscriptions/audit — AI audit of all subscriptions
hygieneRouter.post(
  "/subscriptions/audit",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const allSubs = await db
      .select()
      .from(subscriptionTracker)
      .where(eq(subscriptionTracker.accountId, auth.accountId))
      .orderBy(desc(subscriptionTracker.totalReceived));

    // Categorize subscriptions by engagement
    const lowEngagement: Array<{
      id: string;
      senderEmail: string;
      senderName: string | null;
      openRate: number | null;
      totalReceived: number;
      suggestion: string;
    }> = [];
    const highVolume: Array<{
      id: string;
      senderEmail: string;
      senderName: string | null;
      totalReceived: number;
      frequency: string | null;
      suggestion: string;
    }> = [];
    const neverOpened: Array<{
      id: string;
      senderEmail: string;
      senderName: string | null;
      totalReceived: number;
      suggestion: string;
    }> = [];

    for (const sub of allSubs) {
      const openRate = sub.openRate ?? 0;

      if (sub.totalOpened === 0 && sub.totalReceived > 3) {
        neverOpened.push({
          id: sub.id,
          senderEmail: sub.senderEmail,
          senderName: sub.senderName,
          totalReceived: sub.totalReceived,
          suggestion: "You have never opened an email from this sender. Consider unsubscribing.",
        });
      } else if (openRate < 0.1 && sub.totalReceived > 5) {
        lowEngagement.push({
          id: sub.id,
          senderEmail: sub.senderEmail,
          senderName: sub.senderName,
          openRate,
          totalReceived: sub.totalReceived,
          suggestion: `Open rate is ${Math.round(openRate * 100)}%. Consider unsubscribing to reduce inbox noise.`,
        });
      }

      if (sub.totalReceived > 50) {
        highVolume.push({
          id: sub.id,
          senderEmail: sub.senderEmail,
          senderName: sub.senderName,
          totalReceived: sub.totalReceived,
          frequency: sub.frequency,
          suggestion: `High-volume sender (${sub.totalReceived} emails). Review whether daily digests or less frequent delivery is available.`,
        });
      }
    }

    return c.json({
      data: {
        totalSubscriptions: allSubs.length,
        wantedCount: allSubs.filter((s) => s.isWanted).length,
        unwantedCount: allSubs.filter((s) => !s.isWanted).length,
        suggestions: {
          neverOpened,
          lowEngagement,
          highVolume,
        },
        estimatedTimeSavedMinutesPerWeek:
          (neverOpened.length + lowEngagement.length) * 2, // rough estimate
        auditedAt: new Date().toISOString(),
      },
    });
  },
);

// GET /response-time — Response time analytics by sender/category
hygieneRouter.get(
  "/response-time",
  requireScope("analytics:read"),
  validateQuery(PeriodQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof PeriodQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const { start, end } = getDateRange(query.period);

    const habits = await db
      .select()
      .from(emailHabits)
      .where(
        and(
          eq(emailHabits.accountId, auth.accountId),
          gte(emailHabits.date, start),
          lte(emailHabits.date, end),
        ),
      )
      .orderBy(desc(emailHabits.date));

    const responseTimes = habits
      .filter((h) => h.avgResponseTimeMinutes !== null)
      .map((h) => ({
        date: h.date,
        avgResponseTimeMinutes: h.avgResponseTimeMinutes!,
      }));

    const allTimes = responseTimes.map((r) => r.avgResponseTimeMinutes);
    const avgOverall = allTimes.length > 0
      ? allTimes.reduce((sum, t) => sum + t, 0) / allTimes.length
      : null;
    const fastest = allTimes.length > 0 ? Math.min(...allTimes) : null;
    const slowest = allTimes.length > 0 ? Math.max(...allTimes) : null;

    return c.json({
      data: {
        period: query.period,
        dateRange: { start, end },
        overall: {
          avgResponseTimeMinutes: avgOverall !== null ? Math.round(avgOverall) : null,
          fastestDayMinutes: fastest !== null ? Math.round(fastest) : null,
          slowestDayMinutes: slowest !== null ? Math.round(slowest) : null,
          daysWithData: allTimes.length,
        },
        daily: responseTimes,
      },
    });
  },
);

// POST /inbox-cleanup — AI inbox cleanup suggestions
hygieneRouter.post(
  "/inbox-cleanup",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Get subscription data for cleanup recommendations
    const subscriptions = await db
      .select()
      .from(subscriptionTracker)
      .where(eq(subscriptionTracker.accountId, auth.accountId))
      .orderBy(desc(subscriptionTracker.totalReceived));

    const unsubscribeCandidates = subscriptions
      .filter(
        (s) => !s.isWanted || ((s.openRate ?? 0) < 0.05 && s.totalReceived > 10),
      )
      .map((s) => ({
        id: s.id,
        senderEmail: s.senderEmail,
        senderName: s.senderName,
        totalReceived: s.totalReceived,
        openRate: s.openRate,
        unsubscribeUrl: s.unsubscribeUrl,
      }));

    // Get recent habits for archival recommendations
    const { start, end } = getDateRange("month");
    const habits = await db
      .select()
      .from(emailHabits)
      .where(
        and(
          eq(emailHabits.accountId, auth.accountId),
          gte(emailHabits.date, start),
          lte(emailHabits.date, end),
        ),
      );

    const totalReceived = habits.reduce((sum, h) => sum + h.emailsReceived, 0);
    const totalArchived = habits.reduce((sum, h) => sum + h.emailsArchived, 0);
    const archiveRatio = totalReceived > 0 ? totalArchived / totalReceived : 0;

    return c.json({
      data: {
        suggestions: {
          unsubscribe: {
            count: unsubscribeCandidates.length,
            candidates: unsubscribeCandidates.slice(0, 20),
          },
          archiveOld: {
            suggestion: archiveRatio < 0.5
              ? "You are archiving less than half of received emails. Consider archiving more aggressively to reach inbox zero."
              : "Good archival habits. Keep it up.",
            archiveRatio: Math.round(archiveRatio * 100),
          },
          labelOrganize: {
            suggestion:
              "Create labels for frequently received categories to auto-organize incoming email.",
          },
        },
        generatedAt: new Date().toISOString(),
      },
    });
  },
);

// GET /email-volume — Email volume trends
hygieneRouter.get(
  "/email-volume",
  requireScope("analytics:read"),
  validateQuery(VolumeQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof VolumeQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const { start, end } = getDateRange(query.period);

    const habits = await db
      .select({
        date: emailHabits.date,
        emailsSent: emailHabits.emailsSent,
        emailsReceived: emailHabits.emailsReceived,
        emailsArchived: emailHabits.emailsArchived,
      })
      .from(emailHabits)
      .where(
        and(
          eq(emailHabits.accountId, auth.accountId),
          gte(emailHabits.date, start),
          lte(emailHabits.date, end),
        ),
      )
      .orderBy(emailHabits.date);

    const totalSent = habits.reduce((sum, h) => sum + h.emailsSent, 0);
    const totalReceived = habits.reduce((sum, h) => sum + h.emailsReceived, 0);
    const totalArchived = habits.reduce((sum, h) => sum + h.emailsArchived, 0);

    return c.json({
      data: {
        period: query.period,
        dateRange: { start, end },
        totals: {
          sent: totalSent,
          received: totalReceived,
          archived: totalArchived,
        },
        daily: habits,
      },
    });
  },
);

// GET /top-senders — Top senders by volume with engagement stats
hygieneRouter.get(
  "/top-senders",
  requireScope("analytics:read"),
  validateQuery(TopSendersQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof TopSendersQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select({
        id: subscriptionTracker.id,
        senderEmail: subscriptionTracker.senderEmail,
        senderName: subscriptionTracker.senderName,
        frequency: subscriptionTracker.frequency,
        totalReceived: subscriptionTracker.totalReceived,
        totalOpened: subscriptionTracker.totalOpened,
        openRate: subscriptionTracker.openRate,
        isWanted: subscriptionTracker.isWanted,
        category: subscriptionTracker.category,
        lastReceived: subscriptionTracker.lastReceived,
      })
      .from(subscriptionTracker)
      .where(eq(subscriptionTracker.accountId, auth.accountId))
      .orderBy(desc(subscriptionTracker.totalReceived))
      .limit(query.limit);

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        senderEmail: row.senderEmail,
        senderName: row.senderName,
        frequency: row.frequency,
        totalReceived: row.totalReceived,
        totalOpened: row.totalOpened,
        openRate: row.openRate,
        isWanted: row.isWanted,
        category: row.category,
        lastReceived: row.lastReceived?.toISOString() ?? null,
      })),
    });
  },
);

// POST /goals — Set email productivity goals
hygieneRouter.post(
  "/goals",
  requireScope("account:manage"),
  validateBody(SetGoalsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SetGoalsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    // Check if goals already exist for this account
    const [existing] = await db
      .select({ id: emailProductivityGoals.id })
      .from(emailProductivityGoals)
      .where(eq(emailProductivityGoals.accountId, auth.accountId))
      .limit(1);

    const goals = {
      ...(input.maxDailyChecks !== undefined ? { maxDailyChecks: input.maxDailyChecks } : {}),
      ...(input.targetResponseTimeMinutes !== undefined
        ? { targetResponseTimeMinutes: input.targetResponseTimeMinutes }
        : {}),
      ...(input.inboxZeroGoal !== undefined ? { inboxZeroGoal: input.inboxZeroGoal } : {}),
    };

    if (existing) {
      // Merge with existing goals
      const [current] = await db
        .select()
        .from(emailProductivityGoals)
        .where(eq(emailProductivityGoals.id, existing.id))
        .limit(1);

      const currentGoals = (current?.goals ?? {}) as Record<string, unknown>;
      const mergedGoals = { ...currentGoals, ...goals };

      await db
        .update(emailProductivityGoals)
        .set({ goals: mergedGoals, updatedAt: now })
        .where(eq(emailProductivityGoals.id, existing.id));

      return c.json({
        data: {
          id: existing.id,
          goals: mergedGoals,
          updatedAt: now.toISOString(),
        },
      });
    }

    // Create new
    const id = generateId();

    await db.insert(emailProductivityGoals).values({
      id,
      accountId: auth.accountId,
      goals,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          goals,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /goals — Get current goals and progress
hygieneRouter.get(
  "/goals",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [goalsRow] = await db
      .select()
      .from(emailProductivityGoals)
      .where(eq(emailProductivityGoals.accountId, auth.accountId))
      .limit(1);

    if (!goalsRow) {
      return c.json({
        data: {
          goals: null,
          progress: null,
          message: "No productivity goals set. Use POST /v1/hygiene/goals to set them.",
        },
      });
    }

    // Get today's habits for progress comparison
    const today = getTodayDate();
    const [todayHabits] = await db
      .select()
      .from(emailHabits)
      .where(
        and(
          eq(emailHabits.accountId, auth.accountId),
          eq(emailHabits.date, today),
        ),
      )
      .limit(1);

    const goals = goalsRow.goals as {
      maxDailyChecks?: number;
      targetResponseTimeMinutes?: number;
      inboxZeroGoal?: boolean;
    };

    const progress: Record<string, unknown> = {};

    if (goals.targetResponseTimeMinutes !== undefined && todayHabits?.avgResponseTimeMinutes !== null) {
      const actual = todayHabits?.avgResponseTimeMinutes ?? null;
      progress["responseTime"] = {
        target: goals.targetResponseTimeMinutes,
        actual,
        onTrack: actual !== null ? actual <= goals.targetResponseTimeMinutes : null,
      };
    }

    if (goals.inboxZeroGoal !== undefined) {
      progress["inboxZero"] = {
        goal: goals.inboxZeroGoal,
        achievedToday: todayHabits?.inboxZeroAchieved ?? false,
      };
    }

    return c.json({
      data: {
        goals,
        progress,
        createdAt: goalsRow.createdAt.toISOString(),
        updatedAt: goalsRow.updatedAt.toISOString(),
      },
    });
  },
);

export { hygieneRouter };
