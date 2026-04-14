// =============================================================================
// @alecrae/ai-engine — Transcript Fetcher (S9)
// =============================================================================
// Pluggable provider abstraction for fetching call transcripts.
// Real REST integration for Zoom (https://marketplace.zoom.us/docs/api-reference/zoom-api/).
// Otter, Fathom, Granola, Read.ai providers wrap their public APIs (best-effort
// official endpoints; configurable base URL for self-hosted/proxy setups).
//
// Each provider is constructed with the credentials it needs. fetchTranscript()
// fans out to providers that .supports() the meeting and returns the first
// non-null result.

import type {
  MeetingReference,
  TranscriptProvider,
  TranscriptResult,
  TranscriptParticipant,
} from "./types.js";

// ─── Top-level orchestrator ──────────────────────────────────────────────────

export async function fetchTranscript(
  meeting: MeetingReference,
  providers: readonly TranscriptProvider[],
): Promise<TranscriptResult | null> {
  for (const provider of providers) {
    if (!provider.supports(meeting)) continue;
    try {
      const result = await provider.fetch(meeting);
      if (result) return result;
    } catch {
      // Try the next provider — never throw out of the orchestrator.
      continue;
    }
  }
  return null;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function jsonFetch<T>(
  url: string,
  init: RequestInit,
): Promise<T | null> {
  const res = await fetch(url, init);
  if (!res.ok) {
    if (res.status === 404 || res.status === 401 || res.status === 403) return null;
    throw new Error(`${url} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

function summariseFromTranscript(text: string, maxChars = 600): string {
  if (text.length <= maxChars) return text;
  // Cheap extractive summary: first ~3 sentences.
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ");
  return sentences.length > 0 ? sentences.slice(0, maxChars) : text.slice(0, maxChars);
}

function extractActionItems(text: string): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/\b(action item|todo|to-do|next step|follow.?up):/i.test(line)) {
      out.push(line.trim());
    } else if (/^\s*[-*•]\s+(?:action|todo|will|i'?ll|we'?ll)\b/i.test(line)) {
      out.push(line.trim());
    }
  }
  return out.slice(0, 20);
}

// ─── Zoom REST provider ──────────────────────────────────────────────────────
// Server-to-server OAuth: caller supplies a pre-acquired access token.
// Endpoints used:
//   GET /v2/meetings/{meetingId}/recordings   → recording_files (transcript .vtt)
//   GET /v2/past_meetings/{meetingUUID}/instances (optional, not used here)
//
// VTT files are downloaded then parsed into plain text.

export interface ZoomProviderConfig {
  /** OAuth access token (server-to-server). */
  readonly accessToken: string;
  /** Override base URL (default api.zoom.us/v2). */
  readonly baseUrl?: string;
}

interface ZoomRecordingFile {
  readonly id: string;
  readonly file_type: string;
  readonly file_extension?: string;
  readonly download_url: string;
  readonly recording_type?: string;
}

interface ZoomRecordingsResponse {
  readonly id: number;
  readonly uuid: string;
  readonly topic: string;
  readonly duration: number;
  readonly recording_files: readonly ZoomRecordingFile[];
  readonly participant_audio_files?: readonly ZoomRecordingFile[];
}

function parseVtt(vtt: string): string {
  // Strip WEBVTT header, cue identifiers, timestamps. Keep text lines.
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^WEBVTT/.test(line)) continue;
    if (/^\d+$/.test(line.trim())) continue; // cue id
    if (/-->/.test(line)) continue; // timestamp
    if (/^NOTE\b/i.test(line)) continue;
    out.push(line.trim());
  }
  return out.join(" ");
}

export class ZoomTranscriptProvider implements TranscriptProvider {
  readonly name = "zoom";
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(config: ZoomProviderConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl ?? "https://api.zoom.us/v2";
  }

  supports(meeting: MeetingReference): boolean {
    return meeting.platform === "zoom" && Boolean(meeting.meetingId);
  }

  async fetch(meeting: MeetingReference): Promise<TranscriptResult | null> {
    if (!meeting.meetingId) return null;

    const recordings = await jsonFetch<ZoomRecordingsResponse>(
      `${this.baseUrl}/meetings/${encodeURIComponent(meeting.meetingId)}/recordings`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
        },
      },
    );
    if (!recordings) return null;

    // Find the transcript file (VTT) — Zoom uses file_type "TRANSCRIPT".
    const transcriptFile = recordings.recording_files.find(
      (f) => f.file_type === "TRANSCRIPT" || f.file_extension?.toUpperCase() === "VTT",
    );
    const recordingFile = recordings.recording_files.find(
      (f) => f.file_type === "MP4" || f.recording_type === "shared_screen_with_speaker_view",
    );

    let transcriptText = "";
    if (transcriptFile) {
      const vttRes = await fetch(
        `${transcriptFile.download_url}?access_token=${encodeURIComponent(this.accessToken)}`,
      );
      if (vttRes.ok) {
        transcriptText = parseVtt(await vttRes.text());
      }
    }

    if (!transcriptText) return null;

    return {
      meetingId: String(recordings.id),
      transcriptText,
      summary: summariseFromTranscript(transcriptText),
      actionItems: extractActionItems(transcriptText),
      participants: [],
      duration: recordings.duration * 60,
      recordingUrl: recordingFile?.download_url,
      provider: this.name,
    };
  }
}

// ─── Otter.ai provider ───────────────────────────────────────────────────────
// Otter does not document a fully public REST API, but the workspace export
// API (https://otter.ai/) accepts an API token in production deployments.

export interface OtterProviderConfig {
  readonly apiToken: string;
  readonly baseUrl?: string;
}

interface OtterTranscriptResponse {
  readonly id: string;
  readonly title?: string;
  readonly transcript?: string;
  readonly summary?: string;
  readonly action_items?: readonly string[];
  readonly speakers?: readonly { name: string; email?: string }[];
  readonly duration?: number;
  readonly recording_url?: string;
}

export class OtterTranscriptProvider implements TranscriptProvider {
  readonly name = "otter";
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(config: OtterProviderConfig) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl ?? "https://otter.ai/forward/api/v1";
  }

  supports(meeting: MeetingReference): boolean {
    // Otter ingests Zoom/Meet/Teams meetings — match on title/scheduledAt.
    return Boolean(meeting.meetingId ?? meeting.title);
  }

  async fetch(meeting: MeetingReference): Promise<TranscriptResult | null> {
    const query = encodeURIComponent(meeting.meetingId ?? meeting.title ?? "");
    const data = await jsonFetch<{ speeches?: OtterTranscriptResponse[] }>(
      `${this.baseUrl}/speeches?query=${query}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
      },
    );
    const speech = data?.speeches?.[0];
    if (!speech?.transcript) return null;

    const participants: TranscriptParticipant[] = (speech.speakers ?? []).map(
      (s) => ({ name: s.name, email: s.email }),
    );

    return {
      meetingId: speech.id,
      transcriptText: speech.transcript,
      summary: speech.summary ?? summariseFromTranscript(speech.transcript),
      actionItems: speech.action_items ?? extractActionItems(speech.transcript),
      participants,
      duration: speech.duration ?? 0,
      recordingUrl: speech.recording_url,
      provider: this.name,
    };
  }
}

// ─── Generic JSON-API provider (Fathom / Granola / Read.ai) ──────────────────
// These providers all expose roughly the same shape:
//   GET {baseUrl}/meetings?external_id=...
//   GET {baseUrl}/meetings/{id}/transcript
// We thinly wrap them with a configurable name + auth header.

interface GenericMeetingResult {
  readonly id: string;
  readonly title?: string;
  readonly transcript?: string;
  readonly transcript_text?: string;
  readonly summary?: string;
  readonly action_items?: readonly string[];
  readonly participants?: readonly { name: string; email?: string }[];
  readonly duration?: number;
  readonly recording_url?: string;
}

export interface GenericJsonProviderConfig {
  readonly name: string;
  readonly apiToken: string;
  readonly baseUrl: string;
  readonly authHeader?: string;
  readonly authScheme?: string;
}

export class GenericJsonTranscriptProvider implements TranscriptProvider {
  readonly name: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly authScheme: string;

  constructor(config: GenericJsonProviderConfig) {
    this.name = config.name;
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = config.authHeader ?? "authorization";
    this.authScheme = config.authScheme ?? "Bearer";
  }

  supports(meeting: MeetingReference): boolean {
    return Boolean(meeting.meetingId ?? meeting.meetingUrl ?? meeting.title);
  }

  async fetch(meeting: MeetingReference): Promise<TranscriptResult | null> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    headers[this.authHeader] = `${this.authScheme} ${this.apiToken}`.trim();

    const params = new URLSearchParams();
    if (meeting.meetingId) params.set("external_id", meeting.meetingId);
    if (meeting.meetingUrl) params.set("url", meeting.meetingUrl);
    if (meeting.title) params.set("title", meeting.title);

    const list = await jsonFetch<{ meetings?: GenericMeetingResult[] }>(
      `${this.baseUrl}/meetings?${params.toString()}`,
      { method: "GET", headers },
    );
    const found = list?.meetings?.[0];
    if (!found) return null;

    let transcriptText = found.transcript ?? found.transcript_text ?? "";
    if (!transcriptText) {
      const detail = await jsonFetch<GenericMeetingResult>(
        `${this.baseUrl}/meetings/${encodeURIComponent(found.id)}/transcript`,
        { method: "GET", headers },
      );
      transcriptText = detail?.transcript ?? detail?.transcript_text ?? "";
    }
    if (!transcriptText) return null;

    return {
      meetingId: found.id,
      transcriptText,
      summary: found.summary ?? summariseFromTranscript(transcriptText),
      actionItems: found.action_items ?? extractActionItems(transcriptText),
      participants: (found.participants ?? []).map((p) => ({
        name: p.name,
        email: p.email,
      })),
      duration: found.duration ?? 0,
      recordingUrl: found.recording_url,
      provider: this.name,
    };
  }
}

// ─── Convenience constructors ────────────────────────────────────────────────

export function createFathomProvider(apiToken: string): TranscriptProvider {
  return new GenericJsonTranscriptProvider({
    name: "fathom",
    apiToken,
    baseUrl: "https://api.fathom.video/external/v1",
  });
}

export function createGranolaProvider(apiToken: string): TranscriptProvider {
  return new GenericJsonTranscriptProvider({
    name: "granola",
    apiToken,
    baseUrl: "https://api.granola.ai/v1",
  });
}

export function createReadAiProvider(apiToken: string): TranscriptProvider {
  return new GenericJsonTranscriptProvider({
    name: "read.ai",
    apiToken,
    baseUrl: "https://api.read.ai/v1",
  });
}
