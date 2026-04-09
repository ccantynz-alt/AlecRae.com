"use client";

import React, { forwardRef, useMemo, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Card } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export type StatsPeriod = "7d" | "30d" | "90d" | "1y";

export interface EmailStatsMetrics {
  /** Average response time in seconds. */
  avgResponseTimeSec: number | null;
  /** Average emails per day. */
  emailsPerDay: number;
  /** Day with most emails (ISO date). */
  busiestDay: string | null;
  /** Day with fewest emails (ISO date). */
  quietestDay: string | null;
  /** Current inbox zero streak in days. */
  inboxZeroStreak: number;
  /** Total sent in period. */
  totalSent: number;
  /** Total received in period. */
  totalReceived: number;
}

export interface EmailStatsCompare {
  /** Change in avg response time (negative = improvement). */
  avgResponseTimeDelta: number | null;
  /** Change in emails per day. */
  emailsPerDayDelta: number | null;
  /** Change in total sent. */
  totalSentDelta: number | null;
  /** Change in total received. */
  totalReceivedDelta: number | null;
}

export interface EmailStatsDashboardProps extends HTMLAttributes<HTMLDivElement> {
  /** Current period metrics. */
  metrics: EmailStatsMetrics;
  /** Comparison to previous period (optional). */
  compare?: EmailStatsCompare | null;
  /** Currently selected period. */
  period: StatsPeriod;
  /** Callback when period changes. */
  onPeriodChange?: (period: StatsPeriod) => void;
  /** Whether comparison mode is active. */
  compareEnabled?: boolean;
  /** Toggle comparison mode. */
  onCompareToggle?: (enabled: boolean) => void;
  /** Extra content (heatmap, hourly chart) to render inside the dashboard. */
  children?: React.ReactNode;
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "1y", label: "1 Year" },
];

function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
}

type TrendDirection = "up" | "down" | "neutral";

function getTrend(delta: number | null | undefined): TrendDirection {
  if (delta === null || delta === undefined) return "neutral";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "neutral";
}

function getTrendColor(trend: TrendDirection, invertPositive: boolean): string {
  if (trend === "neutral") return "text-content-tertiary";
  // For response time, going up is bad. For others, going up can be contextual.
  if (invertPositive) {
    return trend === "up" ? "text-status-error" : "text-status-success";
  }
  return trend === "up" ? "text-status-success" : "text-status-error";
}

function formatDelta(delta: number | null | undefined, suffix?: string): string {
  if (delta === null || delta === undefined) return "";
  const sign = delta > 0 ? "+" : "";
  const formatted = Number.isInteger(delta) ? delta.toString() : delta.toFixed(1);
  return `${sign}${formatted}${suffix ?? ""}`;
}

// ─── Metric card sub-component ──────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string | undefined;
  trend?: TrendDirection | undefined;
  trendColor?: string | undefined;
  icon: string;
}

function MetricCard({
  label,
  value,
  delta,
  trend = "neutral",
  trendColor = "text-content-tertiary",
  icon,
}: MetricCardProps): React.JSX.Element {
  const trendArrow = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "";

  return (
    <Card hoverable padding="md">
      <Box className="flex items-start justify-between mb-1">
        <Text variant="body-sm" muted className="truncate">
          {label}
        </Text>
        <Box className="text-lg" aria-hidden="true">
          {icon}
        </Box>
      </Box>
      <Text variant="display-sm" className="mb-1 tabular-nums">
        {value}
      </Text>
      {delta && (
        <Box className="flex items-center gap-1">
          <Text as="span" variant="body-sm" className={`font-medium ${trendColor}`}>
            {trendArrow} {delta}
          </Text>
          <Text variant="body-sm" muted>
            vs prev
          </Text>
        </Box>
      )}
    </Card>
  );
}

MetricCard.displayName = "MetricCard";

// ─── Main Component ─────────────────────────────────────────────────────────

export const EmailStatsDashboard = forwardRef<HTMLDivElement, EmailStatsDashboardProps>(
  function EmailStatsDashboard(
    {
      metrics,
      compare,
      period,
      onPeriodChange,
      compareEnabled = false,
      onCompareToggle,
      children,
      className = "",
      ...props
    },
    ref,
  ) {
    // Pre-compute trends
    const responseTrend = useMemo(
      () => getTrend(compare?.avgResponseTimeDelta),
      [compare?.avgResponseTimeDelta],
    );
    const emailsPerDayTrend = useMemo(
      () => getTrend(compare?.emailsPerDayDelta),
      [compare?.emailsPerDayDelta],
    );
    const sentTrend = useMemo(
      () => getTrend(compare?.totalSentDelta),
      [compare?.totalSentDelta],
    );
    const receivedTrend = useMemo(
      () => getTrend(compare?.totalReceivedDelta),
      [compare?.totalReceivedDelta],
    );

    return (
      <Box ref={ref} className={`space-y-6 ${className}`} {...props}>
        {/* Controls row */}
        <Box className="flex items-center justify-between flex-wrap gap-3">
          <Text variant="heading-md">Email Analytics</Text>

          <Box className="flex items-center gap-3">
            {/* Compare toggle */}
            {onCompareToggle && (
              <Box
                as="button"
                onClick={() => onCompareToggle(!compareEnabled)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border ${
                  compareEnabled
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-border bg-surface text-content-secondary hover:bg-surface-secondary"
                }`}
                aria-pressed={compareEnabled}
                role="switch"
              >
                Compare
              </Box>
            )}

            {/* Period selector */}
            <Box className="flex items-center gap-1" role="radiogroup" aria-label="Analytics period">
              {PERIOD_OPTIONS.map((opt) => (
                <Box
                  key={opt.value}
                  as="button"
                  role="radio"
                  aria-checked={period === opt.value}
                  onClick={() => onPeriodChange?.(opt.value)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    period === opt.value
                      ? "bg-brand-600 text-white"
                      : "bg-surface-secondary text-content-secondary hover:bg-surface-tertiary"
                  }`}
                >
                  {opt.label}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Key metrics grid */}
        <Box className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Avg Response Time"
            value={formatResponseTime(metrics.avgResponseTimeSec)}
            delta={
              compareEnabled && compare
                ? formatDelta(compare.avgResponseTimeDelta, "s")
                : undefined
            }
            trend={responseTrend}
            trendColor={getTrendColor(responseTrend, true)}
            icon={"\u23F1\uFE0F"}
          />
          <MetricCard
            label="Emails / Day"
            value={metrics.emailsPerDay.toFixed(1)}
            delta={
              compareEnabled && compare
                ? formatDelta(compare.emailsPerDayDelta)
                : undefined
            }
            trend={emailsPerDayTrend}
            trendColor={getTrendColor(emailsPerDayTrend, false)}
            icon={"\uD83D\uDCE8"}
          />
          <MetricCard
            label="Total Sent"
            value={metrics.totalSent.toLocaleString()}
            delta={
              compareEnabled && compare
                ? formatDelta(compare.totalSentDelta)
                : undefined
            }
            trend={sentTrend}
            trendColor={getTrendColor(sentTrend, false)}
            icon={"\uD83D\uDCE4"}
          />
          <MetricCard
            label="Total Received"
            value={metrics.totalReceived.toLocaleString()}
            delta={
              compareEnabled && compare
                ? formatDelta(compare.totalReceivedDelta)
                : undefined
            }
            trend={receivedTrend}
            trendColor={getTrendColor(receivedTrend, false)}
            icon={"\uD83D\uDCE5"}
          />
        </Box>

        {/* Secondary stats */}
        <Box className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Card hoverable padding="md">
            <Text variant="body-sm" muted>
              Busiest Day
            </Text>
            <Text variant="body-md" className="font-semibold mt-1">
              {formatDate(metrics.busiestDay)}
            </Text>
          </Card>
          <Card hoverable padding="md">
            <Text variant="body-sm" muted>
              Quietest Day
            </Text>
            <Text variant="body-md" className="font-semibold mt-1">
              {formatDate(metrics.quietestDay)}
            </Text>
          </Card>
          <Card hoverable padding="md">
            <Text variant="body-sm" muted>
              Inbox Zero Streak
            </Text>
            <Text variant="body-md" className="font-semibold mt-1">
              {metrics.inboxZeroStreak} {metrics.inboxZeroStreak === 1 ? "day" : "days"}
            </Text>
          </Card>
        </Box>

        {/* Child content — heatmap & hourly chart rendered here */}
        {children}
      </Box>
    );
  },
);

EmailStatsDashboard.displayName = "EmailStatsDashboard";
