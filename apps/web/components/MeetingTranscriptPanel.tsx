"use client";

/**
 * MeetingTranscriptPanel — Thread-level panel for S9 (Email Thread → Meeting
 * Transcript Link).
 *
 * Appears in thread view when meetings are detected. Auto-detects on thread
 * load, shows meeting cards with transcripts and AI summaries.
 *
 * Usage:
 *   <MeetingTranscriptPanel threadId="msg-123" />
 */

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  MeetingLinkCard,
  type MeetingLinkData,
} from "@alecrae/ui";
import {
  meetingsApi,
  type MeetingLinkData as ApiMeetingLinkData,
} from "../lib/api";

// ─── Props ─────────────────────────────────────────────────────────────────

export interface MeetingTranscriptPanelProps {
  /** Thread identifier (email ID, Message-ID, or inReplyTo value). */
  threadId: string;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── State types ───────────────────────────────────────────────────────────

interface PanelState {
  loading: boolean;
  meetings: MeetingLinkData[];
  error: string | null;
  actionInProgress: Record<string, "linking" | "transcribing" | "summarizing">;
}

const INITIAL_STATE: PanelState = {
  loading: false,
  meetings: [],
  error: null,
  actionInProgress: {},
};

// ─── Mapper ────────────────────────────────────────────────────────────────

function mapApiMeeting(m: ApiMeetingLinkData): MeetingLinkData {
  return {
    id: m.id,
    threadId: m.threadId,
    provider: m.provider,
    meetingUrl: m.meetingUrl,
    scheduledAt: m.scheduledAt,
    recordingUrl: m.recordingUrl,
    transcriptUrl: m.transcriptUrl,
    transcriptPreview: m.transcriptPreview,
    aiSummary: m.aiSummary,
    title: m.title,
    confidence: m.confidence,
    status: m.status,
    participants: m.participants,
    duration: m.duration,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function MeetingTranscriptPanel({
  threadId,
  className = "",
}: MeetingTranscriptPanelProps): React.ReactElement | null {
  const [state, setState] = useState<PanelState>(INITIAL_STATE);

  // Fetch meetings for this thread on mount
  const fetchMeetings = useCallback(async (): Promise<void> => {
    if (!threadId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await meetingsApi.getByThread(threadId);
      const meetings = (res.data.meetings ?? []).map(mapApiMeeting);
      setState({
        loading: false,
        meetings,
        error: null,
        actionInProgress: {},
      });
    } catch (err) {
      setState({
        loading: false,
        meetings: [],
        error: err instanceof Error ? err.message : "Failed to load meetings",
        actionInProgress: {},
      });
    }
  }, [threadId]);

  useEffect(() => {
    void fetchMeetings();
  }, [fetchMeetings]);

  // Action: link recording
  const handleLinkRecording = useCallback(
    async (meetingId: string, recordingUrl: string): Promise<void> => {
      setState((prev) => ({
        ...prev,
        actionInProgress: { ...prev.actionInProgress, [meetingId]: "linking" },
      }));

      try {
        const res = await meetingsApi.linkRecording(meetingId, { recordingUrl });
        setState((prev) => {
          const updated = prev.meetings.map((m) =>
            m.id === meetingId
              ? {
                  ...m,
                  recordingUrl: res.data.recordingUrl,
                  transcriptUrl: res.data.transcriptUrl,
                  status: res.data.status,
                }
              : m,
          );
          const { [meetingId]: _removed, ...rest } = prev.actionInProgress;
          return { ...prev, meetings: updated, actionInProgress: rest };
        });
      } catch (err) {
        setState((prev) => {
          const { [meetingId]: _removed, ...rest } = prev.actionInProgress;
          return { ...prev, actionInProgress: rest };
        });
        throw err;
      }
    },
    [],
  );

  // Action: transcribe
  const handleTranscribe = useCallback(
    async (meetingId: string): Promise<void> => {
      setState((prev) => ({
        ...prev,
        actionInProgress: {
          ...prev.actionInProgress,
          [meetingId]: "transcribing",
        },
      }));

      try {
        const res = await meetingsApi.transcribe(meetingId);
        setState((prev) => {
          const updated = prev.meetings.map((m) =>
            m.id === meetingId
              ? {
                  ...m,
                  transcriptPreview: res.data.transcriptPreview,
                  status: res.data.status,
                }
              : m,
          );
          const { [meetingId]: _removed, ...rest } = prev.actionInProgress;
          return { ...prev, meetings: updated, actionInProgress: rest };
        });
      } catch (err) {
        setState((prev) => {
          const { [meetingId]: _removed, ...rest } = prev.actionInProgress;
          return { ...prev, actionInProgress: rest };
        });
        throw err;
      }
    },
    [],
  );

  // Action: request summary
  const handleRequestSummary = useCallback(
    async (meetingId: string): Promise<void> => {
      setState((prev) => ({
        ...prev,
        actionInProgress: {
          ...prev.actionInProgress,
          [meetingId]: "summarizing",
        },
      }));

      try {
        const res = await meetingsApi.getSummary(meetingId);
        setState((prev) => {
          const updated = prev.meetings.map((m) =>
            m.id === meetingId
              ? {
                  ...m,
                  aiSummary: res.data.summary,
                  status: res.data.status,
                }
              : m,
          );
          const { [meetingId]: _removed, ...rest } = prev.actionInProgress;
          return { ...prev, meetings: updated, actionInProgress: rest };
        });
      } catch (err) {
        setState((prev) => {
          const { [meetingId]: _removed, ...rest } = prev.actionInProgress;
          return { ...prev, actionInProgress: rest };
        });
        throw err;
      }
    },
    [],
  );

  // Don't render if loading or no meetings found
  if (state.loading) return null;
  if (state.error) return null; // Silently hide on error (AI fallback rule)
  if (state.meetings.length === 0) return null;

  return (
    <section
      className={`space-y-3 ${className}`}
      aria-label="Meeting transcripts linked to this thread"
    >
      {state.meetings.map((meeting) => (
        <MeetingLinkCard
          key={meeting.id}
          meeting={meeting}
          onLinkRecording={handleLinkRecording}
          onTranscribe={handleTranscribe}
          onRequestSummary={handleRequestSummary}
          linkingInProgress={
            state.actionInProgress[meeting.id] === "linking"
          }
          transcribingInProgress={
            state.actionInProgress[meeting.id] === "transcribing"
          }
          summarizingInProgress={
            state.actionInProgress[meeting.id] === "summarizing"
          }
        />
      ))}
    </section>
  );
}
