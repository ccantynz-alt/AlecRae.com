"use client";

import React, { forwardRef, useMemo, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Card } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DailyStatEntry {
  date: string;
  emailsProcessed: number;
  emailsSent: number;
  emailsReceived: number;
  reachedZero: boolean;
  focusSessions: number;
  aiComposeUses: number;
}

export interface WeeklyStatsCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Period stats data. */
  period: {
    days: number;
    emailsProcessed: number;
    emailsSent: number;
    emailsReceived: number;
    focusSessions: number;
    aiComposeUses: number;
    unsubscribes: number;
    avgResponseTimeSec: number | null;
    mostProductiveHour: number | null;
  };
  /** Daily breakdown for the mini chart. */
  dailyStats?: DailyStatEntry[];
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return "--";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatHour(hour: number | null): string {
  if (hour === null) return "--";
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

// ─── Stat item ────────────────────────────────────────────────────────────────

interface StatItemProps {
  label: string;
  value: string | number;
  icon: string;
}

function StatItem({ label, value, icon }: StatItemProps): React.JSX.Element {
  return (
    <Box className="flex items-center gap-2 p-2 rounded-md bg-surface-secondary">
      <Box className="text-lg" aria-hidden="true">
        {icon}
      </Box>
      <Box className="flex-1 min-w-0">
        <Text variant="body-sm" muted className="truncate">
          {label}
        </Text>
        <Text variant="body-md" className="font-semibold tabular-nums">
          {value}
        </Text>
      </Box>
    </Box>
  );
}

StatItem.displayName = "StatItem";

// ─── Mini bar chart ──────────────────────────────────────────────────────────

interface MiniBarChartProps {
  data: DailyStatEntry[];
}

function MiniBarChart({ data }: MiniBarChartProps): React.JSX.Element {
  const maxProcessed = useMemo(
    () => Math.max(1, ...data.map((d) => d.emailsProcessed)),
    [data],
  );

  return (
    <Box
      className="flex items-end gap-1 h-16"
      role="img"
      aria-label="Daily email processing chart"
    >
      {data.map((day) => {
        const height = Math.max(4, (day.emailsProcessed / maxProcessed) * 100);
        const dayLabel = new Date(day.date).toLocaleDateString(undefined, {
          weekday: "short",
        });

        return (
          <Box key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
            <Box
              className={`w-full rounded-t-sm transition-all duration-200 ${
                day.reachedZero
                  ? "bg-status-success"
                  : "bg-brand-600/60"
              }`}
              style={{ height: `${height}%` }}
              title={`${dayLabel}: ${day.emailsProcessed} emails${day.reachedZero ? " (inbox zero)" : ""}`}
            />
            <Text variant="caption" className="text-[10px] tabular-nums">
              {dayLabel.charAt(0)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

MiniBarChart.displayName = "MiniBarChart";

// ─── Component ──────────────────────────────────────────────────────────────

export const WeeklyStatsCard = forwardRef<HTMLDivElement, WeeklyStatsCardProps>(
  function WeeklyStatsCard(
    { period, dailyStats = [], className = "", ...props },
    ref,
  ) {
    const zeroDays = dailyStats.filter((d) => d.reachedZero).length;
    const periodLabel = period.days <= 7 ? "This Week" : period.days <= 30 ? "This Month" : `Last ${period.days} Days`;

    return (
      <Card
        ref={ref}
        className={className}
        padding="lg"
        {...props}
      >
        <Box className="flex items-center justify-between mb-4">
          <Text variant="heading-md">{periodLabel}</Text>
          {dailyStats.length > 0 && (
            <Text variant="body-sm" muted>
              {zeroDays}/{dailyStats.length} days at zero
            </Text>
          )}
        </Box>

        {/* Mini chart */}
        {dailyStats.length > 0 && (
          <Box className="mb-4">
            <MiniBarChart data={dailyStats} />
          </Box>
        )}

        {/* Stats grid */}
        <Box className="grid grid-cols-2 gap-2">
          <StatItem
            label="Processed"
            value={period.emailsProcessed.toLocaleString()}
            icon={"\uD83D\uDCE7"}
          />
          <StatItem
            label="Sent"
            value={period.emailsSent.toLocaleString()}
            icon={"\uD83D\uDCE4"}
          />
          <StatItem
            label="Avg Response"
            value={formatResponseTime(period.avgResponseTimeSec)}
            icon={"\u23F1\uFE0F"}
          />
          <StatItem
            label="Peak Hour"
            value={formatHour(period.mostProductiveHour)}
            icon={"\u2615"}
          />
          <StatItem
            label="Focus Sessions"
            value={period.focusSessions}
            icon={"\uD83C\uDFAF"}
          />
          <StatItem
            label="AI Composes"
            value={period.aiComposeUses}
            icon={"\u2728"}
          />
        </Box>
      </Card>
    );
  },
);

WeeklyStatsCard.displayName = "WeeklyStatsCard";
