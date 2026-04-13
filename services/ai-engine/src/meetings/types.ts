// =============================================================================
// @alecrae/ai-engine — Meeting types (S9)
// =============================================================================
// Shared types for the email-thread → meeting-transcript linker.

export type MeetingPlatform = "zoom" | "meet" | "teams" | "webex";

export type DetectionSource =
  | "calendar_invite"
  | "inline_link"
  | "ai_inferred"
  | "ics_attachment";

export interface MeetingReference {
  /** Provider-specific meeting ID (e.g. Zoom meeting numeric ID). */
  readonly meetingId?: string | undefined;
  /** Full join URL if known. */
  readonly meetingUrl?: string | undefined;
  readonly scheduledAt?: Date | undefined;
  readonly platform?: MeetingPlatform | undefined;
  readonly detectedFrom: DetectionSource;
  /** [0..1] heuristic confidence the thread really maps to a real meeting. */
  readonly confidence: number;
  /** Free-form title pulled from a calendar invite or subject line. */
  readonly title?: string | undefined;
}

export interface TranscriptParticipant {
  readonly name: string;
  readonly email?: string | undefined;
  readonly speakerId?: string | undefined;
}

export interface TranscriptResult {
  readonly meetingId: string;
  readonly transcriptText: string;
  readonly summary: string;
  readonly actionItems: readonly string[];
  readonly participants: readonly TranscriptParticipant[];
  /** Duration in seconds */
  readonly duration: number;
  readonly recordingUrl?: string | undefined;
  readonly provider: string;
}

/**
 * A pluggable transcript provider. Implementations: Zoom REST, Otter.ai,
 * Fathom, Granola, Read.ai. Each receives the same MeetingReference and
 * returns null when it cannot service the meeting.
 */
export interface TranscriptProvider {
  readonly name: string;
  /** Whether this provider can plausibly service the given meeting. */
  supports(meeting: MeetingReference): boolean;
  /** Fetch the transcript. Returns null if not available. */
  fetch(meeting: MeetingReference): Promise<TranscriptResult | null>;
}

/** Minimal email shape used by the linker. */
export interface LinkerEmail {
  readonly id?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: readonly string[] | undefined;
  readonly subject?: string | undefined;
  readonly textBody?: string | undefined;
  readonly htmlBody?: string | undefined;
  readonly receivedAt?: Date | undefined;
  readonly attachments?: readonly LinkerEmailAttachment[] | undefined;
}

export interface LinkerEmailAttachment {
  readonly filename?: string | undefined;
  readonly contentType?: string | undefined;
  /** UTF-8 string contents of the attachment if already decoded. */
  readonly content?: string | undefined;
}
