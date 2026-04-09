"use client";

import React, { useState, useCallback, type HTMLAttributes } from "react";
import { Box, Text, Button, VoiceRecorder, VoiceMessagePlayer, type VoiceRecordingResult, type VoiceMessageData } from "@emailed/ui";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VoiceReplyComposerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** API base URL for voice message endpoints */
  apiBaseUrl?: string;
  /** Auth token for API calls */
  authToken?: string;
  /** Called when the voice message is ready to attach to compose */
  onAttach?: (attachment: VoiceAttachment) => void;
  /** Called when user cancels */
  onCancel?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Additional CSS class */
  className?: string;
}

export interface VoiceAttachment {
  /** Server-side voice message ID */
  messageId: string;
  /** Audio URL to embed */
  audioUrl: string;
  /** HTML embed for the email body */
  htmlEmbed: string;
  /** Plain-text transcript */
  transcriptText: string;
  /** Audio blob for attachment */
  audioBlob: Blob;
  /** Duration in seconds */
  duration: number;
  /** Detected language */
  language: string;
}

type ComposerState = "idle" | "recording" | "uploading" | "ready" | "error";

// ─── Icons ──────────────────────────────────────────────────────────────────

function MicrophoneIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Box as="path" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <Box as="path" d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <Box as="line" x1="12" y1="19" x2="12" y2="23" />
      <Box as="line" x1="8" y1="23" x2="16" y2="23" />
    </Box>
  );
}

MicrophoneIcon.displayName = "MicrophoneIcon";

function AttachIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Box as="path" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Box>
  );
}

AttachIcon.displayName = "AttachIcon";

function XIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Box as="line" x1="18" y1="6" x2="6" y2="18" />
      <Box as="line" x1="6" y1="6" x2="18" y2="18" />
    </Box>
  );
}

XIcon.displayName = "XIcon";

// ─── Component ──────────────────────────────────────────────────────────────

export function VoiceReplyComposer({
  apiBaseUrl = "/api",
  authToken,
  onAttach,
  onCancel,
  onError,
  className = "",
  ...props
}: VoiceReplyComposerProps): React.ReactElement {
  const [composerState, setComposerState] = useState<ComposerState>("idle");
  const [attachment, setAttachment] = useState<VoiceAttachment | null>(null);
  const [previewMessage, setPreviewMessage] = useState<VoiceMessageData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Upload and transcribe the recorded audio
  const handleTranscribe = useCallback(
    async (audioBlob: Blob, mimeType: string): Promise<{
      transcriptText: string;
      language: string;
      duration: number;
    }> => {
      const formData = new FormData();
      formData.append("audio", new File([audioBlob], "voice-message.webm", { type: mimeType }));

      const headers: Record<string, string> = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${apiBaseUrl}/v1/voice-messages/record`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(errorBody.error?.message ?? `Upload failed: ${response.status}`);
      }

      const result = (await response.json()) as {
        data: {
          id: string;
          audioUrl: string;
          transcriptText: string;
          language: string;
          duration: number;
          htmlEmbed: string;
        };
      };

      const { data } = result;

      // Store the attachment info
      const voiceAttachment: VoiceAttachment = {
        messageId: data.id,
        audioUrl: data.audioUrl,
        htmlEmbed: data.htmlEmbed,
        transcriptText: data.transcriptText,
        audioBlob,
        duration: data.duration,
        language: data.language,
      };

      setAttachment(voiceAttachment);
      setPreviewMessage({
        audioUrl: URL.createObjectURL(audioBlob),
        transcriptText: data.transcriptText,
        duration: data.duration,
        language: data.language,
      });
      setComposerState("ready");

      return {
        transcriptText: data.transcriptText,
        language: data.language,
        duration: data.duration,
      };
    },
    [apiBaseUrl, authToken],
  );

  // Handle send from the VoiceRecorder
  const handleSend = useCallback(
    (result: VoiceRecordingResult): void => {
      if (attachment) {
        onAttach?.(attachment);
        resetState();
      }
    },
    [attachment, onAttach],
  );

  // Attach the voice message to compose
  const handleAttach = useCallback((): void => {
    if (attachment) {
      onAttach?.(attachment);
      resetState();
    }
  }, [attachment, onAttach]);

  // Handle errors
  const handleError = useCallback(
    (error: string): void => {
      setErrorMessage(error);
      setComposerState("error");
      onError?.(error);
    },
    [onError],
  );

  // Reset to idle state
  const resetState = useCallback((): void => {
    setComposerState("idle");
    setAttachment(null);
    setPreviewMessage(null);
    setErrorMessage("");
  }, []);

  // Cancel
  const handleCancel = useCallback((): void => {
    resetState();
    onCancel?.();
  }, [resetState, onCancel]);

  // ─── Idle / Collapsed ───────────────────────────────────────────────────

  if (composerState === "idle") {
    return (
      <Box
        className={`inline-flex ${className}`}
        role="region"
        aria-label="Voice message composer"
        {...props}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setComposerState("recording")}
          icon={<MicrophoneIcon />}
          aria-label="Record a voice message"
        >
          Voice
        </Button>
      </Box>
    );
  }

  // ─── Recording / Processing ─────────────────────────────────────────────

  if (composerState === "recording" || composerState === "uploading") {
    return (
      <Box
        className={`flex flex-col gap-2 ${className}`}
        role="region"
        aria-label="Voice message recorder"
        {...props}
      >
        <VoiceRecorder
          onTranscribe={handleTranscribe}
          onSend={handleSend}
          onCancel={handleCancel}
          onError={handleError}
          maxDuration={300}
          size="sm"
        />
      </Box>
    );
  }

  // ─── Ready with Preview ─────────────────────────────────────────────────

  if (composerState === "ready" && previewMessage) {
    return (
      <Box
        className={`flex flex-col gap-3 ${className}`}
        role="region"
        aria-label="Voice message ready to attach"
        {...props}
      >
        <VoiceMessagePlayer message={previewMessage} size="sm" />

        {/* Transcript preview in compose area */}
        {attachment?.transcriptText && (
          <Box className="px-3 py-2 rounded-md bg-surface-tertiary border border-border">
            <Text variant="caption" muted className="mb-1">
              This transcript will be included in the email body:
            </Text>
            <Text variant="body-sm" className="text-content-secondary line-clamp-3">
              {attachment.transcriptText}
            </Text>
          </Box>
        )}

        <Box className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            icon={<XIcon />}
            aria-label="Discard voice message"
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAttach}
            icon={<AttachIcon />}
            aria-label="Attach voice message to email"
          >
            Attach to email
          </Button>
        </Box>
      </Box>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────

  return (
    <Box
      className={`flex flex-col gap-2 ${className}`}
      role="region"
      aria-label="Voice message error"
      {...props}
    >
      <Box className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
        <Text variant="body-sm" className="text-status-error flex-1">
          {errorMessage || "Something went wrong. Please try again."}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetState}
          aria-label="Try again"
        >
          Retry
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          icon={<XIcon />}
          aria-label="Cancel"
        />
      </Box>
    </Box>
  );
}

VoiceReplyComposer.displayName = "VoiceReplyComposer";
