"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Card, CardContent } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MeetingProvider = "zoom" | "meet" | "teams" | "webex" | "generic";
export type MeetingLinkStatus = "detected" | "linked" | "transcribed" | "summarized";

export interface MeetingLinkData {
  readonly id: string;
  readonly threadId: string;
  readonly provider: MeetingProvider;
  readonly meetingUrl: string | null;
  readonly scheduledAt: string | null;
  readonly recordingUrl: string | null;
  readonly transcriptUrl: string | null;
  readonly transcriptPreview: string | null;
  readonly aiSummary: string | null;
  readonly title: string | null;
  readonly confidence: number | null;
  readonly status: MeetingLinkStatus;
  readonly participants: string | null;
  readonly duration: string | null;
}

export interface MeetingLinkCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** The meeting data. */
  meeting: MeetingLinkData;
  /** Called when user submits a recording URL. */
  onLinkRecording?: (meetingId: string, recordingUrl: string) => Promise<void>;
  /** Called when user triggers transcription. */
  onTranscribe?: (meetingId: string) => Promise<void>;
  /** Called when user requests AI summary. */
  onRequestSummary?: (meetingId: string) => Promise<void>;
  /** Called on error. */
  onError?: (error: string) => void;
  /** Whether a link-recording action is in progress. */
  linkingInProgress?: boolean;
  /** Whether a transcription action is in progress. */
  transcribingInProgress?: boolean;
  /** Whether a summary generation is in progress. */
  summarizingInProgress?: boolean;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── Provider icons + labels ────────────────────────────────────────────────

const PROVIDER_META: Record<
  MeetingProvider,
  { label: string; color: string; bgColor: string }
> = {
  zoom: {
    label: "Zoom",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
  },
  meet: {
    label: "Google Meet",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950",
  },
  teams: {
    label: "Microsoft Teams",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950",
  },
  webex: {
    label: "Webex",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950",
  },
  generic: {
    label: "Meeting",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-950",
  },
};

function ProviderIcon({ provider }: { provider: MeetingProvider }): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      {provider === "zoom" && (
        <Box
          as="path"
          d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-2l4 3V5l-4 3V6a2 2 0 00-2-2H4z"
        />
      )}
      {provider === "meet" && (
        <Box
          as="path"
          fillRule="evenodd"
          d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-2l4 3V5l-4 3V6a2 2 0 00-2-2H4zm6 6a2 2 0 11-4 0 2 2 0 014 0z"
          clipRule="evenodd"
        />
      )}
      {provider === "teams" && (
        <Box
          as="path"
          d="M13 7a3 3 0 11-6 0 3 3 0 016 0zm-3 4c-3.866 0-7 1.79-7 4v1h14v-1c0-2.21-3.134-4-7-4zm8-2a2 2 0 11-4 0 2 2 0 014 0zm-2 4c1.306 0 2.418.835 3 2v1h-3v-3z"
        />
      )}
      {(provider === "webex" || provider === "generic") && (
        <Box
          as="path"
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
          clipRule="evenodd"
        />
      )}
    </Box>
  );
}

ProviderIcon.displayName = "ProviderIcon";

// ─── Status badge ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<MeetingLinkStatus, { label: string; dot: string; text: string }> = {
  detected: {
    label: "Detected",
    dot: "bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  linked: {
    label: "Linked",
    dot: "bg-blue-400",
    text: "text-blue-600 dark:text-blue-400",
  },
  transcribed: {
    label: "Transcribed",
    dot: "bg-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  summarized: {
    label: "Summarized",
    dot: "bg-violet-400",
    text: "text-violet-600 dark:text-violet-400",
  },
};

function StatusBadge({ status }: { status: MeetingLinkStatus }): React.ReactElement {
  const style = STATUS_STYLES[status];
  return (
    <Box className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
      <Box className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      <Text as="span" variant="caption" className={`text-[10px] font-medium ${style.text}`}>
        {style.label}
      </Text>
    </Box>
  );
}

StatusBadge.displayName = "StatusBadge";

// ─── Component ──────────────────────────────────────────────────────────────

export const MeetingLinkCard = forwardRef<HTMLDivElement, MeetingLinkCardProps>(
  function MeetingLinkCard(
    {
      meeting,
      onLinkRecording,
      onTranscribe,
      onRequestSummary,
      onError,
      linkingInProgress = false,
      transcribingInProgress = false,
      summarizingInProgress = false,
      className = "",
      ...props
    },
    ref,
  ) {
    const [transcriptExpanded, setTranscriptExpanded] = useState(false);
    const [recordingUrlInput, setRecordingUrlInput] = useState("");
    const [showRecordingInput, setShowRecordingInput] = useState(false);

    const providerMeta = PROVIDER_META[meeting.provider];

    const handleLinkRecording = useCallback(async (): Promise<void> => {
      if (!onLinkRecording || !recordingUrlInput.trim()) return;
      try {
        await onLinkRecording(meeting.id, recordingUrlInput.trim());
        setShowRecordingInput(false);
        setRecordingUrlInput("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to link recording";
        onError?.(message);
      }
    }, [onLinkRecording, recordingUrlInput, meeting.id, onError]);

    const handleTranscribe = useCallback(async (): Promise<void> => {
      if (!onTranscribe) return;
      try {
        await onTranscribe(meeting.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transcription failed";
        onError?.(message);
      }
    }, [onTranscribe, meeting.id, onError]);

    const handleRequestSummary = useCallback(async (): Promise<void> => {
      if (!onRequestSummary) return;
      try {
        await onRequestSummary(meeting.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Summary generation failed";
        onError?.(message);
      }
    }, [onRequestSummary, meeting.id, onError]);

    const formattedDate = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

    return (
      <Card
        ref={ref}
        className={`border border-slate-200 dark:border-slate-700 ${className}`}
        {...props}
      >
        <CardContent className="p-4 space-y-3">
          {/* Header: provider icon + title + status badge */}
          <Box className="flex items-start justify-between gap-2">
            <Box className="flex items-center gap-2 min-w-0">
              <Box
                className={`flex items-center justify-center w-8 h-8 rounded-lg ${providerMeta.bgColor} ${providerMeta.color}`}
              >
                <ProviderIcon provider={meeting.provider} />
              </Box>
              <Box className="min-w-0">
                <Text
                  as="p"
                  variant="body-sm"
                  className="font-medium text-slate-900 dark:text-slate-100 truncate"
                >
                  {meeting.title ?? `${providerMeta.label} Meeting`}
                </Text>
                {formattedDate && (
                  <Text as="p" variant="caption" className="text-slate-500 dark:text-slate-400">
                    {formattedDate}
                  </Text>
                )}
              </Box>
            </Box>
            <StatusBadge status={meeting.status} />
          </Box>

          {/* Meeting URL */}
          {meeting.meetingUrl && (
            <Box className="flex items-center gap-1.5">
              <Box
                as="svg"
                className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <Box
                  as="path"
                  d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                />
              </Box>
              <Text
                as="a"
                variant="caption"
                className="text-brand-600 dark:text-brand-400 hover:underline truncate"
                href={meeting.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {meeting.meetingUrl}
              </Text>
            </Box>
          )}

          {/* Recording link */}
          {meeting.recordingUrl && (
            <Box className="flex items-center gap-1.5">
              <Box
                as="svg"
                className="w-3.5 h-3.5 text-red-400 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <Box
                  as="path"
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </Box>
              <Text
                as="a"
                variant="caption"
                className="text-red-600 dark:text-red-400 hover:underline truncate"
                href={meeting.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Recording
              </Text>
            </Box>
          )}

          {/* Transcript preview (collapsible) */}
          {meeting.transcriptPreview && (
            <Box className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTranscriptExpanded((prev) => !prev)}
                className="h-6 px-1.5 text-[11px]"
                aria-expanded={transcriptExpanded}
                aria-label={transcriptExpanded ? "Collapse transcript" : "Expand transcript"}
              >
                <Box
                  as="svg"
                  className={`w-3 h-3 mr-1 transition-transform duration-200 ${transcriptExpanded ? "rotate-90" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <Box as="path" fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </Box>
                Transcript
              </Button>
              {transcriptExpanded && (
                <Box className="pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                  <Text
                    as="p"
                    variant="caption"
                    className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed"
                  >
                    {meeting.transcriptPreview}
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {/* AI summary */}
          {meeting.aiSummary && (
            <Box className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
              <Box className="flex items-center gap-1.5 mb-1.5">
                <Box
                  as="svg"
                  className="w-3.5 h-3.5 text-violet-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <Box
                    as="path"
                    fillRule="evenodd"
                    d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                    clipRule="evenodd"
                  />
                </Box>
                <Text
                  as="span"
                  variant="caption"
                  className="font-semibold text-violet-700 dark:text-violet-300"
                >
                  AI Summary
                </Text>
              </Box>
              <Text
                as="p"
                variant="body-sm"
                className="text-violet-800 dark:text-violet-200 whitespace-pre-wrap leading-relaxed"
              >
                {meeting.aiSummary}
              </Text>
            </Box>
          )}

          {/* Action buttons */}
          <Box className="flex flex-wrap items-center gap-2 pt-1">
            {/* Link Recording button */}
            {!meeting.recordingUrl && onLinkRecording && (
              <>
                {showRecordingInput ? (
                  <Box className="flex items-center gap-1.5 w-full">
                    <Box
                      as="input"
                      type="url"
                      placeholder="Paste recording URL..."
                      value={recordingUrlInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setRecordingUrlInput(e.target.value)
                      }
                      className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      aria-label="Recording URL"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleLinkRecording}
                      loading={linkingInProgress}
                      disabled={!recordingUrlInput.trim()}
                      className="h-7 text-[11px]"
                    >
                      Link
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowRecordingInput(false);
                        setRecordingUrlInput("");
                      }}
                      className="h-7 text-[11px]"
                    >
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRecordingInput(true)}
                    className="h-7 text-[11px]"
                    aria-label="Link a recording to this meeting"
                  >
                    Link Recording
                  </Button>
                )}
              </>
            )}

            {/* Transcribe button */}
            {meeting.recordingUrl &&
              !meeting.transcriptPreview &&
              onTranscribe && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTranscribe}
                  loading={transcribingInProgress}
                  className="h-7 text-[11px]"
                  aria-label="Transcribe this meeting recording"
                >
                  Transcribe
                </Button>
              )}

            {/* Generate Summary button */}
            {meeting.transcriptPreview &&
              !meeting.aiSummary &&
              onRequestSummary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRequestSummary}
                  loading={summarizingInProgress}
                  className="h-7 text-[11px]"
                  aria-label="Generate AI summary of this transcript"
                >
                  Generate Summary
                </Button>
              )}

            {/* Confidence score */}
            {meeting.confidence !== null && meeting.confidence > 0 && (
              <Text
                as="span"
                variant="caption"
                className="ml-auto text-[10px] text-slate-400 dark:text-slate-500"
              >
                {Math.round(meeting.confidence * 100)}% confidence
              </Text>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  },
);

MeetingLinkCard.displayName = "MeetingLinkCard";
