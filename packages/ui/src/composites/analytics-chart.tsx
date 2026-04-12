"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Card } from "../primitives/card";

export interface ChartDataPoint {
  label: string;
  value: number;
}

export type ChartType = "bar" | "line" | "area";

export interface AnalyticsChartProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  data: ChartDataPoint[];
  chartType?: ChartType;
  color?: string;
  height?: number;
  showLabels?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
}

export const AnalyticsChart = forwardRef<HTMLDivElement, AnalyticsChartProps>(function AnalyticsChart(
  {
    title,
    description,
    data,
    chartType = "bar",
    color = "bg-brand-500",
    height = 200,
    showLabels = true,
    formatValue = (v) => v.toLocaleString(),
    className = "",
    ...props
  },
  ref
) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <Card ref={ref} className={className} {...props}>
      <Box className="mb-4">
        <Text variant="heading-sm">{title}</Text>
        {description && (
          <Text variant="body-sm" muted>
            {description}
          </Text>
        )}
      </Box>
      <Box className="relative" style={{ height }}>
        {chartType === "bar" && (
          <BarChart data={data} maxValue={maxValue} color={color} formatValue={formatValue} showLabels={showLabels} />
        )}
        {chartType === "line" && (
          <LineChart data={data} maxValue={maxValue} height={height} />
        )}
        {chartType === "area" && (
          <AreaChart data={data} maxValue={maxValue} height={height} />
        )}
      </Box>
    </Card>
  );
});

AnalyticsChart.displayName = "AnalyticsChart";

interface InnerChartProps {
  data: ChartDataPoint[];
  maxValue: number;
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  showLabels?: boolean;
}

function BarChart({ data, maxValue, color = "bg-brand-500", formatValue, showLabels }: InnerChartProps) {
  return (
    <Box className="flex items-end gap-1 h-full">
      {data.map((point, index) => {
        const heightPct = (point.value / maxValue) * 100;
        return (
          <Box key={index} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            {formatValue && (
              <Text variant="caption" className="text-content-tertiary">
                {formatValue(point.value)}
              </Text>
            )}
            <Box
              className={`w-full rounded-t-sm ${color} transition-all duration-300`}
              style={{ height: `${heightPct}%`, minHeight: point.value > 0 ? 4 : 0 }}
            />
            {showLabels && (
              <Text variant="caption" className="text-content-tertiary truncate max-w-full">
                {point.label}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

BarChart.displayName = "BarChart";

function LineChart({ data, maxValue }: InnerChartProps) {
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * 100,
    y: 100 - (d.value / maxValue) * 100,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <Box as="svg" viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <Box
        as="path"
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="text-brand-500"
      />
    </Box>
  );
}

LineChart.displayName = "LineChart";

function AreaChart({ data, maxValue }: InnerChartProps) {
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * 100,
    y: 100 - (d.value / maxValue) * 100,
  }));
  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${lineD} L 100 100 L 0 100 Z`;

  return (
    <Box as="svg" viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <Box as="path" d={areaD} className="fill-brand-100" />
      <Box
        as="path"
        d={lineD}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="text-brand-500"
      />
    </Box>
  );
}

AreaChart.displayName = "AreaChart";
