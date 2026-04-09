"use client";

/**
 * InboxHeatmapView — Full-page component for A3 (Inbox Heatmap).
 *
 * Fetches heatmap, hourly, and stats data from the API, then renders the
 * EmailStatsDashboard with InboxHeatmap and HourlyActivityChart.
 *
 * Usage:
 *   <InboxHeatmapView />
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  EmailStatsDashboard,
  InboxHeatmap,
  HourlyActivityChart,
  type StatsPeriod,
  type HeatmapMode,
  type HeatmapDayData,
  type HourlyBucket,
  type EmailStatsMetrics,
  type EmailStatsCompare,
  Box,
  Text,
} from "@emailed/ui";
import {
  heatmapApi,
  type HeatmapPeriod,
} from "../lib/api";

// ─── Loading skeleton ───────────────────────────────────────────────────────

function SkeletonBlock({ className = "" }: { className?: string }): React.JSX.Element {
  return (
    <Box
      className={`animate-pulse bg-surface-secondary rounded-lg ${className}`}
      aria-busy="true"
      aria-label="Loading"
    />
  );
}

SkeletonBlock.displayName = "SkeletonBlock";

function DashboardSkeleton(): React.JSX.Element {
  return (
    <Box className="space-y-6">
      {/* Header skeleton */}
      <Box className="flex items-center justify-between">
        <SkeletonBlock className="h-7 w-40" />
        <Box className="flex gap-2">
          <SkeletonBlock className="h-8 w-16" />
          <SkeletonBlock className="h-8 w-16" />
          <SkeletonBlock className="h-8 w-16" />
          <SkeletonBlock className="h-8 w-16" />
        </Box>
      </Box>

      {/* Metric cards skeleton */}
      <Box className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </Box>

      {/* Heatmap skeleton */}
      <SkeletonBlock className="h-40" />

      {/* Hourly chart skeleton */}
      <SkeletonBlock className="h-56" />
    </Box>
  );
}

DashboardSkeleton.displayName = "DashboardSkeleton";

// ─── State ──────────────────────────────────────────────────────────────────

interface DashboardState {
  loading: boolean;
  error: string | null;
  heatmapData: HeatmapDayData[];
  hourlyData: HourlyBucket[];
  peakHours: number[];
  bestSendHours: number[];
  metrics: EmailStatsMetrics;
  compare: EmailStatsCompare | null;
}

const DEFAULT_METRICS: EmailStatsMetrics = {
  avgResponseTimeSec: null,
  emailsPerDay: 0,
  busiestDay: null,
  quietestDay: null,
  inboxZeroStreak: 0,
  totalSent: 0,
  totalReceived: 0,
};

const INITIAL_STATE: DashboardState = {
  loading: true,
  error: null,
  heatmapData: [],
  hourlyData: [],
  peakHours: [],
  bestSendHours: [],
  metrics: DEFAULT_METRICS,
  compare: null,
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface InboxHeatmapViewProps {
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InboxHeatmapView({ className = "" }: InboxHeatmapViewProps): React.JSX.Element {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("both");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (p: HeatmapPeriod, compare: boolean): Promise<void> => {
      // Abort previous in-flight requests
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Fetch all three endpoints in parallel
        const [heatmapRes, hourlyRes, statsRes] = await Promise.all([
          heatmapApi.heatmap({ period: p }),
          heatmapApi.hourly({ period: p }),
          heatmapApi.stats({ period: p, compare }),
        ]);

        // Guard against aborted request
        if (controller.signal.aborted) return;

        setState({
          loading: false,
          error: null,
          heatmapData: heatmapRes.data.map((d) => ({
            date: d.date,
            sent: d.sent,
            received: d.received,
          })),
          hourlyData: hourlyRes.data.map((b) => ({
            hour: b.hour,
            sent: b.sent,
            received: b.received,
          })),
          peakHours: hourlyRes.meta.peakHours,
          bestSendHours: hourlyRes.meta.bestSendHours,
          metrics: statsRes.data.metrics,
          compare: statsRes.data.compare,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to load analytics data";
        setState((prev) => ({ ...prev, loading: false, error: message }));
      }
    },
    [],
  );

  // Fetch on mount and when period/compare changes
  useEffect(() => {
    void fetchData(period, compareEnabled);

    return () => {
      abortRef.current?.abort();
    };
  }, [period, compareEnabled, fetchData]);

  const handlePeriodChange = useCallback((p: StatsPeriod): void => {
    setPeriod(p);
  }, []);

  const handleCompareToggle = useCallback((enabled: boolean): void => {
    setCompareEnabled(enabled);
  }, []);

  const handleModeChange = useCallback((m: HeatmapMode): void => {
    setHeatmapMode(m);
  }, []);

  // Loading state
  if (state.loading && state.heatmapData.length === 0) {
    return (
      <Box className={className}>
        <DashboardSkeleton />
      </Box>
    );
  }

  // Error state
  if (state.error && state.heatmapData.length === 0) {
    return (
      <Box className={`text-center py-12 ${className}`}>
        <Text variant="heading-sm" className="mb-2 text-status-error">
          Unable to load analytics
        </Text>
        <Text variant="body-sm" muted>
          {state.error}
        </Text>
        <Box
          as="button"
          onClick={() => void fetchData(period, compareEnabled)}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors cursor-pointer"
        >
          Retry
        </Box>
      </Box>
    );
  }

  // Compute weeks for heatmap based on period
  const weeksMap: Record<StatsPeriod, number> = {
    "7d": 2,
    "30d": 5,
    "90d": 13,
    "1y": 52,
  };
  const heatmapWeeks = weeksMap[period];

  return (
    <Box className={className}>
      <EmailStatsDashboard
        metrics={state.metrics}
        compare={compareEnabled ? state.compare : null}
        period={period}
        onPeriodChange={handlePeriodChange}
        compareEnabled={compareEnabled}
        onCompareToggle={handleCompareToggle}
      >
        {/* Heatmap */}
        <InboxHeatmap
          data={state.heatmapData}
          mode={heatmapMode}
          onModeChange={handleModeChange}
          weeks={heatmapWeeks}
          className={state.loading ? "opacity-60 pointer-events-none" : ""}
        />

        {/* Hourly activity */}
        <HourlyActivityChart
          data={state.hourlyData}
          peakHours={state.peakHours}
          bestSendHours={state.bestSendHours}
          className={state.loading ? "opacity-60 pointer-events-none" : ""}
        />
      </EmailStatsDashboard>
    </Box>
  );
}

InboxHeatmapView.displayName = "InboxHeatmapView";
