/**
 * Translation Route — Bidirectional Real-Time Email Translation
 *
 * Existing endpoints:
 *   POST /v1/translate              — Translate text between languages
 *   POST /v1/translate/email        — Translate a full email (subject + body)
 *   POST /v1/translate/detect       — Detect language of text
 *   GET  /v1/translate/languages    — List supported languages
 *
 * Per-email convenience endpoint (mounted separately on emails router):
 *   POST /v1/emails/:id/translate   — Auto-translate an email with badge metadata
 *   GET  /v1/emails/:id/translation — Retrieve cached translation for an email
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, emailTranslations, emails } from "@alecrae/db";

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

// ─── Supported Languages ─────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "he", name: "Hebrew", nativeName: "עברית" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "fa", name: "Persian", nativeName: "فارسی" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
] as const;

function languageName(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

// ─── AI Translation via Claude ───────────────────────────────────────────────

async function translateWithClaude(
  text: string,
  targetLang: string,
  sourceLang?: string,
  context?: "email_subject" | "email_body" | "general",
): Promise<{ translated: string; detectedLanguage: string }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Translation service requires ANTHROPIC_API_KEY");
  }

  const targetName = languageName(targetLang);
  const sourceName = sourceLang ? languageName(sourceLang) : "auto-detected";

  const systemPrompt = `You are a professional translator specializing in email communication.
Translate the following text to ${targetName}.
${sourceLang ? `The source language is ${sourceName}.` : "Auto-detect the source language."}
${context === "email_subject" ? "This is an email subject line — keep it concise." : ""}
${context === "email_body" ? "This is an email body — preserve formatting, paragraph breaks, greetings, and sign-offs. Adapt cultural conventions appropriately." : ""}

Rules:
- Preserve the tone and formality level
- Preserve names, proper nouns, and technical terms
- Preserve email formatting (line breaks, bullet points)
- If the text is already in ${targetName}, return it unchanged
- Return ONLY the translated text, no explanations
- On the FIRST line, output the detected source language code (e.g., "en", "es", "fr")
- On the SECOND line onward, output the translation`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Translation API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text?: string }[];
  };

  const fullOutput = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();

  // Parse: first line = detected language, rest = translation
  const lines = fullOutput.split("\n");
  const detectedLanguage = lines[0]?.trim().toLowerCase().slice(0, 5) ?? sourceLang ?? "unknown";
  const translated = lines.slice(1).join("\n").trim() || fullOutput;

  return { translated, detectedLanguage };
}

/**
 * Detect the language of a text snippet using Claude.
 * Returns a language code string.
 */
async function detectLanguage(text: string): Promise<{ code: string; name: string }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Language detection requires ANTHROPIC_API_KEY");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      system: `Detect the language of the following text. Reply with ONLY the ISO 639-1 two-letter language code (e.g., "en", "es", "fr", "de", "ja", "zh", "ko", "ar", "ru"). Nothing else.`,
      messages: [{ role: "user", content: text.slice(0, 2000) }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Language detection API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text?: string }[];
  };

  const code = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim()
    .toLowerCase()
    .slice(0, 5);

  return {
    code,
    name: languageName(code),
  };
}

// ─── ID generation ─────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `trl_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TranslateSchema = z.object({
  text: z.string().min(1).max(50000),
  targetLanguage: z.string().min(2).max(5),
  sourceLanguage: z.string().min(2).max(5).optional(),
});

const TranslateEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  targetLanguage: z.string().min(2).max(5),
  sourceLanguage: z.string().min(2).max(5).optional(),
});

const DetectSchema = z.object({
  text: z.string().min(1).max(5000),
});

const PerEmailTranslateSchema = z.object({
  targetLanguage: z.string().min(2).max(5),
  /** If true, force re-translation even if a cached version exists. */
  force: z.boolean().default(false),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const translate = new Hono();

// POST /v1/translate — Translate text
translate.post(
  "/",
  requireScope("translate:read"),
  validateBody(TranslateSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof TranslateSchema>>(c);

    const result = await translateWithClaude(
      input.text,
      input.targetLanguage,
      input.sourceLanguage,
      "general",
    );

    return c.json({
      data: {
        original: input.text,
        translated: result.translated,
        sourceLanguage: result.detectedLanguage,
        targetLanguage: input.targetLanguage,
      },
    });
  },
);

// POST /v1/translate/email — Translate a full email
translate.post(
  "/email",
  requireScope("translate:read"),
  validateBody(TranslateEmailSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof TranslateEmailSchema>>(c);

    // Translate subject and body in parallel
    const [subjectResult, bodyResult] = await Promise.all([
      translateWithClaude(input.subject, input.targetLanguage, input.sourceLanguage, "email_subject"),
      translateWithClaude(input.body, input.targetLanguage, input.sourceLanguage, "email_body"),
    ]);

    return c.json({
      data: {
        original: {
          subject: input.subject,
          body: input.body,
        },
        translated: {
          subject: subjectResult.translated,
          body: bodyResult.translated,
        },
        sourceLanguage: bodyResult.detectedLanguage,
        targetLanguage: input.targetLanguage,
      },
    });
  },
);

// POST /v1/translate/detect — Detect language
translate.post(
  "/detect",
  requireScope("translate:read"),
  validateBody(DetectSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof DetectSchema>>(c);

    const detected = await detectLanguage(input.text);

    return c.json({
      data: {
        detectedLanguage: detected.code,
        languageName: detected.name,
      },
    });
  },
);

// GET /v1/translate/languages — List supported languages
translate.get(
  "/languages",
  requireScope("translate:read"),
  (c) => {
    return c.json({ data: SUPPORTED_LANGUAGES });
  },
);

// ─── Per-email translation router (mounted at /v1/emails) ──────────────────

const emailTranslate = new Hono();

/**
 * POST /v1/emails/:id/translate
 *
 * Auto-detect the language of an email, translate to the user's target
 * language, cache the result, and return it with badge metadata.
 */
emailTranslate.post(
  "/:id/translate",
  requireScope("translate:read"),
  validateBody(PerEmailTranslateSchema),
  async (c) => {
    const emailId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof PerEmailTranslateSchema>>(c);
    const auth = c.get("auth");

    const db = getDatabase();

    // Check for cached translation if not forcing re-translate.
    if (!input.force) {
      const cached = await db
        .select()
        .from(emailTranslations)
        .where(
          and(
            eq(emailTranslations.emailId, emailId),
            eq(emailTranslations.targetLanguage, input.targetLanguage),
          ),
        )
        .limit(1);

      const existing = cached[0];
      if (existing) {
        return c.json({
          data: {
            id: existing.id,
            emailId,
            sourceLanguage: existing.sourceLanguage,
            sourceLanguageName: existing.sourceLanguageName,
            targetLanguage: existing.targetLanguage,
            targetLanguageName: existing.targetLanguageName,
            original: existing.originalContent,
            translated: existing.translatedContent,
            autoTranslated: existing.autoTranslated,
            badge: {
              visible: existing.sourceLanguage !== input.targetLanguage,
              label: `Translated from ${existing.sourceLanguageName}`,
              sourceLanguage: existing.sourceLanguage,
              sourceLanguageName: existing.sourceLanguageName,
            },
            cached: true,
          },
        });
      }
    }

    // Load the email from DB.
    const emailRows = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    const emailRow = emailRows[0];
    if (!emailRow) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Email ${emailId} not found`,
            code: "email_not_found",
          },
        },
        404,
      );
    }

    const originalSubject = emailRow.subject;
    const originalBody = emailRow.textBody ?? emailRow.htmlBody ?? "";

    // Detect the source language and translate in parallel.
    const bodySnippet = originalBody.slice(0, 2000);
    const combinedText = `${originalSubject}\n\n${bodySnippet}`;

    const detected = await detectLanguage(combinedText);
    const sourceCode = detected.code;
    const sourceName = detected.name;

    // If the email is already in the target language, no translation needed.
    if (sourceCode === input.targetLanguage) {
      return c.json({
        data: {
          emailId,
          sourceLanguage: sourceCode,
          sourceLanguageName: sourceName,
          targetLanguage: input.targetLanguage,
          targetLanguageName: languageName(input.targetLanguage),
          original: {
            subject: originalSubject,
            body: originalBody,
          },
          translated: {
            subject: originalSubject,
            body: originalBody,
          },
          autoTranslated: false,
          badge: {
            visible: false,
            label: null,
            sourceLanguage: sourceCode,
            sourceLanguageName: sourceName,
          },
          cached: false,
        },
      });
    }

    // Translate subject and body in parallel.
    const [subjectResult, bodyResult] = await Promise.all([
      translateWithClaude(originalSubject, input.targetLanguage, sourceCode, "email_subject"),
      translateWithClaude(originalBody, input.targetLanguage, sourceCode, "email_body"),
    ]);

    const translationId = generateId();
    const targetName = languageName(input.targetLanguage);

    // Persist to DB.
    await db.insert(emailTranslations).values({
      id: translationId,
      accountId: auth.accountId,
      emailId,
      sourceLanguage: sourceCode,
      sourceLanguageName: sourceName,
      targetLanguage: input.targetLanguage,
      targetLanguageName: targetName,
      originalContent: {
        subject: originalSubject,
        body: originalBody,
      },
      translatedContent: {
        subject: subjectResult.translated,
        body: bodyResult.translated,
      },
      autoTranslated: true,
    });

    return c.json({
      data: {
        id: translationId,
        emailId,
        sourceLanguage: sourceCode,
        sourceLanguageName: sourceName,
        targetLanguage: input.targetLanguage,
        targetLanguageName: targetName,
        original: {
          subject: originalSubject,
          body: originalBody,
        },
        translated: {
          subject: subjectResult.translated,
          body: bodyResult.translated,
        },
        autoTranslated: true,
        badge: {
          visible: true,
          label: `Translated from ${sourceName}`,
          sourceLanguage: sourceCode,
          sourceLanguageName: sourceName,
        },
        cached: false,
      },
    });
  },
);

/**
 * GET /v1/emails/:id/translation
 *
 * Retrieve an existing cached translation for an email. Returns the
 * translation record including badge metadata and original content for
 * the "toggle to original" feature.
 */
emailTranslate.get(
  "/:id/translation",
  requireScope("translate:read"),
  async (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");
    const targetLanguage = c.req.query("targetLanguage") ?? "en";

    const db = getDatabase();
    const rows = await db
      .select()
      .from(emailTranslations)
      .where(
        and(
          eq(emailTranslations.emailId, emailId),
          eq(emailTranslations.accountId, auth.accountId),
          eq(emailTranslations.targetLanguage, targetLanguage),
        ),
      )
      .limit(1);

    const record = rows[0];
    if (!record) {
      return c.json({
        data: {
          emailId,
          hasTranslation: false,
          badge: {
            visible: false,
            label: null,
            sourceLanguage: null,
            sourceLanguageName: null,
          },
        },
      });
    }

    return c.json({
      data: {
        emailId,
        hasTranslation: true,
        id: record.id,
        sourceLanguage: record.sourceLanguage,
        sourceLanguageName: record.sourceLanguageName,
        targetLanguage: record.targetLanguage,
        targetLanguageName: record.targetLanguageName,
        original: record.originalContent,
        translated: record.translatedContent,
        autoTranslated: record.autoTranslated,
        badge: {
          visible: record.sourceLanguage !== record.targetLanguage,
          label: `Translated from ${record.sourceLanguageName}`,
          sourceLanguage: record.sourceLanguage,
          sourceLanguageName: record.sourceLanguageName,
        },
      },
    });
  },
);

export { translate, emailTranslate };
