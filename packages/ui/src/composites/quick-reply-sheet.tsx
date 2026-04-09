"use client";

/**
 * Vienna UI — QuickReplySheet
 *
 * A bottom sheet overlay for quick email replies. Appears when the user
 * swipes to reply, presenting:
 *   1. AI-generated quick reply suggestions (short / medium / detailed)
 *   2. One-tap send for any suggestion
 *   3. "Edit" button to open full compose
 *   4. Custom reply text input
 *   5. Thread context preview
 *
 * All AI calls have fallback behavior if unavailable — the sheet still
 * works with just the custom reply input.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReplyLength = "short" | "medium" | "detailed";

export interface QuickReplySuggestion {
  readonly id: string;
  readonly length: ReplyLength;
  readonly text: string;
  readonly confidence: number;
}

export interface ThreadContextMessage {
  readonly id: string;
  readonly from: string;
  readonly preview: string;
  readonly receivedAt: string;
}

export interface QuickReplySheetProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSubmit"> {
  readonly visible: boolean;
  readonly threadId: string;
  readonly threadSubject: string;
  readonly threadContext: readonly ThreadContextMessage[];
  readonly suggestions: readonly QuickReplySuggestion[];
  readonly suggestionsLoading: boolean;
  readonly suggestionsError: string | null;
  readonly onSendReply: (threadId: string, text: string) => void;
  readonly onEditInCompose: (threadId: string, draftText: string) => void;
  readonly onDismiss: () => void;
  readonly onRequestSuggestions?: (threadId: string) => void;
  readonly className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LENGTH_LABELS: Record<ReplyLength, string> = {
  short: "Brief",
  medium: "Standard",
  detailed: "Detailed",
};

const LENGTH_ICONS: Record<ReplyLength, string> = {
  short: "\u{26A1}",
  medium: "\u{1F4AC}",
  detailed: "\u{1F4DD}",
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const QuickReplySheet = forwardRef<HTMLDivElement, QuickReplySheetProps>(
  function QuickReplySheet(
    {
      visible,
      threadId,
      threadSubject,
      threadContext,
      suggestions,
      suggestionsLoading,
      suggestionsError,
      onSendReply,
      onEditInCompose,
      onDismiss,
      onRequestSuggestions,
      className = "",
      ...props
    },
    ref,
  ) {
    const [customText, setCustomText] = useState("");
    const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const reduced = prefersReducedMotion();

    // Reset state when sheet opens
    useEffect(() => {
      if (visible) {
        setCustomText("");
        setSelectedSuggestion(null);
        setIsSending(false);
        onRequestSuggestions?.(threadId);
      }
    }, [visible, threadId, onRequestSuggestions]);

    // Focus textarea when visible
    useEffect(() => {
      if (visible && textareaRef.current) {
        const timer = setTimeout(() => {
          textareaRef.current?.focus();
        }, reduced ? 0 : 350);
        return () => clearTimeout(timer);
      }
      return undefined;
    }, [visible, reduced]);

    const handleSendSuggestion = useCallback(
      (suggestion: QuickReplySuggestion): void => {
        setIsSending(true);
        setSelectedSuggestion(suggestion.id);
        onSendReply(threadId, suggestion.text);
      },
      [onSendReply, threadId],
    );

    const handleSendCustom = useCallback(
      (e: FormEvent): void => {
        e.preventDefault();
        const text = customText.trim();
        if (text.length === 0) return;
        setIsSending(true);
        onSendReply(threadId, text);
      },
      [customText, onSendReply, threadId],
    );

    const handleEditSuggestion = useCallback(
      (suggestion: QuickReplySuggestion): void => {
        onEditInCompose(threadId, suggestion.text);
      },
      [onEditInCompose, threadId],
    );

    const handleEditCustom = useCallback((): void => {
      onEditInCompose(threadId, customText);
    }, [customText, onEditInCompose, threadId]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>): void => {
        // Cmd/Ctrl + Enter to send
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          const text = customText.trim();
          if (text.length > 0) {
            setIsSending(true);
            onSendReply(threadId, text);
          }
        }
        // Escape to dismiss
        if (e.key === "Escape") {
          onDismiss();
        }
      },
      [customText, onDismiss, onSendReply, threadId],
    );

    const handleBackdropClick = useCallback((): void => {
      onDismiss();
    }, [onDismiss]);

    if (!visible) return null;

    const sheetTransition = reduced
      ? "none"
      : "transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease";

    return (
      <Box
        ref={ref}
        className={`fixed inset-0 z-50 flex flex-col justify-end ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick reply to: ${threadSubject}`}
        {...props}
      >
        {/* Backdrop */}
        <Box
          className="absolute inset-0 bg-black/60"
          onClick={handleBackdropClick}
          aria-hidden="true"
          style={{
            transition: reduced ? "none" : "opacity 0.2s ease",
          }}
        />

        {/* Sheet */}
        <Box
          className="relative bg-surface rounded-t-2xl border-t border-border shadow-2xl max-h-[85vh] overflow-y-auto"
          style={{ transition: sheetTransition }}
        >
          {/* Handle */}
          <Box className="flex justify-center pt-3 pb-2">
            <Box className="w-11 h-1.5 rounded-full bg-content-tertiary/30" />
          </Box>

          {/* Header */}
          <Box className="px-5 pb-3 border-b border-border">
            <Box className="flex items-center justify-between mb-1">
              <Text variant="heading-sm" className="font-bold">
                Quick Reply
              </Text>
              <button
                type="button"
                className="text-content-tertiary hover:text-content-primary transition-colors px-2 py-1 rounded-md text-sm"
                onClick={onDismiss}
                aria-label="Close quick reply"
              >
                Close
              </button>
            </Box>
            <Text variant="body-xs" muted className="truncate">
              Re: {threadSubject}
            </Text>
          </Box>

          {/* Thread context preview */}
          {threadContext.length > 0 ? (
            <Box className="px-5 py-3 border-b border-border">
              <Text variant="body-xs" muted className="font-semibold uppercase tracking-wide mb-2">
                Thread Context
              </Text>
              <Box className="space-y-2 max-h-32 overflow-y-auto">
                {threadContext.slice(-3).map((msg) => (
                  <Box key={msg.id} className="flex gap-2">
                    <Text variant="body-xs" className="font-semibold text-content-secondary shrink-0">
                      {msg.from}:
                    </Text>
                    <Text variant="body-xs" muted className="truncate">
                      {msg.preview}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}

          {/* AI Suggestions */}
          <Box className="px-5 py-4">
            <Text variant="body-xs" muted className="font-semibold uppercase tracking-wide mb-3">
              AI Suggestions
            </Text>

            {suggestionsLoading ? (
              <Box className="flex items-center gap-3 py-4">
                <Box className="w-4 h-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                <Text variant="body-sm" muted>
                  Generating replies...
                </Text>
              </Box>
            ) : suggestionsError ? (
              <Box className="py-3 px-4 rounded-lg bg-status-error/10 border border-status-error/20 mb-3">
                <Text variant="body-xs" className="text-status-error">
                  {suggestionsError}
                </Text>
                {onRequestSuggestions ? (
                  <button
                    type="button"
                    className="text-brand-400 text-xs mt-1 hover:underline"
                    onClick={() => onRequestSuggestions(threadId)}
                  >
                    Try again
                  </button>
                ) : null}
              </Box>
            ) : suggestions.length > 0 ? (
              <Box className="space-y-2 mb-4">
                {suggestions.map((suggestion) => (
                  <Box
                    key={suggestion.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      selectedSuggestion === suggestion.id
                        ? "border-brand-400 bg-brand-400/10"
                        : "border-border hover:border-content-tertiary/50 hover:bg-surface-hover"
                    }`}
                  >
                    <Box className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs">{LENGTH_ICONS[suggestion.length]}</span>
                      <Text variant="body-xs" className="font-semibold text-content-secondary">
                        {LENGTH_LABELS[suggestion.length]}
                      </Text>
                      {suggestion.confidence >= 0.8 ? (
                        <Text variant="body-xs" className="text-status-success text-[10px]">
                          High confidence
                        </Text>
                      ) : null}
                    </Box>
                    <Text variant="body-sm" className="text-content-primary mb-2 whitespace-pre-wrap">
                      {suggestion.text}
                    </Text>
                    <Box className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSendSuggestion(suggestion)}
                        disabled={isSending}
                        aria-label={`Send ${LENGTH_LABELS[suggestion.length]} reply`}
                        className="text-xs px-3 py-1"
                      >
                        {isSending && selectedSuggestion === suggestion.id
                          ? "Sending..."
                          : "Send"}
                      </Button>
                      <button
                        type="button"
                        className="text-content-tertiary hover:text-content-primary text-xs px-2 py-1 transition-colors"
                        onClick={() => handleEditSuggestion(suggestion)}
                        aria-label={`Edit ${LENGTH_LABELS[suggestion.length]} reply in composer`}
                      >
                        Edit
                      </button>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box className="py-3 mb-3">
                <Text variant="body-sm" muted>
                  No AI suggestions available. Type a custom reply below.
                </Text>
              </Box>
            )}

            {/* Custom reply input */}
            <Box className="border-t border-border pt-4">
              <Text variant="body-xs" muted className="font-semibold uppercase tracking-wide mb-2">
                Custom Reply
              </Text>
              <form onSubmit={handleSendCustom}>
                <textarea
                  ref={textareaRef}
                  className="w-full bg-surface-hover rounded-xl border border-border px-4 py-3 text-sm text-content-primary placeholder-content-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-colors"
                  style={{ minHeight: 80 }}
                  placeholder="Type a reply... (Cmd+Enter to send)"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Custom reply text"
                  disabled={isSending}
                />
                <Box className="flex items-center justify-between mt-3">
                  <button
                    type="button"
                    className="text-content-tertiary hover:text-content-primary text-sm px-3 py-1.5 transition-colors"
                    onClick={handleEditCustom}
                    aria-label="Open full compose editor"
                  >
                    Open Composer
                  </button>
                  <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    disabled={isSending || customText.trim().length === 0}
                    aria-label="Send custom reply"
                  >
                    {isSending ? "Sending..." : "Send Reply"}
                  </Button>
                </Box>
              </form>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  },
);

QuickReplySheet.displayName = "QuickReplySheet";
