/**
 * Analytics Dashboard Route
 *
 * GET    /v1/analytics-dashboard/overview        — Dashboard overview with period comparison
 * GET    /v1/analytics-dashboard/trends           — Trend data over time (daily/weekly/monthly)
 * GET    /v1/analytics-dashboard/top-senders      — Top senders by volume
 * GET    /v1/analytics-dashboard/top-recipients   — Top recipients by volume
 * GET    /v1/analytics-dashboard/engagement       — Engagement metrics (open/click/reply/bounce rates)
 * POST   /v1/analytics-dashboard/snapshot         — Create/update today's snapshot (upsert by date)
 * GET    /v1/analytics-dashboard/goals            — List analytics goals
 * POST   /v1/analytics-dashboard/goals            — Create analytics goal
 * PUT    /v1/analytics-dashboard/goals/:id        — Update goal
 * DELETE /v1/analytics-dashboard/goals/:id        — Delete goal
 * GET    /v1/analytics-dashboard/comparison       — Compare two date ranges side by side
 * GET    /v1/analytics-dashboard/export           — Export analytics as JSON (date range filter)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  analyticsSnapshots,
  analyticsGoals,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PeriodQuerySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

const DateRangeQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

const TopQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const SnapshotBodySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  emailsSent: z.number().int().min(0).default(0),
  emailsReceived: z.number().int().min(0).default(0),
  emailsOpened: z.number().int().min(0).default(0),
  emailsClicked: z.number().int().min(0).default(0),
  emailsBounced: z.number().int().min(0).default(0),
  emailsReplied: z.number().int().min(0).default(0),
  avgResponseTimeMinutes: z.number().min(0).nullable().optional(),
  topSenders: z.array(z.string()).optional(),
  topRecipients: z.array(z.string()).optional(),
  topSubjects: z.array(z.string()).optional(),
});

const CreateGoalSchema = z.object({
  metric: z.enum(["response_time", "open_rate", "inbox_zero_days", "emails_sent"]),
  targetValue: z.number().min(0),
  currentValue: z.number().min(0).default(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
});

const UpdateGoalSchema = z.object({
  targetValue: z.number().min(0).optional(),
  currentValue: z.number().min(0).optional(),
  isAchieved: z.boolean().optional(),
});

const ComparisonQuerySchema = z.object({
  startDate1: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  endDate1: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  startDate2: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  endDate2: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

const ExportQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]!;
}

function getDefaultDateRange(period: "daily" | "weekly" | "monthly"): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0]!;
  const startDate = new Date(now);

  switch (period) {
    case "daily":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "weekly":
      startDate.setDate(startDate.getDate() - 90);
      break;
    case "monthly":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  const start = startDate.toISOString().split("T")[0]!;
  return { start, end };
}

function getPreviousPeriodRange(start: string, end: string): { start: string; end: string } {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const durationMs = endMs - startMs;

  const prevEnd = new Date(startMs - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return {
    start: prevStart.toISOString().split("T")[0]!,
    end: prevEnd.toISOString().split("T")[0]!,
  };
}

interface AggregatedMetrics {
  totalSent: number;
  totalReceived: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalReplied: number;
  avgResponseTimeMinutes: number | null;
}

function aggregateSnapshots(rows: Array<{
  emailsSent: number;
  emailsReceived: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsBounced: number;
  emailsReplied: number;
  avgResponseTimeMinutes: number | null;
}>): AggregatedMetrics {
  const totalSent = rows.reduce((sum, r) => sum + r.emailsSent, 0);
  const totalReceived = rows.reduce((sum, r) => sum + r.emailsReceived, 0);
  const totalOpened = rows.reduce((sum, r) => sum + r.emailsOpened, 0);
  const totalClicked = rows.reduce((sum, r) => sum + r.emailsClicked, 0);
  const totalBounced = rows.reduce((sum, r) => sum + r.emailsBounced, 0);
  const totalReplied = rows.reduce((sum, r) => sum + r.emailsReplied, 0);

  const responseTimes = rows
    .map((r) => r.avgResponseTimeMinutes)
    .filter((t): t is number => t !== null);
  const avgResponseTimeMinutes =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : null;

  return {
    totalSent,
    totalReceived,
    totalOpened,
    totalClicked,
    totalBounced,
    totalReplied,
    avgResponseTimeMinutes,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const analyticsDashboardRouter = new Hono();

// GET /overview — Dashboard overview with period comparison
analyticsDashboardRouter.get(
  "/overview",
  requireScope("analytics:read"),
  validateQuery(PeriodQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof PeriodQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const { start, end } = getDefaultDateRange(query.period);
    const prev = getPreviousPeriodRange(start, end);

    const currentRows = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, start),
          lte(analyticsSnapshots.date, end),
        ),
      )
      .orderBy(desc(analyticsSnapshots.date));

    const previousRows = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, prev.start),
          lte(analyticsSnapshots.date, prev.end),
        ),
      )
      .orderBy(desc(analyticsSnapshots.date));

    const current = aggregateSnapshots(currentRows);
    const previous = aggregateSnapshots(previousRows);

    const pctChange = (cur: number, prev: number): number | null => {
      if (prev === 0) return cur > 0 ? 100 : null;
      return Math.round(((cur - prev) / prev) * 100);
    };

    return c.json({
      data: {
        current: {
          ...current,
          avgResponseTimeMinutes:
            current.avgResponseTimeMinutes !== null
              ? Math.round(current.avgResponseTimeMinutes)
              : null,
          snapshotCount: currentRows.length,
        },
        previous: {
          ...previous,
          avgResponseTimeMinutes:
            previous.avgResponseTimeMinutes !== null
              ? Math.round(previous.avgResponseTimeMinutes)
              : null,
          snapshotCount: previousRows.length,
        },
        changes: {
          sent: pctChange(current.totalSent, previous.totalSent),
          received: pctChange(current.totalReceived, previous.totalReceived),
          opened: pctChange(current.totalOpened, previous.totalOpened),
          clicked: pctChange(current.totalClicked, previous.totalClicked),
          bounced: pctChange(current.totalBounced, previous.totalBounced),
          replied: pctChange(current.totalReplied, previous.totalReplied),
        },
        period: query.period,
        dateRange: { start, end },
        previousDateRange: prev,
      },
    });
  },
);

// GET /trends — Trend data over time
analyticsDashboardRouter.get(
  "/trends",
  requireScope("analytics:read"),
  validateQuery(DateRangeQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof DateRangeQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, query.startDate),
          lte(analyticsSnapshots.date, query.endDate),
        ),
      )
      .orderBy(analyticsSnapshots.date);

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        date: row.date,
        period: row.period,
        emailsSent: row.emailsSent,
        emailsReceived: row.emailsReceived,
        emailsOpened: row.emailsOpened,
        emailsClicked: row.emailsClicked,
        emailsBounced: row.emailsBounced,
        emailsReplied: row.emailsReplied,
        avgResponseTimeMinutes: row.avgResponseTimeMinutes,
      })),
      dateRange: { start: query.startDate, end: query.endDate },
      period: query.period,
      count: rows.length,
    });
  },
);

// GET /top-senders — Top senders by volume
analyticsDashboardRouter.get(
  "/top-senders",
  requireScope("analytics:read"),
  validateQuery(TopQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof TopQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const { start, end } = query.startDate && query.endDate
      ? { start: query.startDate, end: query.endDate }
      : getDefaultDateRange(query.period);

    const rows = await db
      .select({
        topSenders: analyticsSnapshots.topSenders,
        date: analyticsSnapshots.date,
      })
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, start),
          lte(analyticsSnapshots.date, end),
        ),
      )
      .orderBy(desc(analyticsSnapshots.date));

    // Aggregate sender frequency across snapshots
    const senderCounts = new Map<string, number>();
    for (const row of rows) {
      const senders = (row.topSenders ?? []) as string[];
      for (const sender of senders) {
        senderCounts.set(sender, (senderCounts.get(sender) ?? 0) + 1);
      }
    }

    const sorted = Array.from(senderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, query.limit)
      .map(([email, appearances]) => ({ email, appearances }));

    return c.json({
      data: sorted,
      dateRange: { start, end },
      period: query.period,
    });
  },
);

// GET /top-recipients — Top recipients by volume
analyticsDashboardRouter.get(
  "/top-recipients",
  requireScope("analytics:read"),
  validateQuery(TopQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof TopQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const { start, end } = query.startDate && query.endDate
      ? { start: query.startDate, end: query.endDate }
      : getDefaultDateRange(query.period);

    const rows = await db
      .select({
        topRecipients: analyticsSnapshots.topRecipients,
        date: analyticsSnapshots.date,
      })
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, start),
          lte(analyticsSnapshots.date, end),
        ),
      )
      .orderBy(desc(analyticsSnapshots.date));

    // Aggregate recipient frequency across snapshots
    const recipientCounts = new Map<string, number>();
    for (const row of rows) {
      const recipients = (row.topRecipients ?? []) as string[];
      for (const recipient of recipients) {
        recipientCounts.set(recipient, (recipientCounts.get(recipient) ?? 0) + 1);
      }
    }

    const sorted = Array.from(recipientCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, query.limit)
      .map(([email, appearances]) => ({ email, appearances }));

    return c.json({
      data: sorted,
      dateRange: { start, end },
      period: query.period,
    });
  },
);

// GET /engagement — Engagement metrics (open rate, click rate, reply rate, bounce rate)
analyticsDashboardRouter.get(
  "/engagement",
  requireScope("analytics:read"),
  validateQuery(DateRangeQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof DateRangeQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, query.startDate),
          lte(analyticsSnapshots.date, query.endDate),
        ),
      )
      .orderBy(analyticsSnapshots.date);

    const agg = aggregateSnapshots(rows);

    const safeRate = (numerator: number, denominator: number): number | null => {
      if (denominator === 0) return null;
      return Math.round((numerator / denominator) * 10000) / 100; // 2 decimal %
    };

    return c.json({
      data: {
        openRate: safeRate(agg.totalOpened, agg.totalSent),
        clickRate: safeRate(agg.totalClicked, agg.totalSent),
        replyRate: safeRate(agg.totalReplied, agg.totalReceived),
        bounceRate: safeRate(agg.totalBounced, agg.totalSent),
        totals: {
          sent: agg.totalSent,
          received: agg.totalReceived,
          opened: agg.totalOpened,
          clicked: agg.totalClicked,
          bounced: agg.totalBounced,
          replied: agg.totalReplied,
        },
        avgResponseTimeMinutes:
          agg.avgResponseTimeMinutes !== null
            ? Math.round(agg.avgResponseTimeMinutes)
            : null,
        daily: rows.map((row) => ({
          date: row.date,
          openRate: safeRate(row.emailsOpened, row.emailsSent),
          clickRate: safeRate(row.emailsClicked, row.emailsSent),
          replyRate: safeRate(row.emailsReplied, row.emailsReceived),
          bounceRate: safeRate(row.emailsBounced, row.emailsSent),
        })),
        dateRange: { start: query.startDate, end: query.endDate },
        period: query.period,
      },
    });
  },
);

// POST /snapshot — Create/update today's snapshot (upsert by date)
analyticsDashboardRouter.post(
  "/snapshot",
  requireScope("messages:write"),
  validateBody(SnapshotBodySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SnapshotBodySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const date = input.date ?? getTodayDate();
    const now = new Date();

    // Check for existing snapshot on this date + period
    const [existing] = await db
      .select({ id: analyticsSnapshots.id })
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, input.period),
          eq(analyticsSnapshots.date, date),
        ),
      )
      .limit(1);

    if (existing) {
      // Update existing snapshot
      await db
        .update(analyticsSnapshots)
        .set({
          emailsSent: input.emailsSent,
          emailsReceived: input.emailsReceived,
          emailsOpened: input.emailsOpened,
          emailsClicked: input.emailsClicked,
          emailsBounced: input.emailsBounced,
          emailsReplied: input.emailsReplied,
          avgResponseTimeMinutes: input.avgResponseTimeMinutes ?? null,
          topSenders: input.topSenders ?? [],
          topRecipients: input.topRecipients ?? [],
          topSubjects: input.topSubjects ?? [],
        })
        .where(eq(analyticsSnapshots.id, existing.id));

      return c.json({
        data: {
          id: existing.id,
          date,
          period: input.period,
          upserted: "updated",
          updatedAt: now.toISOString(),
        },
      });
    }

    // Create new snapshot
    const id = generateId();

    await db.insert(analyticsSnapshots).values({
      id,
      accountId: auth.accountId,
      period: input.period,
      date,
      emailsSent: input.emailsSent,
      emailsReceived: input.emailsReceived,
      emailsOpened: input.emailsOpened,
      emailsClicked: input.emailsClicked,
      emailsBounced: input.emailsBounced,
      emailsReplied: input.emailsReplied,
      avgResponseTimeMinutes: input.avgResponseTimeMinutes ?? null,
      topSenders: input.topSenders ?? [],
      topRecipients: input.topRecipients ?? [],
      topSubjects: input.topSubjects ?? [],
      createdAt: now,
    });

    return c.json(
      {
        data: {
          id,
          date,
          period: input.period,
          upserted: "created",
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /goals — List analytics goals
analyticsDashboardRouter.get(
  "/goals",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(analyticsGoals)
      .where(eq(analyticsGoals.accountId, auth.accountId))
      .orderBy(desc(analyticsGoals.createdAt));

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        metric: row.metric,
        targetValue: row.targetValue,
        currentValue: row.currentValue,
        startDate: row.startDate,
        endDate: row.endDate,
        isAchieved: row.isAchieved,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      count: rows.length,
    });
  },
);

// POST /goals — Create analytics goal
analyticsDashboardRouter.post(
  "/goals",
  requireScope("messages:write"),
  validateBody(CreateGoalSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateGoalSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(analyticsGoals).values({
      id,
      accountId: auth.accountId,
      metric: input.metric,
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      startDate: input.startDate,
      endDate: input.endDate,
      isAchieved: false,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          metric: input.metric,
          targetValue: input.targetValue,
          currentValue: input.currentValue,
          startDate: input.startDate,
          endDate: input.endDate,
          isAchieved: false,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// PUT /goals/:id — Update goal (targetValue, currentValue, isAchieved)
analyticsDashboardRouter.put(
  "/goals/:id",
  requireScope("messages:write"),
  validateBody(UpdateGoalSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateGoalSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: analyticsGoals.id })
      .from(analyticsGoals)
      .where(
        and(
          eq(analyticsGoals.id, id),
          eq(analyticsGoals.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Analytics goal ${id} not found`,
            code: "goal_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (input.targetValue !== undefined) {
      updates["targetValue"] = input.targetValue;
    }
    if (input.currentValue !== undefined) {
      updates["currentValue"] = input.currentValue;
    }
    if (input.isAchieved !== undefined) {
      updates["isAchieved"] = input.isAchieved;
    }

    await db
      .update(analyticsGoals)
      .set(updates)
      .where(eq(analyticsGoals.id, id));

    return c.json({
      data: {
        id,
        ...input,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /goals/:id — Delete goal
analyticsDashboardRouter.delete(
  "/goals/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: analyticsGoals.id })
      .from(analyticsGoals)
      .where(
        and(
          eq(analyticsGoals.id, id),
          eq(analyticsGoals.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Analytics goal ${id} not found`,
            code: "goal_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(analyticsGoals)
      .where(eq(analyticsGoals.id, id));

    return c.json({
      data: {
        id,
        deleted: true,
      },
    });
  },
);

// GET /comparison — Compare two date ranges side by side
analyticsDashboardRouter.get(
  "/comparison",
  requireScope("analytics:read"),
  validateQuery(ComparisonQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ComparisonQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const range1Rows = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, query.startDate1),
          lte(analyticsSnapshots.date, query.endDate1),
        ),
      )
      .orderBy(analyticsSnapshots.date);

    const range2Rows = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, query.startDate2),
          lte(analyticsSnapshots.date, query.endDate2),
        ),
      )
      .orderBy(analyticsSnapshots.date);

    const range1 = aggregateSnapshots(range1Rows);
    const range2 = aggregateSnapshots(range2Rows);

    const diff = (a: number, b: number): number => a - b;

    return c.json({
      data: {
        range1: {
          dateRange: { start: query.startDate1, end: query.endDate1 },
          ...range1,
          avgResponseTimeMinutes:
            range1.avgResponseTimeMinutes !== null
              ? Math.round(range1.avgResponseTimeMinutes)
              : null,
          snapshotCount: range1Rows.length,
        },
        range2: {
          dateRange: { start: query.startDate2, end: query.endDate2 },
          ...range2,
          avgResponseTimeMinutes:
            range2.avgResponseTimeMinutes !== null
              ? Math.round(range2.avgResponseTimeMinutes)
              : null,
          snapshotCount: range2Rows.length,
        },
        difference: {
          sent: diff(range1.totalSent, range2.totalSent),
          received: diff(range1.totalReceived, range2.totalReceived),
          opened: diff(range1.totalOpened, range2.totalOpened),
          clicked: diff(range1.totalClicked, range2.totalClicked),
          bounced: diff(range1.totalBounced, range2.totalBounced),
          replied: diff(range1.totalReplied, range2.totalReplied),
        },
        period: query.period,
      },
    });
  },
);

// GET /export — Export analytics as JSON (date range filter)
analyticsDashboardRouter.get(
  "/export",
  requireScope("analytics:read"),
  validateQuery(ExportQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ExportQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.accountId, auth.accountId),
          eq(analyticsSnapshots.period, query.period),
          gte(analyticsSnapshots.date, query.startDate),
          lte(analyticsSnapshots.date, query.endDate),
        ),
      )
      .orderBy(analyticsSnapshots.date);

    const agg = aggregateSnapshots(rows);

    return c.json({
      data: {
        meta: {
          accountId: auth.accountId,
          exportedAt: new Date().toISOString(),
          dateRange: { start: query.startDate, end: query.endDate },
          period: query.period,
          snapshotCount: rows.length,
        },
        summary: {
          ...agg,
          avgResponseTimeMinutes:
            agg.avgResponseTimeMinutes !== null
              ? Math.round(agg.avgResponseTimeMinutes)
              : null,
        },
        snapshots: rows.map((row) => ({
          id: row.id,
          date: row.date,
          period: row.period,
          emailsSent: row.emailsSent,
          emailsReceived: row.emailsReceived,
          emailsOpened: row.emailsOpened,
          emailsClicked: row.emailsClicked,
          emailsBounced: row.emailsBounced,
          emailsReplied: row.emailsReplied,
          avgResponseTimeMinutes: row.avgResponseTimeMinutes,
          topSenders: row.topSenders,
          topRecipients: row.topRecipients,
          topSubjects: row.topSubjects,
          createdAt: row.createdAt.toISOString(),
        })),
      },
    });
  },
);

export { analyticsDashboardRouter };
