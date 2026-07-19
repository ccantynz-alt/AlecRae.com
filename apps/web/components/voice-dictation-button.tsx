"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@alecrae/ui";
import { getApiBase } from "../lib/api-base";
import { getAccessToken } from "../lib/auth-token";

/**
 * Voice-to-email dictation button — records from the mic, transcribes via
 * Whisper (POST /v1/dictation/transcribe), then structures the result into
 * an email via Claude (POST /v1/dictation/process). Both endpoints were
 * real and working but had zero UI consumer anywhere in apps/web — this is
 * that missing UI.
 */

export interface DictationResult {
  body: string;
  subject?: string;
  to?: string[];
  cc?: string[];
}

interface VoiceDictationButtonProps {
  mode: "compose" | "reply";
  replyContext?: { from: string; subject: string; body: string };
  onResult: (result: DictationResult) => void;
  onError?: (message: string) => void;
}

type DictationState = "idle" | "recording" | "transcribing" | "processing";

interface ApiErrorBody {
  error?: { message?: string };
}

interface TranscribeResponse {
  data: { text: string };
}

interface ProcessResponse {
  data: {
    intent: {
      type: string;
      email?: { to?: string[]; cc?: string[]; subject?: string; body: string };
    };
  };
}

export function VoiceDictationButton({
  mode,
  replyContext,
  onResult,
  onError,
}: VoiceDictationButtonProps): React.ReactNode {
  const [state, setState] = useState<DictationState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleStop = useCallback(async () => {
    setState("transcribing");
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    cleanupStream();

    if (blob.size === 0) {
      setState("idle");
      onError?.("No audio recorded.");
      return;
    }

    try {
      const token = getAccessToken();
      const apiBase = getApiBase();

      const form = new FormData();
      form.append("audio", blob, "dictation.webm");
      const transcribeRes = await fetch(`${apiBase}/v1/dictation/transcribe`, {
        method: "POST",
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        body: form,
      });
      if (!transcribeRes.ok) {
        const errBody = (await transcribeRes.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(errBody?.error?.message ?? "Transcription failed");
      }
      const { data: transcribeData } = (await transcribeRes.json()) as TranscribeResponse;
      if (!transcribeData.text.trim()) {
        throw new Error("No speech detected — try again closer to the microphone.");
      }

      setState("processing");
      const processRes = await fetch(`${apiBase}/v1/dictation/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          transcription: transcribeData.text,
          mode,
          ...(replyContext ? { replyContext } : {}),
        }),
      });
      if (!processRes.ok) {
        const errBody = (await processRes.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(errBody?.error?.message ?? "Couldn't structure the dictation into an email");
      }
      const { data: processData } = (await processRes.json()) as ProcessResponse;
      const email = processData.intent.email;

      if (email) {
        onResult({
          body: email.body,
          ...(email.subject !== undefined ? { subject: email.subject } : {}),
          ...(email.to !== undefined ? { to: email.to } : {}),
          ...(email.cc !== undefined ? { cc: email.cc } : {}),
        });
      } else {
        // Structuring didn't return an email shape (e.g. a command/triage
        // intent was detected instead) — fall back to the raw transcript
        // rather than silently dropping what the user said.
        onResult({ body: transcribeData.text });
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Dictation failed");
    } finally {
      setState("idle");
    }
  }, [mode, replyContext, onResult, onError, cleanupStream]);

  const startRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Voice dictation isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void handleStop();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      onError?.("Microphone access was denied or unavailable.");
    }
  }, [handleStop, onError]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const busy = state === "transcribing" || state === "processing";
  const label =
    state === "recording"
      ? "Stop dictating"
      : state === "transcribing"
        ? "Transcribing…"
        : state === "processing"
          ? "Writing email…"
          : "Dictate";

  return (
    <Button
      type="button"
      variant={state === "recording" ? "primary" : "ghost"}
      size="sm"
      disabled={busy}
      onClick={() => (state === "recording" ? stopRecording() : void startRecording())}
      aria-label={state === "recording" ? "Stop voice dictation" : "Start voice dictation"}
    >
      {state === "recording" && (
        <span
          className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1.5 animate-pulse"
          aria-hidden="true"
        />
      )}
      {label}
    </Button>
  );
}
