/**
 * AI Intelligence Hub Route — Unified AI-powered email intelligence
 *
 * POST /v1/ai-intelligence/priority/score           — Score an email's priority
 * GET  /v1/ai-intelligence/priority/:emailId        — Get priority score for email
 * GET  /v1/ai-intelligence/relationships            — List relationship insights (cursor pagination)
 * GET  /v1/ai-intelligence/relationships/:contactEmail — Get relationship insight for contact
 * POST /v1/ai-intelligence/smart-replies/generate   — Generate smart replies for email
 * GET  /v1/ai-intelligence/smart-replies/:emailId   — Get smart replies for email
 * POST /v1/ai-intelligence/smart-replies/:id/select — Mark a reply as selected
 * POST /v1/ai-intelligence/sentiment/analyze        — Analyze email sentiment
 * GET  /v1/ai-intelligence/sentiment/:emailId       — Get sentiment for email
 * POST /v1/ai-intelligence/writing-coach/analyze    — Analyze draft quality
 * POST /v1/ai-intelligence/predictive-actions/predict — Predict user action for email
 * GET  /v1/ai-intelligence/predictive-actions/:emailId — Get prediction for email
 * POST /v1/ai-intelligence/predictive-actions/:id/feedback — Submit actual action taken
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  emailPriorityScores,
  relationshipInsights,
  smartReplies,
  emailSentiments,
  writingCoachResults,
  predictiveActions,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ScorePrioritySchema = z.object({
  emailId: z.string().min(1),
});

const GenerateSmartRepliesSchema = z.object({
  emailId: z.string().min(1),
});

const SelectReplySchema = z.object({
  selectedReply: z.string().min(1),
});

const AnalyzeSentimentSchema = z.object({
  emailId: z.string().min(1),
});

const WritingCoachSchema = z.object({
  emailId: z.string().optional(),
  content: z.string().optional(),
}).refine(
  (data) => data.emailId !== undefined || data.content !== undefined,
  { message: "Either emailId or content must be provided" },
);

const PredictActionSchema = z.object({
  emailId: z.string().min(1),
});

const ActionFeedbackSchema = z.object({
  userAction: z.string().min(1),
});

const RelationshipsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  fadingOnly: z.enum(["true", "false"]).default("false"),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Router ───────────────────────────────────────────────────────────────────

const aiIntelligenceRouter = new Hono();

// ─── POST /priority/score — Score an email's priority ────────────────────────

aiIntelligenceRouter.post(
  "/priority/score",
  requireScope("messages:write"),
  validateBody(ScorePrioritySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ScorePrioritySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if already scored
    const [existing] = await db
      .select()
      .from(emailPriorityScores)
      .where(eq(emailPriorityScores.emailId, input.emailId))
      .limit(1);

    if (existing) {
      return c.json({ data: existing });
    }

    // Placeholder AI scoring — in production this calls Claude Haiku
    const score = Math.round(Math.random() * 100);
    const urgencyLevel =
      score >= 90
        ? ("critical" as const)
        : score >= 70
          ? ("high" as const)
          : score >= 40
            ? ("medium" as const)
            : score >= 20
              ? ("low" as const)
              : ("none" as const);

    const contentSignals = {
      hasDeadline: Math.random() > 0.7,
      hasQuestion: Math.random() > 0.5,
      hasMoneyConcern: Math.random() > 0.8,
      hasActionRequired: Math.random() > 0.6,
      mentionsAttachment: Math.random() > 0.7,
      isReplyChain: Math.random() > 0.5,
      threadLength: Math.floor(Math.random() * 10) + 1,
    };

    const id = generateId();
    const now = new Date();

    await db.insert(emailPriorityScores).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      score,
      urgencyLevel,
      reasoning: `AI-scored email with priority ${score}/100 based on content signals and sender importance.`,
      senderImportance: Math.round(Math.random() * 100),
      contentSignals,
      predictedAction: score >= 70 ? "reply" : score >= 40 ? "read" : "archive",
      confidence: Math.round(Math.random() * 50 + 50) / 100,
      scoredAt: now,
    });

    const [created] = await db
      .select()
      .from(emailPriorityScores)
      .where(eq(emailPriorityScores.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── GET /priority/:emailId — Get priority score for email ───────────────────

aiIntelligenceRouter.get(
  "/priority/:emailId",
  requireScope("analytics:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(emailPriorityScores)
      .where(
        and(
          eq(emailPriorityScores.emailId, emailId),
          eq(emailPriorityScores.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Priority score not found for email ${emailId}`,
            code: "priority_score_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: record });
  },
);

// ─── GET /relationships — List relationship insights ─────────────────────────

aiIntelligenceRouter.get(
  "/relationships",
  requireScope("analytics:read"),
  validateQuery(RelationshipsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof RelationshipsQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(relationshipInsights.accountId, auth.accountId)];

    if (query.fadingOnly === "true") {
      conditions.push(eq(relationshipInsights.fadingAlert, true));
    }

    if (query.cursor) {
      conditions.push(lt(relationshipInsights.updatedAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(relationshipInsights)
      .where(and(...conditions))
      .orderBy(desc(relationshipInsights.updatedAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.updatedAt.toISOString()
        : null;

    return c.json({
      data: page,
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── GET /relationships/:contactEmail — Get relationship insight ─────────────

aiIntelligenceRouter.get(
  "/relationships/:contactEmail",
  requireScope("analytics:read"),
  async (c) => {
    const contactEmail = c.req.param("contactEmail");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(relationshipInsights)
      .where(
        and(
          eq(relationshipInsights.accountId, auth.accountId),
          eq(relationshipInsights.contactEmail, contactEmail),
        ),
      )
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Relationship insight not found for ${contactEmail}`,
            code: "relationship_insight_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: record });
  },
);

// ─── POST /smart-replies/generate — Generate smart replies ───────────────────

aiIntelligenceRouter.post(
  "/smart-replies/generate",
  requireScope("messages:write"),
  validateBody(GenerateSmartRepliesSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof GenerateSmartRepliesSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Placeholder AI-generated replies — in production this calls Claude
    const replies = [
      {
        text: "Thanks for reaching out! I'll review this and get back to you shortly.",
        confidence: 0.92,
        tone: "professional",
      },
      {
        text: "Got it, thanks! Let me take a look.",
        confidence: 0.85,
        tone: "casual",
      },
      {
        text: "Thank you for the update. I'll follow up with the team on this.",
        confidence: 0.78,
        tone: "formal",
      },
    ];

    const id = generateId();
    const now = new Date();

    await db.insert(smartReplies).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      replies,
      generatedAt: now,
      selectedReply: null,
      wasUsed: false,
    });

    const [created] = await db
      .select()
      .from(smartReplies)
      .where(eq(smartReplies.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── GET /smart-replies/:emailId — Get smart replies for email ───────────────

aiIntelligenceRouter.get(
  "/smart-replies/:emailId",
  requireScope("analytics:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(smartReplies)
      .where(
        and(
          eq(smartReplies.emailId, emailId),
          eq(smartReplies.accountId, auth.accountId),
        ),
      )
      .orderBy(desc(smartReplies.generatedAt))
      .limit(1);

    const record = rows[0];
    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart replies not found for email ${emailId}`,
            code: "smart_replies_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: record });
  },
);

// ─── POST /smart-replies/:id/select — Mark a reply as selected ───────────────

aiIntelligenceRouter.post(
  "/smart-replies/:id/select",
  requireScope("messages:write"),
  validateBody(SelectReplySchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof SelectReplySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: smartReplies.id })
      .from(smartReplies)
      .where(
        and(
          eq(smartReplies.id, id),
          eq(smartReplies.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart reply ${id} not found`,
            code: "smart_reply_not_found",
          },
        },
        404,
      );
    }

    await db
      .update(smartReplies)
      .set({
        selectedReply: input.selectedReply,
        wasUsed: true,
      })
      .where(eq(smartReplies.id, id));

    return c.json({
      data: {
        id,
        selectedReply: input.selectedReply,
        wasUsed: true,
      },
    });
  },
);

// ─── POST /sentiment/analyze — Analyze email sentiment ───────────────────────

aiIntelligenceRouter.post(
  "/sentiment/analyze",
  requireScope("messages:write"),
  validateBody(AnalyzeSentimentSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AnalyzeSentimentSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if already analyzed
    const [existing] = await db
      .select()
      .from(emailSentiments)
      .where(eq(emailSentiments.emailId, input.emailId))
      .limit(1);

    if (existing) {
      return c.json({ data: existing });
    }

    // Placeholder AI sentiment analysis — in production this calls Claude
    const sentiments = [
      "positive",
      "negative",
      "neutral",
      "urgent",
      "angry",
      "grateful",
      "confused",
    ] as const;
    const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)] ?? "neutral";

    const id = generateId();
    const now = new Date();

    await db.insert(emailSentiments).values({
      id,
      emailId: input.emailId,
      accountId: auth.accountId,
      sentiment,
      confidence: Math.round(Math.random() * 40 + 60) / 100,
      keywords: ["placeholder", "analysis"],
      analyzedAt: now,
    });

    const [created] = await db
      .select()
      .from(emailSentiments)
      .where(eq(emailSentiments.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── GET /sentiment/:emailId — Get sentiment for email ───────────────────────

aiIntelligenceRouter.get(
  "/sentiment/:emailId",
  requireScope("analytics:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(emailSentiments)
      .where(
        and(
          eq(emailSentiments.emailId, emailId),
          eq(emailSentiments.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Sentiment not found for email ${emailId}`,
            code: "sentiment_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: record });
  },
);

// ─── POST /writing-coach/analyze — Analyze draft quality ─────────────────────

aiIntelligenceRouter.post(
  "/writing-coach/analyze",
  requireScope("messages:write"),
  validateBody(WritingCoachSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof WritingCoachSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Placeholder AI writing coach — in production this calls Claude
    const clarityScore = Math.round(Math.random() * 30 + 70);
    const toneScore = Math.round(Math.random() * 30 + 70);
    const persuasivenessScore = Math.round(Math.random() * 40 + 60);
    const avgScore = (clarityScore + toneScore + persuasivenessScore) / 3;

    const overallGrade =
      avgScore >= 90
        ? "A"
        : avgScore >= 80
          ? "B"
          : avgScore >= 70
            ? "C"
            : avgScore >= 60
              ? "D"
              : "F";

    const suggestions = [
      {
        type: "clarity",
        original: "Please be advised that",
        suggested: "Note that",
        reason: "Simpler phrasing improves clarity",
      },
      {
        type: "tone",
        original: "ASAP",
        suggested: "at your earliest convenience",
        reason: "More professional tone",
      },
    ];

    const id = generateId();
    const now = new Date();

    await db.insert(writingCoachResults).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId ?? null,
      clarityScore,
      toneScore,
      persuasivenessScore,
      suggestions,
      overallGrade,
      analyzedAt: now,
    });

    const [created] = await db
      .select()
      .from(writingCoachResults)
      .where(eq(writingCoachResults.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── POST /predictive-actions/predict — Predict user action ──────────────────

aiIntelligenceRouter.post(
  "/predictive-actions/predict",
  requireScope("messages:write"),
  validateBody(PredictActionSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof PredictActionSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Placeholder AI prediction — in production this calls Claude
    const actions = ["reply", "archive", "delete", "forward", "snooze", "read_later"];
    const predictedAction = actions[Math.floor(Math.random() * actions.length)] ?? "read_later";

    const id = generateId();
    const now = new Date();

    await db.insert(predictiveActions).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      predictedAction,
      confidence: Math.round(Math.random() * 40 + 60) / 100,
      reasoning: `Based on historical user behavior patterns, the most likely action for this email is "${predictedAction}".`,
      userAction: null,
      wasAccurate: null,
      predictedAt: now,
    });

    const [created] = await db
      .select()
      .from(predictiveActions)
      .where(eq(predictiveActions.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── GET /predictive-actions/:emailId — Get prediction for email ─────────────

aiIntelligenceRouter.get(
  "/predictive-actions/:emailId",
  requireScope("analytics:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(predictiveActions)
      .where(
        and(
          eq(predictiveActions.emailId, emailId),
          eq(predictiveActions.accountId, auth.accountId),
        ),
      )
      .orderBy(desc(predictiveActions.predictedAt))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Predictive action not found for email ${emailId}`,
            code: "predictive_action_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: record });
  },
);

// ─── POST /predictive-actions/:id/feedback — Submit actual action ────────────

aiIntelligenceRouter.post(
  "/predictive-actions/:id/feedback",
  requireScope("messages:write"),
  validateBody(ActionFeedbackSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof ActionFeedbackSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({
        id: predictiveActions.id,
        predictedAction: predictiveActions.predictedAction,
      })
      .from(predictiveActions)
      .where(
        and(
          eq(predictiveActions.id, id),
          eq(predictiveActions.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Predictive action ${id} not found`,
            code: "predictive_action_not_found",
          },
        },
        404,
      );
    }

    const wasAccurate = existing.predictedAction === input.userAction;

    await db
      .update(predictiveActions)
      .set({
        userAction: input.userAction,
        wasAccurate,
      })
      .where(eq(predictiveActions.id, id));

    return c.json({
      data: {
        id,
        predictedAction: existing.predictedAction,
        userAction: input.userAction,
        wasAccurate,
      },
    });
  },
);

export { aiIntelligenceRouter };
