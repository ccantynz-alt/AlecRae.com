"use client";

import { useCallback } from "react";
import { Box, Text } from "@alecrae/ui";
import { StatusBadge } from "../../components/status-badge";
import { MetricCard } from "../../components/metric-card";
import { DataTable } from "../../components/data-table";
import { adminApi } from "../../lib/api";
import type { AdminDomain } from "../../lib/api";
import { useApi } from "../../lib/use-api";
import { AuthShell } from "../../components/auth-shell";

function DnsStatusIndicator({ verified }: { readonly verified: boolean }) {
  return (
    <Text as="span" variant="caption" className={`font-mono font-medium ${verified ? "text-status-success" : "text-content-tertiary"}`}>
      {verified ? "Pass" : "Fail"}
    </Text>
  );
}

DnsStatusIndicator.displayName = "DnsStatusIndicator";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

const columns = [
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
      const statusMap: Record<string, "healthy" | "warning" | "critical" | "unknown"> = {
        verified: "healthy",
        pending: "warning",
        failed: "critical",
      };
      const labelMap: Record<string, string> = {
        verified: "Verified",
        pending: "Pending",
        failed: "Failed",
      };
      return <StatusBadge status={statusMap[row.status] ?? "unknown"} label={labelMap[row.status] ?? row.status} />;
    },
  },
  {
    key: "spf",
    header: "SPF",
    render: (row: AdminDomain) => <DnsStatusIndicator verified={row.spfVerified} />,
  },
  {
    key: "dkim",
    header: "DKIM",
    render: (row: AdminDomain) => <DnsStatusIndicator verified={row.dkimVerified} />,
  },
  {
    key: "dmarc",
    header: "DMARC",
    render: (row: AdminDomain) => <DnsStatusIndicator verified={row.dmarcVerified} />,
  },
  {
    key: "messagesSent24h",
    header: "Sent (24h)",
    sortable: true,
    sortValue: (row: AdminDomain) => row.messagesSent24h,
    render: (row: AdminDomain) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">
        {row.messagesSent24h > 0 ? formatNumber(row.messagesSent24h) : "--"}
      </Text>
    ),
  },
  {
    key: "createdAt",
    header: "Added",
    sortable: true,
    sortValue: (row: AdminDomain) => row.createdAt,
    render: (row: AdminDomain) => (
      <Text variant="caption" className="text-content-tertiary">{new Date(row.createdAt).toLocaleDateString()}</Text>
    ),
  },
] as const;

export default function DomainsPage() {
  const fetcher = useCallback(() => adminApi.listDomains(), []);
  const { data: domains, loading, error } = useApi<AdminDomain[]>(fetcher);

  const domainList = domains ?? [];
  const verifiedCount = domainList.filter((d) => d.status === "verified").length;
  const pendingCount = domainList.filter((d) => d.status === "pending").length;
  const failedCount = domainList.filter((d) => d.status === "failed").length;

  return (
    <AuthShell>
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Domain Management</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Manage domains, DNS authentication, and per-domain reputation
        </Text>
      </Box>

      {error && (
        <Box className="rounded-xl bg-status-error/10 border border-status-error/30 p-4">
          <Text variant="body-sm" className="text-status-error">
            Failed to load domains: {error}
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Domain summary metrics">
        <MetricCard label="Total Domains" value={loading ? "..." : domainList.length.toString()} />
        <MetricCard label="Verified" value={loading ? "..." : verifiedCount.toString()} />
        <MetricCard label="Pending / Failed" value={loading ? "..." : `${pendingCount} / ${failedCount}`} />
        <MetricCard
          label="Sent (24h)"
          value={loading ? "..." : formatNumber(domainList.reduce((sum, d) => sum + d.messagesSent24h, 0))}
        />
      </Box>

      {loading ? (
        <Box className="rounded-xl bg-surface-secondary border border-border p-8 text-center">
          <Text variant="body-sm" className="text-content-tertiary">Loading domains...</Text>
        </Box>
      ) : (
        <DataTable
          columns={columns}
          data={domainList}
          rowKey={(row) => row.id}
          pageSize={10}
          filterPlaceholder="Search domains..."
          filterFn={(row, query) => row.domain.toLowerCase().includes(query.toLowerCase())}
          emptyMessage="No domains found"
        />
      )}
    </Box>
    </AuthShell>
  );
}
