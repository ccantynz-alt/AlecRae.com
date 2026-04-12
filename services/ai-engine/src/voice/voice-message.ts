// =============================================================================
// @emailed/ai-engine — Voice Message Processing (B8)
// =============================================================================
// Handles audio voice messages: transcription via Whisper, HTML embed generation,
// accessible transcript output, multi-language auto-detection.
// =============================================================================

import type { Result } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VoiceMessageInput {
  /** Audio data as a Blob/File-like object (WebM, MP3, WAV) */
  readonly audioData: Blob | File;
  /** Override language detection with explicit language code (ISO 639-1) */
  readonly language?: string | undefined;
  /** MIME type of the audio (e.g., "audio/webm", "audio/mpeg", "audio/wav") */
  readonly mimeType: string;
  /** Filename for the audio file */
  readonly filename: string;
}

export interface VoiceMessageResult {
  /** Transcribed text from the audio */
  readonly transcriptText: string;
  /** Detected or specified language (ISO 639-1) */
  readonly language: string;
  /** Duration of the audio in seconds */
  readonly duration: number;
  /** HTML embed code with inline audio player + transcript */
  readonly htmlEmbed: string;
  /** URL where the audio file is stored (set by caller after upload) */
  readonly audioUrl: string;
}

export interface TranscriptionResult {
  /** Raw transcribed text */
  readonly text: string;
  /** Detected language */
  readonly language: string;
  /** Duration of the audio in seconds */
  readonly duration: number;
}

export interface WhisperTranscriptionResponse {
  readonly text: string;
  readonly language?: string;
  readonly duration?: number;
  readonly segments?: readonly WhisperSegment[];
}

export interface WhisperSegment {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/m4a",
  "audio/flac",
]);

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper limit)

// Map MIME to extension for Whisper API
const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/flac": "flac",
};

// ─── Validation ─────────────────────────────────────────────────────────────

function validateAudioInput(input: VoiceMessageInput): Result<true> {
  const normalizedMime = input.mimeType.toLowerCase().trim();

  if (!SUPPORTED_AUDIO_TYPES.has(normalizedMime)) {
    return {
      ok: false,
      error: {
        code: "unsupported_audio_format",
        message: `Unsupported audio format: ${input.mimeType}. Supported: WebM, MP3, WAV, OGG, MP4, M4A, FLAC.`,
        retryable: false,
      },
    };
  }

  if (input.audioData.size > MAX_AUDIO_SIZE_BYTES) {
    return {
      ok: false,
      error: {
        code: "audio_too_large",
        message: `Audio file too large: ${Math.round(input.audioData.size / 1024 / 1024)}MB. Maximum: 25MB.`,
        retryable: false,
      },
    };
  }

  if (input.audioData.size === 0) {
    return {
      ok: false,
      error: {
        code: "empty_audio",
        message: "Audio file is empty.",
        retryable: false,
      },
    };
  }

  return { ok: true, value: true };
}

// ─── Transcription ──────────────────────────────────────────────────────────

/**
 * Transcribe audio using the OpenAI Whisper API.
 *
 * Requires OPENAI_API_KEY environment variable.
 */
export async function transcribeAudio(
  audioData: Blob | File,
  mimeType: string,
  options?: { language?: string; apiKey?: string },
): Promise<Result<TranscriptionResult>> {
  const apiKey = options?.apiKey ?? process.env["OPENAI_API_KEY"];

  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "transcription_unavailable",
        message: "Transcription service not configured. Set OPENAI_API_KEY.",
        retryable: false,
      },
    };
  }

  const normalizedMime = mimeType.toLowerCase().trim();
  const extension = MIME_TO_EXTENSION[normalizedMime] ?? "webm";
  const filename = `voice-message.${extension}`;

  const formData = new FormData();
  formData.append("file", new File([audioData], filename, { type: mimeType }));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  if (options?.language) {
    formData.append("language", options.language);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        error: {
          code: "whisper_error",
          message: `Whisper API error ${response.status}: ${errText}`,
          retryable: response.status >= 500,
          details: { status: response.status },
        },
      };
    }

    const data = (await response.json()) as WhisperTranscriptionResponse;

    return {
      ok: true,
      value: {
        text: data.text.trim(),
        language: data.language ?? options?.language ?? "en",
        duration: data.duration ?? 0,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "whisper_unreachable",
        message: `Failed to reach transcription service: ${err instanceof Error ? err.message : "unknown error"}`,
        retryable: true,
      },
    };
  }
}

// ─── HTML Embed Generation ──────────────────────────────────────────────────

/**
 * Format duration in seconds to MM:SS display format.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Generate an inline HTML player embed for a voice message.
 *
 * The embed includes:
 * - An audio player with controls
 * - A styled container with the voice message indicator
 * - An accessible transcript below the player
 * - Responsive design that works in email clients
 */
export function generateHtmlEmbed(
  audioUrl: string,
  transcriptText: string,
  duration: number,
  language: string,
): string {
  const escapedTranscript = escapeHtml(transcriptText);
  const formattedDuration = formatDuration(duration);
  const langLabel = getLanguageLabel(language);

  return `<div style="max-width:480px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:8px 0;" role="region" aria-label="Voice message">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:12px 16px;display:flex;align-items:center;gap:12px;">
    <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
    </div>
    <div style="flex:1;color:white;">
      <div style="font-size:14px;font-weight:600;">Voice Message</div>
      <div style="font-size:12px;opacity:0.85;">${formattedDuration} &middot; ${langLabel}</div>
    </div>
  </div>
  <div style="padding:12px 16px;background:#f8fafc;">
    <audio controls preload="metadata" style="width:100%;height:40px;" aria-label="Voice message audio, ${formattedDuration} long">
      <source src="${escapeHtml(audioUrl)}" type="audio/mpeg" />
      <source src="${escapeHtml(audioUrl)}" type="audio/webm" />
      <a href="${escapeHtml(audioUrl)}" download>Download voice message</a>
    </audio>
  </div>
  <details style="padding:0 16px 12px;background:#f8fafc;">
    <summary style="cursor:pointer;font-size:12px;color:#64748b;padding:4px 0;user-select:none;" aria-label="Show transcript">Transcript</summary>
    <div style="font-size:13px;color:#334155;line-height:1.5;padding:8px 0;border-top:1px solid #e2e8f0;margin-top:4px;" lang="${language}">${escapedTranscript}</div>
  </details>
</div>`;
}

// ─── Main Processing Pipeline ───────────────────────────────────────────────

/**
 * Process a voice message: validate, transcribe, and generate embed HTML.
 *
 * The caller is responsible for uploading the audio to R2/storage and
 * providing the resulting URL back. This function returns an audioUrl
 * placeholder that should be replaced.
 */
export async function processVoiceMessage(
  input: VoiceMessageInput,
  audioUrl: string,
  options?: { openaiApiKey?: string },
): Promise<Result<VoiceMessageResult>> {
  // Validate input
  const validation = validateAudioInput(input);
  if (!validation.ok) {
    return validation as Result<VoiceMessageResult>;
  }

  // Transcribe
  const apiKey = options?.openaiApiKey;
  const transcription = await transcribeAudio(
    input.audioData,
    input.mimeType,
    {
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
    },
  );

  if (!transcription.ok) {
    return transcription as Result<VoiceMessageResult>;
  }

  const { text, language, duration } = transcription.value;

  // Generate HTML embed
  const htmlEmbed = generateHtmlEmbed(audioUrl, text, duration, language);

  return {
    ok: true,
    value: {
      transcriptText: text,
      language,
      duration,
      htmlEmbed,
      audioUrl,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  tr: "Turkish",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  uk: "Ukrainian",
  cs: "Czech",
  el: "Greek",
  he: "Hebrew",
  ro: "Romanian",
  hu: "Hungarian",
  ca: "Catalan",
  hr: "Croatian",
  sk: "Slovak",
  bg: "Bulgarian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
};

function getLanguageLabel(code: string): string {
  return LANGUAGE_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

// ─── Exports ────────────────────────────────────────────────────────────────

export const SUPPORTED_VOICE_AUDIO_TYPES = [...SUPPORTED_AUDIO_TYPES];
export const MAX_VOICE_AUDIO_SIZE = MAX_AUDIO_SIZE_BYTES;
