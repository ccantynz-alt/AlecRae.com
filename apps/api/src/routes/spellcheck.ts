/**
 * Spell Check Route — Multi-Language Spell Checking
 *
 * POST /v1/compose/spellcheck           — Check text for spelling errors
 * GET  /v1/compose/spellcheck/languages — List supported languages
 * POST /v1/compose/spellcheck/dictionary — Add a word to user's custom dictionary
 * DELETE /v1/compose/spellcheck/dictionary/:word — Remove a word from custom dictionary
 * GET  /v1/compose/spellcheck/dictionary — List words in custom dictionary
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
  validateQuery,
  getValidatedQuery,
} from "../middleware/validator.js";
import { spellCheck, SUPPORTED_LANGUAGES } from "@emailed/ai-engine/grammar/spellcheck";
import { getDatabase, customDictionaries } from "@emailed/db";

// ─── Schemas ────────────────────────────────────────────────────────────────

const SpellCheckSchema = z.object({
  text: z.string().min(1).max(50000),
  language: z.string().min(2).max(10).optional(),
  customWords: z.array(z.string().min(1).max(100)).optional(),
});

const AddWordSchema = z.object({
  word: z.string().min(1).max(100),
  language: z.string().min(2).max(10).optional(),
});

const DictionaryQuerySchema = z.object({
  language: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Router ─────────────────────────────────────────────────────────────────

const spellcheckRouter = new Hono();

// POST /v1/compose/spellcheck — Run spell check on text
spellcheckRouter.post(
  "/",
  requireScope("grammar:read"),
  validateBody(SpellCheckSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SpellCheckSchema>>(c);
    const auth = c.get("auth");

    // Fetch custom dictionary words if user didn't provide them
    let customWords = input.customWords;
    if (!customWords) {
      try {
        const db = getDatabase();
        const rows = await db
          .select({ word: customDictionaries.word })
          .from(customDictionaries)
          .where(eq(customDictionaries.accountId, auth.accountId));
        customWords = rows.map((r) => r.word);
      } catch {
        customWords = [];
      }
    }

    const result = await spellCheck({
      text: input.text,
      language: input.language,
      customWords,
    });

    return c.json({ data: result });
  },
);

// GET /v1/compose/spellcheck/languages — List supported languages
spellcheckRouter.get(
  "/languages",
  requireScope("grammar:read"),
  (c) => {
    const languages: Array<{ code: string; name: string }> = [];
    for (const [code, name] of SUPPORTED_LANGUAGES) {
      languages.push({ code, name });
    }
    return c.json({ data: { languages } });
  },
);

// POST /v1/compose/spellcheck/dictionary — Add word to custom dictionary
spellcheckRouter.post(
  "/dictionary",
  requireScope("grammar:read"),
  validateBody(AddWordSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AddWordSchema>>(c);
    const auth = c.get("auth");

    try {
      const db = getDatabase();
      const id = crypto.randomUUID().replace(/-/g, "");

      await db.insert(customDictionaries).values({
        id,
        accountId: auth.accountId,
        word: input.word.toLowerCase(),
        language: input.language ?? null,
      });

      return c.json({
        data: {
          id,
          word: input.word.toLowerCase(),
          language: input.language ?? null,
        },
      });
    } catch (error: unknown) {
      // Handle unique constraint violation (word already exists)
      const message =
        error instanceof Error ? error.message : String(error);
      if (message.includes("unique") || message.includes("duplicate")) {
        return c.json(
          {
            error: {
              type: "conflict",
              message: "Word already exists in your custom dictionary",
              code: "duplicate_word",
            },
          },
          409,
        );
      }
      throw error;
    }
  },
);

// DELETE /v1/compose/spellcheck/dictionary/:word — Remove word from custom dictionary
spellcheckRouter.delete(
  "/dictionary/:word",
  requireScope("grammar:read"),
  async (c) => {
    const auth = c.get("auth");
    const word = c.req.param("word");

    if (!word) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Word parameter is required",
            code: "missing_param",
          },
        },
        400,
      );
    }

    try {
      const db = getDatabase();
      await db
        .delete(customDictionaries)
        .where(
          and(
            eq(customDictionaries.accountId, auth.accountId),
            eq(customDictionaries.word, word.toLowerCase()),
          ),
        );

      return c.json({ data: { deleted: true, word: word.toLowerCase() } });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return c.json(
        {
          error: {
            type: "server_error",
            message: `Failed to delete word: ${message}`,
            code: "delete_failed",
          },
        },
        500,
      );
    }
  },
);

// GET /v1/compose/spellcheck/dictionary — List custom dictionary words
spellcheckRouter.get(
  "/dictionary",
  requireScope("grammar:read"),
  validateQuery(DictionaryQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const query = getValidatedQuery<z.infer<typeof DictionaryQuerySchema>>(c);

    try {
      const db = getDatabase();

      let q = db
        .select()
        .from(customDictionaries)
        .where(eq(customDictionaries.accountId, auth.accountId))
        .limit(query.limit)
        .offset(query.offset);

      if (query.language) {
        q = db
          .select()
          .from(customDictionaries)
          .where(
            and(
              eq(customDictionaries.accountId, auth.accountId),
              eq(customDictionaries.language, query.language),
            ),
          )
          .limit(query.limit)
          .offset(query.offset);
      }

      const rows = await q;

      return c.json({
        data: {
          words: rows.map((r) => ({
            id: r.id,
            word: r.word,
            language: r.language,
            createdAt: r.createdAt.toISOString(),
          })),
          pagination: {
            limit: query.limit,
            offset: query.offset,
            count: rows.length,
          },
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return c.json(
        {
          error: {
            type: "server_error",
            message: `Failed to list dictionary: ${message}`,
            code: "list_failed",
          },
        },
        500,
      );
    }
  },
);

export { spellcheckRouter };
