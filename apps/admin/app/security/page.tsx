"use client";

import { useCallback } from "react";
import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { DataTable } from "../../components/data-table";
import { AuthShell } from "../../components/auth-shell";
import { adminApi } from "../../lib/api";
import type { AdminStats, AdminEvent } from "../../lib/api";
import { useApi } from "../../lib/use-api";

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "email.bounced": "Bounce",
    "email.complained": "Complaint",
    "email.failed": "Failure",
    "email.deferred": "Deferred",
    "email.delivered": "Delivered",
    "email.opened": "Opened",
    "email.clicked": "Clicked",
    "email.sent": "Sent",
  };
  return labels[type] ?? type;
}

const eventColumns = [
  {
    key: "type",
    header: "Type",
    sortable: true,
    sortValue: (row: AdminEvent) => row.type,
    render: (row: AdminEvent) => {
      const typeColors: Record<string, string> = {
        "email.bounced": "bg-status-error/10 text-status-error",
        "email.complained": "bg-status-error/10 text-status-error",
        "email.failed": "bg-status-warning/10 text-status-warning",
        "email.deferred": "bg-status-warning/10 text-status-warning",
        "email.delivered": "bg-status-success/10 text-status-success",
        "email.opened": "bg-status-info/10 text-status-info",
        "email.clicked": "bg-brand-600/10 text-brand-400",
      };
      return (
        <Box className={`inline-flex rounded-full px-2 py-0.5 ${typeColors[row.type] ?? "bg-content-tertiary/10 text-content-secondary"}`}>
          <Text as="span" variant="caption" className="font-medium">{eventTypeLabel(row.type)}</Text>
        </Box>
      );
    },
  },
  {
    key: "recipient",
    header: "Recipient",
    render: (row: AdminEvent) => (
      <Text variant="body-sm" className="text-content font-mono text-body-sm">{row.recipient}</Text>
    ),
  },
  {
    key: "bounceType",
    header: "Detail",
    render: (row: AdminEvent) => (
      <Text variant="body-sm" className="text-content-secondary truncate max-w-[200px]" title={row.diagnosticCode ?? row.bounceType ?? ""}>
        {row.bounceType ?? row.diagnosticCode ?? row.smtpResponse ?? "--"}
      </Text>
    ),
  },
  {
    key: "mxHost",
    header: "MX Host",
    render: (row: AdminEvent) => (
      <Text variant="caption" className="text-content-tertiary">{row.mxHost ?? row.remoteMta ?? "--"}</Text>
    ),
  },
  {
    key: "timestamp",
    header: "Time",
    sortable: true,
    sortValue: (row: AdminEvent) => row.timestamp,
    render: (row: AdminEvent) => (
      <Text variant="caption" className="text-content-tertiary">{timeAgo(row.timestamp)}</Text>
    ),
  },
] as const;

export default function SecurityPage() {
  const statsFetcher = useCallback(() => adminApi.getStats(), []);
  const eventsFetcher = useCallback(() => adminApi.listEvents({ limit: 100 }), []);

  const { data: stats, loading: statsLoading, error: statsError } = useApi<AdminStats>(statsFetcher);
  const { data: events, loading: eventsLoading } = useApi<AdminEvent[]>(eventsFetcher);

  const eventList = events ?? [];
  const bounceEvents = eventList.filter((e) => e.type === "email.bounced");
  const complaintEvents = eventList.filter((e) => e.type === "email.complained");
  const failedEvents = eventList.filter((e) => e.type === "email.failed");

  // Group bounces by category
  const bounceCategoryCounts: Record<string, number> = {};
  for (const e of bounceEvents) {
    const category = e.bounceCategory ?? e.bounceType ?? "Unknown";
    bounceCategoryCounts[category] = (bounceCategoryCounts[category] ?? 0) + 1;
  }
  const bounceCategories = Object.entries(bounceCategoryCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ category, count }));

  // Group events by type
  const eventTypeCounts: Record<string, number> = {};
  for (const e of eventList) {
    eventTypeCounts[e.type] = (eventTypeCounts[e.type] ?? 0) + 1;
  }
  const eventTypeDistribution = Object.entries(eventTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({
      type,
      label: eventTypeLabel(type),
      count,
      percentage: eventList.length > 0 ? (count / eventList.length) * 100 : 0,
    }));

  return (
    <AuthShell>
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Security & Events</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Bounce analysis, complaint tracking, and event monitoring
        </Text>
      </Box>

      {statsError && (
        <Box className="rounded-xl bg-status-error/10 border border-status-error/30 p-4">
          <Text variant="body-sm" className="text-status-error">
            Failed to load stats: {statsError}
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Security metrics">
        <MetricCard
          label="Total Bounced"
          value={statsLoading ? "..." : formatNumber(stats?.totals.bounced ?? 0)}
          description={`24h: ${formatNumber(stats?.last24h.bounced ?? 0)}`}
        />
        <MetricCard
          label="Bounce Rate"
          value={statsLoading ? "..." : (stats ? formatRate(stats.totals.bounceRate) : "--")}
        />
        <MetricCard
          label="Complaints"
          value={statsLoading ? "..." : formatNumber(stats?.totals.complained ?? 0)}
        />
        <MetricCard
          label="Failed"
          value={statsLoading ? "..." : formatNumber(stats?.totals.failed ?? 0)}
          description={`24h: ${formatNumber(stats?.last24h.failed ?? 0)}`}
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2">
          <Box className="rounded-xl bg-surface-secondary border border-border p-5">
            <Text variant="heading-sm" className="text-content font-semibold mb-4">Event Type Distribution</Text>
            {eventsLoading ? (
              <Box className="h-40 bg-surface-tertiary/50 rounded animate-pulse" />
            ) : eventTypeDistribution.length === 0 ? (
              <Text variant="body-sm" className="text-content-tertiary">No events recorded yet</Text>
            ) : (
              <Box className="flex flex-col gap-3" role="list" aria-label="Event type distribution">
                {eventTypeDistribution.map((item) => {
                  const colorMap: Record<string, string> = {
                    "email.delivered": "bg-status-success",
                    "email.bounced": "bg-status-error",
                    "email.complained": "bg-status-error/60",
                    "email.failed": "bg-status-warning",
                    "email.deferred": "bg-brand-500",
                    "email.opened": "bg-status-info",
                    "email.clicked": "bg-brand-400",
                    "email.sent": "bg-content-tertiary",
                  };
                  return (
                    <Box key={item.type} role="listitem">
                      <Box className="flex items-center justify-between mb-1">
                        <Text variant="body-sm" className="text-content">{item.label}</Text>
                        <Box className="flex items-center gap-2">
                          <Text variant="caption" className="text-content-secondary font-mono">{item.count}</Text>
                          <Text variant="caption" className="text-content-tertiary font-mono w-14 text-right">{item.percentage.toFixed(1)}%</Text>
                        </Box>
                      </Box>
                      <Box className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                        <Box className={`h-full rounded-full ${colorMap[item.type] ?? "bg-content-tertiary"}`} style={{ width: `${Math.min(item.percentage * 2, 100)}%` }} />
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Bounce Categories</Text>
          {eventsLoading ? (
            <Box className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Box key={i} className="h-8 bg-surface-tertiary/50 rounded animate-pulse" />
              ))}
            </Box>
          ) : bounceCategories.length === 0 ? (
            <Text variant="body-sm" className="text-content-tertiary">No bounces recorded</Text>
          ) : (
            <Box className="flex flex-col gap-3" role="list" aria-label="Bounce categories">
              {bounceCategories.map((item) => (
                <Box key={item.category} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
                  <Text variant="body-sm" className="text-content capitalize">{item.category}</Text>
                  <Text variant="body-sm" className="text-status-error font-mono font-medium">{item.count}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">Recent Events</Text>
        {eventsLoading ? (
          <Box className="rounded-xl bg-surface-secondary border border-border p-8 text-center">
            <Text variant="body-sm" className="text-content-tertiary">Loading events...</Text>
          </Box>
        ) : (
          <DataTable
            columns={eventColumns}
            data={eventList}
            rowKey={(row) => row.id}
            pageSize={10}
            filterPlaceholder="Search events by recipient, type, or detail..."
            filterFn={(row, query) => {
              const q = query.toLowerCase();
              return (
                row.recipient.toLowerCase().includes(q) ||
                row.type.toLowerCase().includes(q) ||
                (row.bounceType?.toLowerCase().includes(q) ?? false) ||
                (row.diagnosticCode?.toLowerCase().includes(q) ?? false)
              );
            }}
            emptyMessage="No events found"
          />
        )}
      </Box>
    </Box>
    </AuthShell>
  );
}
