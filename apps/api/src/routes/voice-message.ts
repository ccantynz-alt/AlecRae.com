/**
 * Voice Message Route — Voice-to-Voice Replies (B8)
 *
 * POST /v1/voice-messages/record     — Upload voice message, get transcription + storage URL
 * POST /v1/voice-messages/transcribe — Transcribe existing audio file
 * GET  /v1/voice-messages/:id        — Get voice message metadata + transcript
 * POST /v1/voice-messages/:id/reply  — Reply to a voice message with another voice message
 */

import { Hono } from "hono";
import { requireScope } from "../middleware/auth.js";
import {
  processVoiceMessage,
  transcribeAudio,
  formatDuration,
  MAX_VOICE_AUDIO_SIZE,
} from "@alecrae/ai-engine/voice/voice-message";

// ─── In-memory store (production: persist in Neon + R2) ─────────────────────

interface StoredVoiceMessage {
  readonly id: string;
  readonly accountId: string;
  readonly audioUrl: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly transcriptText: string;
  readonly language: string;
  readonly duration: number;
  readonly htmlEmbed: string;
  readonly replyToId: string | null;
  readonly createdAt: string;
}

const voiceMessages = new Map<string, StoredVoiceMessage>();

function generateId(): string {
  return `vm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const voiceMessageRouter = new Hono();

// POST /v1/voice-messages/record — Upload voice recording, get transcription
voiceMessageRouter.post(
  "/record",
  requireScope("voice:write"),
  async (c) => {
    const auth = c.get("auth");

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

    // Parse multipart form data
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");
    const languageHint = formData.get("language") as string | null;

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Missing 'audio' file in form data. Send a multipart form with an 'audio' field.",
            code: "missing_audio",
          },
        },
        400,
      );
    }

    if (audioFile.size > MAX_VOICE_AUDIO_SIZE) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Audio file too large: ${Math.round(audioFile.size / 1024 / 1024)}MB. Maximum: 25MB.`,
            code: "audio_too_large",
          },
        },
        400,
      );
    }

    if (audioFile.size === 0) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Audio file is empty.",
            code: "empty_audio",
          },
        },
        400,
      );
    }

    // Generate a storage URL placeholder (production: upload to R2 and get real URL)
    const messageId = generateId();
    const audioUrl = `/v1/voice-messages/${messageId}/audio`;

    // Process: validate + transcribe + generate embed
    const result = await processVoiceMessage(
      {
        audioData: audioFile,
        mimeType: audioFile.type || "audio/webm",
        filename: audioFile.name || "voice-message.webm",
        language: languageHint ?? undefined,
      },
      audioUrl,
      { openaiApiKey: OPENAI_API_KEY },
    );

    if (!result.ok) {
      const statusCode =
        result.error.code === "whisper_error" ? 502
        : result.error.code === "whisper_unreachable" ? 502
        : 400;

      return c.json(
        {
          error: {
            type: result.error.code,
            message: result.error.message,
            code: result.error.code,
          },
        },
        statusCode,
      );
    }

    // Store the voice message
    const stored: StoredVoiceMessage = {
      id: messageId,
      accountId: auth.accountId,
      audioUrl: result.value.audioUrl,
      mimeType: audioFile.type || "audio/webm",
      filename: audioFile.name || "voice-message.webm",
      sizeBytes: audioFile.size,
      transcriptText: result.value.transcriptText,
      language: result.value.language,
      duration: result.value.duration,
      htmlEmbed: result.value.htmlEmbed,
      replyToId: null,
      createdAt: new Date().toISOString(),
    };

    voiceMessages.set(messageId, stored);

    return c.json({
      data: {
        id: messageId,
        audioUrl: stored.audioUrl,
        transcriptText: stored.transcriptText,
        language: stored.language,
        duration: stored.duration,
        durationFormatted: formatDuration(stored.duration),
        htmlEmbed: stored.htmlEmbed,
        sizeBytes: stored.sizeBytes,
        createdAt: stored.createdAt,
      },
    });
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

    const message = voiceMessages.get(messageId);

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
        createdAt: message.createdAt,
      },
    });
  },
);

// POST /v1/voice-messages/:id/reply — Reply with another voice message
voiceMessageRouter.post(
  "/:id/reply",
  requireScope("voice:write"),
  async (c) => {
    const auth = c.get("auth");
    const parentId = c.req.param("id");

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

    // Verify parent exists
    const parent = voiceMessages.get(parentId);
    if (!parent) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Voice message '${parentId}' not found.`,
            code: "voice_message_not_found",
          },
        },
        404,
      );
    }

    // Parse audio reply
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

    if (audioFile.size > MAX_VOICE_AUDIO_SIZE) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Audio file too large: ${Math.round(audioFile.size / 1024 / 1024)}MB. Maximum: 25MB.`,
            code: "audio_too_large",
          },
        },
        400,
      );
    }

    const replyId = generateId();
    const audioUrl = `/v1/voice-messages/${replyId}/audio`;

    const result = await processVoiceMessage(
      {
        audioData: audioFile,
        mimeType: audioFile.type || "audio/webm",
        filename: audioFile.name || "voice-reply.webm",
        language: languageHint ?? undefined,
      },
      audioUrl,
      { openaiApiKey: OPENAI_API_KEY },
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

    const stored: StoredVoiceMessage = {
      id: replyId,
      accountId: auth.accountId,
      audioUrl: result.value.audioUrl,
      mimeType: audioFile.type || "audio/webm",
      filename: audioFile.name || "voice-reply.webm",
      sizeBytes: audioFile.size,
      transcriptText: result.value.transcriptText,
      language: result.value.language,
      duration: result.value.duration,
      htmlEmbed: result.value.htmlEmbed,
      replyToId: parentId,
      createdAt: new Date().toISOString(),
    };

    voiceMessages.set(replyId, stored);

    return c.json({
      data: {
        id: replyId,
        audioUrl: stored.audioUrl,
        transcriptText: stored.transcriptText,
        language: stored.language,
        duration: stored.duration,
        durationFormatted: formatDuration(stored.duration),
        htmlEmbed: stored.htmlEmbed,
        replyToId: parentId,
        parentTranscript: parent.transcriptText,
        sizeBytes: stored.sizeBytes,
        createdAt: stored.createdAt,
      },
    });
  },
);

export { voiceMessageRouter };
