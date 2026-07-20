/**
 * Voice Message Route — Voice-to-Voice Replies (B8)
 *
 * POST /v1/voice-messages/record     — Upload voice recording, get transcription
 * POST /v1/voice-messages/transcribe — Transcribe existing audio file (unaffected — doesn't persist)
 * GET  /v1/voice-messages/:id        — Get voice message metadata + transcript
 * POST /v1/voice-messages/:id/reply  — Reply with another voice message
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  transcribeAudio,
  formatDuration,
} from "@alecrae/ai-engine/voice/voice-message";
import {
  getDatabase,
  voiceMessages,
  type VoiceMessage,
} from "@alecrae/db";
import { vapron, isVapronConfigured, VapronError } from "../lib/vapron.js";

// Voice message metadata + transcripts are persisted in the `voice_messages`
// table (Drizzle) so they survive API restarts. /record and /:id/reply used
// to hand back a fake `/v1/voice-messages/:id/audio` URL that no route ever
// served — the raw audio bytes were discarded and any recipient's embedded
// player 404s (Known Issue #29). Fixed 2026-07-21 by wiring the real Vapron
// object-storage upload (lib/vapron.ts, corrected transport per issue #83).
// /transcribe is unaffected — it never claimed to persist anything.
const STORAGE_UNAVAILABLE = {
  error: {
    type: "storage_unavailable",
    message:
      "Voice messages are not available right now — object storage is not configured.",
    code: "storage_unavailable",
  },
} as const;

/** Storage bucket for voice-message audio, distinct from the general files bucket. */
const VOICE_BUCKET = process.env["VAPRON_VOICE_BUCKET"] ?? "alecrae-voice-messages";

/** Ceiling on a single voice-message recording, well above any realistic dictated reply. */
const MAX_VOICE_MESSAGE_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Upload a recorded audio blob to Vapron storage, best-effort transcribe it,
 * and persist a voice_messages row. Shared by /record and /:id/reply.
 */
async function persistVoiceMessage(
  accountId: string,
  audioFile: File,
  languageHint: string | null,
  replyToId: string | null,
): Promise<
  | { ok: true; record: VoiceMessage }
  | { ok: false; status: 400 | 502 | 503; message: string }
> {
  if (!isVapronConfigured()) {
    return { ok: false, status: 503, message: STORAGE_UNAVAILABLE.error.message };
  }

  if (audioFile.size > MAX_VOICE_MESSAGE_BYTES) {
    return {
      ok: false,
      status: 400,
      message: `Voice message exceeds the ${MAX_VOICE_MESSAGE_BYTES / (1024 * 1024)}MB limit.`,
    };
  }

  const id = crypto.randomUUID();
  const contentType = audioFile.type || "audio/webm";
  const storageKey = `${accountId}/${id}.${contentType.split("/")[1] ?? "webm"}`;

  let uploadUrl: string;
  try {
    const result = await vapron.storage.getUploadUrl({
      bucket: VOICE_BUCKET,
      path: storageKey,
      contentType,
    });
    uploadUrl = result.uploadUrl;
  } catch (err) {
    console.error("[voice-message] Vapron getUploadUrl failed:", err);
    const status = err instanceof VapronError && err.status >= 400 && err.status < 500 ? 502 : 503;
    return { ok: false, status, message: "Could not get an upload URL from object storage." };
  }

  const bytes = await audioFile.arrayBuffer();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  }).catch((err: unknown) => {
    console.error("[voice-message] Upload PUT failed:", err);
    return null;
  });

  if (!putRes || !putRes.ok) {
    return { ok: false, status: 502, message: "Failed to upload audio to object storage." };
  }

  // Presigned PUT URLs are query-signed; the same object's canonical (public,
  // S3-compatible convention — Vapron Object Storage is documented as
  // S3-compatible in CLAUDE.md) URL is the same origin+path with the query
  // string stripped. Flagged here rather than guessed silently: verify this
  // resolves once a real upload has been done against a live bucket.
  const audioUrl = uploadUrl.split("?")[0] ?? uploadUrl;

  let transcriptText = "";
  let language = languageHint ?? "en";
  let duration = 0;
  const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
  if (OPENAI_API_KEY) {
    const transcribed = await transcribeAudio(audioFile, contentType, {
      apiKey: OPENAI_API_KEY,
      ...(languageHint ? { language: languageHint } : {}),
    }).catch((err: unknown) => {
      console.error("[voice-message] Best-effort transcription failed:", err);
      return null;
    });
    if (transcribed?.ok) {
      transcriptText = transcribed.value.text;
      language = transcribed.value.language;
      duration = transcribed.value.duration;
    }
  }

  const db = getDatabase();
  const [record] = await db
    .insert(voiceMessages)
    .values({
      id,
      accountId,
      audioUrl,
      mimeType: contentType,
      filename: audioFile.name || `voice-message.${contentType.split("/")[1] ?? "webm"}`,
      sizeBytes: bytes.byteLength,
      transcriptText,
      language,
      duration,
      htmlEmbed: `<audio controls src="${audioUrl}"></audio>`,
      replyToId,
    })
    .returning();

  if (!record) {
    return { ok: false, status: 502, message: "Failed to record the voice message after upload." };
  }

  return { ok: true, record };
}

function formatVoiceMessage(message: VoiceMessage): Record<string, unknown> {
  return {
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
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const voiceMessageRouter = new Hono();

// POST /v1/voice-messages/record — Upload voice recording, get transcription
voiceMessageRouter.post(
  "/record",
  requireScope("voice:write"),
  async (c) => {
    const auth = c.get("auth");
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

    const result = await persistVoiceMessage(auth.accountId, audioFile, languageHint, null);
    if (!result.ok) {
      return c.json(
        { error: { type: "storage_unavailable", message: result.message, code: "storage_unavailable" } },
        result.status,
      );
    }

    return c.json({ data: formatVoiceMessage(result.record) }, 201);
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

    return c.json({ data: formatVoiceMessage(message) });
  },
);

// POST /v1/voice-messages/:id/reply — Reply with another voice message
voiceMessageRouter.post(
  "/:id/reply",
  requireScope("voice:write"),
  async (c) => {
    const auth = c.get("auth");
    const parentId = c.req.param("id");
    const db = getDatabase();

    const [parent] = await db
      .select({ id: voiceMessages.id, accountId: voiceMessages.accountId })
      .from(voiceMessages)
      .where(and(eq(voiceMessages.id, parentId), eq(voiceMessages.accountId, auth.accountId)))
      .limit(1);

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

    const result = await persistVoiceMessage(auth.accountId, audioFile, languageHint, parentId);
    if (!result.ok) {
      return c.json(
        { error: { type: "storage_unavailable", message: result.message, code: "storage_unavailable" } },
        result.status,
      );
    }

    return c.json({ data: formatVoiceMessage(result.record) }, 201);
  },
);

export { voiceMessageRouter };
