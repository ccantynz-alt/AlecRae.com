/**
 * Predictive Send-Time Optimization Route (S10)
 *
 * POST /v1/send-time/predict            — Get recommended send times for a recipient
 * POST /v1/send-time/analyze            — Get full pattern analysis for a recipient
 * POST /v1/send-time/auto-schedule      — Schedule an existing email at the predicted optimal time
 * POST /v1/emails/optimal-send-time     — Batch: get optimal send time for multiple recipients
 * GET  /v1/analytics/recipient-patterns  — Get engagement patterns for a recipient
 * POST /v1/send-time/record-engagement  — Record an engagement event (open/click/reply)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, validateQuery, getValidatedBody, getValidatedQuery } from "../middleware/validator.js";
import {
  getDatabase,
  emails,
  recipientEngagement,
  engagementEvents,
} from "@alecrae/db";
import {
  analyzeRecipientPatterns,
  predictBestSendTime,
  engagementRowToPattern,
  computeUpdatedAggregates,
  type HistoricalEmail,
  type EngagementRow,
  type RecipientPattern,
  type SendTimeRecommendation,
} from "@alecrae/ai-engine/send-time";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const PredictSchema = z.object({
  recipientEmail: z.string().email(),
  senderTimezone: z.string().default("UTC"),
  recipientTimezone: z.string().optional(),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
  windowDays: z.number().int().min(1).max(30).optional(),
});

const AnalyzeSchema = z.object({
  recipientEmail: z.string().email(),
  lookbackDays: z.number().int().min(7).max(365).default(180),
});

const AutoScheduleSchema = z.object({
  emailId: z.string(),
  recipientEmail: z.string().email(),
  senderTimezone: z.string().default("UTC"),
  recipientTimezone: z.string().optional(),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
  windowDays: z.number().int().min(1).max(30).optional(),
});

const OptimalSendTimeSchema = z.object({
  recipients: z
    .array(z.string().email())
    .min(1)
    .max(50),
  senderTimezone: z.string().default("UTC"),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
  windowDays: z.number().int().min(1).max(30).optional(),
});

const RecipientPatternsQuerySchema = z.object({
  recipientEmail: z.string().email(),
});

const RecordEngagementSchema = z.object({
  recipientEmail: z.string().email(),
  emailId: z.string(),
  eventType: z.enum(["open", "click", "reply"]),
  sentAt: z.string().datetime(),
  engagedAt: z.string().datetime(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface EmailRow {
  createdAt: Date;
  sentAt: Date | null;
  toAddresses: unknown;
}

function rowsToHistorical(
  rows: readonly EmailRow[],
  recipient: string,
): HistoricalEmail[] {
  const lower = recipient.toLowerCase();
  const out: HistoricalEmail[] = [];
  for (const row of rows) {
    const tos = Array.isArray(row.toAddresses) ? row.toAddresses : [];
    const matches = tos.some((t) => {
      if (typeof t !== "object" || t === null) return false;
      const addr = (t as Record<string, unknown>)["address"];
      return typeof addr === "string" && addr.toLowerCase() === lower;
    });
    if (!matches) continue;
    const sentAt = row.sentAt ?? row.createdAt;
    out.push({ sentAt });
  }
  return out;
}

/**
 * Fetch the engagement row for a recipient within an account.
 * Returns null if not found.
 */
async function getEngagementRow(
  accountId: string,
  email: string,
): Promise<EngagementRow | null> {
  const db = getDatabase();
  const rows = await db
    .select({
      totalSent: recipientEngagement.totalSent,
      totalOpened: recipientEngagement.totalOpened,
      totalClicked: recipientEngagement.totalClicked,
      totalReplied: recipientEngagement.totalReplied,
      openRate: recipientEngagement.openRate,
      clickRate: recipientEngagement.clickRate,
      replyRate: recipientEngagement.replyRate,
      openHourDistribution: recipientEngagement.openHourDistribution,
      openDayDistribution: recipientEngagement.openDayDistribution,
      clickHourDistribution: recipientEngagement.clickHourDistribution,
      clickDayDistribution: recipientEngagement.clickDayDistribution,
      avgOpenDelayHours: recipientEngagement.avgOpenDelayHours,
      avgClickDelayHours: recipientEngagement.avgClickDelayHours,
      avgReplyDelayHours: recipientEngagement.avgReplyDelayHours,
      peakOpenHour: recipientEngagement.peakOpenHour,
      peakOpenDay: recipientEngagement.peakOpenDay,
      peakClickHour: recipientEngagement.peakClickHour,
      peakClickDay: recipientEngagement.peakClickDay,
      inferredTimezone: recipientEngagement.inferredTimezone,
    })
    .from(recipientEngagement)
    .where(
      and(
        eq(recipientEngagement.accountId, accountId),
        eq(recipientEngagement.recipientEmail, email.toLowerCase()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return row;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const sendTime = new Hono();

// POST /v1/send-time/predict
sendTime.post(
  "/predict",
  requireScope("messages:read"),
  validateBody(PredictSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof PredictSchema>>(c);
    const auth = c.get("auth");

    // Try to fetch engagement data from DB
    const engagement = await getEngagementRow(auth.accountId, input.recipientEmail);

    const recommendation: SendTimeRecommendation = await predictBestSendTime({
      recipientEmail: input.recipientEmail,
      senderTimezone: input.senderTimezone,
      urgency: input.urgency,
      ...(input.recipientTimezone !== undefined ? { recipientTimezone: input.recipientTimezone } : {}),
      ...(input.windowDays !== undefined ? { windowDays: input.windowDays } : {}),
      engagement,
    });

    return c.json({ data: recommendation });
  },
);

// POST /v1/send-time/analyze
sendTime.post(
  "/analyze",
  requireScope("messages:read"),
  validateBody(AnalyzeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AnalyzeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // First check DB engagement data
    const engagement = await getEngagementRow(auth.accountId, input.recipientEmail);

    if (engagement && engagement.totalOpened > 0) {
      const pattern: RecipientPattern = engagementRowToPattern(engagement);
      return c.json({
        data: {
          recipientEmail: input.recipientEmail,
          sampleSize: engagement.totalSent,
          source: "aggregated" as const,
          pattern,
        },
      });
    }

    // Fallback: scan raw email data
    const rows = await db
      .select({
        createdAt: emails.createdAt,
        sentAt: emails.sentAt,
        toAddresses: emails.toAddresses,
      })
      .from(emails)
      .where(eq(emails.accountId, auth.accountId))
      .orderBy(desc(emails.createdAt))
      .limit(500);

    const historical = rowsToHistorical(rows, input.recipientEmail);
    const pattern: RecipientPattern = await analyzeRecipientPatterns(
      input.recipientEmail,
      historical,
    );

    return c.json({
      data: {
        recipientEmail: input.recipientEmail,
        sampleSize: historical.length,
        source: "raw_scan" as const,
        pattern,
      },
    });
  },
);

// POST /v1/send-time/auto-schedule
sendTime.post(
  "/auto-schedule",
  requireScope("messages:send"),
  validateBody(AutoScheduleSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AutoScheduleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const engagement = await getEngagementRow(auth.accountId, input.recipientEmail);

    const recommendation: SendTimeRecommendation = await predictBestSendTime({
      recipientEmail: input.recipientEmail,
      senderTimezone: input.senderTimezone,
      urgency: input.urgency,
      ...(input.recipientTimezone !== undefined ? { recipientTimezone: input.recipientTimezone } : {}),
      ...(input.windowDays !== undefined ? { windowDays: input.windowDays } : {}),
      engagement,
    });

    const top = recommendation.recommendedTimes[0];
    if (!top) {
      return c.json(
        {
          error: {
            type: "no_recommendation",
            message: "No optimal send time could be determined",
            code: "no_send_time",
          },
        },
        422,
      );
    }

    const sendAt = new Date(top.datetime);
    if (sendAt <= new Date()) {
      return c.json(
        {
          error: {
            type: "invalid_time",
            message: "Optimal send time has already passed",
            code: "past_send_time",
          },
        },
        422,
      );
    }

    const result = await db
      .update(emails)
      .set({
        scheduledAt: sendAt,
        status: "queued",
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
      .returning({ id: emails.id });

    if (result.length === 0) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Email ${input.emailId} not found`,
            code: "email_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        emailId: input.emailId,
        scheduledAt: sendAt.toISOString(),
        confidence: top.confidence,
        reasoning: top.reasoning,
        dataSource: recommendation.dataSource,
        alternatives: recommendation.recommendedTimes.slice(1),
      },
    });
  },
);

// POST /v1/send-time/record-engagement — Record engagement event + update aggregates
sendTime.post(
  "/record-engagement",
  requireScope("messages:send"),
  validateBody(RecordEngagementSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof RecordEngagementSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const sentDate = new Date(input.sentAt);
    const engagedDate = new Date(input.engagedAt);
    const delaySeconds = Math.max(
      0,
      Math.floor((engagedDate.getTime() - sentDate.getTime()) / 1000),
    );
    const delayHours = delaySeconds / 3600;
    const engagedHour = engagedDate.getUTCHours();
    const engagedDayOfWeek = engagedDate.getUTCDay();
    const normalizedEmail = input.recipientEmail.toLowerCase().trim();

    // 1. Insert the raw engagement event
    const eventId = generateId();
    await db.insert(engagementEvents).values({
      id: eventId,
      accountId: auth.accountId,
      recipientEmail: normalizedEmail,
      emailId: input.emailId,
      eventType: input.eventType,
      sentAt: sentDate,
      engagedAt: engagedDate,
      delaySeconds,
      engagedHour,
      engagedDayOfWeek,
    });

    // 2. Upsert + update the aggregate row
    const existing = await getEngagementRow(auth.accountId, normalizedEmail);

    if (!existing) {
      // Create a new engagement row
      const hourDist: Record<string, number> = {};
      const dayDist: Record<string, number> = {};
      hourDist[String(engagedHour)] = 1;
      dayDist[String(engagedDayOfWeek)] = 1;

      const isOpen = input.eventType === "open";
      const isClick = input.eventType === "click";
      const isReply = input.eventType === "reply";

      await db.insert(recipientEngagement).values({
        id: generateId(),
        accountId: auth.accountId,
        recipientEmail: normalizedEmail,
        totalSent: 1,
        totalOpened: isOpen ? 1 : 0,
        totalClicked: isClick ? 1 : 0,
        totalReplied: isReply ? 1 : 0,
        openRate: isOpen ? 1 : 0,
        clickRate: isClick ? 1 : 0,
        replyRate: isReply ? 1 : 0,
        openHourDistribution: isOpen ? hourDist : {},
        openDayDistribution: isOpen ? dayDist : {},
        clickHourDistribution: isClick ? hourDist : {},
        clickDayDistribution: isClick ? dayDist : {},
        avgOpenDelayHours: isOpen ? delayHours : null,
        avgClickDelayHours: isClick ? delayHours : null,
        avgReplyDelayHours: isReply ? delayHours : null,
        peakOpenHour: isOpen ? engagedHour : null,
        peakOpenDay: isOpen ? engagedDayOfWeek : null,
        peakClickHour: isClick ? engagedHour : null,
        peakClickDay: isClick ? engagedDayOfWeek : null,
        firstInteractionAt: engagedDate,
        lastInteractionAt: engagedDate,
      });
    } else {
      // Update existing aggregates
      const updates = computeUpdatedAggregates(
        existing,
        input.eventType,
        engagedDate,
        delayHours,
      );

      await db
        .update(recipientEngagement)
        .set({
          ...updates,
          lastInteractionAt: engagedDate,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(recipientEngagement.accountId, auth.accountId),
            eq(recipientEngagement.recipientEmail, normalizedEmail),
          ),
        );
    }

    return c.json({
      data: {
        eventId,
        recipientEmail: normalizedEmail,
        eventType: input.eventType,
        delaySeconds,
        recorded: true,
      },
    });
  },
);

// ─── Optimal Send Time (batch) ──────────────────────────────────────────────

const optimalSendTime = new Hono();

// POST /v1/emails/optimal-send-time
optimalSendTime.post(
  "/optimal-send-time",
  requireScope("messages:read"),
  validateBody(OptimalSendTimeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof OptimalSendTimeSchema>>(c);
    const auth = c.get("auth");

    const results: {
      recipientEmail: string;
      recommendation: SendTimeRecommendation;
    }[] = [];

    for (const recipient of input.recipients) {
      const engagement = await getEngagementRow(auth.accountId, recipient);
      const recommendation: SendTimeRecommendation = await predictBestSendTime({
        recipientEmail: recipient,
        senderTimezone: input.senderTimezone,
        urgency: input.urgency,
        ...(input.windowDays !== undefined ? { windowDays: input.windowDays } : {}),
        engagement,
      });

      results.push({
        recipientEmail: recipient,
        recommendation,
      });
    }

    // Compute a consensus time: the most common top recommendation
    const timeCounts = new Map<string, number>();
    for (const r of results) {
      const topTime = r.recommendation.recommendedTimes[0]?.datetime;
      if (topTime) {
        timeCounts.set(topTime, (timeCounts.get(topTime) ?? 0) + 1);
      }
    }
    const sortedTimes = [...timeCounts.entries()].sort((a, b) => b[1] - a[1]);
    const consensusTime = sortedTimes[0]?.[0] ?? null;

    return c.json({
      data: {
        recipients: results,
        consensusOptimalTime: consensusTime,
        recipientCount: input.recipients.length,
      },
    });
  },
);

// ─── Recipient Patterns (analytics) ─────────────────────────────────────────

const recipientPatterns = new Hono();

// GET /v1/analytics/recipient-patterns?recipientEmail=...
recipientPatterns.get(
  "/recipient-patterns",
  requireScope("analytics:read"),
  validateQuery(RecipientPatternsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof RecipientPatternsQuerySchema>>(c);
    const auth = c.get("auth");

    const engagement = await getEngagementRow(auth.accountId, query.recipientEmail);

    if (!engagement) {
      return c.json({
        data: {
          recipientEmail: query.recipientEmail,
          hasData: false,
          pattern: null,
          engagement: null,
        },
      });
    }

    const pattern: RecipientPattern = engagementRowToPattern(engagement);

    return c.json({
      data: {
        recipientEmail: query.recipientEmail,
        hasData: true,
        pattern,
        engagement: {
          totalSent: engagement.totalSent,
          totalOpened: engagement.totalOpened,
          totalClicked: engagement.totalClicked,
          totalReplied: engagement.totalReplied,
          openRate: engagement.openRate,
          clickRate: engagement.clickRate,
          replyRate: engagement.replyRate,
          avgOpenDelayHours: engagement.avgOpenDelayHours,
          avgClickDelayHours: engagement.avgClickDelayHours,
          avgReplyDelayHours: engagement.avgReplyDelayHours,
          peakOpenHour: engagement.peakOpenHour,
          peakOpenDay: engagement.peakOpenDay,
          inferredTimezone: engagement.inferredTimezone,
        },
      },
    });
  },
);

export { sendTime, optimalSendTime, recipientPatterns };
