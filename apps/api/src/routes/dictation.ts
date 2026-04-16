/**
 * Dictation Route — Advanced Voice-to-Email Processing
 *
 * POST /v1/dictation/process     — Process dictated text into structured email
 * POST /v1/dictation/transcribe  — Transcribe audio to text (Whisper proxy)
 * GET  /v1/dictation/languages   — List supported dictation languages
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { processDictation, SUPPORTED_DICTATION_LANGUAGES } from "@alecrae/ai-engine/dictation";

const ProcessSchema = z.object({
  transcription: z.string().min(1).max(10000),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  mode: z.enum(["compose", "reply", "triage", "command"]).default("compose"),
  replyContext: z
    .object({
      from: z.string(),
      subject: z.string(),
      body: z.string(),
    })
    .optional(),
});

const dictation = new Hono();

// POST /v1/dictation/process — Convert dictation to structured email
dictation.post(
  "/process",
  requireScope("dictation:write"),
  validateBody(ProcessSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ProcessSchema>>(c);
    const auth = c.get("auth");

    const result = await processDictation({
      transcription: input.transcription,
      accountId: auth.accountId,
      mode: input.mode,
      ...(input.sourceLanguage !== undefined ? { sourceLanguage: input.sourceLanguage } : {}),
      ...(input.targetLanguage !== undefined ? { targetLanguage: input.targetLanguage } : {}),
      ...(input.replyContext !== undefined ? { replyContext: input.replyContext } : {}),
    });

    return c.json({ data: result });
  },
);

// POST /v1/dictation/transcribe — Whisper proxy for audio transcription
dictation.post(
  "/transcribe",
  requireScope("dictation:write"),
  async (c) => {
    const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
    if (!OPENAI_API_KEY) {
      return c.json(
        {
          error: {
            type: "configuration_error",
            message: "Transcription service not configured. Set OPENAI_API_KEY.",
            code: "transcription_unavailable",
          },
        },
        503,
      );
    }

    // Forward the multipart form data to Whisper API
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Missing 'audio' file in form data",
            code: "missing_audio",
          },
        },
        400,
      );
    }

    const language = formData.get("language") as string | null;

    const whisperForm = new FormData();
    whisperForm.append("file", audioFile);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "json");
    if (language) whisperForm.append("language", language);

    try {
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: whisperForm,
      });

      if (!response.ok) {
        return c.json(
          {
            error: {
              type: "transcription_error",
              message: `Whisper API error: ${response.status}`,
              code: "whisper_error",
            },
          },
          502,
        );
      }

      const result = (await response.json()) as { text: string };
      return c.json({ data: { text: result.text } });
    } catch {
      return c.json(
        {
          error: {
            type: "transcription_error",
            message: "Failed to reach transcription service",
            code: "whisper_unreachable",
          },
        },
        502,
      );
    }
  },
);

// GET /v1/dictation/languages — List supported languages
dictation.get(
  "/languages",
  requireScope("dictation:read"),
  (c) => {
    return c.json({ data: SUPPORTED_DICTATION_LANGUAGES });
  },
);

export { dictation };
