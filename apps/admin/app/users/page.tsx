"use client";

import { useCallback } from "react";
import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { DataTable } from "../../components/data-table";
import { adminApi } from "../../lib/api";
import type { AdminUser } from "../../lib/api";
import { useApi } from "../../lib/use-api";
import { AuthShell } from "../../components/auth-shell";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return "Never";
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const userColumns = [
  {
    key: "name",
    header: "User",
    sortable: true,
    sortValue: (row: AdminUser) => row.name,
    render: (row: AdminUser) => (
      <Box className="flex flex-col">
        <Text variant="body-sm" className="text-content font-medium">{row.name}</Text>
        <Text variant="caption" className="text-content-tertiary">{row.email}</Text>
      </Box>
    ),
  },
  {
    key: "role",
    header: "Role",
    sortable: true,
    sortValue: (row: AdminUser) => row.role,
    render: (row: AdminUser) => (
      <Text variant="body-sm" className="text-content-secondary capitalize">{row.role}</Text>
    ),
  },
  {
    key: "plan",
    header: "Plan",
    sortable: true,
    sortValue: (row: AdminUser) => row.plan,
    render: (row: AdminUser) => {
      const planColors: Record<string, string> = {
        free: "bg-content-tertiary/10 text-content-tertiary",
        pro: "bg-brand-600/10 text-brand-400",
        enterprise: "bg-status-success/10 text-status-success",
      };
      return (
        <Box className={`inline-flex rounded-full px-2 py-0.5 ${planColors[row.plan] ?? "bg-content-tertiary/10 text-content-tertiary"}`}>
          <Text as="span" variant="caption" className="font-medium capitalize">{row.plan}</Text>
        </Box>
      );
    },
  },
  {
    key: "account",
    header: "Account",
    render: (row: AdminUser) => (
      <Text variant="body-sm" className="text-content-secondary">{row.accountName ?? "--"}</Text>
    ),
  },
  {
    key: "emailsSent",
    header: "Sent (Period)",
    sortable: true,
    sortValue: (row: AdminUser) => row.emailsSentThisPeriod,
    render: (row: AdminUser) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">{formatNumber(row.emailsSentThisPeriod)}</Text>
    ),
  },
  {
    key: "lastLogin",
    header: "Last Login",
    render: (row: AdminUser) => (
      <Text variant="caption" className="text-content-tertiary">{timeAgo(row.lastLoginAt)}</Text>
    ),
  },
  {
    key: "createdAt",
    header: "Joined",
    sortable: true,
    sortValue: (row: AdminUser) => row.createdAt,
    render: (row: AdminUser) => (
      <Text variant="caption" className="text-content-tertiary">{new Date(row.createdAt).toLocaleDateString()}</Text>
    ),
  },
] as const;

export default function UsersPage() {
  const fetcher = useCallback(() => adminApi.listUsers(), []);
  const { data: users, loading, error } = useApi<AdminUser[]>(fetcher);

  const userList = users ?? [];
  const planCounts: Record<string, number> = {};
  for (const u of userList) {
    planCounts[u.plan] = (planCounts[u.plan] ?? 0) + 1;
  }

  return (
    <AuthShell>
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">User Management</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Manage platform users, account statuses, sending limits, and activity monitoring
        </Text>
      </Box>

      {error && (
        <Box className="rounded-xl bg-status-error/10 border border-status-error/30 p-4">
          <Text variant="body-sm" className="text-status-error">
            Failed to load users: {error}
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="User summary metrics">
        <MetricCard
          label="Total Users"
          value={loading ? "..." : userList.length.toString()}
        />
        <MetricCard
          label="Enterprise"
          value={loading ? "..." : (planCounts["enterprise"] ?? 0).toString()}
        />
        <MetricCard
          label="Pro"
          value={loading ? "..." : (planCounts["pro"] ?? 0).toString()}
        />
        <MetricCard
          label="Free"
          value={loading ? "..." : (planCounts["free"] ?? 0).toString()}
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2 rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Plan Distribution</Text>
          {loading ? (
            <Box className="h-24 bg-surface-tertiary/50 rounded animate-pulse" />
          ) : (
            <Box className="flex gap-4" role="list" aria-label="User plan distribution">
              {(["free", "pro", "enterprise"] as const).map((plan) => {
                const planCount = planCounts[plan] ?? 0;
                const pct = userList.length > 0 ? Math.round((planCount / userList.length) * 100) : 0;
                const colors = {
                  free: { bg: "bg-content-tertiary/20", fill: "bg-content-tertiary" },
                  pro: { bg: "bg-brand-500/20", fill: "bg-brand-500" },
                  enterprise: { bg: "bg-status-success/20", fill: "bg-status-success" },
                } as const;
                return (
                  <Box key={plan} className="flex-1 text-center" role="listitem">
                    <Box className={`h-24 rounded-lg ${colors[plan].bg} flex items-end justify-center p-2 mb-2`}>
                      <Box className={`w-full rounded ${colors[plan].fill}`} style={{ height: `${Math.max(pct * 2, 4)}%` }} />
                    </Box>
                    <Text variant="heading-sm" className="text-content font-bold">{planCount}</Text>
                    <Text variant="caption" className="text-content-secondary capitalize">{plan} ({pct}%)</Text>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Recently Joined</Text>
          {loading ? (
            <Box className="flex flex-col gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Box key={i} className="h-10 bg-surface-tertiary/50 rounded animate-pulse" />
              ))}
            </Box>
          ) : (
            <Box className="flex flex-col gap-3" role="list" aria-label="Recent users">
              {userList.slice(0, 5).map((user) => (
                <Box key={user.id} className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0" role="listitem">
                  <Box className="flex-1">
                    <Text variant="body-sm" className="text-content">{user.name}</Text>
                    <Text variant="caption" className="text-content-tertiary">{user.email}</Text>
                  </Box>
                  <Text variant="caption" className="text-content-tertiary whitespace-nowrap">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </Text>
                </Box>
              ))}
              {userList.length === 0 && (
                <Text variant="body-sm" className="text-content-tertiary">No users yet</Text>
              )}
            </Box>
          )}
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">All Users</Text>
        {loading ? (
          <Box className="rounded-xl bg-surface-secondary border border-border p-8 text-center">
            <Text variant="body-sm" className="text-content-tertiary">Loading users...</Text>
          </Box>
        ) : (
          <DataTable
            columns={userColumns}
            data={userList}
            rowKey={(row) => row.id}
            pageSize={10}
            filterPlaceholder="Search by name or email..."
            filterFn={(row, query) => {
              const q = query.toLowerCase();
              return row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q);
            }}
            emptyMessage="No users found"
          />
        )}
      </Box>
    </Box>
    </AuthShell>
  );
}
