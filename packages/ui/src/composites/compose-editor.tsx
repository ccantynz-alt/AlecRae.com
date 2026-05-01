"use client";

import { forwardRef, useState, useCallback, useRef, useEffect, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { CalendarSlotSuggestion, type MeetingIntentInfo } from "./calendar-slot-suggestion";
import type { SlotOption } from "./slot-picker";

export interface AISuggestion {
  id: string;
  type: "rewrite" | "autocomplete" | "tone" | "grammar";
  label: string;
  preview: string;
}

export interface ComposeData {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

/** Callback signature for requesting calendar slot suggestions from an API. */
export type CalendarSlotRequestFn = (text: string, recipientEmail: string) => Promise<{
  detected: boolean;
  intent: MeetingIntentInfo;
  slots: SlotOption[];
  formattedText: string | null;
}>;

export interface ComposeEditorProps extends HTMLAttributes<HTMLDivElement> {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  suggestions?: AISuggestion[];
  onSend?: (data: ComposeData) => void;
  onSaveDraft?: () => void;
  onDiscard?: () => void;
  onApplySuggestion?: (suggestion: AISuggestion) => void;
  showAIPanel?: boolean;
  /** Callback to fetch AI calendar slot suggestions. When provided, enables B7 feature. */
  onRequestCalendarSlots?: CalendarSlotRequestFn;
  /** Fires whenever the body text changes — used to drive grammar checks / live AI. */
  onBodyChange?: (text: string) => void;
  className?: string;
}

// ─── Meeting intent detection (heuristic, client-side) ─────────────────────

const MEETING_PHRASES_RE =
  /\b(let'?s\s+(meet|chat|sync|catch up|talk|call|hop on)|schedule\s+a\s+(call|meeting|chat)|find\s+a\s+time|are\s+you\s+free|do\s+you\s+have\s+time|how\s+about|want\s+to\s+(meet|chat|call)|shall\s+we\s+(meet|call|chat)|can\s+we\s+(meet|call|set up)|book\s+a\s+(meeting|call)|set\s+up\s+a\s+(call|meeting|time))\b/i;

function hasLocalMeetingIntent(text: string): boolean {
  return MEETING_PHRASES_RE.test(text);
}

// ─── Calendar slot state ────────────────────────────────────────────────────

interface CalendarSlotState {
  visible: boolean;
  loading: boolean;
  intent: MeetingIntentInfo | null;
  slots: SlotOption[];
  formattedText: string | null;
}

const INITIAL_SLOT_STATE: CalendarSlotState = {
  visible: false,
  loading: false,
  intent: null,
  slots: [],
  formattedText: null,
};

export const ComposeEditor = forwardRef<HTMLDivElement, ComposeEditorProps>(function ComposeEditor(
  {
    from: initialFrom = "",
    to: initialTo = "",
    cc: initialCc = "",
    bcc: initialBcc = "",
    subject: initialSubject = "",
    body: initialBody = "",
    suggestions = [],
    onSend,
    onSaveDraft,
    onDiscard,
    onApplySuggestion,
    showAIPanel = true,
    onRequestCalendarSlots,
    onBodyChange,
    className = "",
    ...props
  },
  ref
) {
  const [showCcBcc, setShowCcBcc] = useState(!!initialCc || !!initialBcc);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc);
  const [bcc, setBcc] = useState(initialBcc);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  // Calendar slot suggestion state (B7)
  const [slotState, setSlotState] = useState<CalendarSlotState>(INITIAL_SLOT_STATE);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDetectedRef = useRef<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback((): void => {
    onSend?.({ from, to, cc, bcc, subject, body });
  }, [from, to, cc, bcc, subject, body, onSend]);

  // Fetch calendar slots from the API
  const fetchCalendarSlots = useCallback(
    async (text: string): Promise<void> => {
      if (!onRequestCalendarSlots) return;

      // Extract first recipient email for personalisation
      const recipientEmail = to.split(",")[0]?.trim() ?? "";

      setSlotState((prev) => ({ ...prev, loading: true, visible: true }));
      try {
        const result = await onRequestCalendarSlots(text, recipientEmail);
        setSlotState({
          visible: result.detected,
          loading: false,
          intent: result.intent,
          slots: result.slots,
          formattedText: result.formattedText,
        });
        lastDetectedRef.current = text;
      } catch {
        setSlotState((prev) => ({ ...prev, loading: false }));
      }
    },
    [onRequestCalendarSlots, to],
  );

  // Debounced meeting intent detection on body changes
  useEffect(() => {
    if (!onRequestCalendarSlots) return;
    if (!body || body.length < 10) {
      setSlotState(INITIAL_SLOT_STATE);
      return;
    }

    // Quick client-side check before calling the API
    if (!hasLocalMeetingIntent(body)) {
      if (slotState.visible) setSlotState(INITIAL_SLOT_STATE);
      return;
    }

    // Don't re-fetch if body hasn't changed meaningfully since last detection
    if (lastDetectedRef.current === body) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchCalendarSlots(body);
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [body, onRequestCalendarSlots, fetchCalendarSlots, slotState.visible]);

  // Insert a single slot into the body
  const handleInsertSlot = useCallback(
    (slot: SlotOption): void => {
      const insertText = `\n\nHow about ${slot.formattedRange}? (${slot.durationMinutes} min)\n`;
      setBody((prev) => prev + insertText);
      setSlotState(INITIAL_SLOT_STATE);
      // Refocus the textarea
      textareaRef.current?.focus();
    },
    [],
  );

  // Insert all slots as formatted text
  const handleInsertAll = useCallback(
    (text: string): void => {
      setBody((prev) => prev + "\n\n" + text + "\n");
      setSlotState(INITIAL_SLOT_STATE);
      textareaRef.current?.focus();
    },
    [],
  );

  // Dismiss the calendar suggestion
  const handleDismissSlots = useCallback((): void => {
    setSlotState(INITIAL_SLOT_STATE);
  }, []);

  // Refresh calendar slot suggestions
  const handleRefreshSlots = useCallback((): void => {
    void fetchCalendarSlots(body);
  }, [fetchCalendarSlots, body]);

  return (
    <Box ref={ref} className={`flex flex-col h-full bg-surface ${className}`} {...props}>
      <Box className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button variant="primary" size="md" onClick={handleSend}>
          Send
        </Button>
        <Button variant="secondary" size="md" onClick={onSaveDraft}>
          Save Draft
        </Button>
        <Box className="flex-1" />
        <Button variant="ghost" size="md" onClick={onDiscard}>
          Discard
        </Button>
      </Box>
      <Box className="flex flex-1 overflow-hidden">
        <Box className="flex-1 flex flex-col">
          <Box className="px-4 py-2 border-b border-border space-y-2">
            {from && (
              <Box className="flex items-center gap-2">
                <Text variant="label" className="w-16 text-content-secondary">
                  From
                </Text>
                <Input
                  variant="email"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="you@example.com"
                  className="border-0 shadow-none focus:ring-0"
                />
              </Box>
            )}
            <Box className="flex items-center gap-2">
              <Text variant="label" className="w-16 text-content-secondary">
                To
              </Text>
              <Input
                variant="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="border-0 shadow-none focus:ring-0"
              />
              <Button variant="ghost" size="sm" onClick={() => setShowCcBcc((prev) => !prev)}>
                Cc/Bcc
              </Button>
            </Box>
            {showCcBcc && (
              <Box className="space-y-2">
                <Box className="flex items-center gap-2">
                  <Text variant="label" className="w-16 text-content-secondary">
                    Cc
                  </Text>
                  <Input
                    variant="email"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                    className="border-0 shadow-none focus:ring-0"
                  />
                </Box>
                <Box className="flex items-center gap-2">
                  <Text variant="label" className="w-16 text-content-secondary">
                    Bcc
                  </Text>
                  <Input
                    variant="email"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@example.com"
                    className="border-0 shadow-none focus:ring-0"
                  />
                </Box>
              </Box>
            )}
            <Box className="flex items-center gap-2">
              <Text variant="label" className="w-16 text-content-secondary">
                Subject
              </Text>
              <Input
                variant="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="border-0 shadow-none focus:ring-0"
              />
            </Box>
          </Box>
          <Box className="flex-1 p-4 flex flex-col">
            <Box
              as="textarea"
              ref={textareaRef}
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setBody(e.target.value);
                onBodyChange?.(e.target.value);
              }}
              placeholder="Write your email..."
              className="w-full flex-1 resize-none bg-transparent text-body-md text-content focus:outline-none placeholder:text-content-tertiary"
            />
            {/* B7: Calendar Slot Suggestions inline in compose */}
            {onRequestCalendarSlots && (
              <CalendarSlotSuggestion
                visible={slotState.visible}
                loading={slotState.loading}
                intent={slotState.intent}
                slots={slotState.slots}
                formattedText={slotState.formattedText}
                onInsertSlot={handleInsertSlot}
                onInsertAll={handleInsertAll}
                onDismiss={handleDismissSlots}
                onRefresh={handleRefreshSlots}
                className="mt-3"
              />
            )}
          </Box>
        </Box>
        {showAIPanel && suggestions.length > 0 && (
          <AISuggestionsPanel
            suggestions={suggestions}
            onApply={onApplySuggestion}
          />
        )}
      </Box>
    </Box>
  );
});

ComposeEditor.displayName = "ComposeEditor";

interface AISuggestionsPanelProps {
  suggestions: AISuggestion[];
  onApply?: ((suggestion: AISuggestion) => void) | undefined;
}

function AISuggestionsPanel({ suggestions, onApply }: AISuggestionsPanelProps) {
  const typeLabels = {
    rewrite: "Rewrite",
    autocomplete: "Complete",
    tone: "Tone",
    grammar: "Grammar",
  } as const;

  return (
    <Box className="w-72 border-l border-border bg-surface-secondary p-4 overflow-y-auto">
      <Box className="flex items-center gap-2 mb-4">
        <Text variant="heading-sm">AI Suggestions</Text>
      </Box>
      <Box className="space-y-3">
        {suggestions.map((suggestion) => (
          <Box
            key={suggestion.id}
            className="p-3 bg-surface rounded-lg border border-border hover:border-brand-300 transition-colors cursor-pointer"
            onClick={() => onApply?.(suggestion)}
          >
            <Box className="flex items-center gap-2 mb-1">
              <Text
                as="span"
                variant="caption"
                className="px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded font-medium"
              >
                {typeLabels[suggestion.type]}
              </Text>
              <Text variant="caption" className="font-medium">
                {suggestion.label}
              </Text>
            </Box>
            <Text variant="body-sm" muted className="line-clamp-2">
              {suggestion.preview}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

AISuggestionsPanel.displayName = "AISuggestionsPanel";
