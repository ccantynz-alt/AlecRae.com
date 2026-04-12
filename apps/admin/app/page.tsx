"use client";

import { useCallback } from "react";
import { Box, Text } from "@alecrae/ui";
import { MetricCard } from "../components/metric-card";
import { StatusBadge } from "../components/status-badge";
import { ChartContainer } from "../components/chart-container";
import { AuthShell } from "../components/auth-shell";
import { adminApi } from "../lib/api";
import type { AdminStats, AdminEvent } from "../lib/api";
import { useApi } from "../lib/use-api";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "email.delivered": "Delivered",
    "email.bounced": "Bounced",
    "email.deferred": "Deferred",
    "email.opened": "Opened",
    "email.clicked": "Clicked",
    "email.complained": "Complained",
    "email.sent": "Sent",
    "email.failed": "Failed",
  };
  return labels[type] ?? type;
}

function eventTypeStatus(type: string): "healthy" | "warning" | "critical" | "unknown" {
  if (type.includes("delivered") || type.includes("opened") || type.includes("clicked")) return "healthy";
  if (type.includes("deferred") || type.includes("complained")) return "warning";
  if (type.includes("bounced") || type.includes("failed")) return "critical";
  return "unknown";
}

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

export default function DashboardPage() {
  const statsFetcher = useCallback(() => adminApi.getStats(), []);
  const eventsFetcher = useCallback(() => adminApi.listEvents({ limit: 10 }), []);

  const { data: stats, loading: statsLoading, error: statsError } = useApi<AdminStats>(statsFetcher);
  const { data: events, loading: eventsLoading } = useApi<AdminEvent[]>(eventsFetcher);

  return (
    <AuthShell>
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Dashboard</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Platform overview and real-time operational metrics
        </Text>
      </Box>

      {statsError && (
        <Box className="rounded-xl bg-status-error/10 border border-status-error/30 p-4">
          <Text variant="body-sm" className="text-status-error">
            Failed to load stats: {statsError}. Showing empty state.
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Key metrics">
        <MetricCard
          label="Messages Sent (24h)"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.sent ?? 0)}
          description={`Total all-time: ${formatNumber(stats?.totals.sent ?? 0)}`}
        />
        <MetricCard
          label="Delivered (24h)"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.delivered ?? 0)}
          description={`Delivery rate: ${stats ? formatRate(stats.totals.deliveryRate) : "--"}`}
        />
        <MetricCard
          label="Bounced (24h)"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.bounced ?? 0)}
          description={`Bounce rate: ${stats ? formatRate(stats.totals.bounceRate) : "--"}`}
        />
        <MetricCard
          label="Queued"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.queued ?? 0)}
          description={`Failed: ${formatNumber(stats?.last24h.failed ?? 0)}, Deferred: ${formatNumber(stats?.last24h.deferred ?? 0)}`}
        />
        <MetricCard
          label="Total Accounts"
          value={statsLoading ? "..." : formatNumber(stats?.platform.totalAccounts ?? 0)}
        />
        <MetricCard
          label="Total Domains"
          value={statsLoading ? "..." : formatNumber(stats?.platform.totalDomains ?? 0)}
        />
        <MetricCard
          label="Total Users"
          value={statsLoading ? "..." : formatNumber(stats?.platform.totalUsers ?? 0)}
        />
        <MetricCard
          label="Open Rate"
          value={statsLoading ? "..." : (stats ? formatRate(stats.totals.openRate) : "--")}
          description={`Click rate: ${stats ? formatRate(stats.totals.clickRate) : "--"}`}
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2">
          <ChartContainer title="All-Time Status Breakdown" description="Email counts by current status" loading={statsLoading}>
            {stats && <StatusBreakdownChart stats={stats} />}
          </ChartContainer>
        </Box>

        <Box>
          <Box className="rounded-xl bg-surface-secondary border border-border p-5">
            <Text variant="heading-sm" className="text-content font-semibold mb-4">Recent Events</Text>
            {eventsLoading ? (
              <Box className="flex flex-col gap-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Box key={i} className="h-12 bg-surface-tertiary/50 rounded animate-pulse" />
                ))}
              </Box>
            ) : (
              <Box className="flex flex-col gap-3" role="log" aria-label="Recent platform events">
                {(events ?? []).length === 0 ? (
                  <Text variant="body-sm" className="text-content-tertiary">No events yet</Text>
                ) : (
                  (events ?? []).slice(0, 8).map((event) => (
                    <Box key={event.id} className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                      <Box className="pt-0.5">
                        <StatusBadge status={eventTypeStatus(event.type)} label={eventTypeLabel(event.type)} />
                      </Box>
                      <Box className="flex-1 min-w-0">
                        <Text variant="body-sm" className="text-content leading-snug truncate">
                          {event.recipient}
                        </Text>
                        <Text variant="caption" className="text-content-tertiary mt-0.5">
                          {timeAgo(event.timestamp)}
                        </Text>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EngagementPanel stats={stats} loading={statsLoading} />
        <PlatformSummaryPanel stats={stats} loading={statsLoading} />
      </Box>
    </Box>
    </AuthShell>
  );
}

function StatusBreakdownChart({ stats }: { readonly stats: AdminStats }) {
  const items = [
    { label: "Delivered", value: stats.totals.delivered, color: "bg-status-success/80" },
    { label: "Bounced", value: stats.totals.bounced, color: "bg-status-error/60" },
    { label: "Queued", value: stats.totals.queued, color: "bg-status-warning/60" },
    { label: "Failed", value: stats.totals.failed, color: "bg-status-error/40" },
    { label: "Deferred", value: stats.totals.deferred, color: "bg-brand-500/60" },
    { label: "Complained", value: stats.totals.complained, color: "bg-content-tertiary/60" },
  ];

  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <Box>
      <Box className="flex items-end gap-3 h-48" role="img" aria-label="Email status breakdown bar chart">
        {items.map((item) => (
          <Box key={item.label} className="flex-1 flex flex-col items-center gap-1">
            <Text variant="caption" className="text-content-secondary font-mono">{formatNumber(item.value)}</Text>
            <Box className="w-full flex flex-col justify-end" style={{ height: "160px" }}>
              <Box
                className={`w-full ${item.color} rounded-t`}
                style={{ height: `${Math.max((item.value / maxValue) * 100, 2)}%` }}
                title={`${item.label}: ${item.value.toLocaleString()}`}
              />
            </Box>
            <Text variant="caption" className="text-content-tertiary">{item.label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

StatusBreakdownChart.displayName = "StatusBreakdownChart";

function EngagementPanel({ stats, loading }: { readonly stats: AdminStats | null; readonly loading: boolean }) {
  const rows = [
    { label: "Opened", value: stats?.totals.opened ?? 0 },
    { label: "Clicked", value: stats?.totals.clicked ?? 0 },
    { label: "Complained", value: stats?.totals.complained ?? 0 },
    { label: "Open Rate", value: stats ? formatRate(stats.totals.openRate) : "--", raw: true },
    { label: "Click Rate", value: stats ? formatRate(stats.totals.clickRate) : "--", raw: true },
  ];

  return (
    <Box className="rounded-xl bg-surface-secondary border border-border p-5">
      <Text variant="heading-sm" className="text-content font-semibold mb-4">Engagement</Text>
      {loading ? (
        <Box className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Box key={i} className="h-8 bg-surface-tertiary/50 rounded animate-pulse" />
          ))}
        </Box>
      ) : (
        <Box className="flex flex-col gap-2" role="list" aria-label="Engagement metrics">
          {rows.map((row) => (
            <Box key={row.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
              <Text variant="body-sm" className="text-content">{row.label}</Text>
              <Text variant="body-sm" className="text-content font-mono font-medium">
                {"raw" in row && row.raw ? String(row.value) : formatNumber(row.value as number)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

EngagementPanel.displayName = "EngagementPanel";

function PlatformSummaryPanel({ stats, loading }: { readonly stats: AdminStats | null; readonly loading: boolean }) {
  const rows = [
    { label: "Total Sent", value: stats?.totals.sent ?? 0 },
    { label: "Total Delivered", value: stats?.totals.delivered ?? 0 },
    { label: "Total Bounced", value: stats?.totals.bounced ?? 0 },
    { label: "Delivery Rate", value: stats ? formatRate(stats.totals.deliveryRate) : "--", raw: true },
    { label: "Bounce Rate", value: stats ? formatRate(stats.totals.bounceRate) : "--", raw: true },
  ];

  return (
    <Box className="rounded-xl bg-surface-secondary border border-border p-5">
      <Text variant="heading-sm" className="text-content font-semibold mb-4">All-Time Totals</Text>
      {loading ? (
        <Box className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Box key={i} className="h-8 bg-surface-tertiary/50 rounded animate-pulse" />
          ))}
        </Box>
      ) : (
        <Box className="flex flex-col gap-2" role="list" aria-label="Platform totals">
          {rows.map((row) => (
            <Box key={row.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
              <Text variant="body-sm" className="text-content">{row.label}</Text>
              <Text variant="body-sm" className="text-content font-mono font-medium">
                {"raw" in row && row.raw ? String(row.value) : formatNumber(row.value as number)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

PlatformSummaryPanel.displayName = "PlatformSummaryPanel";
