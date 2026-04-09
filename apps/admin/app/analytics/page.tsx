"use client";

import { useCallback } from "react";
import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { ChartContainer } from "../../components/chart-container";
import { DataTable } from "../../components/data-table";
import { adminApi } from "../../lib/api";
import type { AdminStats, AdminDomain } from "../../lib/api";
import { useApi } from "../../lib/use-api";
import { AuthShell } from "../../components/auth-shell";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const domainColumns = [
  {
    key: "domain",
    header: "Domain",
    sortable: true,
    sortValue: (row: AdminDomain) => row.domain,
    render: (row: AdminDomain) => (
      <Text variant="body-sm" className="text-content font-medium">{row.domain}</Text>
    ),
  },
  {
    key: "sent24h",
    header: "Sent (24h)",
    sortable: true,
    sortValue: (row: AdminDomain) => row.messagesSent24h,
    render: (row: AdminDomain) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">{formatNumber(row.messagesSent24h)}</Text>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (row: AdminDomain) => row.status,
    render: (row: AdminDomain) => {
      const color = row.status === "verified" ? "text-status-success" : row.status === "pending" ? "text-status-warning" : "text-status-error";
      return (
        <Text variant="body-sm" className={`font-medium capitalize ${color}`}>{row.status}</Text>
      );
    },
  },
  {
    key: "spf",
    header: "SPF",
    render: (row: AdminDomain) => (
      <Text variant="caption" className={`font-mono font-medium ${row.spfVerified ? "text-status-success" : "text-content-tertiary"}`}>
        {row.spfVerified ? "Pass" : "Fail"}
      </Text>
    ),
  },
  {
    key: "dkim",
    header: "DKIM",
    render: (row: AdminDomain) => (
      <Text variant="caption" className={`font-mono font-medium ${row.dkimVerified ? "text-status-success" : "text-content-tertiary"}`}>
        {row.dkimVerified ? "Pass" : "Fail"}
      </Text>
    ),
  },
  {
    key: "dmarc",
    header: "DMARC",
    render: (row: AdminDomain) => (
      <Text variant="caption" className={`font-mono font-medium ${row.dmarcVerified ? "text-status-success" : "text-content-tertiary"}`}>
        {row.dmarcVerified ? "Pass" : "Fail"}
      </Text>
    ),
  },
] as const;

export default function AnalyticsPage() {
  const statsFetcher = useCallback(() => adminApi.getStats(), []);
  const domainsFetcher = useCallback(() => adminApi.listDomains(), []);

  const { data: stats, loading: statsLoading, error: statsError } = useApi<AdminStats>(statsFetcher);
  const { data: domains, loading: domainsLoading } = useApi<AdminDomain[]>(domainsFetcher);

  const domainList = domains ?? [];

  return (
    <AuthShell>
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Analytics</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Delivery rates, engagement metrics, and sending domain performance
        </Text>
      </Box>

      {statsError && (
        <Box className="rounded-xl bg-status-error/10 border border-status-error/30 p-4">
          <Text variant="body-sm" className="text-status-error">
            Failed to load analytics: {statsError}
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Analytics summary">
        <MetricCard
          label="Delivery Rate"
          value={statsLoading ? "..." : (stats ? formatRate(stats.totals.deliveryRate) : "--")}
        />
        <MetricCard
          label="Open Rate"
          value={statsLoading ? "..." : (stats ? formatRate(stats.totals.openRate) : "--")}
        />
        <MetricCard
          label="Click Rate"
          value={statsLoading ? "..." : (stats ? formatRate(stats.totals.clickRate) : "--")}
        />
        <MetricCard
          label="Bounce Rate"
          value={statsLoading ? "..." : (stats ? formatRate(stats.totals.bounceRate) : "--")}
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartContainer title="Email Status Distribution" description="All-time counts by status" loading={statsLoading}>
          {stats && <StatusDistributionChart stats={stats} />}
        </ChartContainer>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Engagement Summary</Text>
          {statsLoading ? (
            <Box className="flex flex-col gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Box key={i} className="h-8 bg-surface-tertiary/50 rounded animate-pulse" />
              ))}
            </Box>
          ) : (
            <Box className="flex flex-col gap-4" role="list" aria-label="Engagement summary">
              {[
                { label: "Total Sent", value: formatNumber(stats?.totals.sent ?? 0) },
                { label: "Delivered", value: formatNumber(stats?.totals.delivered ?? 0), color: "text-status-success" },
                { label: "Opened", value: formatNumber(stats?.totals.opened ?? 0) },
                { label: "Clicked", value: formatNumber(stats?.totals.clicked ?? 0) },
                { label: "Bounced", value: formatNumber(stats?.totals.bounced ?? 0), color: "text-status-error" },
                { label: "Complained", value: formatNumber(stats?.totals.complained ?? 0) },
              ].map((row) => (
                <Box key={row.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
                  <Text variant="body-sm" className="text-content">{row.label}</Text>
                  <Text variant="body-sm" className={`font-mono font-medium ${row.color ?? "text-content"}`}>{row.value}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">Sending Domains</Text>
        {domainsLoading ? (
          <Box className="rounded-xl bg-surface-secondary border border-border p-8 text-center">
            <Text variant="body-sm" className="text-content-tertiary">Loading domains...</Text>
          </Box>
        ) : (
          <DataTable
            columns={domainColumns}
            data={domainList}
            rowKey={(row) => row.id}
            pageSize={10}
            filterPlaceholder="Search domains..."
            filterFn={(row, query) => row.domain.toLowerCase().includes(query.toLowerCase())}
            emptyMessage="No domain data available"
          />
        )}
      </Box>
    </Box>
    </AuthShell>
  );
}

function StatusDistributionChart({ stats }: { readonly stats: AdminStats }) {
  const items = [
    { label: "Delivered", value: stats.totals.delivered, color: "bg-status-success/70" },
    { label: "Bounced", value: stats.totals.bounced, color: "bg-status-error/60" },
    { label: "Queued", value: stats.totals.queued, color: "bg-status-warning/60" },
    { label: "Failed", value: stats.totals.failed, color: "bg-status-error/40" },
    { label: "Deferred", value: stats.totals.deferred, color: "bg-brand-500/60" },
  ];

  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <Box>
      <Box className="flex items-end gap-3 h-48" role="img" aria-label="Status distribution chart">
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

StatusDistributionChart.displayName = "StatusDistributionChart";
