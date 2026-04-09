"use client";

import React, { forwardRef, useState, useCallback, useRef, useEffect, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RecordingState = "idle" | "recording" | "processing" | "preview" | "error";

export interface VoiceRecordingResult {
  /** The audio blob recorded from the microphone */
  audioBlob: Blob;
  /** Duration in seconds */
  duration: number;
  /** MIME type of the recording */
  mimeType: string;
  /** Transcribed text (filled after processing) */
  transcriptText?: string;
  /** Detected language */
  language?: string;
}

export interface VoiceRecorderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Called when a recording is completed and ready to send */
  onRecordingComplete?: (result: VoiceRecordingResult) => void;
  /** Called to upload and transcribe the recording. Returns transcript. */
  onTranscribe?: (audioBlob: Blob, mimeType: string) => Promise<{
    transcriptText: string;
    language: string;
    duration: number;
  }>;
  /** Called when the voice message is sent */
  onSend?: (result: VoiceRecordingResult) => void;
  /** Called when recording is cancelled */
  onCancel?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Maximum recording duration in seconds (default: 300 = 5 minutes) */
  maxDuration?: number;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional CSS class */
  className?: string;
}

// ─── Helper: format seconds to MM:SS ────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

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

function StopIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box as="rect" x="6" y="6" width="12" height="12" rx="2" />
    </Box>
  );
}

StopIcon.displayName = "StopIcon";

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

function SendIcon(): React.ReactElement {
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
      <Box as="line" x1="22" y1="2" x2="11" y2="13" />
      <Box as="polygon" points="22,2 15,22 11,13 2,9" />
    </Box>
  );
}

SendIcon.displayName = "SendIcon";

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

// ─── Waveform Visualization ─────────────────────────────────────────────────

function WaveformVisualizer({
  analyserRef,
  isRecording,
}: {
  analyserRef: React.RefObject<AnalyserNode | null>;
  isRecording: boolean;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser || !isRecording) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw(): void {
      if (!canvas || !ctx || !analyser) return;
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = "transparent";
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#8b5cf6";
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = (dataArray[i] ?? 128) / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [analyserRef, isRecording]);

  return (
    <Box
      as="canvas"
      ref={canvasRef}
      width={200}
      height={40}
      className="w-full h-10 rounded-md"
      role="img"
      aria-label="Audio waveform visualization"
    />
  );
}

WaveformVisualizer.displayName = "WaveformVisualizer";

// ─── Component ──────────────────────────────────────────────────────────────

export const VoiceRecorder = forwardRef<HTMLDivElement, VoiceRecorderProps>(
  function VoiceRecorder(
    {
      onRecordingComplete,
      onTranscribe,
      onSend,
      onCancel,
      onError,
      maxDuration = 300,
      size = "md",
      className = "",
      ...props
    },
    ref,
  ) {
    const [state, setState] = useState<RecordingState>("idle");
    const [duration, setDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<string>("");
    const [language, setLanguage] = useState<string>("");
    const [isPlaying, setIsPlaying] = useState(false);
    const [editingTranscript, setEditingTranscript] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>("");

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    // Determine supported MIME type
    const getSupportedMimeType = useCallback((): string => {
      const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      if (typeof MediaRecorder !== "undefined") {
        for (const type of types) {
          if (MediaRecorder.isTypeSupported(type)) {
            return type;
          }
        }
      }
      return "audio/webm";
    }, []);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            track.stop();
          }
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          void audioContextRef.current.close();
        }
      };
    }, [audioUrl]);

    // Start recording
    const startRecording = useCallback(async (): Promise<void> => {
      try {
        setErrorMessage("");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
          },
        });

        streamRef.current = stream;

        // Set up Web Audio API for waveform
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Set up MediaRecorder
        const mimeType = getSupportedMimeType();
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          setAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);

          // Stop all tracks
          for (const track of stream.getTracks()) {
            track.stop();
          }

          // Clean up audio context
          if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            void audioContextRef.current.close();
          }

          setState("preview");
          onRecordingComplete?.({
            audioBlob: blob,
            duration,
            mimeType,
          });

          // Auto-transcribe if handler provided
          if (onTranscribe) {
            setState("processing");
            onTranscribe(blob, mimeType)
              .then((result) => {
                setTranscript(result.transcriptText);
                setLanguage(result.language);
                setDuration(result.duration);
                setState("preview");
              })
              .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : "Transcription failed";
                setErrorMessage(message);
                setState("preview");
                onError?.(message);
              });
          }
        };

        // Start recording
        mediaRecorder.start(250); // Collect data every 250ms
        setState("recording");
        setDuration(0);

        // Duration timer
        const startTime = Date.now();
        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setDuration(elapsed);

          if (elapsed >= maxDuration) {
            stopRecording();
          }
        }, 200);
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Microphone access denied. Please allow microphone access in your browser settings."
            : err instanceof Error
              ? err.message
              : "Failed to start recording";
        setErrorMessage(message);
        setState("error");
        onError?.(message);
      }
    }, [getSupportedMimeType, maxDuration, onRecordingComplete, onTranscribe, onError, duration]);

    // Stop recording
    const stopRecording = useCallback((): void => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, []);

    // Cancel recording
    const cancelRecording = useCallback((): void => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript("");
      setLanguage("");
      setDuration(0);
      setErrorMessage("");
      setState("idle");
      onCancel?.();
    }, [audioUrl, onCancel]);

    // Toggle playback preview
    const togglePlayback = useCallback((): void => {
      if (!audioUrl) return;

      if (!audioElementRef.current) {
        audioElementRef.current = new Audio(audioUrl);
        audioElementRef.current.onended = () => setIsPlaying(false);
      }

      if (isPlaying) {
        audioElementRef.current.pause();
        setIsPlaying(false);
      } else {
        void audioElementRef.current.play();
        setIsPlaying(true);
      }
    }, [audioUrl, isPlaying]);

    // Send the voice message
    const handleSend = useCallback((): void => {
      if (!audioBlob) return;
      onSend?.({
        audioBlob,
        duration,
        mimeType: audioBlob.type,
        transcriptText: transcript,
        language,
      });

      // Reset state
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript("");
      setLanguage("");
      setDuration(0);
      setState("idle");
    }, [audioBlob, audioUrl, duration, transcript, language, onSend]);

    const isCompact = size === "sm";

    // ─── Idle State ───────────────────────────────────────────────────────

    if (state === "idle" || state === "error") {
      return (
        <Box
          ref={ref}
          className={`inline-flex flex-col items-center gap-2 ${className}`}
          role="region"
          aria-label="Voice recorder"
          {...props}
        >
          <Button
            variant="ghost"
            size={isCompact ? "sm" : "md"}
            onClick={() => void startRecording()}
            icon={<MicrophoneIcon />}
            aria-label="Start voice recording"
          >
            {isCompact ? "" : "Record voice message"}
          </Button>
          {state === "error" && errorMessage && (
            <Text variant="caption" className="text-status-error max-w-xs text-center">
              {errorMessage}
            </Text>
          )}
        </Box>
      );
    }

    // ─── Recording State ──────────────────────────────────────────────────

    if (state === "recording") {
      return (
        <Box
          ref={ref}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 ${className}`}
          role="region"
          aria-label="Recording in progress"
          aria-live="polite"
          {...props}
        >
          <Box className="flex items-center gap-2">
            <Box className="w-3 h-3 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
            <Text variant="body-sm" className="font-medium text-red-700 dark:text-red-300 tabular-nums">
              {formatTime(duration)}
            </Text>
          </Box>

          <Box className="flex-1 min-w-0">
            <WaveformVisualizer analyserRef={analyserRef} isRecording={true} />
          </Box>

          <Box className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelRecording}
              icon={<XIcon />}
              aria-label="Cancel recording"
            >
              {isCompact ? "" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={stopRecording}
              icon={<StopIcon />}
              aria-label="Stop recording"
            >
              {isCompact ? "" : "Stop"}
            </Button>
          </Box>
        </Box>
      );
    }

    // ─── Processing State ─────────────────────────────────────────────────

    if (state === "processing") {
      return (
        <Box
          ref={ref}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-surface-secondary ${className}`}
          role="region"
          aria-label="Processing voice recording"
          aria-live="polite"
          {...props}
        >
          <Box className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <Text variant="body-sm" muted>
            Transcribing voice message...
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelRecording}
            icon={<XIcon />}
            aria-label="Cancel"
          />
        </Box>
      );
    }

    // ─── Preview State ────────────────────────────────────────────────────

    return (
      <Box
        ref={ref}
        className={`flex flex-col gap-3 px-4 py-3 rounded-lg border border-border bg-surface-secondary ${className}`}
        role="region"
        aria-label="Voice message preview"
        {...props}
      >
        {/* Playback controls */}
        <Box className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayback}
            aria-label={isPlaying ? "Pause playback" : "Play recording"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </Button>

          <Box className="flex-1 min-w-0">
            <Box className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
              <Box
                className="h-full bg-brand-600 rounded-full transition-all"
                style={{ width: isPlaying ? "100%" : "0%" }}
              />
            </Box>
          </Box>

          <Text variant="caption" className="tabular-nums flex-shrink-0">
            {formatTime(duration)}
          </Text>
        </Box>

        {/* Transcript */}
        {transcript && (
          <Box className="flex flex-col gap-1">
            <Box className="flex items-center justify-between">
              <Text variant="caption" muted>
                Transcript{language ? ` (${language})` : ""}
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingTranscript(!editingTranscript)}
                aria-label={editingTranscript ? "Done editing transcript" : "Edit transcript"}
              >
                {editingTranscript ? "Done" : "Edit"}
              </Button>
            </Box>
            {editingTranscript ? (
              <Box
                as="textarea"
                className="w-full min-h-[60px] px-3 py-2 text-body-sm rounded-md border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                value={transcript}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTranscript(e.target.value)}
                aria-label="Edit transcript text"
              />
            ) : (
              <Text variant="body-sm" className="text-content-secondary line-clamp-3">
                {transcript}
              </Text>
            )}
          </Box>
        )}

        {/* Error if any */}
        {errorMessage && (
          <Text variant="caption" className="text-status-error">
            {errorMessage}
          </Text>
        )}

        {/* Action buttons */}
        <Box className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelRecording}
            icon={<XIcon />}
            aria-label="Discard recording"
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            icon={<SendIcon />}
            aria-label="Send voice message"
            disabled={!audioBlob}
          >
            Send
          </Button>
        </Box>
      </Box>
    );
  },
);

VoiceRecorder.displayName = "VoiceRecorder";
