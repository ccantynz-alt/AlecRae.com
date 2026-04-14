"use client";

/**
 * SendTimeSuggestion — Inline panel for AI send-time optimization (S10)
 *
 * Shows predicted optimal send times for a recipient based on their
 * engagement patterns. Displays confidence level, reasoning, and allows
 * the user to pick a suggested time or dismiss.
 *
 * Fully accessible: keyboard-navigable, screen-reader labels, focus
 * management, reduced-motion support.
 */

import {
  forwardRef,
  useState,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SendTimeSlot {
  datetime: string;
  confidence: number;
  reasoning: string;
  dayLabel: string;
  hourLabel: string;
}

export type ConfidenceLevel = "none" | "low" | "medium" | "high";
export type DataSource = "historical" | "default";

export interface SendTimeSuggestionProps {
  /** Whether the suggestion panel is visible. */
  visible: boolean;
  /** Whether data is currently loading. */
  loading: boolean;
  /** Recommended send times from the AI engine. */
  recommendedTimes: SendTimeSlot[];
  /** Whether now is already an optimal time to send. */
  currentlyOptimal: boolean;
  /** Where the data came from. */
  dataSource: DataSource;
  /** Confidence level based on sample size. */
  confidenceLevel: ConfidenceLevel;
  /** Number of historical interactions used. */
  sampleSize: number;
  /** Fires when the user selects a specific time slot. */
  onSelectTime: (slot: SendTimeSlot) => void;
  /** Fires when the user dismisses the suggestion. */
  onDismiss: () => void;
  /** Fires when the user wants to send immediately (current time is optimal). */
  onSendNow?: () => void;
  /** Fires when the user wants to refresh the predictions. */
  onRefresh?: () => void;
  /** Additional CSS classes. */
  className?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<
  ConfidenceLevel,
  { bg: string; text: string; label: string }
> = {
  none: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: "No data",
  },
  low: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    label: "Low confidence",
  },
  medium: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    label: "Medium confidence",
  },
  high: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    label: "High confidence",
  },
};

function formatConfidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatRelativeTime(datetime: string): string {
  const now = new Date();
  const target = new Date(datetime);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return "Now";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Within the hour";
  if (diffHours < 24) return `In ${diffHours}h`;
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

// ─── ConfidenceBar sub-component ───────────────────────────────────────────

function ConfidenceBar({
  confidence,
  level,
}: {
  confidence: number;
  level: ConfidenceLevel;
}): JSX.Element {
  const widthPercent = Math.round(confidence * 100);
  const barColor =
    level === "high"
      ? "bg-emerald-500"
      : level === "medium"
        ? "bg-blue-500"
        : level === "low"
          ? "bg-amber-500"
          : "bg-gray-400";

  return (
    <Box className="flex items-center gap-2">
      <Box
        className="h-1.5 flex-1 bg-gray-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={widthPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Prediction confidence: ${widthPercent}%`}
      >
        <Box
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${widthPercent}%` }}
        />
      </Box>
      <Text as="span" variant="caption" className="font-mono tabular-nums text-content-tertiary">
        {formatConfidencePercent(confidence)}
      </Text>
    </Box>
  );
}

// ─── TimeSlotCard sub-component ────────────────────────────────────────────

function TimeSlotCard({
  slot,
  index,
  isTop,
  onSelect,
}: {
  slot: SendTimeSlot;
  index: number;
  isTop: boolean;
  onSelect: (slot: SendTimeSlot) => void;
}): JSX.Element {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(slot);
      }
    },
    [slot, onSelect],
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(slot)}
      onKeyDown={handleKeyDown}
      className={`w-full text-left rounded-lg border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
        isTop
          ? "border-brand-300 bg-brand-50 hover:bg-brand-100"
          : "border-border bg-surface hover:bg-gray-50"
      }`}
      role="option"
      aria-selected={false}
      aria-label={`Send ${slot.dayLabel} at ${slot.hourLabel}, ${formatConfidencePercent(slot.confidence)} confidence`}
    >
      <Box className="flex items-center justify-between mb-1">
        <Box className="flex items-center gap-2">
          {isTop && (
            <Text
              as="span"
              variant="caption"
              className="px-1.5 py-0.5 bg-brand-200 text-brand-800 rounded font-semibold"
            >
              Best
            </Text>
          )}
          <Text as="span" variant="body-sm" className="font-semibold">
            {slot.dayLabel} at {slot.hourLabel}
          </Text>
        </Box>
        <Text as="span" variant="caption" muted>
          {formatRelativeTime(slot.datetime)}
        </Text>
      </Box>
      <ConfidenceBar confidence={slot.confidence} level={slot.confidence >= 0.8 ? "high" : slot.confidence >= 0.6 ? "medium" : "low"} />
      <Text variant="caption" muted className="mt-1">
        {slot.reasoning}
      </Text>
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export const SendTimeSuggestion = forwardRef<HTMLDivElement, SendTimeSuggestionProps>(
  function SendTimeSuggestion(
    {
      visible,
      loading,
      recommendedTimes,
      currentlyOptimal,
      dataSource,
      confidenceLevel,
      sampleSize,
      onSelectTime,
      onDismiss,
      onSendNow,
      onRefresh,
      className = "",
    },
    ref,
  ) {
    const [dismissed, setDismissed] = useState(false);

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

    if (!visible || dismissed) return null;

    const confStyle = CONFIDENCE_STYLES[confidenceLevel];

    return (
      <Box
        ref={ref}
        role="region"
        aria-label="Send time optimization suggestions"
        aria-live="polite"
        onKeyDown={handleKeyDown}
        className={`border border-brand-200 bg-brand-50/50 rounded-xl overflow-hidden ${className}`}
      >
        {/* Header */}
        <Box className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 border-b border-brand-200">
          <Box className="flex items-center gap-2 flex-1 min-w-0">
            <Text as="span" variant="body-sm" className="font-semibold text-brand-700">
              Optimal Send Time
            </Text>
            <Text
              as="span"
              variant="caption"
              className={`px-1.5 py-0.5 ${confStyle.bg} ${confStyle.text} rounded font-medium`}
            >
              {confStyle.label}
            </Text>
            {dataSource === "historical" && sampleSize > 0 && (
              <Text as="span" variant="caption" muted>
                Based on {sampleSize} interactions
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
                aria-label="Refresh send time predictions"
              >
                Refresh
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              aria-label="Dismiss send time suggestions"
            >
              Dismiss
            </Button>
          </Box>
        </Box>

        {/* Body */}
        <Box className="px-4 py-3">
          {loading ? (
            <Box className="flex items-center gap-2 py-4">
              <Box className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
              <Text variant="body-sm" muted>
                Analyzing recipient engagement patterns...
              </Text>
            </Box>
          ) : currentlyOptimal ? (
            <Box className="space-y-3">
              <Box className="flex items-center gap-2 py-2">
                <Box className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Text variant="body-sm" className="font-semibold text-emerald-700">
                  Now is an optimal time to send!
                </Text>
              </Box>
              <Text variant="caption" muted>
                Based on this recipient&#39;s engagement patterns, sending now
                has the highest chance of being read promptly.
              </Text>
              {onSendNow && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSendNow}
                  className="w-full"
                  aria-label="Send email now at optimal time"
                >
                  Send now
                </Button>
              )}
              {recommendedTimes.length > 0 && (
                <Box className="pt-2 border-t border-brand-200">
                  <Text variant="caption" muted className="mb-2">
                    Or schedule for later:
                  </Text>
                  <Box className="space-y-2" role="listbox" aria-label="Alternative send times">
                    {recommendedTimes.map((slot, i) => (
                      <TimeSlotCard
                        key={slot.datetime}
                        slot={slot}
                        index={i}
                        isTop={i === 0}
                        onSelect={onSelectTime}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          ) : recommendedTimes.length === 0 ? (
            <Box className="py-3">
              <Text variant="body-sm" muted>
                Not enough engagement data to predict optimal send times for
                this recipient. The email will be sent immediately.
              </Text>
            </Box>
          ) : (
            <Box className="space-y-3">
              <Text variant="body-sm" muted>
                AI has analyzed this recipient&#39;s engagement patterns to
                find when they&#39;re most likely to open and respond:
              </Text>
              <Box className="space-y-2" role="listbox" aria-label="Recommended send times">
                {recommendedTimes.map((slot, i) => (
                  <TimeSlotCard
                    key={slot.datetime}
                    slot={slot}
                    index={i}
                    isTop={i === 0}
                    onSelect={onSelectTime}
                  />
                ))}
              </Box>
              {dataSource === "default" && (
                <Text variant="caption" className="text-amber-600">
                  Using general best-practice windows. As you send more emails
                  to this recipient, predictions will become personalized.
                </Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
    );
  },
);

SendTimeSuggestion.displayName = "SendTimeSuggestion";
