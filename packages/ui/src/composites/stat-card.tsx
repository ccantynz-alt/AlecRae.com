"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Card } from "../primitives/card";

export type StatTrend = "up" | "down" | "neutral";

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  previousValue?: string | number;
  changePercent?: number;
  trend?: StatTrend;
  icon?: ReactNode;
  description?: string;
  className?: string;
}

const trendStyles: Record<StatTrend, { color: string; arrow: string }> = {
  up: { color: "text-status-success", arrow: "\u2191" },
  down: { color: "text-status-error", arrow: "\u2193" },
  neutral: { color: "text-content-tertiary", arrow: "\u2192" },
};

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  {
    label,
    value,
    previousValue: _previousValue,
    changePercent,
    trend = "neutral",
    icon,
    description,
    className = "",
    ...props
  },
  ref
) {
  const trendStyle = trendStyles[trend];

  return (
    <Card ref={ref} className={className} hoverable {...props}>
      <Box className="flex items-start justify-between mb-2">
        <Text variant="body-sm" muted>
          {label}
        </Text>
        {icon && (
          <Box className="text-content-tertiary">{icon}</Box>
        )}
      </Box>
      <Text variant="display-sm" className="mb-1">
        {value}
      </Text>
      {(changePercent !== undefined || description) && (
        <Box className="flex items-center gap-1.5">
          {changePercent !== undefined && (
            <Text as="span" variant="body-sm" className={`font-medium ${trendStyle.color}`}>
              {trendStyle.arrow} {Math.abs(changePercent)}%
            </Text>
          )}
          {description && (
            <Text variant="body-sm" muted>
              {description}
            </Text>
          )}
        </Box>
      )}
    </Card>
  );
});

StatCard.displayName = "StatCard";
