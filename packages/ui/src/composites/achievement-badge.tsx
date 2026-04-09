"use client";

import React, { forwardRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AchievementBadgeData {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface AchievementBadgeProps extends HTMLAttributes<HTMLDivElement> {
  /** The achievement data. */
  achievement: AchievementBadgeData;
  /** Display size variant. */
  size?: "sm" | "md" | "lg";
  /** Whether to show progress bar for locked achievements. */
  showProgress?: boolean;
  className?: string;
}

// ─── Icon mapping ──────────────────────────────────────────────────────────

const ICON_MAP: Record<string, string> = {
  trophy: "\uD83C\uDFC6",
  flame: "\uD83D\uDD25",
  crown: "\uD83D\uDC51",
  zap: "\u26A1",
  sunrise: "\uD83C\uDF05",
  moon: "\uD83C\uDF19",
  shield: "\uD83D\uDEE1\uFE0F",
  target: "\uD83C\uDFAF",
  sparkles: "\u2728",
  star: "\u2B50",
};

// ─── Size styles ──────────────────────────────────────────────────────────

const SIZE_STYLES = {
  sm: {
    container: "p-2 gap-2",
    icon: "text-xl",
    name: "body-sm" as const,
    desc: "caption" as const,
  },
  md: {
    container: "p-3 gap-3",
    icon: "text-2xl",
    name: "body-md" as const,
    desc: "body-sm" as const,
  },
  lg: {
    container: "p-4 gap-4",
    icon: "text-3xl",
    name: "heading-sm" as const,
    desc: "body-md" as const,
  },
} as const;

// ─── Component ──────────────────────────────────────────────────────────────

export const AchievementBadge = forwardRef<HTMLDivElement, AchievementBadgeProps>(
  function AchievementBadge(
    {
      achievement,
      size = "md",
      showProgress = true,
      className = "",
      ...props
    },
    ref,
  ) {
    const styles = SIZE_STYLES[size];
    const progressPercent =
      achievement.target > 0
        ? Math.min(100, Math.round((achievement.progress / achievement.target) * 100))
        : 0;

    const icon = ICON_MAP[achievement.icon] ?? "\uD83C\uDFC5";
    const lockedClass = achievement.unlocked ? "" : "opacity-50 grayscale";

    return (
      <Box
        ref={ref}
        className={`flex items-start rounded-lg border border-border bg-surface-secondary ${styles.container} ${lockedClass} ${className}`}
        role="listitem"
        aria-label={`${achievement.name}: ${achievement.unlocked ? "Unlocked" : `${progressPercent}% complete`}. ${achievement.description}`}
        {...props}
      >
        {/* Icon */}
        <Box
          className={`flex-shrink-0 ${styles.icon}`}
          aria-hidden="true"
        >
          {icon}
        </Box>

        {/* Content */}
        <Box className="flex-1 min-w-0">
          <Box className="flex items-center gap-2">
            <Text variant={styles.name} className="font-semibold truncate">
              {achievement.name}
            </Text>
            {achievement.unlocked && (
              <Box
                as="span"
                className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full bg-status-success/10 text-status-success"
                aria-hidden="true"
              >
                Unlocked
              </Box>
            )}
          </Box>
          <Text variant={styles.desc} muted className="mt-0.5">
            {achievement.description}
          </Text>

          {/* Progress bar */}
          {showProgress && !achievement.unlocked && achievement.target > 1 && (
            <Box className="mt-2">
              <Box className="flex justify-between mb-1">
                <Text variant="caption">
                  {achievement.progress} / {achievement.target}
                </Text>
                <Text variant="caption">{progressPercent}%</Text>
              </Box>
              <Box
                className="w-full h-1.5 rounded-full bg-surface-tertiary overflow-hidden"
                role="progressbar"
                aria-valuenow={achievement.progress}
                aria-valuemin={0}
                aria-valuemax={achievement.target}
                aria-label={`${achievement.name} progress`}
              >
                <Box
                  className="h-full rounded-full bg-brand-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </Box>
            </Box>
          )}

          {/* Unlock date */}
          {achievement.unlocked && achievement.unlockedAt && (
            <Text variant="caption" className="mt-1">
              {new Date(achievement.unlockedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
        </Box>
      </Box>
    );
  },
);

AchievementBadge.displayName = "AchievementBadge";
