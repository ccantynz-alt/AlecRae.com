"use client";

import { useState, useCallback } from "react";
import { Box, Text, Button } from "@alecrae/ui";
import {
  composeAssistApi,
  type MeetingIntentResult,
  type FormattedSlot,
  type SlotInsertFormat,
} from "../lib/api-compose-power";

/** A calendar slot as returned by the page's existing suggest-slots flow. */
export interface AssistSlot {
  readonly start: string;
  readonly end: string;
  readonly formattedRange: string;
  readonly durationMinutes: number;
  readonly score: number;
  readonly reasoning: string;
}

interface ComposeAssistPanelProps {
  /** Plain-text body of the current draft. */
  readonly text: string;
  /**
   * Fetch candidate calendar slots for the draft. Supplied by the compose page,
   * which already owns the /v1/calendar/suggest-slots flow (and the recipient
   * context). Returns [] when no slots are available.
   */
  readonly onRequestSlots: (text: string) => Promise<readonly AssistSlot[]>;
  /** Insert formatted content into the draft body at the cursor / end. */
  readonly onInsert: (content: string, format: SlotInsertFormat) => void;
  readonly className?: string;
}

/**
 * AI compose assist for scheduling: detect meeting intent in the draft, pull
 * candidate slots, and insert a nicely formatted set of times in one click.
 *
 * Wires:
 *   POST /v1/compose-assist/detect-meeting
 *   POST /v1/compose-assist/insert-slots
 * (slot candidates come from the page's existing /v1/calendar/suggest-slots flow)
 */
export function ComposeAssistPanel({
  text,
  onRequestSlots,
  onInsert,
  className = "",
}: ComposeAssistPanelProps): React.JSX.Element {
  const [intent, setIntent] = useState<MeetingIntentResult | null>(null);
  const [slots, setSlots] = useState<readonly AssistSlot[]>([]);
  const [format, setFormat] = useState<SlotInsertFormat>("markdown");
  const [loading, setLoading] = useState<boolean>(false);
  const [inserting, setInserting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState<boolean>(false);

  const plainText = text.replace(/<[^>]*>/g, "").trim();

  const handleAnalyze = useCallback(async (): Promise<void> => {
    if (!plainText) return;
    setLoading(true);
    setError(null);
    setRan(true);
    try {
      const [intentRes, foundSlots] = await Promise.all([
        composeAssistApi.detectMeeting(plainText),
        onRequestSlots(plainText).catch(() => [] as readonly AssistSlot[]),
      ]);
      setIntent(intentRes.data);
      setSlots(foundSlots);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not analyze the draft",
      );
    } finally {
      setLoading(false);
    }
  }, [plainText, onRequestSlots]);

  const handleInsert = useCallback(async (): Promise<void> => {
    if (slots.length === 0) return;
    setInserting(true);
    setError(null);
    try {
      const payload: FormattedSlot[] = slots.map((s) => ({
        start: s.start,
        end: s.end,
        formattedRange: s.formattedRange,
        durationMinutes: s.durationMinutes,
        score: s.score,
        reasoning: s.reasoning,
      }));
      const res = await composeAssistApi.insertSlots(payload, { format });
      onInsert(res.data.content, res.data.format);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not format the slots",
      );
    } finally {
      setInserting(false);
    }
  }, [slots, format, onInsert]);

  const confidencePct =
    intent !== null ? Math.round(intent.confidence * 100) : 0;

  return (
    <Box
      className={`rounded-lg border border-border bg-surface-secondary p-3 ${className}`}
    >
      <Box className="flex items-center justify-between gap-3 flex-wrap">
        <Box className="flex items-center gap-2">
          <Text variant="body-sm" className="font-medium">
            AI compose assist
          </Text>
          <Text variant="caption" muted>
            Suggest meeting times from your draft
          </Text>
        </Box>
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          disabled={loading || !plainText}
          onClick={() => void handleAnalyze()}
        >
          {ran ? "Re-analyze" : "Analyze draft"}
        </Button>
      </Box>

      {error && (
        <Text variant="caption" className="text-status-error mt-2">
          {error}
        </Text>
      )}

      {ran && !loading && intent && (
        <Box className="mt-3 space-y-3">
          <Box className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                intent.hasMeetingIntent ? "bg-green-500" : "bg-surface-tertiary"
              }`}
              aria-hidden="true"
            />
            <Text variant="caption" muted>
              {intent.hasMeetingIntent
                ? `Meeting intent detected (${confidencePct}% confidence)`
                : "No clear meeting intent found"}
            </Text>
          </Box>

          {slots.length > 0 ? (
            <Box className="space-y-2">
              <Box className="rounded-md border border-border bg-surface divide-y divide-border">
                {slots.slice(0, 5).map((s) => (
                  <Box key={`${s.start}-${s.end}`} className="px-3 py-2">
                    <Text variant="body-sm" className="font-medium">
                      {s.formattedRange}
                    </Text>
                    <Text variant="caption" muted>
                      {s.durationMinutes} min · {s.reasoning}
                    </Text>
                  </Box>
                ))}
              </Box>
              <Box className="flex items-center gap-2 flex-wrap">
                <Box
                  as="select"
                  value={format}
                  onChange={(e) =>
                    setFormat(
                      (e.target as HTMLSelectElement).value as SlotInsertFormat,
                    )
                  }
                  aria-label="Insertion format"
                  className="h-8 px-2 rounded-md border border-border bg-surface text-content text-body-sm"
                >
                  <option value="markdown">Markdown</option>
                  <option value="text">Plain text</option>
                  <option value="html">HTML</option>
                </Box>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={inserting}
                  disabled={inserting}
                  onClick={() => void handleInsert()}
                >
                  Insert times into draft
                </Button>
              </Box>
            </Box>
          ) : (
            <Text variant="caption" muted>
              No open calendar slots to suggest.
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
