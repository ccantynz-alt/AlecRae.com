"use client";

/**
 * /admin/flywheel — internal RPM dashboard.
 *
 * Polls /v1/flywheel/global for the cross-account snapshot. Renders:
 *  - Composite "Wheel RPM" headline
 *  - One tile per metric with target gap + 12-week sparkline
 *  - "No data yet" empty state pre-launch (the wheel is built but not spun)
 *
 * Read-only. Rendering only — all aggregation happens server-side.
 */

import { useCallback, useEffect, useState } from "react";
import { Box, Text } from "@alecrae/ui";
import type { FlywheelMetric, FlywheelSnapshot } from "@alecrae/flywheel";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const REFRESH_MS = 60_000;

interface LoadState {
  readonly status: "loading" | "ready" | "offline" | "error";
  readonly snapshot: FlywheelSnapshot | null;
  readonly error: string | null;
}

const INITIAL: LoadState = { status: "loading", snapshot: null, error: null };

function formatRate(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatEditDistance(v: number): string {
  return v.toFixed(3);
}

function formatMetric(m: FlywheelMetric): string {
  if (m.unit === "rate") return formatRate(m.value);
  if (m.unit === "edit_distance") return formatEditDistance(m.value);
  if (m.unit === "ms") return `${Math.round(m.value)}ms`;
  return Math.round(m.value).toLocaleString();
}

function formatTarget(m: FlywheelMetric): string {
  const t =
    m.unit === "rate"
      ? formatRate(m.target)
      : m.unit === "edit_distance"
        ? formatEditDistance(m.target)
        : m.unit === "ms"
          ? `${Math.round(m.target)}ms`
          : Math.round(m.target).toString();
  return m.direction === "minimize" ? `≤ ${t}` : `≥ ${t}`;
}

function trendStrokeFor(direction: "maximize" | "minimize"): string {
  return direction === "minimize" ? "#dc2626" : "#16a34a";
}

interface SparklineProps {
  readonly points: readonly { value: number; sampleSize: number }[];
  readonly stroke: string;
  readonly normalize: number;
}

function Sparkline({ points, stroke, normalize }: SparklineProps): React.ReactElement {
  const width = 160;
  const height = 40;
  const pad = 2;
  if (points.length === 0) {
    return (
      <Box className="text-content-tertiary text-xs italic">No data yet</Box>
    );
  }
  const xs = (i: number): number =>
    pad + (i * (width - 2 * pad)) / Math.max(1, points.length - 1);
  const ys = (v: number): number => {
    const clamped = Math.max(0, Math.min(normalize, v));
    return height - pad - (clamped * (height - 2 * pad)) / Math.max(0.0001, normalize);
  };
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(p.value).toFixed(1)}`)
    .join(" ");
  return (
    <Box
      as="svg"
      className="block"
      width={width}
      height={height}
      role="img"
      aria-label="12 week trend"
    >
      <Box as="path" d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
    </Box>
  );
}

function MetricTile({ metric }: { metric: FlywheelMetric }): React.ReactElement {
  const samples = metric.trend.reduce((s, p) => s + p.sampleSize, 0);
  const onTarget =
    metric.direction === "maximize"
      ? metric.value >= metric.target
      : metric.value <= metric.target;
  const stroke = trendStrokeFor(metric.direction);
  const normalize =
    metric.unit === "rate" ? 1 : metric.unit === "edit_distance" ? 0.5 : Math.max(...metric.trend.map((p) => p.value), 1);

  return (
    <Box className="rounded-xl border border-border bg-surface-secondary p-5 flex flex-col gap-3">
      <Box className="flex items-start justify-between gap-3">
        <Box>
          <Text variant="body-sm" className="text-content-secondary">
            {metric.label}
          </Text>
          <Box className="mt-1 flex items-baseline gap-2">
            <Text variant="heading-md" className="font-bold text-content">
              {samples === 0 ? "—" : formatMetric(metric)}
            </Text>
            <Text variant="caption" className="text-content-tertiary">
              target {formatTarget(metric)}
            </Text>
          </Box>
        </Box>
        <Box
          className={`rounded-full px-2 py-1 text-xs font-medium border ${
            samples === 0
              ? "bg-slate-500/10 text-slate-500 border-slate-500/30"
              : onTarget
                ? "bg-green-500/10 text-green-600 border-green-500/30"
                : "bg-amber-500/10 text-amber-600 border-amber-500/30"
          }`}
        >
          {samples === 0 ? "no data" : onTarget ? "on target" : "below target"}
        </Box>
      </Box>
      <Sparkline points={metric.trend.map((p) => ({ value: p.value, sampleSize: p.sampleSize }))} stroke={stroke} normalize={normalize} />
      <Text variant="caption" className="text-content-tertiary">
        {samples.toLocaleString()} samples · 12 weeks
      </Text>
    </Box>
  );
}

export default function FlywheelPage(): React.ReactElement {
  const [state, setState] = useState<LoadState>(INITIAL);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/v1/flywheel/global`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 503 || res.status === 0) {
          setState({ status: "offline", snapshot: null, error: null });
          return;
        }
        throw new Error(`API ${res.status}`);
      }
      const snapshot = (await res.json()) as FlywheelSnapshot;
      setState({ status: "ready", snapshot, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Treat fetch failure (API not deployed yet) as offline, not error.
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setState({ status: "offline", snapshot: null, error: null });
        return;
      }
      setState({ status: "error", snapshot: null, error: msg });
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const rpmPct = state.snapshot ? Math.round(state.snapshot.rpm * 100) : 0;

  return (
    <Box className="min-h-screen bg-surface p-6 sm:p-10">
      <Box className="max-w-6xl mx-auto flex flex-col gap-8">
        <Box>
          <Text variant="heading-lg" className="text-content font-bold">
            Flywheel
          </Text>
          <Text variant="body-sm" className="text-content-secondary mt-1">
            Composite RPM + per-metric trend over the last 12 weeks. Higher RPM = the AI moat is compounding faster than the competition can copy it.
          </Text>
        </Box>

        {/* RPM headline */}
        <Box className="rounded-2xl border border-border bg-surface-secondary p-8 flex flex-col gap-4">
          <Text variant="caption" className="text-content-tertiary uppercase tracking-wide">
            Wheel RPM
          </Text>
          <Box className="flex items-baseline gap-3">
            <Text variant="heading-lg" className="text-content font-bold text-6xl">
              {state.status === "ready" ? `${rpmPct}` : "—"}
            </Text>
            <Text variant="body-sm" className="text-content-secondary">
              / 100
            </Text>
          </Box>
          <Box className="rounded-full bg-surface h-2 overflow-hidden">
            <Box
              className="h-full bg-gradient-to-r from-amber-400 to-green-500"
              style={{ width: `${rpmPct}%`, transition: "width 0.6s ease-out" }}
            />
          </Box>
          <Text variant="caption" className="text-content-tertiary">
            {state.status === "ready" && state.snapshot
              ? `${state.snapshot.totalSignals.toLocaleString()} signals across ${state.snapshot.metrics.length} metrics · last refreshed ${new Date(state.snapshot.generatedAtIso).toLocaleTimeString()}`
              : state.status === "offline"
                ? "API offline — wheel is wired but not yet spinning. Provision Neon + deploy the API to start collecting signals."
                : state.status === "error"
                  ? `Error: ${state.error}`
                  : "Loading…"}
          </Text>
        </Box>

        {/* Metric tiles */}
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.snapshot
            ? state.snapshot.metrics.map((m) => <MetricTile key={m.key} metric={m} />)
            : Array.from({ length: 8 }).map((_, i) => (
                <Box
                  key={i}
                  className="rounded-xl border border-border bg-surface-secondary p-5 h-40 animate-pulse opacity-60"
                />
              ))}
        </Box>

        {/* Reading the wheel */}
        <Box className="rounded-xl border border-border bg-surface-secondary p-6">
          <Text variant="body-md" className="text-content font-semibold mb-2">
            How to read this page
          </Text>
          <Box as="ul" className="text-content-secondary text-sm space-y-1.5 list-disc pl-5">
            <Box as="li">RPM is a sample-weighted composite of every metric's score-against-target. 100 means every metric is at or past target.</Box>
            <Box as="li">Green tiles = at or past target. Amber tiles = below target but data is flowing.</Box>
            <Box as="li">Sparklines show 12 weeks of weekly aggregates — sample size is reported below each tile.</Box>
            <Box as="li">"No data" is the expected state pre-launch. As soon as users start composing, triaging, and replying, the wheel begins spinning automatically.</Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
