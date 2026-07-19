/**
 * Voice Message Route — Voice-to-Voice Replies (B8)
 *
 * POST /v1/voice-messages/record     — 501: no object storage backend wired up yet (#29)
 * POST /v1/voice-messages/transcribe — Transcribe existing audio file (unaffected — doesn't persist)
 * GET  /v1/voice-messages/:id        — Get voice message metadata + transcript
 * POST /v1/voice-messages/:id/reply  — 501: no object storage backend wired up yet (#29)
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  transcribeAudio,
  formatDuration,
} from "@alecrae/ai-engine/voice/voice-message";
import {
  getDatabase,
  voiceMessages,
} from "@alecrae/db";

// Voice message metadata + transcripts are persisted in the `voice_messages`
// table (Drizzle) so they survive API restarts, but no object-storage
// backend is actually wired up yet (Known Issue #29): the stack table names
// "Vapron Object Storage" but only listBuckets/createBucket exist in
// lib/vapron.ts, and Vapron API calls are broken in prod regardless (issue
// #83, wrong key scheme). /record and /:id/reply used to hand back a fake
// `/v1/voice-messages/:id/audio` URL that no route ever served — the raw
// audio bytes were discarded and any recipient's embedded player 404s.
// Both now refuse up front instead of silently losing the audio.
// /transcribe is unaffected — it never claimed to persist anything.
const STORAGE_UNAVAILABLE = {
  error: {
    type: "storage_unavailable",
    message:
      "Voice messages are not available yet — no object storage backend is connected to persist the audio. See CLAUDE.md Known Issue #29.",
    code: "storage_unavailable",
  },
} as const;

// ─── Routes ─────────────────────────────────────────────────────────────────

const voiceMessageRouter = new Hono();

// POST /v1/voice-messages/record — Upload voice recording, get transcription
voiceMessageRouter.post(
  "/record",
  requireScope("voice:write"),
  async (c) => {
    return c.json(STORAGE_UNAVAILABLE, 501);
  },
);

// POST /v1/voice-messages/transcribe — Transcribe existing audio file
voiceMessageRouter.post(
  "/transcribe",
  requireScope("voice:write"),
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

    const formData = await c.req.formData();
    const audioFile = formData.get("audio");
    const languageHint = formData.get("language") as string | null;

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Missing 'audio' file in form data.",
            code: "missing_audio",
          },
        },
        400,
      );
    }

    const result = await transcribeAudio(
      audioFile,
      audioFile.type || "audio/webm",
      {
        apiKey: OPENAI_API_KEY,
        ...(languageHint !== null && languageHint !== undefined ? { language: languageHint } : {}),
      },
    );

    if (!result.ok) {
      return c.json(
        {
          error: {
            type: result.error.code,
            message: result.error.message,
            code: result.error.code,
          },
        },
        502,
      );
    }

    return c.json({
      data: {
        text: result.value.text,
        language: result.value.language,
        duration: result.value.duration,
        durationFormatted: formatDuration(result.value.duration),
      },
    });
  },
);

// GET /v1/voice-messages/:id — Get voice message metadata + transcript
voiceMessageRouter.get(
  "/:id",
  requireScope("voice:read"),
  async (c) => {
    const auth = c.get("auth");
    const messageId = c.req.param("id");
    const db = getDatabase();

    const [message] = await db
      .select()
      .from(voiceMessages)
      .where(eq(voiceMessages.id, messageId))
      .limit(1);

    if (!message) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Voice message '${messageId}' not found.`,
            code: "voice_message_not_found",
          },
        },
        404,
      );
    }

    if (message.accountId !== auth.accountId) {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "You do not have access to this voice message.",
            code: "access_denied",
          },
        },
        403,
      );
    }

    return c.json({
      data: {
        id: message.id,
        audioUrl: message.audioUrl,
        mimeType: message.mimeType,
        filename: message.filename,
        sizeBytes: message.sizeBytes,
        transcriptText: message.transcriptText,
        language: message.language,
        duration: message.duration,
        durationFormatted: formatDuration(message.duration),
        htmlEmbed: message.htmlEmbed,
        replyToId: message.replyToId,
        createdAt: message.createdAt.toISOString(),
      },
    });
  },
);

// POST /v1/voice-messages/:id/reply — Reply with another voice message
voiceMessageRouter.post(
  "/:id/reply",
  requireScope("voice:write"),
  async (c) => {
    return c.json(STORAGE_UNAVAILABLE, 501);
  },
);

export { voiceMessageRouter };
