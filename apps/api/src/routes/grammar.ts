/**
 * Grammar Route — Real-Time Grammar, Spelling & Tone Checking
 *
 * POST /v1/grammar/check    — Check text for grammar/spelling/tone issues
 * POST /v1/grammar/correct  — Auto-correct text and return fixed version
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { checkGrammar } from "@alecrae/ai-engine/grammar";

const GrammarCheckSchema = z.object({
  text: z.string().min(1).max(50000),
  language: z.string().optional(),
  level: z.enum(["basic", "standard", "advanced"]).default("standard"),
  recipientContext: z
    .object({
      relationship: z.enum(["boss", "colleague", "client", "friend", "stranger"]),
      formality: z.enum(["formal", "neutral", "casual"]),
    })
    .optional(),
  threadContext: z.array(z.string()).optional(),
  subject: z.string().optional(),
});

const grammar = new Hono();

// POST /v1/grammar/check — Full grammar analysis
grammar.post(
  "/check",
  requireScope("grammar:read"),
  validateBody(GrammarCheckSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof GrammarCheckSchema>>(c);

    const result = await checkGrammar({
      text: input.text,
      level: input.level,
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.recipientContext !== undefined ? { recipientContext: input.recipientContext } : {}),
      ...(input.threadContext !== undefined ? { threadContext: input.threadContext } : {}),
    });

    return c.json({ data: result });
  },
);

// POST /v1/grammar/correct — Auto-correct and return fixed text
grammar.post(
  "/correct",
  requireScope("grammar:read"),
  validateBody(GrammarCheckSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof GrammarCheckSchema>>(c);

    const result = await checkGrammar({
      text: input.text,
      level: input.level,
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.recipientContext !== undefined ? { recipientContext: input.recipientContext } : {}),
    });

    return c.json({
      data: {
        original: input.text,
        corrected: result.correctedText,
        qualityScore: result.qualityScore,
        issueCount: result.issues.length,
        detectedTone: result.detectedTone,
        detectedLanguage: result.detectedLanguage,
        emailWarnings: result.emailWarnings,
      },
    });
  },
);

export { grammar };
