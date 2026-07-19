"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Text,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import { VoiceCloneManager } from "../../../components/VoiceCloneManager";
import {
  VoiceReplyComposer,
  type VoiceAttachment,
} from "../../../components/VoiceReplyComposer";
import { getApiBase } from "../../../lib/api-base";
import { getAccessToken } from "../../../lib/auth-token";
import { PlanGate } from "../../../components/plan-gate";

export default function VoicePage(): React.ReactNode {
  const [authToken, setAuthToken] = useState<string>("");
  const [attachment, setAttachment] = useState<VoiceAttachment | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    setAuthToken(getAccessToken());
  }, []);

  return (
    <PageLayout
      title="Voice"
      description="Voice profiles that write like you, and voice messages with auto-transcription."
    >
      <Box className="space-y-8">
        <Box>
          <Text variant="heading-sm" className="mb-1">
            Voice clone profiles
          </Text>
          <Text variant="body-sm" muted className="mb-4">
            Train AI on your sent email so drafts sound exactly like you —
            rhythm, vocabulary, punctuation, and all.
          </Text>
          <PlanGate feature="voice_clone" required="pro">
            <VoiceCloneManager />
          </PlanGate>
        </Box>

        <Card>
          <CardHeader>
            <Text variant="heading-sm">Record a voice message</Text>
            <Text variant="body-sm" muted>
              Record a reply, get an automatic transcript, and attach it to any
              email from compose.
            </Text>
          </CardHeader>
          <CardContent>
            {voiceError && (
              <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
                <Text variant="body-sm" className="text-red-800">
                  {voiceError}
                </Text>
              </Box>
            )}
            <VoiceReplyComposer
              apiBaseUrl={getApiBase()}
              authToken={authToken}
              onAttach={(att) => {
                setAttachment(att);
                setVoiceError(null);
              }}
              onCancel={() => setAttachment(null)}
              onError={(msg) => setVoiceError(msg)}
            />

            {attachment && (
              <Box className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-4" role="status">
                <Text variant="body-sm" className="font-medium text-accent">
                  Voice message ready ({Math.round(attachment.duration)}s,{" "}
                  {attachment.language})
                </Text>
                <Text variant="body-sm" muted className="mt-1 whitespace-pre-wrap">
                  Transcript: {attachment.transcriptText || "(no speech detected)"}
                </Text>
                <Text variant="caption" muted className="mt-2 block">
                  Attach it to an email from the compose window&apos;s voice
                  message option.
                </Text>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </PageLayout>
  );
}
