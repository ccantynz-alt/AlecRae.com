"use client";

/**
 * Dependency-free hour × day-of-week heatmap for send-time analytics.
 *
 * Renders a 7-row (Sun→Sat) × 24-column (0h→23h) Tailwind grid where each cell's
 * background intensity is scaled to its value against the grid's max. No charting
 * library, no new deps — plain grid cells, like InboxHeatmapView.
 */

import type { ReactNode } from "react";
import { Box, Text } from "@alecrae/ui";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** One value keyed by day-of-week (0–6) and hour (0–23). */
export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  value: number;
}

interface SchedulingHeatmapProps {
  cells: readonly HeatmapCell[];
  /** Short unit label shown in the tooltip, e.g. "opens". */
  unit: string;
  /** Accessible label for the whole grid. */
  ariaLabel: string;
}

/** Format an hour (0–23) as a compact 12-hour clock label, e.g. 0 → "12a", 14 → "2p". */
function hourLabel(hour: number): string {
  const period = hour < 12 ? "a" : "p";
  const base = hour % 12 === 0 ? 12 : hour % 12;
  return `${base}${period}`;
}

/** Map a 0..1 intensity onto one of five Tailwind background steps. */
function intensityClass(intensity: number): string {
  if (intensity <= 0) return "bg-surface-raised";
  if (intensity < 0.25) return "bg-brand-100";
  if (intensity < 0.5) return "bg-brand-300";
  if (intensity < 0.75) return "bg-brand-500";
  return "bg-brand-700";
}

export function SchedulingHeatmap({
  cells,
  unit,
  ariaLabel,
}: SchedulingHeatmapProps): ReactNode {
  // Build a lookup so missing (day, hour) pairs render as empty (value 0).
  const lookup = new Map<string, number>();
  let max = 0;
  for (const cell of cells) {
    lookup.set(`${cell.dayOfWeek}-${cell.hour}`, cell.value);
    if (cell.value > max) max = cell.value;
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <Box className="overflow-x-auto" role="group" aria-label={ariaLabel}>
      <Box className="inline-block min-w-full">
        {/* Hour axis header */}
        <Box className="flex items-end gap-1 pl-10 mb-1">
          {hours.map((h) => (
            <Box
              key={h}
              className="w-5 text-center flex-shrink-0"
              aria-hidden="true"
            >
              {h % 3 === 0 ? (
                <Text variant="caption" className="text-content-subtle text-[10px]">
                  {hourLabel(h)}
                </Text>
              ) : null}
            </Box>
          ))}
        </Box>

        {/* One row per weekday */}
        {DAY_LABELS.map((dayLabel, day) => (
          <Box key={dayLabel} className="flex items-center gap-1 mb-1">
            <Box className="w-9 flex-shrink-0 pr-1 text-right" aria-hidden="true">
              <Text variant="caption" className="text-content-subtle text-[11px]">
                {dayLabel}
              </Text>
            </Box>
            {hours.map((h) => {
              const value = lookup.get(`${day}-${h}`) ?? 0;
              const intensity = max > 0 ? value / max : 0;
              return (
                <Box
                  key={h}
                  className={`w-5 h-5 flex-shrink-0 rounded-sm border border-border ${intensityClass(
                    intensity,
                  )}`}
                  title={`${dayLabel} ${hourLabel(h)} — ${value.toLocaleString()} ${unit}`}
                  aria-label={`${dayLabel} ${hourLabel(h)}: ${value.toLocaleString()} ${unit}`}
                />
              );
            })}
          </Box>
        ))}

        {/* Legend */}
        <Box className="flex items-center gap-2 pl-10 mt-3">
          <Text variant="caption" className="text-content-subtle text-[11px]">
            Less
          </Text>
          {["bg-surface-raised", "bg-brand-100", "bg-brand-300", "bg-brand-500", "bg-brand-700"].map(
            (cls) => (
              <Box
                key={cls}
                className={`w-4 h-4 rounded-sm border border-border ${cls}`}
                aria-hidden="true"
              />
            ),
          )}
          <Text variant="caption" className="text-content-subtle text-[11px]">
            More
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
SchedulingHeatmap.displayName = "SchedulingHeatmap";
