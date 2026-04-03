import { Box, Text } from "@emailed/ui";

interface ChartContainerProps {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly loading?: boolean;
}

function ChartSkeleton() {
  return (
    <Box className="flex items-end gap-2 h-48 px-4 pb-4" aria-label="Loading chart data">
      {Array.from({ length: 12 }, (_, i) => (
        <Box
          key={i}
          className="flex-1 bg-surface-tertiary/50 rounded-t animate-pulse"
          style={{ height: `${20 + Math.random() * 80}%` }}
        />
      ))}
    </Box>
  );
}

ChartSkeleton.displayName = "ChartSkeleton";

export function ChartContainer({ title, description, children, actions, loading = false }: ChartContainerProps) {
  return (
    <Box className="rounded-xl bg-surface-secondary border border-border overflow-hidden">
      <Box className="flex items-start justify-between p-5 pb-0">
        <Box>
          <Text variant="heading-sm" className="text-content font-semibold">
            {title}
          </Text>
          {description && (
            <Text variant="body-sm" className="text-content-secondary mt-1">
              {description}
            </Text>
          )}
        </Box>
        {actions && <Box className="flex items-center gap-2">{actions}</Box>}
      </Box>
      <Box className="p-5">
        {loading ? <ChartSkeleton /> : children}
      </Box>
    </Box>
  );
}

ChartContainer.displayName = "ChartContainer";
