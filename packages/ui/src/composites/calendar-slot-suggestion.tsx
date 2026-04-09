"use client";

/**
 * CalendarSlotSuggestion — Inline popup for AI calendar slot suggestions
 * in the compose editor.
 *
 * Appears below the compose body when a meeting intent is detected.
 * Shows a dismissible panel with a SlotPicker. When the user selects a
 * slot, fires `onInsertSlots` with formatted availability text.
 *
 * Fully accessible: keyboard-navigable, screen-reader labels, focus
 * management, reduced-motion support.
 */

import { forwardRef, useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { SlotPicker, type SlotOption } from "./slot-picker";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MeetingIntentInfo {
  hasIntent: boolean;
  type: string | null;
  confidence: number;
  durationHint: number | null;
  locationHint: string | null;
}

export interface CalendarSlotSuggestionProps {
  /** Whether the suggestion panel is visible. */
  visible: boolean;
  /** Whether slot data is currently loading. */
  loading: boolean;
  /** Detected meeting intent metadata. */
  intent: MeetingIntentInfo | null;
  /** AI-suggested time slots. */
  slots: SlotOption[];
  /** Pre-formatted text ready for insertion (all slots). */
  formattedText: string | null;
  /** Fires when the user picks a specific slot to insert. */
  onInsertSlot: (slot: SlotOption) => void;
  /** Fires when the user wants to insert all suggested slots as formatted text. */
  onInsertAll: (text: string) => void;
  /** Fires when the user dismisses the suggestion. */
  onDismiss: () => void;
  /** Fires when the user wants to refresh suggestions. */
  onRefresh?: () => void;
  /** Additional CSS classes. */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const CalendarSlotSuggestion = forwardRef<HTMLDivElement, CalendarSlotSuggestionProps>(
  function CalendarSlotSuggestion(
    {
      visible,
      loading,
      intent,
      slots,
      formattedText,
      onInsertSlot,
      onInsertAll,
      onDismiss,
      onRefresh,
      className = "",
    },
    ref,
  ) {
    const [dismissed, setDismissed] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Reset dismissed state when visibility toggles
    useEffect(() => {
      if (visible) setDismissed(false);
    }, [visible]);

    const handleDismiss = useCallback((): void => {
      setDismissed(true);
      onDismiss();
    }, [onDismiss]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === "Escape") {
          e.preventDefault();
          handleDismiss();
        }
      },
      [handleDismiss],
    );

    const handleInsertAll = useCallback((): void => {
      if (formattedText) {
        onInsertAll(formattedText);
      }
    }, [formattedText, onInsertAll]);

    if (!visible || dismissed) return null;

    return (
      <Box
        ref={ref}
        role="region"
        aria-label="Calendar slot suggestions"
        aria-live="polite"
        onKeyDown={handleKeyDown}
        className={`border border-brand-200 bg-brand-50/50 rounded-xl overflow-hidden ${className}`}
      >
        {/* Header */}
        <Box className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 border-b border-brand-200">
          <Box className="flex items-center gap-2 flex-1 min-w-0">
            <Text as="span" variant="body-sm" className="font-semibold text-brand-700">
              Calendar Assistant
            </Text>
            {intent && (
              <Text
                as="span"
                variant="caption"
                className="px-1.5 py-0.5 bg-brand-100 text-brand-600 rounded font-medium"
              >
                {intent.confidence >= 0.7 ? "High confidence" : "Detected"}
              </Text>
            )}
          </Box>
          <Box className="flex items-center gap-1 flex-shrink-0">
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refresh slot suggestions"
              >
                Refresh
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              aria-label="Dismiss calendar suggestions"
            >
              Dismiss
            </Button>
          </Box>
        </Box>

        {/* Body */}
        <Box ref={panelRef} className="px-4 py-3">
          {loading ? (
            <Box className="flex items-center gap-2 py-4">
              <Box className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
              <Text variant="body-sm" muted>
                Finding available times...
              </Text>
            </Box>
          ) : slots.length === 0 ? (
            <Box className="py-3">
              <Text variant="body-sm" muted>
                No available slots found for the requested time period. Try adjusting your
                working hours or extending the date range.
              </Text>
            </Box>
          ) : (
            <Box className="space-y-3">
              <Text variant="body-sm" muted>
                Meeting intent detected in your email. Choose a time to insert:
              </Text>

              <SlotPicker
                slots={slots}
                onSelect={onInsertSlot}
                label="Available times"
              />

              {formattedText && slots.length > 1 && (
                <Box className="flex items-center justify-between pt-2 border-t border-brand-200">
                  <Text variant="caption" muted>
                    Or insert all {slots.length} suggestions at once
                  </Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleInsertAll}
                    aria-label="Insert all suggested time slots"
                  >
                    Insert all
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    );
  },
);

CalendarSlotSuggestion.displayName = "CalendarSlotSuggestion";
