/**
 * AI Categorization & Smart Labels Route
 *
 * POST   /v1/ai-categorization/categorize              — Categorize a single email
 * POST   /v1/ai-categorization/categorize/batch         — Batch categorize (max 100)
 * GET    /v1/ai-categorization/categories/:emailId      — Get category for an email
 * POST   /v1/ai-categorization/feedback                 — Submit category correction
 * GET    /v1/ai-categorization/stats                    — Category distribution stats
 * GET    /v1/ai-categorization/smart-rules              — List smart label rules
 * POST   /v1/ai-categorization/smart-rules              — Create smart label rule
 * PUT    /v1/ai-categorization/smart-rules/:id          — Update rule
 * DELETE /v1/ai-categorization/smart-rules/:id          — Delete rule
 * POST   /v1/ai-categorization/smart-rules/:id/test     — Test rule against recent emails
 * GET    /v1/ai-categorization/insights                 — AI categorization insights
 * POST   /v1/ai-categorization/retrain                  — Trigger retraining from feedback
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import {
  getDatabase,
  emailCategories,
  smartLabelRules,
  categoryFeedback,
} from "@alecrae/db";

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIMARY_CATEGORIES = [
  "important",
  "newsletter",
  "social",
  "promotions",
  "updates",
  "forums",
  "receipts",
  "travel",
  "finance",
  "work",
  "personal",
] as const;

const BATCH_LIMIT = 100;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CategorizeSchema = z.object({
  emailId: z.string().min(1),
});

const BatchCategorizeSchema = z.object({
  emailIds: z
    .array(z.string().min(1))
    .min(1)
    .max(BATCH_LIMIT),
});

const FeedbackSchema = z.object({
  emailId: z.string().min(1),
  correctedCategory: z.enum(PRIMARY_CATEGORIES),
});

const SmartLabelConditionsSchema = z.object({
  senderPatterns: z.array(z.string()).optional(),
  subjectPatterns: z.array(z.string()).optional(),
  bodyKeywords: z.array(z.string()).optional(),
  hasAttachment: z.boolean().optional(),
  minImportance: z.number().min(0).max(1).optional(),
});

const CreateSmartRuleSchema = z.object({
  labelId: z.string().min(1),
  ruleName: z.string().min(1).max(255),
  conditions: SmartLabelConditionsSchema,
  aiAssisted: z.boolean().optional(),
});

const UpdateSmartRuleSchema = z.object({
  ruleName: z.string().min(1).max(255).optional(),
  conditions: SmartLabelConditionsSchema.optional(),
  aiAssisted: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Placeholder AI categorization. In production this calls Claude Haiku
 * to analyse sender, subject, and body content.
 */
function placeholderCategorize(emailId: string): {
  primaryCategory: (typeof PRIMARY_CATEGORIES)[number];
  secondaryCategories: string[];
  confidence: number;
} {
  // Deterministic-ish placeholder based on emailId hash
  const hash = emailId
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const idx = hash % PRIMARY_CATEGORIES.length;
  const primary = PRIMARY_CATEGORIES[idx];
  const secondary =
    PRIMARY_CATEGORIES[(idx + 3) % PRIMARY_CATEGORIES.length];

  return {
    primaryCategory: primary,
    secondaryCategories: primary !== secondary ? [secondary] : [],
    confidence: 0.85 + (hash % 15) / 100,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const aiCategorizationRouter = new Hono();

// POST /categorize — Categorize a single email
aiCategorizationRouter.post(
  "/categorize",
  requireScope("messages:write"),
  validateBody(CategorizeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CategorizeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const result = placeholderCategorize(input.emailId);
    const id = generateId();
    const now = new Date();

    await db
      .insert(emailCategories)
      .values({
        id,
        accountId: auth.accountId,
        emailId: input.emailId,
        primaryCategory: result.primaryCategory,
        secondaryCategories: result.secondaryCategories,
        confidence: result.confidence,
        aiModel: "haiku",
        categorizedAt: now,
      })
      .onConflictDoNothing();

    return c.json({
      data: {
        id,
        emailId: input.emailId,
        primaryCategory: result.primaryCategory,
        secondaryCategories: result.secondaryCategories,
        confidence: result.confidence,
        aiModel: "haiku",
        categorizedAt: now.toISOString(),
      },
    });
  },
);

// POST /categorize/batch — Batch categorize (max 100)
aiCategorizationRouter.post(
  "/categorize/batch",
  requireScope("messages:write"),
  validateBody(BatchCategorizeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof BatchCategorizeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();
    const results = input.emailIds.map((emailId) => {
      const cat = placeholderCategorize(emailId);
      return {
        id: generateId(),
        accountId: auth.accountId,
        emailId,
        primaryCategory: cat.primaryCategory,
        secondaryCategories: cat.secondaryCategories,
        confidence: cat.confidence,
        aiModel: "haiku" as const,
        categorizedAt: now,
      };
    });

    if (results.length > 0) {
      await db
        .insert(emailCategories)
        .values(results)
        .onConflictDoNothing();
    }

    return c.json({
      data: results.map((r) => ({
        id: r.id,
        emailId: r.emailId,
        primaryCategory: r.primaryCategory,
        secondaryCategories: r.secondaryCategories,
        confidence: r.confidence,
        aiModel: r.aiModel,
        categorizedAt: r.categorizedAt.toISOString(),
      })),
      total: results.length,
    });
  },
);

// GET /categories/:emailId — Get category for an email
aiCategorizationRouter.get(
  "/categories/:emailId",
  requireScope("analytics:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [row] = await db
      .select()
      .from(emailCategories)
      .where(
        and(
          eq(emailCategories.emailId, emailId),
          eq(emailCategories.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!row) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `No category found for email ${emailId}`,
            code: "category_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: row.id,
        emailId: row.emailId,
        primaryCategory: row.primaryCategory,
        secondaryCategories: row.secondaryCategories,
        confidence: row.confidence,
        aiModel: row.aiModel,
        categorizedAt: row.categorizedAt.toISOString(),
      },
    });
  },
);

// POST /feedback — Submit category correction
aiCategorizationRouter.post(
  "/feedback",
  requireScope("messages:write"),
  validateBody(FeedbackSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof FeedbackSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Look up the existing categorization to record what was predicted
    const [existing] = await db
      .select({ primaryCategory: emailCategories.primaryCategory })
      .from(emailCategories)
      .where(
        and(
          eq(emailCategories.emailId, input.emailId),
          eq(emailCategories.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const predictedCategory = existing?.primaryCategory ?? "unknown";

    const id = generateId();

    await db.insert(categoryFeedback).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      predictedCategory,
      correctedCategory: input.correctedCategory,
      createdAt: new Date(),
    });

    // Update the email category record if it exists
    if (existing) {
      await db
        .update(emailCategories)
        .set({
          primaryCategory: input.correctedCategory,
          confidence: 1.0,
          aiModel: "user_corrected",
          categorizedAt: new Date(),
        })
        .where(
          and(
            eq(emailCategories.emailId, input.emailId),
            eq(emailCategories.accountId, auth.accountId),
          ),
        );
    }

    return c.json({
      data: {
        id,
        emailId: input.emailId,
        predictedCategory,
        correctedCategory: input.correctedCategory,
        accepted: true,
      },
    });
  },
);

// GET /stats — Category distribution stats
aiCategorizationRouter.get(
  "/stats",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const distribution = await db
      .select({
        category: emailCategories.primaryCategory,
        count: sql<number>`count(*)::int`,
        avgConfidence: sql<number>`round(avg(${emailCategories.confidence})::numeric, 3)::float`,
      })
      .from(emailCategories)
      .where(eq(emailCategories.accountId, auth.accountId))
      .groupBy(emailCategories.primaryCategory)
      .orderBy(desc(sql`count(*)`));

    const totalCategorized = distribution.reduce(
      (sum, row) => sum + row.count,
      0,
    );

    const [feedbackStats] = await db
      .select({
        totalFeedback: sql<number>`count(*)::int`,
      })
      .from(categoryFeedback)
      .where(eq(categoryFeedback.accountId, auth.accountId));

    return c.json({
      data: {
        totalCategorized,
        totalFeedback: feedbackStats?.totalFeedback ?? 0,
        distribution: distribution.map((row) => ({
          category: row.category,
          count: row.count,
          percentage:
            totalCategorized > 0
              ? Math.round((row.count / totalCategorized) * 10000) / 100
              : 0,
          avgConfidence: row.avgConfidence,
        })),
      },
    });
  },
);

// GET /smart-rules — List smart label rules
aiCategorizationRouter.get(
  "/smart-rules",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(smartLabelRules)
      .where(eq(smartLabelRules.accountId, auth.accountId))
      .orderBy(desc(smartLabelRules.createdAt));

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        labelId: row.labelId,
        ruleName: row.ruleName,
        conditions: row.conditions,
        aiAssisted: row.aiAssisted,
        accuracy: row.accuracy,
        totalApplied: row.totalApplied,
        totalCorrected: row.totalCorrected,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total: rows.length,
    });
  },
);

// POST /smart-rules — Create smart label rule
aiCategorizationRouter.post(
  "/smart-rules",
  requireScope("messages:write"),
  validateBody(CreateSmartRuleSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateSmartRuleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(smartLabelRules).values({
      id,
      accountId: auth.accountId,
      labelId: input.labelId,
      ruleName: input.ruleName,
      conditions: input.conditions,
      aiAssisted: input.aiAssisted ?? true,
      accuracy: 0.5,
      totalApplied: 0,
      totalCorrected: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          labelId: input.labelId,
          ruleName: input.ruleName,
          conditions: input.conditions,
          aiAssisted: input.aiAssisted ?? true,
          accuracy: 0.5,
          totalApplied: 0,
          totalCorrected: 0,
          isActive: true,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// PUT /smart-rules/:id — Update rule
aiCategorizationRouter.put(
  "/smart-rules/:id",
  requireScope("messages:write"),
  validateBody(UpdateSmartRuleSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateSmartRuleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(smartLabelRules)
      .where(
        and(
          eq(smartLabelRules.id, id),
          eq(smartLabelRules.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart label rule ${id} not found`,
            code: "smart_rule_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(smartLabelRules)
      .set({
        ...(input.ruleName !== undefined ? { ruleName: input.ruleName } : {}),
        ...(input.conditions !== undefined
          ? { conditions: input.conditions }
          : {}),
        ...(input.aiAssisted !== undefined
          ? { aiAssisted: input.aiAssisted }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(smartLabelRules.id, id),
          eq(smartLabelRules.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id,
        labelId: existing.labelId,
        ruleName: input.ruleName ?? existing.ruleName,
        conditions: input.conditions ?? existing.conditions,
        aiAssisted: input.aiAssisted ?? existing.aiAssisted,
        accuracy: existing.accuracy,
        totalApplied: existing.totalApplied,
        totalCorrected: existing.totalCorrected,
        isActive: input.isActive ?? existing.isActive,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /smart-rules/:id — Delete rule
aiCategorizationRouter.delete(
  "/smart-rules/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: smartLabelRules.id })
      .from(smartLabelRules)
      .where(
        and(
          eq(smartLabelRules.id, id),
          eq(smartLabelRules.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart label rule ${id} not found`,
            code: "smart_rule_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(smartLabelRules)
      .where(
        and(
          eq(smartLabelRules.id, id),
          eq(smartLabelRules.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// POST /smart-rules/:id/test — Test rule against recent emails (placeholder)
aiCategorizationRouter.post(
  "/smart-rules/:id/test",
  requireScope("analytics:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [rule] = await db
      .select()
      .from(smartLabelRules)
      .where(
        and(
          eq(smartLabelRules.id, id),
          eq(smartLabelRules.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!rule) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart label rule ${id} not found`,
            code: "smart_rule_not_found",
          },
        },
        404,
      );
    }

    // Placeholder: In production this scans recent emails against rule conditions
    const matchedCount = Math.floor(Math.random() * 50) + 1;

    return c.json({
      data: {
        ruleId: id,
        ruleName: rule.ruleName,
        matchedCount,
        sampleSize: 200,
        estimatedAccuracy: rule.accuracy,
        testedAt: new Date().toISOString(),
      },
    });
  },
);

// GET /insights — AI categorization insights
aiCategorizationRouter.get(
  "/insights",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Most miscategorized: categories with the most feedback corrections
    const mostMiscategorized = await db
      .select({
        predictedCategory: categoryFeedback.predictedCategory,
        correctedCategory: categoryFeedback.correctedCategory,
        count: sql<number>`count(*)::int`,
      })
      .from(categoryFeedback)
      .where(eq(categoryFeedback.accountId, auth.accountId))
      .groupBy(
        categoryFeedback.predictedCategory,
        categoryFeedback.correctedCategory,
      )
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // Overall accuracy: (total categorized - total corrections) / total categorized
    const [totalStats] = await db
      .select({
        totalCategorized: sql<number>`count(*)::int`,
      })
      .from(emailCategories)
      .where(eq(emailCategories.accountId, auth.accountId));

    const [feedbackCount] = await db
      .select({
        totalCorrections: sql<number>`count(*)::int`,
      })
      .from(categoryFeedback)
      .where(eq(categoryFeedback.accountId, auth.accountId));

    const total = totalStats?.totalCategorized ?? 0;
    const corrections = feedbackCount?.totalCorrections ?? 0;
    const accuracy =
      total > 0
        ? Math.round(((total - corrections) / total) * 10000) / 100
        : 100;

    // Suggested rules: categories with high correction rates
    const suggestedRules = mostMiscategorized
      .filter((row) => row.count >= 3)
      .slice(0, 5)
      .map((row) => ({
        suggestion: `Create a rule to auto-categorize "${row.predictedCategory}" emails as "${row.correctedCategory}"`,
        predictedCategory: row.predictedCategory,
        correctedCategory: row.correctedCategory,
        occurrences: row.count,
      }));

    return c.json({
      data: {
        accuracy,
        totalCategorized: total,
        totalCorrections: corrections,
        mostMiscategorized: mostMiscategorized.map((row) => ({
          from: row.predictedCategory,
          to: row.correctedCategory,
          count: row.count,
        })),
        suggestedRules,
      },
    });
  },
);

// POST /retrain — Trigger retraining from feedback (placeholder)
aiCategorizationRouter.post(
  "/retrain",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Count available feedback for retraining
    const [feedbackStats] = await db
      .select({
        totalFeedback: sql<number>`count(*)::int`,
      })
      .from(categoryFeedback)
      .where(eq(categoryFeedback.accountId, auth.accountId));

    const total = feedbackStats?.totalFeedback ?? 0;

    if (total === 0) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message:
              "No feedback data available for retraining. Submit corrections first.",
            code: "no_feedback_data",
          },
        },
        400,
      );
    }

    // Placeholder: In production this queues a background job to fine-tune
    // the categorization model using accumulated feedback data.
    return c.json({
      data: {
        status: "queued",
        feedbackSamples: total,
        estimatedDuration: `${Math.ceil(total / 10)}s`,
        queuedAt: new Date().toISOString(),
      },
    });
  },
);

export { aiCategorizationRouter };
