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
  emails,
} from "@alecrae/db";
import { scoreEmailPriority } from "@alecrae/ai-engine/intelligence/priority-scorer";
import { generateSmartReplies } from "@alecrae/ai-engine/intelligence/smart-replies";
import { analyzeEmailSentiment } from "@alecrae/ai-engine/intelligence/sentiment-analyzer";
import { aiComplete } from "../lib/ai.js";

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

// Convert API errors thrown by ai-engine into JSON 5xx responses.
function aiErrorResponse(
  err: unknown,
):
  | { status: 503; body: { error: { type: string; message: string; code: string } } }
  | { status: 500; body: { error: { type: string; message: string; code: string } } } {
  const message = err instanceof Error ? err.message : "Unknown AI error";
  if (message.includes("ANTHROPIC_API_KEY")) {
    return {
      status: 503,
      body: {
        error: {
          type: "service_unavailable",
          message: "AI service is not configured",
          code: "ai_unavailable",
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        type: "ai_error",
        message,
        code: "ai_error",
      },
    },
  };
}

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Claude response did not contain a JSON object");
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  if (typeof parsed !== "object" || parsed === null) throw new Error("Parsed response was not an object");
  return parsed as Record<string, unknown>;
}

function clampScore(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

interface WritingCoachAnalysis {
  clarityScore: number;
  toneScore: number;
  persuasivenessScore: number;
  suggestions: { type: string; original: string; suggested: string; reason: string }[];
  overallGrade: "A" | "B" | "C" | "D" | "F";
}

/** Real Claude-based draft analysis — was previously three Math.random() calls. */
async function runWritingCoachAnalysis(draftText: string): Promise<WritingCoachAnalysis> {
  const result = await aiComplete({
    system: "You are a professional email writing coach. Respond with a single valid JSON object only — no prose, no markdown fences.",
    messages: [
      {
        role: "user",
        content: [
          "Analyze this email draft for writing quality. Return JSON only:",
          "{",
          '  "clarityScore": <0-100, how easy the draft is to understand>,',
          '  "toneScore": <0-100, how appropriate the tone is for professional email>,',
          '  "persuasivenessScore": <0-100, how compelling/actionable the draft is>,',
          '  "suggestions": [{"type": "clarity"|"tone"|"persuasiveness"|"grammar", "original": "<exact phrase from the draft>", "suggested": "<improved phrase>", "reason": "<one short sentence>"}],',
          '  "overallGrade": "A"|"B"|"C"|"D"|"F"',
          "}",
          "Provide at most 3 suggestions, each referencing a phrase that actually appears in the draft below.",
          "",
          "Draft:",
          draftText.slice(0, 4000),
        ].join("\n"),
      },
    ],
    maxTokens: 700,
  });

  const obj = extractJson(result.text);
  const clarityScore = clampScore(obj["clarityScore"], 70);
  const toneScore = clampScore(obj["toneScore"], 70);
  const persuasivenessScore = clampScore(obj["persuasivenessScore"], 70);

  const rawSuggestions = Array.isArray(obj["suggestions"]) ? obj["suggestions"] : [];
  const suggestions = rawSuggestions
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .slice(0, 3)
    .map((s) => ({
      type: typeof s["type"] === "string" ? s["type"] : "clarity",
      original: typeof s["original"] === "string" ? s["original"] : "",
      suggested: typeof s["suggested"] === "string" ? s["suggested"] : "",
      reason: typeof s["reason"] === "string" ? s["reason"] : "",
    }))
    .filter((s) => s.original.length > 0 && s.suggested.length > 0);

  const grades = ["A", "B", "C", "D", "F"] as const;
  const overallGrade = grades.includes(obj["overallGrade"] as (typeof grades)[number])
    ? (obj["overallGrade"] as (typeof grades)[number])
    : "C";

  return { clarityScore, toneScore, persuasivenessScore, suggestions, overallGrade };
}

const PREDICTABLE_ACTIONS = ["reply", "archive", "delete", "forward", "snooze", "read_later"] as const;
type PredictableAction = (typeof PREDICTABLE_ACTIONS)[number];

interface ActionPrediction {
  predictedAction: PredictableAction;
  confidence: number;
  reasoning: string;
}

/** Real Claude-based next-action prediction — was previously a random pick
 *  from the same 6-item list with a templated reasoning string. */
async function runActionPrediction(email: { subject: string; fromAddress: string; body: string }): Promise<ActionPrediction> {
  const result = await aiComplete({
    system: "You predict what a busy professional will most likely do next with an email. Respond with a single valid JSON object only.",
    messages: [
      {
        role: "user",
        content: [
          `From: ${email.fromAddress}`,
          `Subject: ${email.subject}`,
          "Body:",
          email.body.slice(0, 2000),
          "",
          `Predict the single most likely next action from this exact list: ${PREDICTABLE_ACTIONS.join(", ")}.`,
          "Return JSON only:",
          "{",
          `  "predictedAction": one of [${PREDICTABLE_ACTIONS.map((a) => `"${a}"`).join(", ")}],`,
          '  "confidence": <0.0-1.0>,',
          '  "reasoning": "<one sentence explaining why, referencing the actual email content>"',
          "}",
        ].join("\n"),
      },
    ],
    maxTokens: 300,
  });

  const obj = extractJson(result.text);
  const predictedAction = (PREDICTABLE_ACTIONS as readonly string[]).includes(obj["predictedAction"] as string)
    ? (obj["predictedAction"] as PredictableAction)
    : "read_later";
  const confidence = Math.max(0, Math.min(1, typeof obj["confidence"] === "number" ? obj["confidence"] : 0.5));
  const reasoning = typeof obj["reasoning"] === "string" && obj["reasoning"].length > 0
    ? obj["reasoning"]
    : `Predicted based on the email's subject and content.`;

  return { predictedAction, confidence, reasoning };
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
      .where(and(eq(emailPriorityScores.emailId, input.emailId), eq(emailPriorityScores.accountId, auth.accountId)))
      .limit(1);

    if (existing) {
      return c.json({ data: existing });
    }

    // Fetch the email record to pass real content to Claude
    const [emailRecord] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!emailRecord) {
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

    let priorityResult: Awaited<ReturnType<typeof scoreEmailPriority>>;
    try {
      priorityResult = await scoreEmailPriority({
        subject: emailRecord.subject,
        from: emailRecord.fromAddress,
        body: emailRecord.textBody ?? emailRecord.htmlBody ?? "",
      });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }

    const { score, urgencyLevel, reasons, suggestedAction } = priorityResult;

    const contentSignals = {
      hasDeadline: reasons.some((r) => /deadline|due|by |before /i.test(r)),
      hasQuestion: reasons.some((r) => /question|asked|request/i.test(r)),
      hasMoneyConcern: reasons.some((r) => /money|payment|invoice|budget/i.test(r)),
      hasActionRequired: suggestedAction === "reply_now" || suggestedAction === "reply_today",
      mentionsAttachment: false,
      isReplyChain: false,
      threadLength: 1,
    };

    const id = generateId();
    const now = new Date();

    await db.insert(emailPriorityScores).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      score,
      urgencyLevel,
      reasoning: reasons.join(" | "),
      senderImportance: score,
      contentSignals,
      predictedAction: suggestedAction === "reply_now" || suggestedAction === "reply_today"
        ? "reply"
        : suggestedAction === "reply_when_free"
          ? "read"
          : "archive",
      confidence: score / 100,
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
        ? page[page.length - 1]?.updatedAt.toISOString()
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

    // Fetch the email record to pass real content to Claude
    const [emailRecordForReplies] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!emailRecordForReplies) {
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

    let generatedReplies: Awaited<ReturnType<typeof generateSmartReplies>>;
    try {
      generatedReplies = await generateSmartReplies({
        subject: emailRecordForReplies.subject,
        from: emailRecordForReplies.fromAddress,
        body: emailRecordForReplies.textBody ?? emailRecordForReplies.htmlBody ?? "",
      });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }

    const replies = generatedReplies.map((r, i) => ({
      text: r.text,
      confidence: Math.round((0.95 - i * 0.07) * 100) / 100,
      tone: r.tone,
    }));

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
      .where(and(eq(emailSentiments.emailId, input.emailId), eq(emailSentiments.accountId, auth.accountId)))
      .limit(1);

    if (existing) {
      return c.json({ data: existing });
    }

    // Fetch the email record to pass real content to Claude
    const [emailRecordForSentiment] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!emailRecordForSentiment) {
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

    let sentimentResult: Awaited<ReturnType<typeof analyzeEmailSentiment>>;
    try {
      sentimentResult = await analyzeEmailSentiment({
        subject: emailRecordForSentiment.subject,
        body: emailRecordForSentiment.textBody ?? emailRecordForSentiment.htmlBody ?? "",
      });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }

    // Map ai-engine sentiment values to DB enum values
    type DbSentiment = "positive" | "negative" | "neutral" | "urgent" | "angry" | "grateful" | "confused";
    const sentimentMap: Record<string, DbSentiment> = {
      very_positive: "positive",
      positive: "positive",
      neutral: "neutral",
      negative: "negative",
      very_negative: "angry",
    };
    const sentiment: DbSentiment = sentimentMap[sentimentResult.sentiment] ?? "neutral";

    // Use requiresUrgentResponse to upgrade to "urgent" if flagged
    const finalSentiment: DbSentiment = sentimentResult.requiresUrgentResponse && sentiment === "neutral"
      ? "urgent"
      : sentiment;

    // Derive confidence from the absolute value of the sentiment score
    const confidence = Math.min(1, Math.max(0.5, Math.abs(sentimentResult.score) + 0.5));

    const id = generateId();
    const now = new Date();

    await db.insert(emailSentiments).values({
      id,
      emailId: input.emailId,
      accountId: auth.accountId,
      sentiment: finalSentiment,
      confidence: Math.round(confidence * 100) / 100,
      keywords: sentimentResult.emotions,
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

    let draftText = input.content ?? null;
    if (draftText === null && input.emailId) {
      const [emailRow] = await db
        .select({ textBody: emails.textBody, htmlBody: emails.htmlBody })
        .from(emails)
        .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
        .limit(1);
      if (!emailRow) {
        return c.json({ error: { type: "not_found", message: `Email ${input.emailId} not found`, code: "email_not_found" } }, 404);
      }
      draftText = emailRow.textBody ?? emailRow.htmlBody?.replace(/<[^>]+>/g, " ") ?? "";
    }

    if (!draftText || draftText.trim().length === 0) {
      return c.json({ error: { type: "validation_error", message: "No draft content to analyze", code: "empty_draft" } }, 400);
    }

    let analysis: WritingCoachAnalysis;
    try {
      analysis = await runWritingCoachAnalysis(draftText);
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }

    const { clarityScore, toneScore, persuasivenessScore, suggestions, overallGrade } = analysis;

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

    const [emailRow] = await db
      .select({ subject: emails.subject, fromAddress: emails.fromAddress, textBody: emails.textBody, htmlBody: emails.htmlBody })
      .from(emails)
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!emailRow) {
      return c.json({ error: { type: "not_found", message: `Email ${input.emailId} not found`, code: "email_not_found" } }, 404);
    }

    let prediction: ActionPrediction;
    try {
      prediction = await runActionPrediction({
        subject: emailRow.subject,
        fromAddress: emailRow.fromAddress,
        body: emailRow.textBody ?? emailRow.htmlBody?.replace(/<[^>]+>/g, " ") ?? "",
      });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }

    const { predictedAction, confidence, reasoning } = prediction;

    const id = generateId();
    const now = new Date();

    await db.insert(predictiveActions).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      predictedAction,
      confidence,
      reasoning,
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
