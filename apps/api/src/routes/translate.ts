/**
 * Translation Route — Bidirectional Real-Time Email Translation
 *
 * POST /v1/translate              — Translate text between languages
 * POST /v1/translate/email        — Translate a full email (subject + body)
 * POST /v1/translate/detect       — Detect language of text
 * GET  /v1/translate/languages    — List supported languages
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

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
    content: Array<{ type: string; text?: string }>;
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

    // Quick local detection for common languages
    const result = await translateWithClaude(input.text, "en", undefined, "general");

    return c.json({
      data: {
        detectedLanguage: result.detectedLanguage,
        languageName: languageName(result.detectedLanguage),
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

export { translate };
