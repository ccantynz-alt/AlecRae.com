"use client";

import { useCallback } from "react";
import { Box, Text } from "@alecrae/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { DataTable } from "../../components/data-table";
import { adminApi } from "../../lib/api";
import type { AdminStats, AdminMessage } from "../../lib/api";
import { useApi } from "../../lib/use-api";
import { AuthShell } from "../../components/auth-shell";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
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

const messageColumns = [
  {
    key: "id",
    header: "ID",
    render: (row: AdminMessage) => (
      <Text variant="body-sm" className="text-content font-mono truncate max-w-[120px]" title={row.id}>
        {row.id.slice(0, 12)}...
      </Text>
    ),
  },
  {
    key: "from",
    header: "From",
    sortable: true,
    sortValue: (row: AdminMessage) => row.from.email,
    render: (row: AdminMessage) => (
      <Box className="flex flex-col">
        {row.from.name && <Text variant="body-sm" className="text-content">{row.from.name}</Text>}
        <Text variant="caption" className="text-content-tertiary">{row.from.email}</Text>
      </Box>
    ),
  },
  {
    key: "to",
    header: "To",
    render: (row: AdminMessage) => {
      const first = row.to[0];
      const extra = row.to.length - 1;
      return (
        <Box>
          <Text variant="body-sm" className="text-content-secondary">
            {first?.email ?? "--"}
            {extra > 0 ? ` +${extra}` : ""}
          </Text>
        </Box>
      );
    },
  },
  {
    key: "subject",
    header: "Subject",
    render: (row: AdminMessage) => (
      <Text variant="body-sm" className="text-content truncate max-w-[200px]" title={row.subject}>
        {row.subject || "(no subject)"}
      </Text>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (row: AdminMessage) => row.status,
    render: (row: AdminMessage) => {
      const statusMap: Record<string, "healthy" | "warning" | "critical" | "unknown"> = {
        delivered: "healthy",
        sent: "healthy",
        queued: "unknown",
        deferred: "warning",
        bounced: "critical",
        failed: "critical",
        complained: "critical",
      };
      return <StatusBadge status={statusMap[row.status] ?? "unknown"} label={row.status.charAt(0).toUpperCase() + row.status.slice(1)} />;
    },
  },
  {
    key: "createdAt",
    header: "Created",
    sortable: true,
    sortValue: (row: AdminMessage) => row.createdAt,
    render: (row: AdminMessage) => (
      <Text variant="caption" className="text-content-tertiary">{timeAgo(row.createdAt)}</Text>
    ),
  },
] as const;

export default function QueuePage() {
  const statsFetcher = useCallback(() => adminApi.getStats(), []);
  const messagesFetcher = useCallback(() => adminApi.listMessages({ limit: 50 }), []);

  const { data: stats, loading: statsLoading, error: statsError } = useApi<AdminStats>(statsFetcher);
  const { data: messages, loading: messagesLoading } = useApi<AdminMessage[]>(messagesFetcher);

  const messageList = messages ?? [];
  const queuedMessages = messageList.filter((m) => m.status === "queued");
  const failedMessages = messageList.filter((m) => m.status === "failed");
  const deferredMessages = messageList.filter((m) => m.status === "deferred");

  return (
    <AuthShell>
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Email Queue</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Monitor queue depth, recent messages, and delivery status
        </Text>
      </Box>

      {statsError && (
        <Box className="rounded-xl bg-status-error/10 border border-status-error/30 p-4">
          <Text variant="body-sm" className="text-status-error">
            Failed to load queue stats: {statsError}
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Queue metrics">
        <MetricCard
          label="Queued (24h)"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.queued ?? 0)}
          description={`All-time: ${formatNumber(stats?.totals.queued ?? 0)}`}
        />
        <MetricCard
          label="Failed (24h)"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.failed ?? 0)}
          description={`All-time: ${formatNumber(stats?.totals.failed ?? 0)}`}
        />
        <MetricCard
          label="Deferred (24h)"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.deferred ?? 0)}
          description={`All-time: ${formatNumber(stats?.totals.deferred ?? 0)}`}
        />
        <MetricCard
          label="Delivered (24h)"
          value={statsLoading ? "..." : formatNumber(stats?.last24h.delivered ?? 0)}
          description={`All-time: ${formatNumber(stats?.totals.delivered ?? 0)}`}
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2 rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Status Summary (Recent Messages)</Text>
          {messagesLoading ? (
            <Box className="h-32 bg-surface-tertiary/50 rounded animate-pulse" />
          ) : (
            <Box className="flex flex-col gap-3" role="list" aria-label="Message status counts">
              {[
                { label: "Queued", count: queuedMessages.length, color: "bg-content-tertiary" },
                { label: "Deferred", count: deferredMessages.length, color: "bg-status-warning" },
                { label: "Failed", count: failedMessages.length, color: "bg-status-error" },
                { label: "Delivered", count: messageList.filter((m) => m.status === "delivered").length, color: "bg-status-success" },
                { label: "Sent", count: messageList.filter((m) => m.status === "sent").length, color: "bg-brand-500" },
              ].map((item) => (
                <Box key={item.label} role="listitem">
                  <Box className="flex items-center justify-between mb-1">
                    <Text variant="body-sm" className="text-content">{item.label}</Text>
                    <Text variant="body-sm" className="text-content-secondary font-mono">{item.count}</Text>
                  </Box>
                  <Box className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                    <Box
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width: `${messageList.length > 0 ? Math.max((item.count / messageList.length) * 100, 1) : 0}%` }}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">24h Overview</Text>
          {statsLoading ? (
            <Box className="flex flex-col gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Box key={i} className="h-8 bg-surface-tertiary/50 rounded animate-pulse" />
              ))}
            </Box>
          ) : (
            <Box className="flex flex-col gap-2">
              {[
                { label: "Sent", value: stats?.last24h.sent ?? 0 },
                { label: "Delivered", value: stats?.last24h.delivered ?? 0 },
                { label: "Bounced", value: stats?.last24h.bounced ?? 0 },
                { label: "Queued", value: stats?.last24h.queued ?? 0 },
                { label: "Failed", value: stats?.last24h.failed ?? 0 },
                { label: "Deferred", value: stats?.last24h.deferred ?? 0 },
              ].map((row) => (
                <Box key={row.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <Text variant="caption" className="text-content-secondary">{row.label}</Text>
                  <Text variant="caption" className="text-content font-mono">{formatNumber(row.value)}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">Recent Messages</Text>
        {messagesLoading ? (
          <Box className="rounded-xl bg-surface-secondary border border-border p-8 text-center">
            <Text variant="body-sm" className="text-content-tertiary">Loading messages...</Text>
          </Box>
        ) : (
          <DataTable
            columns={messageColumns}
            data={messageList}
            rowKey={(row) => row.id}
            pageSize={10}
            filterPlaceholder="Search by subject, sender, or recipient..."
            filterFn={(row, query) => {
              const q = query.toLowerCase();
              return (
                row.subject.toLowerCase().includes(q) ||
                row.from.email.toLowerCase().includes(q) ||
                row.to.some((t) => t.email.toLowerCase().includes(q))
              );
            }}
            emptyMessage="No messages in queue"
          />
        )}
      </Box>
    </Box>
    </AuthShell>
  );
}
