"use client";

import React, { forwardRef, useState, useCallback, useRef, useEffect, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;

export interface VoiceMessageData {
  /** URL of the audio file */
  audioUrl: string;
  /** Transcribed text */
  transcriptText: string;
  /** Audio duration in seconds */
  duration: number;
  /** Detected language code */
  language?: string;
  /** Sender display name */
  senderName?: string;
  /** Timestamp of the message */
  sentAt?: string;
}

export interface VoiceMessagePlayerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Voice message data */
  message: VoiceMessageData;
  /** Called when download is requested */
  onDownload?: (audioUrl: string) => void;
  /** Called on playback error */
  onError?: (error: string) => void;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional CSS class */
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [0.5, 1, 1.5, 2];

function getNextSpeed(current: PlaybackSpeed): PlaybackSpeed {
  const index = PLAYBACK_SPEEDS.indexOf(current);
  const nextIndex = (index + 1) % PLAYBACK_SPEEDS.length;
  return PLAYBACK_SPEEDS[nextIndex] ?? 1;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function PlayIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box as="polygon" points="5,3 19,12 5,21" />
    </Box>
  );
}

PlayIcon.displayName = "PlayIcon";

function PauseIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box as="rect" x="6" y="4" width="4" height="16" rx="1" />
      <Box as="rect" x="14" y="4" width="4" height="16" rx="1" />
    </Box>
  );
}

PauseIcon.displayName = "PauseIcon";

function DownloadIcon(): React.ReactElement {
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
      <Box as="path" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Box as="polyline" points="7,10 12,15 17,10" />
      <Box as="line" x1="12" y1="15" x2="12" y2="3" />
    </Box>
  );
}

DownloadIcon.displayName = "DownloadIcon";

function MicrophoneIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5"
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

function ChevronDownIcon(): React.ReactElement {
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
      <Box as="polyline" points="6,9 12,15 18,9" />
    </Box>
  );
}

ChevronDownIcon.displayName = "ChevronDownIcon";

// ─── Static Waveform ────────────────────────────────────────────────────────

function StaticWaveform({
  progress,
  barCount,
}: {
  progress: number;
  barCount: number;
}): React.ReactElement {
  // Generate pseudo-random but deterministic bar heights
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    // Use a sine-based pattern for nice-looking waveform
    const base = Math.sin(i * 0.7) * 0.3 + 0.5;
    const variation = Math.sin(i * 1.3 + 2) * 0.2;
    bars.push(Math.max(0.15, Math.min(1, base + variation)));
  }

  return (
    <Box
      className="flex items-center gap-px h-8 flex-1"
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Audio playback progress"
    >
      {bars.map((height, i) => {
        const fillProgress = i / barCount;
        const isFilled = fillProgress <= progress;
        return (
          <Box
            key={i}
            className={`flex-1 rounded-full transition-colors duration-100 ${
              isFilled
                ? "bg-brand-600 dark:bg-brand-400"
                : "bg-surface-tertiary dark:bg-surface-tertiary"
            }`}
            style={{ height: `${Math.round(height * 100)}%` }}
          />
        );
      })}
    </Box>
  );
}

StaticWaveform.displayName = "StaticWaveform";

// ─── Component ──────────────────────────────────────────────────────────────

export const VoiceMessagePlayer = forwardRef<HTMLDivElement, VoiceMessagePlayerProps>(
  function VoiceMessagePlayer(
    {
      message,
      onDownload,
      onError,
      size = "md",
      className = "",
      ...props
    },
    ref,
  ) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    const [showTranscript, setShowTranscript] = useState(false);
    const [hasError, setHasError] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const animFrameRef = useRef<number>(0);

    // Initialize audio element
    useEffect(() => {
      const audio = new Audio(message.audioUrl);
      audio.preload = "metadata";
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audio.onerror = () => {
        setHasError(true);
        setIsPlaying(false);
        onError?.("Failed to load audio file");
      };

      return () => {
        cancelAnimationFrame(animFrameRef.current);
        audio.pause();
        audio.src = "";
      };
    }, [message.audioUrl, onError]);

    // Update current time during playback
    useEffect(() => {
      if (!isPlaying) {
        cancelAnimationFrame(animFrameRef.current);
        return;
      }

      function tick(): void {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
        animFrameRef.current = requestAnimationFrame(tick);
      }

      animFrameRef.current = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(animFrameRef.current);
      };
    }, [isPlaying]);

    // Toggle play/pause
    const togglePlayback = useCallback((): void => {
      const audio = audioRef.current;
      if (!audio || hasError) return;

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        void audio.play();
        setIsPlaying(true);
      }
    }, [isPlaying, hasError]);

    // Change playback speed
    const cycleSpeed = useCallback((): void => {
      const next = getNextSpeed(speed);
      setSpeed(next);
      if (audioRef.current) {
        audioRef.current.playbackRate = next;
      }
    }, [speed]);

    // Seek on waveform click
    const handleSeek = useCallback(
      (e: React.MouseEvent<HTMLDivElement>): void => {
        const audio = audioRef.current;
        if (!audio) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width));
        const newTime = progress * message.duration;
        audio.currentTime = newTime;
        setCurrentTime(newTime);
      },
      [message.duration],
    );

    // Handle keyboard seek
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent): void => {
        const audio = audioRef.current;
        if (!audio) return;

        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          togglePlayback();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          audio.currentTime = Math.max(0, audio.currentTime - 5);
          setCurrentTime(audio.currentTime);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          audio.currentTime = Math.min(message.duration, audio.currentTime + 5);
          setCurrentTime(audio.currentTime);
        }
      },
      [togglePlayback, message.duration],
    );

    // Download handler
    const handleDownload = useCallback((): void => {
      if (onDownload) {
        onDownload(message.audioUrl);
      } else {
        const a = document.createElement("a");
        a.href = message.audioUrl;
        a.download = `voice-message-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }, [message.audioUrl, onDownload]);

    const progress = message.duration > 0 ? currentTime / message.duration : 0;
    const isCompact = size === "sm";
    const barCount = isCompact ? 30 : 50;

    return (
      <Box
        ref={ref}
        className={`flex flex-col rounded-lg border border-border overflow-hidden ${className}`}
        role="region"
        aria-label={`Voice message${message.senderName ? ` from ${message.senderName}` : ""}, ${formatTime(message.duration)} long`}
        {...props}
      >
        {/* Header */}
        <Box className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-500">
          <Box className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Box className="text-white">
              <MicrophoneIcon />
            </Box>
          </Box>
          <Box className="flex-1 min-w-0">
            <Text variant="body-sm" className="text-white font-medium truncate">
              {message.senderName ? `${message.senderName} - Voice Message` : "Voice Message"}
            </Text>
            <Text variant="caption" className="text-white/80">
              {formatTime(message.duration)}
              {message.language ? ` \u00b7 ${message.language}` : ""}
            </Text>
          </Box>
          <Text
            as="span"
            variant="caption"
            className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0"
          >
            {formatTime(message.duration)}
          </Text>
        </Box>

        {/* Player controls */}
        <Box className="flex items-center gap-3 px-3 py-2.5 bg-surface-secondary">
          {/* Play/Pause button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayback}
            onKeyDown={handleKeyDown}
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={hasError}
            className="flex-shrink-0"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </Button>

          {/* Waveform / seek bar */}
          <Box
            className="flex-1 cursor-pointer"
            onClick={handleSeek}
            role="slider"
            tabIndex={0}
            aria-label="Seek audio position"
            aria-valuenow={Math.round(currentTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(message.duration)}
            onKeyDown={handleKeyDown}
          >
            <StaticWaveform progress={progress} barCount={barCount} />
          </Box>

          {/* Time display */}
          <Text variant="caption" className="tabular-nums flex-shrink-0 w-12 text-right">
            {isPlaying || currentTime > 0
              ? formatTime(currentTime)
              : formatTime(message.duration)}
          </Text>

          {/* Speed control */}
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleSpeed}
            aria-label={`Playback speed: ${speed}x. Click to change.`}
            className="min-w-[3rem] text-xs font-mono"
          >
            {speed}x
          </Button>

          {/* Download */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            icon={<DownloadIcon />}
            aria-label="Download voice message"
            className="flex-shrink-0"
          />
        </Box>

        {/* Error state */}
        {hasError && (
          <Box className="px-3 py-2 bg-red-50 dark:bg-red-950 border-t border-red-200 dark:border-red-800">
            <Text variant="caption" className="text-status-error">
              Failed to load audio. The file may be unavailable.
            </Text>
          </Box>
        )}

        {/* Transcript accordion */}
        {message.transcriptText && (
          <Box className="border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTranscript(!showTranscript)}
              className="w-full justify-between px-3 py-2 rounded-none"
              aria-expanded={showTranscript}
              aria-controls="voice-message-transcript"
            >
              <Text variant="caption" muted>
                Transcript
              </Text>
              <Box
                className={`transition-transform duration-200 ${showTranscript ? "rotate-180" : ""}`}
              >
                <ChevronDownIcon />
              </Box>
            </Button>
            {showTranscript && (
              <Box
                id="voice-message-transcript"
                className="px-3 py-2 border-t border-border"
                role="region"
                aria-label="Voice message transcript"
              >
                <Text
                  variant="body-sm"
                  className="text-content-secondary leading-relaxed whitespace-pre-wrap"
                  lang={message.language}
                >
                  {message.transcriptText}
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  },
);

VoiceMessagePlayer.displayName = "VoiceMessagePlayer";
