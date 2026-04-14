import { Box, Text } from "@alecrae/ui";

type TrendDirection = "up" | "down" | "neutral";

interface MetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly trend?: {
    readonly direction: TrendDirection;
    readonly value: string;
  };
  readonly description?: string;
  readonly sparklineData?: readonly number[];
}

function TrendIndicator({ direction, value }: { readonly direction: TrendDirection; readonly value: string }) {
  const colorClass = direction === "up"
    ? "text-status-success"
    : direction === "down"
      ? "text-status-error"
      : "text-content-secondary";

  const arrow = direction === "up" ? "\u2191" : direction === "down" ? "\u2193" : "\u2192";

  return (
    <Box className={`flex items-center gap-1 ${colorClass}`}>
      <Text as="span" variant="body-sm" className="font-medium">
        {arrow} {value}
      </Text>
    </Box>
  );
}

TrendIndicator.displayName = "TrendIndicator";

function SparklinePlaceholder({ data }: { readonly data: readonly number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 32;
  const width = 80;
  const step = width / (data.length - 1);

  const points = data
    .map((val, i) => {
      const x = i * step;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Box as="svg" className="w-20 h-8 text-brand-400" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <Box as="polyline" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </Box>
  );
}

SparklinePlaceholder.displayName = "SparklinePlaceholder";

export function MetricCard({ label, value, trend, description, sparklineData }: MetricCardProps) {
  return (
    <Box className="rounded-xl bg-surface-secondary border border-border p-5 flex flex-col gap-3 hover:border-border-strong transition-colors">
      <Box className="flex items-start justify-between">
        <Text variant="body-sm" className="text-content-secondary font-medium">
          {label}
        </Text>
        {sparklineData && sparklineData.length > 1 && (
          <SparklinePlaceholder data={sparklineData} />
        )}
      </Box>
      <Box className="flex items-end gap-3">
        <Text variant="heading-lg" className="text-content font-bold leading-none">
          {value}
        </Text>
        {trend && <TrendIndicator direction={trend.direction} value={trend.value} />}
      </Box>
      {description && (
        <Text variant="caption" className="text-content-tertiary">
          {description}
        </Text>
      )}
    </Box>
  );
}

MetricCard.displayName = "MetricCard";
