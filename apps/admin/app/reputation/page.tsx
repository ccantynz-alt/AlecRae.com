"use client";

import { useCallback } from "react";
import { Box, Text } from "@alecrae/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
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
  return `${(rate * 100).toFixed(2)}%`;
}

function DomainHealthBar({ domain }: { readonly domain: AdminDomain }) {
  const checks = [domain.spfVerified, domain.dkimVerified, domain.dmarcVerified, domain.returnPathVerified];
  const passed = checks.filter(Boolean).length;
  const pct = (passed / checks.length) * 100;
  const color = pct === 100 ? "bg-status-success" : pct >= 50 ? "bg-status-warning" : "bg-status-error";

  return (
    <Box className="flex items-center gap-2">
      <Box className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden w-20" role="progressbar" aria-valuenow={passed} aria-valuemin={0} aria-valuemax={checks.length} aria-label={`${passed} of ${checks.length} checks passing`}>
        <Box className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </Box>
      <Text variant="caption" className="text-content-secondary font-mono w-8 text-right">{passed}/{checks.length}</Text>
    </Box>
  );
}

DomainHealthBar.displayName = "DomainHealthBar";

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
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (row: AdminDomain) => row.status,
    render: (row: AdminDomain) => {
      const map: Record<string, { status: "healthy" | "warning" | "critical" | "unknown"; label: string }> = {
        verified: { status: "healthy", label: "Verified" },
        pending: { status: "warning", label: "Pending" },
        failed: { status: "critical", label: "Failed" },
      };
      const config = map[row.status] ?? { status: "unknown" as const, label: row.status };
      return <StatusBadge status={config.status} label={config.label} />;
    },
  },
  {
    key: "health",
    header: "Auth Health",
    width: "w-40",
    render: (row: AdminDomain) => <DomainHealthBar domain={row} />,
  },
  {
    key: "spf",
    header: "SPF",
    render: (row: AdminDomain) => (
      <Text variant="caption" className={`font-mono font-medium ${row.spfVerified ? "text-status-success" : "text-status-error"}`}>
        {row.spfVerified ? "Pass" : "Fail"}
      </Text>
    ),
  },
  {
    key: "dkim",
    header: "DKIM",
    render: (row: AdminDomain) => (
      <Text variant="caption" className={`font-mono font-medium ${row.dkimVerified ? "text-status-success" : "text-status-error"}`}>
        {row.dkimVerified ? "Pass" : "Fail"}
      </Text>
    ),
  },
  {
    key: "dmarc",
    header: "DMARC",
    render: (row: AdminDomain) => (
      <Text variant="caption" className={`font-mono font-medium ${row.dmarcVerified ? "text-status-success" : "text-status-error"}`}>
        {row.dmarcVerified ? "Pass" : "Fail"}
      </Text>
    ),
  },
  {
    key: "returnPath",
    header: "Return Path",
    render: (row: AdminDomain) => (
      <Text variant="caption" className={`font-mono font-medium ${row.returnPathVerified ? "text-status-success" : "text-status-error"}`}>
        {row.returnPathVerified ? "Pass" : "Fail"}
      </Text>
    ),
  },
  {
    key: "sent24h",
    header: "Sent (24h)",
    sortable: true,
    sortValue: (row: AdminDomain) => row.messagesSent24h,
    render: (row: AdminDomain) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">
        {row.messagesSent24h > 0 ? formatNumber(row.messagesSent24h) : "--"}
      </Text>
    ),
  },
] as const;

export default function ReputationPage() {
  const statsFetcher = useCallback(() => adminApi.getStats(), []);
  const domainsFetcher = useCallback(() => adminApi.listDomains(), []);

  const { data: stats, loading: statsLoading, error: statsError } = useApi<AdminStats>(statsFetcher);
  const { data: domains, loading: domainsLoading } = useApi<AdminDomain[]>(domainsFetcher);

  const domainList = domains ?? [];
  const verifiedDomains = domainList.filter((d) => d.status === "verified");
  const fullyAuthDomains = domainList.filter(
    (d) => d.spfVerified && d.dkimVerified && d.dmarcVerified && d.returnPathVerified,
  );
  const avgAuthScore = domainList.length > 0
    ? Math.round(
        domainList.reduce((sum, d) => {
          const checks = [d.spfVerified, d.dkimVerified, d.dmarcVerified, d.returnPathVerified];
          return sum + checks.filter(Boolean).length;
        }, 0) / (domainList.length * 4) * 100
      )
    : 0;

  return (
    <AuthShell>
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Reputation Management</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Domain authentication health, deliverability metrics, and compliance overview
        </Text>
      </Box>

      {statsError && (
        <Box className="rounded-xl bg-status-error/10 border border-status-error/30 p-4">
          <Text variant="body-sm" className="text-status-error">
            Failed to load reputation data: {statsError}
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Reputation summary">
        <MetricCard
          label="Auth Score"
          value={domainsLoading ? "..." : `${avgAuthScore}%`}
          description={`${fullyAuthDomains.length} fully authenticated domains`}
        />
        <MetricCard
          label="Verified Domains"
          value={domainsLoading ? "..." : verifiedDomains.length.toString()}
          description={`${domainList.length} total`}
        />
        <MetricCard
          label="Delivery Rate"
          value={statsLoading ? "..." : (stats ? `${(stats.totals.deliveryRate * 100).toFixed(1)}%` : "--")}
        />
        <MetricCard
          label="Bounce Rate"
          value={statsLoading ? "..." : (stats ? formatRate(stats.totals.bounceRate) : "--")}
        />
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">Domain Authentication Status</Text>
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
            filterPlaceholder="Search by domain..."
            filterFn={(row, query) => row.domain.toLowerCase().includes(query.toLowerCase())}
            emptyMessage="No domains found"
          />
        )}
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Deliverability Metrics</Text>
          {statsLoading ? (
            <Box className="flex flex-col gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Box key={i} className="h-8 bg-surface-tertiary/50 rounded animate-pulse" />
              ))}
            </Box>
          ) : (
            <Box className="flex flex-col gap-3" role="list" aria-label="Deliverability metrics">
              {[
                { label: "Delivery Rate", value: stats ? `${(stats.totals.deliveryRate * 100).toFixed(1)}%` : "--", status: "healthy" as const },
                { label: "Bounce Rate", value: stats ? formatRate(stats.totals.bounceRate) : "--", status: (stats && stats.totals.bounceRate > 0.02) ? "critical" as const : "healthy" as const },
                { label: "Open Rate", value: stats ? `${(stats.totals.openRate * 100).toFixed(1)}%` : "--", status: "healthy" as const },
                { label: "Click Rate", value: stats ? `${(stats.totals.clickRate * 100).toFixed(1)}%` : "--", status: "healthy" as const },
                { label: "Complaint Rate", value: stats && stats.totals.sent > 0 ? formatRate(stats.totals.complained / stats.totals.sent) : "--", status: "healthy" as const },
              ].map((metric) => (
                <Box key={metric.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
                  <Box className="flex items-center gap-3">
                    <StatusBadge status={metric.status} />
                    <Text variant="body-sm" className="text-content">{metric.label}</Text>
                  </Box>
                  <Text variant="body-sm" className="text-content font-mono font-medium">{metric.value}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Authentication Coverage</Text>
          {domainsLoading ? (
            <Box className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Box key={i} className="h-8 bg-surface-tertiary/50 rounded animate-pulse" />
              ))}
            </Box>
          ) : (
            <Box className="flex flex-col gap-4" role="list" aria-label="Authentication coverage">
              {[
                { label: "SPF", count: domainList.filter((d) => d.spfVerified).length },
                { label: "DKIM", count: domainList.filter((d) => d.dkimVerified).length },
                { label: "DMARC", count: domainList.filter((d) => d.dmarcVerified).length },
                { label: "Return Path", count: domainList.filter((d) => d.returnPathVerified).length },
              ].map((item) => {
                const pct = domainList.length > 0 ? (item.count / domainList.length) * 100 : 0;
                const color = pct === 100 ? "bg-status-success" : pct >= 50 ? "bg-status-warning" : "bg-status-error";
                return (
                  <Box key={item.label} role="listitem">
                    <Box className="flex items-center justify-between mb-1">
                      <Text variant="body-sm" className="text-content">{item.label}</Text>
                      <Text variant="body-sm" className="text-content-secondary font-mono">{item.count}/{domainList.length}</Text>
                    </Box>
                    <Box className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                      <Box className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
    </AuthShell>
  );
}
