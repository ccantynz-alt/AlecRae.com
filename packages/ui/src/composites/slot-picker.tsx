"use client";

/**
 * SlotPicker — Accessible clickable time slot list for calendar suggestions.
 *
 * Renders a list of suggested meeting slots. Each slot shows the formatted
 * time range, duration, score badge, and reasoning. Clicking a slot fires
 * `onSelect`. Keyboard navigable with arrow keys, Enter, and Space.
 */

import { forwardRef, useState, useCallback, useRef, type KeyboardEvent } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SlotOption {
  start: string;
  end: string;
  formattedRange: string;
  durationMinutes: number;
  score: number;
  reasoning: string;
}

export interface SlotPickerProps {
  /** Available time slots to choose from. */
  slots: SlotOption[];
  /** Fires when the user selects a slot. */
  onSelect: (slot: SlotOption) => void;
  /** Optional label for the slot list heading. */
  label?: string;
  /** Additional CSS classes. */
  className?: string;
  /** Index of the currently highlighted slot (controlled). */
  activeIndex?: number;
}

// ─── Score badge helper ─────────────────────────────────────────────────────

function scoreBadgeClass(score: number): string {
  if (score >= 0.8) return "bg-green-100 text-green-800";
  if (score >= 0.6) return "bg-yellow-100 text-yellow-800";
  return "bg-surface-tertiary text-content-secondary";
}

function scoreLabel(score: number): string {
  if (score >= 0.8) return "Best";
  if (score >= 0.6) return "Good";
  return "OK";
}

// ─── Component ──────────────────────────────────────────────────────────────

export const SlotPicker = forwardRef<HTMLDivElement, SlotPickerProps>(function SlotPicker(
  { slots, onSelect, label = "Suggested times", className = "", activeIndex: controlledIndex },
  ref,
) {
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIdx = controlledIndex ?? internalIndex;
  const listRef = useRef<HTMLUListElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLUListElement>): void => {
      if (slots.length === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = (activeIdx + 1) % slots.length;
          setInternalIndex(next);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = (activeIdx - 1 + slots.length) % slots.length;
          setInternalIndex(prev);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          const selected = slots[activeIdx];
          if (selected) onSelect(selected);
          break;
        }
        default:
          break;
      }
    },
    [activeIdx, onSelect, slots],
  );

  if (slots.length === 0) {
    return (
      <Box ref={ref} className={`p-3 ${className}`}>
        <Text variant="body-sm" muted>
          No available slots found. Try adjusting your working hours or date range.
        </Text>
      </Box>
    );
  }

  return (
    <Box ref={ref} className={className}>
      <Text variant="label" className="mb-2 block" id="slot-picker-label">
        {label}
      </Text>
      <Box
        as="ul"
        ref={listRef}
        role="listbox"
        aria-labelledby="slot-picker-label"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="space-y-1.5 focus:outline-none"
      >
        {slots.map((slot, index) => {
          const isActive = index === activeIdx;
          return (
            <Box
              as="li"
              key={`${slot.start}-${slot.end}`}
              role="option"
              aria-selected={isActive}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors duration-100 ${
                isActive
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-300"
                  : "border-border bg-surface hover:bg-surface-secondary hover:border-brand-200"
              }`}
              onClick={() => {
                setInternalIndex(index);
                onSelect(slot);
              }}
            >
              <Box className="flex-1 min-w-0">
                <Text variant="body-sm" className="font-medium truncate">
                  {slot.formattedRange}
                </Text>
                <Text variant="caption" muted className="truncate">
                  {slot.reasoning}
                </Text>
              </Box>
              <Box className="flex items-center gap-2 flex-shrink-0">
                <Text
                  as="span"
                  variant="caption"
                  className={`px-1.5 py-0.5 rounded font-medium ${scoreBadgeClass(slot.score)}`}
                >
                  {scoreLabel(slot.score)}
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(slot);
                  }}
                  aria-label={`Insert slot: ${slot.formattedRange}`}
                >
                  Insert
                </Button>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});

SlotPicker.displayName = "SlotPicker";
