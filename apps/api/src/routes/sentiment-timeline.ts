import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, gt as _gt, lt, gte, sql, count as _count } from "drizzle-orm";
import { getDatabase, sentimentTimeline, relationshipHealth } from "@alecrae/db";
import { generateId } from "../lib/jwt.js";
import { requireScope } from "../middleware/auth.js";
import { validateBody, validateQuery, getValidatedBody, getValidatedQuery } from "../middleware/validator.js";
import { analyzeEmailSentiment, type EmailSentiment } from "@alecrae/ai-engine/intelligence/sentiment-analyzer";

const SENTIMENT_LEVELS = ["very_positive", "positive", "neutral", "negative", "very_negative"] as const;
const TOPIC_KEYWORDS = ["project", "deadline", "budget", "meeting", "review", "update", "proposal", "report"];

/** Schema's score column is documented 0.0-1.0; the analyzer's is -1.0-1.0. */
function toSchemaScore(analyzerScore: number): number {
  return Math.max(0, Math.min(1, (analyzerScore + 1) / 2));
}

async function runSentimentAnalysis(content: string): Promise<EmailSentiment> {
  try {
    return await analyzeEmailSentiment({ subject: "", body: content });
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")
        ? "Sentiment analysis is unavailable — no AI provider configured."
        : `Sentiment analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const AnalyzeBodySchema = z.object({
  emailId: z.string().min(1),
  content: z.string().min(1),
  senderEmail: z.string().email(),
  senderName: z.string().optional(),
});

const TimelineQuerySchema = z.object({
  contactEmail: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

const ContactsQuerySchema = z.object({
  riskLevel: z.enum(["none", "low", "medium", "high"]).optional(),
  sortBy: z.enum(["healthScore", "totalInteractions", "updatedAt"]).optional().default("updatedAt"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

const TrendsQuerySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

const BatchAnalyzeBodySchema = z.object({
  emails: z
    .array(
      z.object({
        emailId: z.string().min(1),
        content: z.string().min(1),
        senderEmail: z.string().email(),
        senderName: z.string().optional(),
      }),
    )
    .min(1)
    .max(50),
});

const sentimentTimelineRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /analyze — analyze sentiment of an email
// ---------------------------------------------------------------------------

sentimentTimelineRouter.post(
  "/analyze",
  requireScope("messages:write"),
  validateBody(AnalyzeBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof AnalyzeBodySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    let analysis: EmailSentiment;
    try {
      analysis = await runSentimentAnalysis(body.content);
    } catch (err) {
      return c.json({ error: { message: err instanceof Error ? err.message : String(err), code: "sentiment_analysis_unavailable" } }, 503);
    }

    const contentLower = body.content.toLowerCase();
    const topics = TOPIC_KEYWORDS.filter((t) => contentLower.includes(t));
    const sentiment = analysis.sentiment;
    const score = toSchemaScore(analysis.score);
    const emotionalTone = analysis.emotions[0] ?? null;
    const sentimentIdx = SENTIMENT_LEVELS.indexOf(sentiment);

    const id = generateId();
    const [entry] = await db
      .insert(sentimentTimeline)
      .values({
        id,
        accountId,
        contactEmail: body.senderEmail,
        emailId: body.emailId,
        sentiment,
        score,
        topics,
        emotionalTone,
      })
      .returning();

    const existing = await db
      .select()
      .from(relationshipHealth)
      .where(
        and(
          eq(relationshipHealth.accountId, accountId),
          eq(relationshipHealth.contactEmail, body.senderEmail),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const record = existing[0];
      if (!record) return c.json({ error: "unexpected empty result" }, 500);
      const newTotal = record.totalInteractions + 1;
      const newAvg = (record.avgSentiment * record.totalInteractions + score) / newTotal;
      const trend = newAvg > record.avgSentiment + 0.05 ? "improving" : newAvg < record.avgSentiment - 0.05 ? "declining" : "stable";
      const risk = newAvg < 0.25 ? "high" : newAvg < 0.4 ? "medium" : newAvg < 0.5 ? "low" : "none";

      await db
        .update(relationshipHealth)
        .set({
          healthScore: Math.round(newAvg * 100),
          avgSentiment: newAvg,
          totalInteractions: newTotal,
          trendDirection: trend,
          riskLevel: risk,
          ...(sentimentIdx <= 1 ? { lastPositiveAt: new Date() } : {}),
          ...(sentimentIdx >= 3 ? { lastNegativeAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(relationshipHealth.id, record.id));
    } else {
      const risk = score < 0.25 ? "high" : score < 0.4 ? "medium" : score < 0.5 ? "low" : "none";
      await db.insert(relationshipHealth).values({
        id: generateId(),
        accountId,
        contactEmail: body.senderEmail,
        contactName: body.senderName ?? null,
        healthScore: Math.round(score * 100),
        trendDirection: "stable",
        avgSentiment: score,
        totalInteractions: 1,
        riskLevel: risk,
        ...(sentimentIdx <= 1 ? { lastPositiveAt: new Date() } : {}),
        ...(sentimentIdx >= 3 ? { lastNegativeAt: new Date() } : {}),
      });
    }

    return c.json({ success: true, data: entry });
  },
);

// ---------------------------------------------------------------------------
// GET /timeline — get sentiment timeline
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/timeline",
  requireScope("analytics:read"),
  validateQuery(TimelineQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof TimelineQuerySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const conditions = [eq(sentimentTimeline.accountId, accountId)];
    if (query.contactEmail) conditions.push(eq(sentimentTimeline.contactEmail, query.contactEmail));
    const cutoff = new Date(Date.now() - query.days * 86400000);
    conditions.push(gte(sentimentTimeline.createdAt, cutoff));
    if (query.cursor) conditions.push(lt(sentimentTimeline.id, query.cursor));

    const rows = await db
      .select()
      .from(sentimentTimeline)
      .where(and(...conditions))
      .orderBy(desc(sentimentTimeline.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    if (hasMore) rows.pop();

    return c.json({
      data: rows,
      pagination: { hasMore, nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /timeline/:contactEmail — timeline for specific contact
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/timeline/:contactEmail",
  requireScope("analytics:read"),
  async (c) => {
    const contactEmail = c.req.param("contactEmail");
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const rows = await db
      .select()
      .from(sentimentTimeline)
      .where(
        and(
          eq(sentimentTimeline.accountId, accountId),
          eq(sentimentTimeline.contactEmail, contactEmail),
        ),
      )
      .orderBy(desc(sentimentTimeline.createdAt))
      .limit(100);

    return c.json({ data: rows });
  },
);

// ---------------------------------------------------------------------------
// GET /contacts — list contacts with relationship health
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/contacts",
  requireScope("analytics:read"),
  validateQuery(ContactsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ContactsQuerySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const conditions = [eq(relationshipHealth.accountId, accountId)];
    if (query.riskLevel) conditions.push(eq(relationshipHealth.riskLevel, query.riskLevel));
    if (query.cursor) conditions.push(lt(relationshipHealth.id, query.cursor));

    const orderCol = query.sortBy === "healthScore" ? relationshipHealth.healthScore
      : query.sortBy === "totalInteractions" ? relationshipHealth.totalInteractions
      : relationshipHealth.updatedAt;

    const rows = await db
      .select()
      .from(relationshipHealth)
      .where(and(...conditions))
      .orderBy(desc(orderCol))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    if (hasMore) rows.pop();

    return c.json({
      data: rows,
      pagination: { hasMore, nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /contacts/:contactEmail — specific contact health
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/contacts/:contactEmail",
  requireScope("analytics:read"),
  async (c) => {
    const contactEmail = c.req.param("contactEmail");
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(relationshipHealth)
      .where(
        and(
          eq(relationshipHealth.accountId, accountId),
          eq(relationshipHealth.contactEmail, contactEmail),
        ),
      )
      .limit(1);

    if (!record) return c.json({ error: { type: "not_found", message: "Contact not found" } }, 404);
    return c.json({ data: record });
  },
);

// ---------------------------------------------------------------------------
// GET /trends — aggregate sentiment trends
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/trends",
  requireScope("analytics:read"),
  validateQuery(TrendsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof TrendsQuerySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const cutoff = new Date(Date.now() - query.days * 86400000);
    const truncFn = query.period === "monthly" ? "month" : query.period === "weekly" ? "week" : "day";

    const rows = await db
      .select({
        period: sql<string>`date_trunc(${truncFn}, ${sentimentTimeline.createdAt})::text`.as("period"),
        avgScore: sql<number>`avg(${sentimentTimeline.score})`.as("avg_score"),
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(sentimentTimeline)
      .where(
        and(
          eq(sentimentTimeline.accountId, accountId),
          gte(sentimentTimeline.createdAt, cutoff),
        ),
      )
      .groupBy(sql`date_trunc(${truncFn}, ${sentimentTimeline.createdAt})`)
      .orderBy(sql`date_trunc(${truncFn}, ${sentimentTimeline.createdAt})`);

    return c.json({ data: rows });
  },
);

// ---------------------------------------------------------------------------
// GET /alerts — relationship risk alerts
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/alerts",
  requireScope("analytics:read"),
  async (c) => {
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const rows = await db
      .select()
      .from(relationshipHealth)
      .where(
        and(
          eq(relationshipHealth.accountId, accountId),
          eq(relationshipHealth.trendDirection, "declining"),
        ),
      )
      .orderBy(relationshipHealth.healthScore)
      .limit(20);

    return c.json({ data: rows });
  },
);

// ---------------------------------------------------------------------------
// POST /batch-analyze — batch analyze multiple emails
// ---------------------------------------------------------------------------

sentimentTimelineRouter.post(
  "/batch-analyze",
  requireScope("messages:write"),
  validateBody(BatchAnalyzeBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof BatchAnalyzeBodySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const analyzed = await Promise.allSettled(
      body.emails.map((email) => runSentimentAnalysis(email.content)),
    );

    const results: { emailId: string; sentiment: string; score: number }[] = [];
    const failures: { emailId: string; error: string }[] = [];

    for (let i = 0; i < analyzed.length; i++) {
      const email = body.emails[i];
      const outcome = analyzed[i];
      if (!email || !outcome) continue;

      if (outcome.status === "rejected") {
        failures.push({ emailId: email.emailId, error: String(outcome.reason) });
        continue;
      }

      const analysis = outcome.value;
      const sentiment = analysis.sentiment;
      const score = toSchemaScore(analysis.score);

      await db.insert(sentimentTimeline).values({
        id: generateId(),
        accountId,
        contactEmail: email.senderEmail,
        emailId: email.emailId,
        sentiment,
        score,
        topics: [],
        emotionalTone: analysis.emotions[0] ?? null,
      });

      results.push({ emailId: email.emailId, sentiment, score });
    }

    return c.json({ success: true, analyzed: results.length, failed: failures.length, data: results, failures });
  },
);

// ---------------------------------------------------------------------------
// GET /topics — most discussed topics with sentiment
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/topics",
  requireScope("analytics:read"),
  async (c) => {
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const rows = await db
      .select({
        topic: sql<string>`jsonb_array_elements_text(${sentimentTimeline.topics})`.as("topic"),
        avgScore: sql<number>`avg(${sentimentTimeline.score})`.as("avg_score"),
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(sentimentTimeline)
      .where(eq(sentimentTimeline.accountId, accountId))
      .groupBy(sql`jsonb_array_elements_text(${sentimentTimeline.topics})`)
      .orderBy(sql`count(*) desc`)
      .limit(20);

    return c.json({ data: rows });
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard — sentiment dashboard
// ---------------------------------------------------------------------------

sentimentTimelineRouter.get(
  "/dashboard",
  requireScope("analytics:read"),
  async (c) => {
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const [totalEntries] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sentimentTimeline)
      .where(eq(sentimentTimeline.accountId, accountId));

    const [avgScore] = await db
      .select({ avg: sql<number>`coalesce(avg(${sentimentTimeline.score}), 0)` })
      .from(sentimentTimeline)
      .where(eq(sentimentTimeline.accountId, accountId));

    const topPositive = await db
      .select()
      .from(relationshipHealth)
      .where(eq(relationshipHealth.accountId, accountId))
      .orderBy(desc(relationshipHealth.healthScore))
      .limit(5);

    const topNegative = await db
      .select()
      .from(relationshipHealth)
      .where(eq(relationshipHealth.accountId, accountId))
      .orderBy(relationshipHealth.healthScore)
      .limit(5);

    const atRisk = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(relationshipHealth)
      .where(
        and(
          eq(relationshipHealth.accountId, accountId),
          eq(relationshipHealth.trendDirection, "declining"),
        ),
      );

    return c.json({
      data: {
        totalAnalyzed: totalEntries?.count ?? 0,
        averageSentiment: avgScore?.avg ?? 0,
        topPositiveContacts: topPositive,
        topNegativeContacts: topNegative,
        atRiskCount: atRisk[0]?.count ?? 0,
      },
    });
  },
);

export { sentimentTimelineRouter };
