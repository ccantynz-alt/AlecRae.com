"use client";

import React, { forwardRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StreakCounterProps extends HTMLAttributes<HTMLDivElement> {
  /** Current consecutive inbox-zero day count. */
  currentStreak: number;
  /** Longest ever streak. */
  longestStreak?: number;
  /** Whether to show the compact version (for sidebar). */
  compact?: boolean;
  /** Whether gamification is enabled. */
  enabled?: boolean;
  className?: string;
}

// ─── Streak tier thresholds ──────────────────────────────────────────────────

interface StreakTier {
  minDays: number;
  icon: string;
  color: string;
  label: string;
}

const STREAK_TIERS: readonly StreakTier[] = [
  { minDays: 30, icon: "\uD83D\uDD25", color: "text-orange-500", label: "On Fire" },
  { minDays: 14, icon: "\uD83D\uDCAA", color: "text-yellow-500", label: "Strong" },
  { minDays: 7, icon: "\u2B50", color: "text-blue-500", label: "Rolling" },
  { minDays: 3, icon: "\u2728", color: "text-emerald-500", label: "Building" },
  { minDays: 1, icon: "\uD83C\uDF31", color: "text-green-500", label: "Started" },
  { minDays: 0, icon: "\uD83D\uDCEB", color: "text-content-tertiary", label: "No streak" },
] as const;

function getStreakTier(streak: number): StreakTier {
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.minDays) {
      return tier;
    }
  }
  // STREAK_TIERS ends with a minDays: 0 fallback tier, which always matches.
  // Return the last tier explicitly; the fallback is unreachable in practice.
  const fallback = STREAK_TIERS[STREAK_TIERS.length - 1];
  if (fallback) return fallback;
  return { minDays: 0, icon: "\uD83D\uDCEB", color: "text-content-tertiary", label: "No streak" };
}

// ─── Component ──────────────────────────────────────────────────────────────

export const StreakCounter = forwardRef<HTMLDivElement, StreakCounterProps>(
  function StreakCounter(
    {
      currentStreak,
      longestStreak,
      compact = false,
      enabled = true,
      className = "",
      ...props
    },
    ref,
  ) {
    if (!enabled) return null;

    const tier = getStreakTier(currentStreak);

    if (compact) {
      return (
        <Box
          ref={ref}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-secondary ${className}`}
          role="status"
          aria-label={`Inbox zero streak: ${currentStreak} days`}
          {...props}
        >
          <Box as="span" className="text-sm" aria-hidden="true">
            {tier.icon}
          </Box>
          <Text
            as="span"
            variant="body-sm"
            className={`font-semibold tabular-nums ${tier.color}`}
          >
            {currentStreak}
          </Text>
        </Box>
      );
    }

    return (
      <Box
        ref={ref}
        className={`flex items-center gap-3 p-3 rounded-lg bg-surface-secondary border border-border ${className}`}
        role="status"
        aria-label={`Inbox zero streak: ${currentStreak} days. ${tier.label}. ${
          longestStreak !== undefined ? `Best: ${longestStreak} days` : ""
        }`}
        {...props}
      >
        <Box className="text-2xl" aria-hidden="true">
          {tier.icon}
        </Box>
        <Box className="flex-1 min-w-0">
          <Box className="flex items-baseline gap-2">
            <Text
              as="span"
              variant="heading-md"
              className={`tabular-nums ${tier.color}`}
            >
              {currentStreak}
            </Text>
            <Text as="span" variant="body-sm" muted>
              {currentStreak === 1 ? "day" : "days"}
            </Text>
          </Box>
          <Text variant="body-sm" muted>
            {tier.label}
          </Text>
        </Box>
        {longestStreak !== undefined && longestStreak > 0 && (
          <Box className="text-right">
            <Text variant="caption" className="tabular-nums">
              Best: {longestStreak}
            </Text>
          </Box>
        )}
      </Box>
    );
  },
);

StreakCounter.displayName = "StreakCounter";
