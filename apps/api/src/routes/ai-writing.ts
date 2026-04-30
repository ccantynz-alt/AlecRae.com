/**
 * AI Writing Intelligence Route — Beyond grammar, full writing assistant
 *
 * POST   /compose              — AI compose from scratch
 * POST   /rewrite              — Rewrite text in a different style
 * POST   /expand               — Expand brief text into full email
 * POST   /summarize            — Summarize long text
 * POST   /translate            — Translate with context awareness
 * POST   /subject-lines        — Generate subject line options
 * POST   /proofread            — Deep proofread (grammar + style + tone + clarity)
 * GET    /profiles             — Get writing profiles
 * POST   /profiles             — Create writing profile
 * PUT    /profiles/:id         — Update writing profile
 * DELETE /profiles/:id         — Delete writing profile
 * POST   /profiles/:id/train   — Train profile from sample emails
 * POST   /autocomplete         — Predictive text completion
 * GET    /suggestions          — List recent writing suggestions (cursor pagination)
 * POST   /suggestions/:id/accept — Mark suggestion as accepted
 * GET    /stats                — Writing improvement stats over time
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, sql, count } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, writingProfiles, writingSuggestionsLog } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ComposeSchema = z.object({
  topic: z.string().min(1).max(2000),
  tone: z
    .enum(["formal", "casual", "friendly", "professional", "persuasive"])
    .optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  profileId: z.string().optional(),
});

const RewriteSchema = z.object({
  text: z.string().min(1).max(50000),
  style: z.enum(["formal", "casual", "concise", "persuasive", "friendly"]),
});

const ExpandSchema = z.object({
  text: z.string().min(1).max(5000),
  targetLength: z.enum(["short", "medium", "long"]).optional(),
});

const TranslateSchema = z.object({
  text: z.string().min(1).max(50000),
  targetLanguage: z.string().min(2).max(10),
});

const AutocompleteSchema = z.object({
  partialText: z.string().min(1).max(10000),
  context: z.string().max(5000).optional(),
});

const CreateProfileSchema = z.object({
  name: z.string().min(1).max(100),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avoidWords: z.array(z.string().max(100)).max(200).optional(),
  vocabulary: z.array(z.string().max(100)).max(500).optional(),
});

const TrainProfileSchema = z.object({
  emailIds: z.array(z.string()).min(1).max(500),
});

const SummarizeSchema = z.object({
  text: z.string().min(1).max(100000),
  maxLength: z.number().int().min(10).max(1000).optional(),
});

const SubjectLinesSchema = z.object({
  body: z.string().min(1).max(50000),
  count: z.number().int().min(1).max(10).optional(),
});

const ProofreadSchema = z.object({
  text: z.string().min(1).max(50000),
});

const ListSuggestionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Proofread issue type ─────────────────────────────────────────────────────

interface ProofreadIssue {
  type: "grammar" | "style" | "tone" | "clarity" | "conciseness";
  original: string;
  suggestion: string;
  explanation: string;
  position: { start: number; end: number };
  confidence: number;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const aiWritingRouter = new Hono();

// POST /compose — AI compose from scratch
aiWritingRouter.post(
  "/compose",
  requireScope("messages:write"),
  validateBody(ComposeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ComposeSchema>>(c);

    const tone = input.tone ?? "professional";
    const length = input.length ?? "medium";

    // Placeholder — in production, Claude composes a full email from the topic
    const subject = `Re: ${input.topic.slice(0, 60)}`;
    const body =
      `Hi,\n\n` +
      `Thank you for reaching out. Regarding "${input.topic}", ` +
      `I wanted to share my thoughts.\n\n` +
      `[AI-composed content would appear here in ${tone} tone, ` +
      `targeting a ${length} email length, when Claude API is configured.]\n\n` +
      `Best regards`;

    return c.json({
      data: {
        subject,
        body,
        tone,
        length,
        confidence: 0.88,
        wordCount: body.split(/\s+/).length,
        profileUsed: input.profileId ?? null,
      },
    });
  },
);

// POST /rewrite — AI rewrite text in a different style
aiWritingRouter.post(
  "/rewrite",
  requireScope("messages:write"),
  validateBody(RewriteSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof RewriteSchema>>(c);

    // Placeholder — in production, Claude rewrites the text
    const styleTransforms: Record<string, string> = {
      formal: "I would like to inform you that ",
      casual: "Hey, just wanted to let you know that ",
      concise: "",
      persuasive: "I strongly believe that ",
      friendly: "Hope you're doing well! Just wanted to mention that ",
    };

    const prefix = styleTransforms[input.style] ?? "";
    const rewritten =
      prefix + input.text.charAt(0).toLowerCase() + input.text.slice(1);

    return c.json({
      data: {
        original: input.text,
        rewritten,
        style: input.style,
        confidence: 0.82,
        changes: [
          {
            type: "style" as const,
            description: `Rewritten in ${input.style} style`,
          },
        ],
      },
    });
  },
);

// POST /expand — AI expand text to target length
aiWritingRouter.post(
  "/expand",
  requireScope("messages:write"),
  validateBody(ExpandSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ExpandSchema>>(c);

    const targetLength = input.targetLength ?? "medium";

    // Placeholder — in production, Claude expands the brief text
    const expanded =
      `Dear recipient,\n\n` +
      `I hope this message finds you well. I am writing to discuss the following: ` +
      `${input.text}\n\n` +
      `To elaborate further on this topic, I would like to provide additional context ` +
      `and details that may be helpful for your consideration.\n\n` +
      `[Expanded content would be generated here by Claude, ` +
      `targeting a ${targetLength} email length.]\n\n` +
      `Kind regards`;

    return c.json({
      data: {
        original: input.text,
        expanded,
        targetLength,
        confidence: 0.85,
        wordCount: expanded.split(/\s+/).length,
      },
    });
  },
);

// POST /summarize — Summarize long text
aiWritingRouter.post(
  "/summarize",
  requireScope("messages:read"),
  validateBody(SummarizeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SummarizeSchema>>(c);

    const maxLength = input.maxLength ?? 150;
    const words = input.text.split(/\s+/);
    const summaryWords = Math.min(maxLength, Math.ceil(words.length * 0.2));
    const summary = words.slice(0, summaryWords).join(" ") + "...";

    return c.json({
      data: {
        original: input.text,
        summary,
        originalWordCount: words.length,
        summaryWordCount: summaryWords,
        compressionRatio: Math.round((1 - summaryWords / words.length) * 100),
        confidence: 0.87,
      },
    });
  },
);

// POST /translate — AI translate text to target language
aiWritingRouter.post(
  "/translate",
  requireScope("messages:write"),
  validateBody(TranslateSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof TranslateSchema>>(c);

    // Placeholder — in production, Claude translates with context awareness
    const translated = `[Translation to ${input.targetLanguage}]: ${input.text}`;

    return c.json({
      data: {
        original: input.text,
        translated,
        targetLanguage: input.targetLanguage,
        detectedSourceLanguage: "en",
        confidence: 0.91,
      },
    });
  },
);

// POST /subject-lines — Generate subject line options
aiWritingRouter.post(
  "/subject-lines",
  requireScope("messages:write"),
  validateBody(SubjectLinesSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SubjectLinesSchema>>(c);

    const requestedCount = input.count ?? 5;
    const bodyPreview = input.body.slice(0, 200);

    // Placeholder subject lines — Claude generates real ones in production
    const styleOptions = ["direct", "question", "action-oriented", "conversational", "formal"] as const;
    const subjects = Array.from({ length: requestedCount }, (_, i) => ({
      subject: `Option ${i + 1}: Re: ${bodyPreview.slice(0, 50).trim()}...`,
      confidence: Math.round((0.95 - i * 0.05) * 100) / 100,
      style: styleOptions[i % styleOptions.length],
    }));

    return c.json({
      data: {
        subjects,
        bodyPreview: bodyPreview.slice(0, 100),
      },
    });
  },
);

// POST /proofread — Deep proofread (grammar + style + tone + clarity)
aiWritingRouter.post(
  "/proofread",
  requireScope("messages:read"),
  validateBody(ProofreadSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ProofreadSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Placeholder proofread results — Claude provides real analysis in production
    const issues: ProofreadIssue[] = [];
    const words = input.text.split(/\s+/);

    // Simple heuristic: flag very long sentences
    const sentences = input.text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/);
      if (sentenceWords.length > 30) {
        const start = input.text.indexOf(sentence.trim());
        issues.push({
          type: "clarity",
          original: sentence.trim(),
          suggestion: "Consider breaking this into shorter sentences for better readability.",
          explanation: `This sentence has ${sentenceWords.length} words, which may be difficult to follow.`,
          position: { start, end: start + sentence.trim().length },
          confidence: 0.78,
        });
      }
    }

    // Log suggestions for stats tracking
    for (const issue of issues) {
      const logId = generateId();
      await db.insert(writingSuggestionsLog).values({
        id: logId,
        accountId: auth.accountId,
        emailId: null,
        originalText: issue.original,
        suggestedText: issue.suggestion,
        suggestionType: issue.type,
        wasAccepted: false,
        createdAt: new Date(),
      });
    }

    // Calculate overall scores
    const grammarScore = issues.filter((i) => i.type === "grammar").length === 0 ? 1.0 : 0.7;
    const styleScore = issues.filter((i) => i.type === "style").length === 0 ? 1.0 : 0.75;
    const clarityScore = issues.filter((i) => i.type === "clarity").length === 0 ? 1.0 : 0.65;
    const overallScore = Math.round(((grammarScore + styleScore + clarityScore) / 3) * 100) / 100;

    return c.json({
      data: {
        text: input.text,
        issues,
        issueCount: issues.length,
        scores: {
          overall: overallScore,
          grammar: grammarScore,
          style: styleScore,
          clarity: clarityScore,
          tone: 0.9,
          conciseness: words.length > 500 ? 0.6 : 0.9,
        },
        wordCount: words.length,
        sentenceCount: sentences.length,
        readabilityGrade: Math.min(
          18,
          Math.round((words.length / Math.max(sentences.length, 1)) * 0.5 + 5),
        ),
        confidence: 0.86,
      },
    });
  },
);

// POST /autocomplete — AI autocomplete partial text
aiWritingRouter.post(
  "/autocomplete",
  requireScope("messages:write"),
  validateBody(AutocompleteSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AutocompleteSchema>>(c);

    // Placeholder — in production, Claude provides real predictions
    const suggestions = [
      {
        text: " and I look forward to hearing from you.",
        confidence: 0.72,
      },
      {
        text: " regarding this matter.",
        confidence: 0.65,
      },
      {
        text: ". Please let me know if you have any questions.",
        confidence: 0.58,
      },
    ];

    return c.json({
      data: {
        suggestions,
        partialText: input.partialText,
        contextUsed: input.context ?? null,
      },
    });
  },
);

// GET /profiles — List writing profiles for account
aiWritingRouter.get(
  "/profiles",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(writingProfiles)
      .where(eq(writingProfiles.accountId, auth.accountId))
      .orderBy(desc(writingProfiles.updatedAt));

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        vocabulary: row.vocabulary,
        avgSentenceLength: row.avgSentenceLength,
        formalityScore: row.formalityScore,
        commonPhrases: row.commonPhrases,
        avoidWords: row.avoidWords,
        sampleCount: row.sampleCount,
        lastTrainedAt: row.lastTrainedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  },
);

// POST /profiles — Create writing profile
aiWritingRouter.post(
  "/profiles",
  requireScope("messages:write"),
  validateBody(CreateProfileSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateProfileSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(writingProfiles).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      vocabulary: [],
      commonPhrases: [],
      avoidWords: [],
      sampleCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          vocabulary: [] as string[],
          avgSentenceLength: null,
          formalityScore: null,
          commonPhrases: [] as string[],
          avoidWords: [] as string[],
          sampleCount: 0,
          lastTrainedAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// PUT /profiles/:id — Update writing profile
aiWritingRouter.put(
  "/profiles/:id",
  requireScope("messages:write"),
  validateBody(UpdateProfileSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateProfileSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(writingProfiles)
      .where(
        and(
          eq(writingProfiles.id, id),
          eq(writingProfiles.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Writing profile ${id} not found`,
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(writingProfiles)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.vocabulary !== undefined
          ? { vocabulary: input.vocabulary }
          : {}),
        ...(input.avoidWords !== undefined
          ? { avoidWords: input.avoidWords }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(writingProfiles.id, id),
          eq(writingProfiles.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id,
        name: input.name ?? existing.name,
        vocabulary: input.vocabulary ?? existing.vocabulary,
        avoidWords: input.avoidWords ?? existing.avoidWords,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /profiles/:id — Delete writing profile
aiWritingRouter.delete(
  "/profiles/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: writingProfiles.id })
      .from(writingProfiles)
      .where(
        and(
          eq(writingProfiles.id, id),
          eq(writingProfiles.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Writing profile ${id} not found`,
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(writingProfiles)
      .where(
        and(
          eq(writingProfiles.id, id),
          eq(writingProfiles.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// POST /profiles/:id/train — Train profile from sample emails
aiWritingRouter.post(
  "/profiles/:id/train",
  requireScope("messages:write"),
  validateBody(TrainProfileSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof TrainProfileSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify profile exists and belongs to this account
    const [profile] = await db
      .select()
      .from(writingProfiles)
      .where(
        and(
          eq(writingProfiles.id, id),
          eq(writingProfiles.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!profile) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Writing profile ${id} not found`,
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    // In production, this would:
    // 1. Fetch the email bodies by emailIds
    // 2. Run them through Claude for feature extraction
    // 3. Update vocabulary, sentence patterns, formality score
    // Placeholder: update sample count and training timestamp

    const now = new Date();

    await db
      .update(writingProfiles)
      .set({
        sampleCount: sql`${writingProfiles.sampleCount} + ${input.emailIds.length}`,
        avgSentenceLength: 15.2,
        formalityScore: 0.65,
        vocabulary: [
          "regarding",
          "please",
          "appreciate",
          "follow-up",
          "update",
        ],
        commonPhrases: [
          "I hope this helps",
          "Please let me know",
          "Looking forward to",
        ],
        lastTrainedAt: now,
        updatedAt: now,
      })
      .where(eq(writingProfiles.id, id));

    return c.json({
      data: {
        profileId: id,
        emailsProcessed: input.emailIds.length,
        features: {
          avgSentenceLength: 15.2,
          formalityScore: 0.65,
          topVocabulary: [
            "regarding",
            "please",
            "appreciate",
            "follow-up",
            "update",
          ],
          commonPhrases: [
            "I hope this helps",
            "Please let me know",
            "Looking forward to",
          ],
        },
        confidence: Math.min(0.95, 0.4 + input.emailIds.length * 0.01),
        trainedAt: now.toISOString(),
      },
    });
  },
);

// GET /suggestions — List recent writing suggestions (cursor pagination)
aiWritingRouter.get(
  "/suggestions",
  requireScope("messages:read"),
  validateQuery(ListSuggestionsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListSuggestionsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [
      eq(writingSuggestionsLog.accountId, auth.accountId),
    ];

    if (query.cursor) {
      conditions.push(
        lt(writingSuggestionsLog.createdAt, new Date(query.cursor)),
      );
    }

    const rows = await db
      .select()
      .from(writingSuggestionsLog)
      .where(and(...conditions))
      .orderBy(desc(writingSuggestionsLog.createdAt))
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
        emailId: row.emailId,
        originalText: row.originalText,
        suggestedText: row.suggestedText,
        suggestionType: row.suggestionType,
        wasAccepted: row.wasAccepted,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// POST /suggestions/:id/accept — Mark suggestion as accepted
aiWritingRouter.post(
  "/suggestions/:id/accept",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: writingSuggestionsLog.id })
      .from(writingSuggestionsLog)
      .where(
        and(
          eq(writingSuggestionsLog.id, id),
          eq(writingSuggestionsLog.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Suggestion ${id} not found`,
            code: "suggestion_not_found",
          },
        },
        404,
      );
    }

    await db
      .update(writingSuggestionsLog)
      .set({ wasAccepted: true })
      .where(
        and(
          eq(writingSuggestionsLog.id, id),
          eq(writingSuggestionsLog.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: { id, wasAccepted: true },
    });
  },
);

// GET /stats — Writing improvement stats over time
aiWritingRouter.get(
  "/stats",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Get total suggestions and acceptance rate
    const [totalResult] = await db
      .select({ total: count() })
      .from(writingSuggestionsLog)
      .where(eq(writingSuggestionsLog.accountId, auth.accountId));

    const [acceptedResult] = await db
      .select({ accepted: count() })
      .from(writingSuggestionsLog)
      .where(
        and(
          eq(writingSuggestionsLog.accountId, auth.accountId),
          eq(writingSuggestionsLog.wasAccepted, true),
        ),
      );

    // Get breakdown by type
    const typeBreakdown = await db
      .select({
        type: writingSuggestionsLog.suggestionType,
        total: count(),
      })
      .from(writingSuggestionsLog)
      .where(eq(writingSuggestionsLog.accountId, auth.accountId))
      .groupBy(writingSuggestionsLog.suggestionType);

    const totalSuggestions = totalResult?.total ?? 0;
    const acceptedSuggestions = acceptedResult?.accepted ?? 0;
    const acceptanceRate =
      totalSuggestions > 0
        ? Math.round((acceptedSuggestions / totalSuggestions) * 100) / 100
        : 0;

    // Get profile count
    const [profileCountResult] = await db
      .select({ total: count() })
      .from(writingProfiles)
      .where(eq(writingProfiles.accountId, auth.accountId));

    return c.json({
      data: {
        totalSuggestions,
        acceptedSuggestions,
        acceptanceRate,
        byType: typeBreakdown.map((row) => ({
          type: row.type,
          count: row.total,
        })),
        profileCount: profileCountResult?.total ?? 0,
        improvementScore: Math.min(100, Math.round(acceptanceRate * 100)),
      },
    });
  },
);

export { aiWritingRouter };
