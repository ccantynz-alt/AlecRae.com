"use client";

import React, { forwardRef, useState, useMemo, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Card } from "../primitives/card";
import {
  AchievementBadge,
  type AchievementBadgeData,
} from "./achievement-badge";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AchievementFilter = "all" | "unlocked" | "locked" | string;

export interface AchievementPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** All achievements to display. */
  achievements: AchievementBadgeData[];
  /** Number of unlocked achievements. */
  unlockedCount: number;
  /** Total number of achievements. */
  totalCount: number;
  /** Callback when an achievement is clicked. */
  onAchievementClick?: (achievement: AchievementBadgeData) => void;
  className?: string;
}

// ─── Filter options ────────────────────────────────────────────────────────

interface FilterOption {
  key: AchievementFilter;
  label: string;
}

const FILTER_OPTIONS: readonly FilterOption[] = [
  { key: "all", label: "All" },
  { key: "unlocked", label: "Unlocked" },
  { key: "locked", label: "Locked" },
  { key: "streak", label: "Streaks" },
  { key: "action", label: "Actions" },
  { key: "milestone", label: "Milestones" },
] as const;

// ─── Component ──────────────────────────────────────────────────────────────

export const AchievementPanel = forwardRef<HTMLDivElement, AchievementPanelProps>(
  function AchievementPanel(
    {
      achievements,
      unlockedCount,
      totalCount,
      onAchievementClick,
      className = "",
      ...props
    },
    ref,
  ) {
    const [filter, setFilter] = useState<AchievementFilter>("all");

    const filteredAchievements = useMemo(() => {
      switch (filter) {
        case "all":
          return achievements;
        case "unlocked":
          return achievements.filter((a) => a.unlocked);
        case "locked":
          return achievements.filter((a) => !a.unlocked);
        default:
          // Category filter (streak, action, milestone, etc.)
          return achievements.filter((a) => a.category === filter);
      }
    }, [achievements, filter]);

    const progressPercent =
      totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    return (
      <Card
        ref={ref}
        className={`${className}`}
        padding="lg"
        {...props}
      >
        {/* Header */}
        <Box className="flex items-center justify-between mb-4">
          <Box>
            <Text variant="heading-md">Achievements</Text>
            <Text variant="body-sm" muted>
              {unlockedCount} of {totalCount} unlocked
            </Text>
          </Box>
          <Box className="text-right">
            <Text variant="display-sm" className="text-brand-600 tabular-nums">
              {progressPercent}%
            </Text>
          </Box>
        </Box>

        {/* Overall progress bar */}
        <Box className="mb-6">
          <Box
            className="w-full h-2 rounded-full bg-surface-tertiary overflow-hidden"
            role="progressbar"
            aria-valuenow={unlockedCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
            aria-label="Overall achievement progress"
          >
            <Box
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </Box>
        </Box>

        {/* Filters */}
        <Box
          className="flex flex-wrap gap-2 mb-4"
          role="tablist"
          aria-label="Filter achievements"
        >
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.key}
              variant={filter === option.key ? "primary" : "ghost"}
              size="sm"
              role="tab"
              aria-selected={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </Box>

        {/* Achievement list */}
        <Box
          className="flex flex-col gap-2"
          role="list"
          aria-label="Achievement list"
        >
          {filteredAchievements.length === 0 ? (
            <Box className="py-8 text-center">
              <Text variant="body-md" muted>
                No achievements match this filter.
              </Text>
            </Box>
          ) : (
            filteredAchievements.map((achievement) => (
              <Box
                key={achievement.key}
                className={onAchievementClick ? "cursor-pointer" : ""}
                onClick={
                  onAchievementClick
                    ? () => onAchievementClick(achievement)
                    : undefined
                }
              >
                <AchievementBadge
                  achievement={achievement}
                  size="md"
                  showProgress
                />
              </Box>
            ))
          )}
        </Box>
      </Card>
    );
  },
);

AchievementPanel.displayName = "AchievementPanel";
