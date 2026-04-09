"use client";

import React, { forwardRef, useMemo, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Card } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HourlyBucket {
  /** Hour of day (0-23). */
  hour: number;
  /** Average emails sent during this hour. */
  sent: number;
  /** Average emails received during this hour. */
  received: number;
}

export interface HourlyActivityChartProps extends HTMLAttributes<HTMLDivElement> {
  /** Hourly email breakdown (24 buckets). */
  data: HourlyBucket[];
  /** Recommended best send-time hours (highlighted). */
  bestSendHours?: number[];
  /** Peak productivity hours (highlighted differently). */
  peakHours?: number[];
  /** Chart bar height in pixels. Default: 160. */
  barHeight?: number;
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function formatHourLong(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return "12:00 PM";
  return `${hour - 12}:00 PM`;
}

// ─── Tooltip state ──────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  hour: number;
  sent: number;
  received: number;
}

const INITIAL_TOOLTIP: TooltipState = {
  visible: false,
  x: 0,
  y: 0,
  hour: 0,
  sent: 0,
  received: 0,
};

// ─── Component ──────────────────────────────────────────────────────────────

export const HourlyActivityChart = forwardRef<HTMLDivElement, HourlyActivityChartProps>(
  function HourlyActivityChart(
    {
      data,
      bestSendHours = [],
      peakHours = [],
      barHeight = 160,
      className = "",
      ...props
    },
    ref,
  ) {
    const [tooltip, setTooltip] = useState<TooltipState>(INITIAL_TOOLTIP);

    // Normalize to 24 buckets
    const normalizedData = useMemo((): HourlyBucket[] => {
      const bucketMap = new Map<number, HourlyBucket>();
      for (const b of data) {
        bucketMap.set(b.hour, b);
      }
      const result: HourlyBucket[] = [];
      for (let h = 0; h < 24; h++) {
        result.push(bucketMap.get(h) ?? { hour: h, sent: 0, received: 0 });
      }
      return result;
    }, [data]);

    const maxValue = useMemo(() => {
      let max = 0;
      for (const b of normalizedData) {
        const total = b.sent + b.received;
        if (total > max) max = total;
      }
      return Math.max(max, 1);
    }, [normalizedData]);

    const bestSendSet = useMemo(() => new Set(bestSendHours), [bestSendHours]);
    const peakSet = useMemo(() => new Set(peakHours), [peakHours]);

    const handleBarHover = useCallback(
      (e: React.MouseEvent, bucket: HourlyBucket): void => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const parentRect = (e.currentTarget as HTMLElement)
          .closest("[data-hourly-container]")
          ?.getBoundingClientRect();
        setTooltip({
          visible: true,
          x: rect.left - (parentRect?.left ?? 0) + rect.width / 2,
          y: rect.top - (parentRect?.top ?? 0) - 8,
          hour: bucket.hour,
          sent: bucket.sent,
          received: bucket.received,
        });
      },
      [],
    );

    const handleBarLeave = useCallback((): void => {
      setTooltip(INITIAL_TOOLTIP);
    }, []);

    // Identify peak hour for the badge
    const peakHour = useMemo(() => {
      let maxTotal = 0;
      let peak = 0;
      for (const b of normalizedData) {
        const total = b.sent + b.received;
        if (total > maxTotal) {
          maxTotal = total;
          peak = b.hour;
        }
      }
      return peak;
    }, [normalizedData]);

    return (
      <Card ref={ref} className={className} padding="lg" {...props}>
        {/* Header */}
        <Box className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <Box>
            <Text variant="heading-sm">Hourly Activity</Text>
            <Text variant="body-sm" muted>
              Average emails per hour of day
            </Text>
          </Box>
          <Box className="flex items-center gap-3">
            {peakHours.length > 0 && (
              <Box className="flex items-center gap-1.5">
                <Box className="w-2.5 h-2.5 rounded-full bg-status-warning" aria-hidden="true" />
                <Text variant="caption" muted>
                  Peak hours
                </Text>
              </Box>
            )}
            {bestSendHours.length > 0 && (
              <Box className="flex items-center gap-1.5">
                <Box className="w-2.5 h-2.5 rounded-full bg-status-success" aria-hidden="true" />
                <Text variant="caption" muted>
                  Best send time
                </Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* Chart */}
        <Box
          className="relative"
          data-hourly-container=""
          style={{ position: "relative" }}
        >
          <Box
            className="flex items-end gap-[2px]"
            style={{ height: barHeight }}
            role="img"
            aria-label="Hourly email activity chart showing 24 hours"
          >
            {normalizedData.map((bucket) => {
              const total = bucket.sent + bucket.received;
              const totalPct = (total / maxValue) * 100;
              const sentPct = total > 0 ? (bucket.sent / total) * totalPct : 0;
              const receivedPct = totalPct - sentPct;

              const isPeak = peakSet.has(bucket.hour);
              const isBestSend = bestSendSet.has(bucket.hour);

              return (
                <Box
                  key={bucket.hour}
                  className="flex-1 flex flex-col items-stretch justify-end cursor-pointer group"
                  style={{ height: "100%" }}
                  onMouseEnter={(e: React.MouseEvent) => handleBarHover(e, bucket)}
                  onMouseLeave={handleBarLeave}
                  aria-label={`${formatHourLong(bucket.hour)}: ${bucket.received} received, ${bucket.sent} sent`}
                >
                  <Box className="flex flex-col justify-end flex-1">
                    {/* Received portion (top) */}
                    <Box
                      className={`w-full rounded-t-sm transition-all duration-150 group-hover:opacity-80 ${
                        isPeak
                          ? "bg-status-warning"
                          : isBestSend
                            ? "bg-status-success"
                            : "bg-brand-400"
                      }`}
                      style={{
                        height: `${receivedPct}%`,
                        minHeight: bucket.received > 0 ? 2 : 0,
                      }}
                    />
                    {/* Sent portion (bottom) */}
                    <Box
                      className={`w-full transition-all duration-150 group-hover:opacity-80 ${
                        isPeak
                          ? "bg-status-warning/60"
                          : isBestSend
                            ? "bg-status-success/60"
                            : "bg-brand-600"
                      } ${bucket.received === 0 ? "rounded-t-sm" : ""}`}
                      style={{
                        height: `${sentPct}%`,
                        minHeight: bucket.sent > 0 ? 2 : 0,
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Hour labels */}
          <Box className="flex gap-[2px] mt-1.5">
            {normalizedData.map((bucket) => (
              <Box key={bucket.hour} className="flex-1 text-center">
                {bucket.hour % 3 === 0 && (
                  <Text variant="caption" className="text-[9px] tabular-nums text-content-tertiary">
                    {formatHour(bucket.hour)}
                  </Text>
                )}
              </Box>
            ))}
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
                {formatHourLong(tooltip.hour)}
              </Text>
              <Text variant="caption" className="text-content-inverted/80 block">
                {tooltip.received} received, {tooltip.sent} sent
              </Text>
            </Box>
          )}
        </Box>

        {/* Legend */}
        <Box className="flex items-center gap-4 mt-3 flex-wrap">
          <Box className="flex items-center gap-1.5">
            <Box className="w-2.5 h-2.5 rounded-sm bg-brand-400" aria-hidden="true" />
            <Text variant="caption" muted>
              Received
            </Text>
          </Box>
          <Box className="flex items-center gap-1.5">
            <Box className="w-2.5 h-2.5 rounded-sm bg-brand-600" aria-hidden="true" />
            <Text variant="caption" muted>
              Sent
            </Text>
          </Box>
          <Box className="ml-auto">
            <Text variant="caption" muted>
              Peak productivity: {formatHourLong(peakHour)}
            </Text>
          </Box>
        </Box>
      </Card>
    );
  },
);

HourlyActivityChart.displayName = "HourlyActivityChart";
