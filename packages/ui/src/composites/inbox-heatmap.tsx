"use client";

import React, { forwardRef, useMemo, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Card } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export type HeatmapMode = "both" | "sent" | "received";

export interface HeatmapDayData {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Number of emails sent on this day. */
  sent: number;
  /** Number of emails received on this day. */
  received: number;
}

export interface InboxHeatmapProps extends HTMLAttributes<HTMLDivElement> {
  /** Daily email data for the heatmap grid. */
  data: HeatmapDayData[];
  /** Which metric to visualize. Default: "both". */
  mode?: HeatmapMode;
  /** Callback when user changes the mode. */
  onModeChange?: (mode: HeatmapMode) => void;
  /** Number of weeks to display (columns). Default: 52. */
  weeks?: number;
  /** Accent color class prefix. Default: "brand". */
  colorScheme?: string;
  className?: string;
}

// ─── Color scale (color-blind safe) ─────────────────────────────────────────

/**
 * Five intensity levels from transparent to full, using semantic classes.
 * We define them inline with opacity to remain color-blind safe and
 * theme-compatible. The colors work in both light and dark mode because
 * they derive from brand tokens.
 */
const INTENSITY_CLASSES = [
  "bg-surface-secondary",     // 0 emails
  "bg-brand-200",             // low
  "bg-brand-400",             // medium-low
  "bg-brand-600",             // medium-high
  "bg-brand-800",             // high
] as const;

const INTENSITY_LABELS = ["None", "Low", "Medium", "High", "Very High"] as const;

function getIntensityLevel(value: number, max: number): number {
  if (value === 0) return 0;
  if (max <= 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.50) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function getCellValue(day: HeatmapDayData, mode: HeatmapMode): number {
  switch (mode) {
    case "sent":
      return day.sent;
    case "received":
      return day.received;
    case "both":
    default:
      return day.sent + day.received;
  }
}

// ─── Day names ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ─── Month labels ───────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// ─── Tooltip state ──────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  date: string;
  sent: number;
  received: number;
}

const INITIAL_TOOLTIP: TooltipState = {
  visible: false,
  x: 0,
  y: 0,
  date: "",
  sent: 0,
  received: 0,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dayName = d.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${dayName} ${monthDay}`;
}

/**
 * Build a lookup map of "YYYY-MM-DD" → HeatmapDayData.
 */
function buildDataMap(data: HeatmapDayData[]): Map<string, HeatmapDayData> {
  const map = new Map<string, HeatmapDayData>();
  for (const entry of data) {
    map.set(entry.date, entry);
  }
  return map;
}

/**
 * Generate the grid: array of weeks, each week is an array of 7 days.
 * Most recent data is on the right.
 */
function buildGrid(
  weeks: number,
  dataMap: Map<string, HeatmapDayData>,
): { date: string; data: HeatmapDayData }[][] {
  const grid: { date: string; data: HeatmapDayData }[][] = [];
  const today = new Date();

  // Align end to Saturday (end of ISO week row where Mon=0)
  const todayDow = (today.getDay() + 6) % 7; // Mon=0..Sun=6
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + (6 - todayDow));

  for (let w = weeks - 1; w >= 0; w--) {
    const week: { date: string; data: HeatmapDayData }[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(endDate);
      cellDate.setDate(endDate.getDate() - w * 7 - (6 - d));
      const iso = cellDate.toISOString().slice(0, 10);
      const existing = dataMap.get(iso);
      const isFuture = cellDate > today;
      // Mark future days with -1 to skip rendering
      const data = isFuture
        ? { date: iso, sent: -1, received: -1 }
        : (existing ?? { date: iso, sent: 0, received: 0 });
      week.push({ date: iso, data });
    }
    grid.push(week);
  }

  return grid;
}

/**
 * Derive month labels positioned above the correct column index.
 */
function getMonthLabels(
  grid: { date: string; data: HeatmapDayData }[][],
): { label: string; colIndex: number }[] {
  const labels: { label: string; colIndex: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < grid.length; w++) {
    const firstDay = grid[w]?.[0];
    if (!firstDay) continue;
    const month = new Date(firstDay.date + "T00:00:00").getMonth();
    if (month !== lastMonth) {
      labels.push({ label: MONTH_NAMES[month] ?? "", colIndex: w });
      lastMonth = month;
    }
  }
  return labels;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const InboxHeatmap = forwardRef<HTMLDivElement, InboxHeatmapProps>(
  function InboxHeatmap(
    {
      data,
      mode = "both",
      onModeChange,
      weeks = 52,
      className = "",
      ...props
    },
    ref,
  ) {
    const [tooltip, setTooltip] = useState<TooltipState>(INITIAL_TOOLTIP);

    const dataMap = useMemo(() => buildDataMap(data), [data]);
    const grid = useMemo(() => buildGrid(weeks, dataMap), [weeks, dataMap]);
    const monthLabels = useMemo(() => getMonthLabels(grid), [grid]);

    // Compute max value for intensity scaling
    const maxValue = useMemo(() => {
      let max = 0;
      for (const entry of data) {
        const v = getCellValue(entry, mode);
        if (v > max) max = v;
      }
      return max;
    }, [data, mode]);

    const handleCellHover = useCallback(
      (e: React.MouseEvent, day: HeatmapDayData): void => {
        if (day.sent === -1) return; // future day
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const parentRect = (e.currentTarget as HTMLElement).closest("[data-heatmap-container]")?.getBoundingClientRect();
        setTooltip({
          visible: true,
          x: rect.left - (parentRect?.left ?? 0) + rect.width / 2,
          y: rect.top - (parentRect?.top ?? 0) - 8,
          date: day.date,
          sent: day.sent,
          received: day.received,
        });
      },
      [],
    );

    const handleCellLeave = useCallback((): void => {
      setTooltip(INITIAL_TOOLTIP);
    }, []);

    // Cell size
    const cellSize = 12;
    const cellGap = 2;
    const labelWidth = 28;
    const topPadding = 20;
    const svgWidth = labelWidth + grid.length * (cellSize + cellGap);
    const svgHeight = topPadding + 7 * (cellSize + cellGap);

    return (
      <Card ref={ref} className={className} padding="lg" {...props}>
        {/* Header */}
        <Box className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <Text variant="heading-sm">Email Activity</Text>

          {/* Mode selector */}
          <Box className="flex items-center gap-1" role="radiogroup" aria-label="Heatmap data mode">
            {(["both", "sent", "received"] as const).map((m) => (
              <Box
                key={m}
                as="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => onModeChange?.(m)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  mode === m
                    ? "bg-brand-600 text-white"
                    : "bg-surface-secondary text-content-secondary hover:bg-surface-tertiary"
                }`}
              >
                {m === "both" ? "All" : m.charAt(0).toUpperCase() + m.slice(1)}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Heatmap grid (pure SVG) */}
        <Box
          className="overflow-x-auto"
          data-heatmap-container=""
          style={{ position: "relative" }}
        >
          <Box
            as="svg"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full"
            style={{ minWidth: Math.min(svgWidth, 700) }}
            role="img"
            aria-label={`Email activity heatmap showing ${weeks} weeks of data`}
          >
            <Box as="title">
              Email activity heatmap showing {weeks} weeks of data
            </Box>

            {/* Month labels across the top */}
            {monthLabels.map((ml) => (
              <Box
                as="text"
                key={`month-${ml.colIndex}`}
                x={labelWidth + ml.colIndex * (cellSize + cellGap)}
                y={12}
                className="fill-content-secondary"
                style={{ fontSize: 9, fontFamily: "inherit" }}
              >
                {ml.label}
              </Box>
            ))}

            {/* Day-of-week labels */}
            {DAY_LABELS.map((label, i) => {
              // Only show Mon, Wed, Fri to save space
              if (i % 2 === 1) return null;
              return (
                <Box
                  as="text"
                  key={`day-${label}`}
                  x={0}
                  y={topPadding + i * (cellSize + cellGap) + cellSize - 2}
                  className="fill-content-secondary"
                  style={{ fontSize: 9, fontFamily: "inherit" }}
                >
                  {label}
                </Box>
              );
            })}

            {/* Grid cells */}
            {grid.map((week, wIdx) =>
              week.map((cell, dIdx) => {
                const isFuture = cell.data.sent === -1;
                const value = isFuture ? 0 : getCellValue(cell.data, mode);
                const level = isFuture ? -1 : getIntensityLevel(value, maxValue);
                const fillClass = level < 0 ? "fill-transparent" : "";

                return (
                  <Box
                    as="rect"
                    key={`${wIdx}-${dIdx}`}
                    x={labelWidth + wIdx * (cellSize + cellGap)}
                    y={topPadding + dIdx * (cellSize + cellGap)}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    className={`${fillClass} transition-colors duration-150`}
                    style={
                      level >= 0
                        ? {
                            fill: level === 0
                              ? "var(--color-surface-secondary, #ebedf0)"
                              : level === 1
                                ? "var(--color-brand-200, #9be9a8)"
                                : level === 2
                                  ? "var(--color-brand-400, #40c463)"
                                  : level === 3
                                    ? "var(--color-brand-600, #30a14e)"
                                    : "var(--color-brand-800, #216e39)",
                          }
                        : undefined
                    }
                    onMouseEnter={(e: React.MouseEvent) => handleCellHover(e, cell.data)}
                    onMouseLeave={handleCellLeave}
                    aria-label={
                      isFuture
                        ? undefined
                        : `${formatDateLabel(cell.date)}: ${cell.data.received} received, ${cell.data.sent} sent`
                    }
                  />
                );
              }),
            )}
          </Box>

          {/* Tooltip */}
          {tooltip.visible && (
            <Box
              className="absolute z-50 px-2.5 py-1.5 rounded-md bg-surface-inverted text-content-inverted text-xs shadow-lg pointer-events-none whitespace-nowrap"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(-50%, -100%)",
              }}
              role="tooltip"
            >
              <Text variant="caption" className="font-semibold text-content-inverted block">
                {formatDateLabel(tooltip.date)}
              </Text>
              <Text variant="caption" className="text-content-inverted/80 block">
                {tooltip.received} received, {tooltip.sent} sent
              </Text>
            </Box>
          )}
        </Box>

        {/* Legend */}
        <Box className="flex items-center gap-2 mt-3 justify-end" aria-label="Heatmap intensity legend">
          <Text variant="caption" muted>
            Less
          </Text>
          {INTENSITY_CLASSES.map((cls, i) => (
            <Box
              key={i}
              className={`w-3 h-3 rounded-sm ${cls}`}
              title={INTENSITY_LABELS[i]}
              aria-label={INTENSITY_LABELS[i]}
            />
          ))}
          <Text variant="caption" muted>
            More
          </Text>
        </Box>
      </Card>
    );
  },
);

InboxHeatmap.displayName = "InboxHeatmap";
