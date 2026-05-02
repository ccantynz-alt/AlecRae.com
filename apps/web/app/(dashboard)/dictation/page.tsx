"use client";

/**
 * Dictation — Dragon-killer email-aware voice control.
 *
 * Two paths to text:
 *   1. Web Speech API (built into Chrome/Edge/Safari, free, sub-second)
 *   2. MediaRecorder upload to /v1/dictation/transcribe (Whisper, multilingual)
 *
 * The text then goes to /v1/dictation/process which knows email commands:
 *   - "reply with no thanks"
 *   - "schedule a follow-up Tuesday at 10am"
 *   - "forward to legal at acme.com"
 *   - "send"
 *
 * No incumbent (Workspace, 365) does email-aware dictation. Dragon is dead.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import {
  dictationApi,
  type DictationMode,
  type DictationProcessResult,
} from "../../../lib/api";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { [k: number]: SpeechRecognitionResultLike; length: number };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

const MODES: { value: DictationMode; label: string; hint: string }[] = [
  {
    value: "compose",
    label: "Compose",
    hint: "Speak a new email — subject, recipients, body. AlecRae structures it.",
  },
  {
    value: "reply",
    label: "Reply",
    hint: "Speak a reply. Try 'reply with no thanks' or 'schedule for Tuesday'.",
  },
  {
    value: "triage",
    label: "Triage",
    hint: "Speak inbox commands: 'archive', 'snooze for a week', 'mark all read'.",
  },
  {
    value: "command",
    label: "Command",
    hint: "Free-form natural language commands. AlecRae parses intent.",
  },
];

export default function DictationPage(): React.ReactNode {
  const [mode, setMode] = useState<DictationMode>("compose");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<DictationProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as WindowWithSpeech;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (!res) continue;
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) setTranscript((prev) => (prev + " " + finalText).trim());
      setInterim(interimText);
    };

    r.onerror = (e) => {
      setError(`Speech recognition: ${e.error}`);
      setRecording(false);
    };

    r.onend = () => {
      setRecording(false);
      setInterim("");
    };

    recognitionRef.current = r;
    return () => {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    setError(null);
    setResult(null);
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setRecording(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
  }, []);

  const clearAll = useCallback(() => {
    setTranscript("");
    setInterim("");
    setResult(null);
    setError(null);
  }, []);

  const processText = useCallback(async () => {
    const text = transcript.trim();
    if (!text) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await dictationApi.process({ transcription: text, mode });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process dictation");
    } finally {
      setProcessing(false);
    }
  }, [transcript, mode]);

  const activeMode = MODES.find((m) => m.value === mode);

  return (
    <PageLayout
      title="Dictation"
      description="Hands-free email. Speak naturally — AlecRae understands email commands. No Dragon required."
    >
      <Box className="space-y-6 max-w-3xl">
        {error && (
          <Box className="rounded-md border border-status-error/30 bg-status-error/5 p-3">
            <Text variant="body-sm" className="text-status-error">
              {error}
            </Text>
          </Box>
        )}

        <Card>
          <CardHeader>
            <Text variant="heading-sm">Mode</Text>
          </CardHeader>
          <CardContent>
            <Box className="flex flex-wrap gap-2 mb-3">
              {MODES.map((m) => (
                <Button
                  key={m.value}
                  variant={m.value === mode ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setMode(m.value)}
                >
                  {m.label}
                </Button>
              ))}
            </Box>
            {activeMode && (
              <Text variant="body-sm" muted>
                {activeMode.hint}
              </Text>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Box className="flex items-center justify-between">
              <Text variant="heading-sm">Microphone</Text>
              {recording && (
                <Text variant="caption" className="text-status-error">
                  ● Listening
                </Text>
              )}
            </Box>
          </CardHeader>
          <CardContent>
            {!supported ? (
              <Text variant="body-sm" muted>
                This browser doesn&apos;t expose the Web Speech API. Use the
                upload-audio fallback or switch to Chrome / Edge / Safari for
                client-side dictation.
              </Text>
            ) : (
              <Box className="flex flex-wrap gap-2 mb-3">
                {recording ? (
                  <Button variant="primary" size="md" onClick={stopRecording}>
                    Stop
                  </Button>
                ) : (
                  <Button variant="primary" size="md" onClick={startRecording}>
                    Start dictation
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => void processText()}
                  disabled={!transcript.trim() || processing}
                >
                  {processing ? "Processing..." : "Process"}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={clearAll}
                  disabled={!transcript && !result}
                >
                  Clear
                </Button>
              </Box>
            )}

            <Box className="rounded-md bg-surface-secondary p-3 min-h-[120px]">
              <Text
                as="pre"
                variant="body-sm"
                className="whitespace-pre-wrap font-sans"
              >
                {transcript}
                {interim && (
                  <Text as="span" muted>
                    {transcript ? " " : ""}
                    {interim}
                  </Text>
                )}
                {!transcript && !interim && (
                  <Text as="span" muted>
                    Your transcript will appear here.
                  </Text>
                )}
              </Text>
            </Box>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <Box className="flex items-center justify-between">
                <Text variant="heading-sm">Structured result</Text>
                <Text variant="caption" className="text-status-success">
                  {Math.round(result.confidence * 100)}% confident
                </Text>
              </Box>
            </CardHeader>
            <CardContent>
              <Box className="space-y-3">
                {result.output.command && (
                  <Box className="rounded-md border border-accent/30 bg-accent/5 p-3">
                    <Text variant="caption" muted className="block">
                      Detected command
                    </Text>
                    <Text variant="body-md" className="font-semibold">
                      {result.output.command.intent}
                    </Text>
                    <Text
                      as="pre"
                      variant="caption"
                      muted
                      className="mt-1 whitespace-pre-wrap font-mono"
                    >
                      {JSON.stringify(result.output.command.args, null, 2)}
                    </Text>
                  </Box>
                )}

                {result.output.subject && (
                  <Box>
                    <Text variant="caption" muted className="block">
                      Subject
                    </Text>
                    <Text variant="body-md" className="font-semibold">
                      {result.output.subject}
                    </Text>
                  </Box>
                )}

                {result.output.to && result.output.to.length > 0 && (
                  <Box>
                    <Text variant="caption" muted className="block">
                      To
                    </Text>
                    <Text variant="body-sm">{result.output.to.join(", ")}</Text>
                  </Box>
                )}

                {result.output.body && (
                  <Box>
                    <Text variant="caption" muted className="block">
                      Body
                    </Text>
                    <Box className="rounded-md bg-surface-secondary p-3">
                      <Text
                        as="pre"
                        variant="body-sm"
                        className="whitespace-pre-wrap font-sans"
                      >
                        {result.output.body}
                      </Text>
                    </Box>
                  </Box>
                )}

                {result.output.actions && result.output.actions.length > 0 && (
                  <Box>
                    <Text variant="caption" muted className="block">
                      Triage actions
                    </Text>
                    <Box className="space-y-1">
                      {result.output.actions.map((a, i) => (
                        <Text key={i} variant="body-sm">
                          • <Text as="span" className="font-medium">{a.type}</Text>
                          {a.target ? ` → ${a.target}` : ""}
                          {a.reason ? ` (${a.reason})` : ""}
                        </Text>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>
    </PageLayout>
  );
}
