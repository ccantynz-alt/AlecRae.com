import { Box, Text } from "@emailed/ui";

type StatusLevel = "healthy" | "warning" | "critical" | "unknown";

interface StatusBadgeProps {
  readonly status: StatusLevel;
  readonly label?: string;
}

const statusConfig: Record<StatusLevel, { readonly dotColor: string; readonly bgColor: string; readonly textColor: string; readonly defaultLabel: string }> = {
  healthy: {
    dotColor: "bg-status-success",
    bgColor: "bg-status-success/10",
    textColor: "text-status-success",
    defaultLabel: "Healthy",
  },
  warning: {
    dotColor: "bg-status-warning",
    bgColor: "bg-status-warning/10",
    textColor: "text-status-warning",
    defaultLabel: "Warning",
  },
  critical: {
    dotColor: "bg-status-error",
    bgColor: "bg-status-error/10",
    textColor: "text-status-error",
    defaultLabel: "Critical",
  },
  unknown: {
    dotColor: "bg-content-tertiary",
    bgColor: "bg-content-tertiary/10",
    textColor: "text-content-tertiary",
    defaultLabel: "Unknown",
  },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label ?? config.defaultLabel;

  return (
    <Box
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${config.bgColor}`}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      <Box className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} aria-hidden="true" />
      <Text as="span" variant="caption" className={`font-medium ${config.textColor}`}>
        {displayLabel}
      </Text>
    </Box>
  );
}

StatusBadge.displayName = "StatusBadge";
