import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { DataTable } from "../../components/data-table";

interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly plan: "free" | "pro" | "enterprise";
  readonly status: "active" | "suspended" | "pending" | "deactivated";
  readonly sendLimit: number;
  readonly sentToday: number;
  readonly domainsCount: number;
  readonly lastActive: string;
  readonly createdAt: string;
}

const users: readonly User[] = [
  { id: "u-001", email: "alice@acme-corp.com", name: "Alice Chen", plan: "enterprise", status: "active", sendLimit: 500000, sentToday: 128400, domainsCount: 3, lastActive: "2 min ago", createdAt: "2025-06-15" },
  { id: "u-002", email: "bob@newsletter.io", name: "Bob Martinez", plan: "pro", status: "active", sendLimit: 100000, sentToday: 87200, domainsCount: 2, lastActive: "5 min ago", createdAt: "2025-08-22" },
  { id: "u-003", email: "carol@startup-labs.co", name: "Carol Johnson", plan: "pro", status: "active", sendLimit: 100000, sentToday: 34100, domainsCount: 1, lastActive: "18 min ago", createdAt: "2025-11-03" },
  { id: "u-004", email: "dave@bulk-news.co", name: "Dave Wilson", plan: "enterprise", status: "active", sendLimit: 500000, sentToday: 245000, domainsCount: 1, lastActive: "1 min ago", createdAt: "2025-09-10" },
  { id: "u-005", email: "emma@devtools.xyz", name: "Emma Nakamura", plan: "pro", status: "active", sendLimit: 100000, sentToday: 21500, domainsCount: 1, lastActive: "34 min ago", createdAt: "2025-12-01" },
  { id: "u-006", email: "frank@bigretail.store", name: "Frank Okafor", plan: "enterprise", status: "pending", sendLimit: 500000, sentToday: 0, domainsCount: 1, lastActive: "Never", createdAt: "2026-03-28" },
  { id: "u-007", email: "grace@financeapp.com", name: "Grace Liu", plan: "pro", status: "active", sendLimit: 100000, sentToday: 56800, domainsCount: 1, lastActive: "8 min ago", createdAt: "2026-01-10" },
  { id: "u-008", email: "hank@spammer.biz", name: "Hank Doe", plan: "free", status: "suspended", sendLimit: 0, sentToday: 0, domainsCount: 0, lastActive: "3 days ago", createdAt: "2026-03-15" },
  { id: "u-009", email: "iris@saas-platform.io", name: "Iris Patel", plan: "enterprise", status: "active", sendLimit: 500000, sentToday: 178600, domainsCount: 2, lastActive: "1 min ago", createdAt: "2025-07-20" },
  { id: "u-010", email: "james@healthco.org", name: "James Kim", plan: "pro", status: "active", sendLimit: 100000, sentToday: 12400, domainsCount: 1, lastActive: "1 hr ago", createdAt: "2026-02-14" },
  { id: "u-011", email: "kate@edu-platform.edu", name: "Kate Thompson", plan: "pro", status: "active", sendLimit: 100000, sentToday: 8900, domainsCount: 1, lastActive: "45 min ago", createdAt: "2026-02-28" },
  { id: "u-012", email: "leo@new-sender.net", name: "Leo Santos", plan: "free", status: "deactivated", sendLimit: 0, sentToday: 0, domainsCount: 0, lastActive: "2 weeks ago", createdAt: "2026-03-01" },
] as const;

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function UsageBar({ used, limit }: { readonly used: number; readonly limit: number }) {
  if (limit === 0) return <Text variant="caption" className="text-content-tertiary">--</Text>;
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? "bg-status-error" : pct >= 70 ? "bg-status-warning" : "bg-status-success";

  return (
    <Box className="flex items-center gap-2">
      <Box className="flex-1 h-1.5 bg-surface-tertiary rounded-full overflow-hidden w-20" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit} aria-label={`${formatNumber(used)} of ${formatNumber(limit)} sent`}>
        <Box className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </Box>
      <Text variant="caption" className="text-content-secondary font-mono whitespace-nowrap">
        {formatNumber(used)}/{formatNumber(limit)}
      </Text>
    </Box>
  );
}

UsageBar.displayName = "UsageBar";

const userColumns = [
  {
    key: "name",
    header: "User",
    sortable: true,
    sortValue: (row: User) => row.name,
    render: (row: User) => (
      <Box className="flex flex-col">
        <Text variant="body-sm" className="text-content font-medium">{row.name}</Text>
        <Text variant="caption" className="text-content-tertiary">{row.email}</Text>
      </Box>
    ),
  },
  {
    key: "plan",
    header: "Plan",
    sortable: true,
    sortValue: (row: User) => row.plan,
    render: (row: User) => {
      const planColors: Record<string, string> = {
        free: "bg-content-tertiary/10 text-content-tertiary",
        pro: "bg-brand-600/10 text-brand-400",
        enterprise: "bg-status-success/10 text-status-success",
      };
      return (
        <Box className={`inline-flex rounded-full px-2 py-0.5 ${planColors[row.plan] ?? ""}`}>
          <Text as="span" variant="caption" className="font-medium capitalize">{row.plan}</Text>
        </Box>
      );
    },
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (row: User) => row.status,
    render: (row: User) => {
      const map = {
        active: { status: "healthy" as const, label: "Active" },
        suspended: { status: "critical" as const, label: "Suspended" },
        pending: { status: "warning" as const, label: "Pending" },
        deactivated: { status: "unknown" as const, label: "Deactivated" },
      } as const;
      const config = map[row.status];
      return <StatusBadge status={config.status} label={config.label} />;
    },
  },
  {
    key: "usage",
    header: "Daily Usage",
    sortable: true,
    sortValue: (row: User) => row.sentToday,
    width: "w-48",
    render: (row: User) => <UsageBar used={row.sentToday} limit={row.sendLimit} />,
  },
  {
    key: "domains",
    header: "Domains",
    sortable: true,
    sortValue: (row: User) => row.domainsCount,
    render: (row: User) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">{row.domainsCount}</Text>
    ),
  },
  {
    key: "lastActive",
    header: "Last Active",
    render: (row: User) => (
      <Text variant="caption" className="text-content-tertiary">{row.lastActive}</Text>
    ),
  },
  {
    key: "createdAt",
    header: "Joined",
    sortable: true,
    sortValue: (row: User) => row.createdAt,
    render: (row: User) => (
      <Text variant="caption" className="text-content-tertiary">{row.createdAt}</Text>
    ),
  },
] as const;

export default function UsersPage() {
  const activeCount = users.filter((u) => u.status === "active").length;
  const suspendedCount = users.filter((u) => u.status === "suspended").length;
  const enterpriseCount = users.filter((u) => u.plan === "enterprise").length;
  const totalSentToday = users.reduce((sum, u) => sum + u.sentToday, 0);

  return (
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">User Management</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Manage platform users, account statuses, sending limits, and activity monitoring
        </Text>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="User summary metrics">
        <MetricCard
          label="Total Users"
          value={users.length.toString()}
          trend={{ direction: "up", value: "423 this week" }}
          sparklineData={[33100, 33400, 33600, 33800, 33900, 34000, 34100, 34219]}
        />
        <MetricCard
          label="Active Users"
          value={activeCount.toString()}
          description={`${suspendedCount} suspended`}
        />
        <MetricCard
          label="Enterprise Accounts"
          value={enterpriseCount.toString()}
          trend={{ direction: "up", value: "1 this month" }}
        />
        <MetricCard
          label="Sent Today (All Users)"
          value={formatNumber(totalSentToday)}
          trend={{ direction: "up", value: "12.3%" }}
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2 rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Plan Distribution</Text>
          <Box className="flex gap-4" role="list" aria-label="User plan distribution">
            {(["free", "pro", "enterprise"] as const).map((plan) => {
              const count = users.filter((u) => u.plan === plan).length;
              const pct = Math.round((count / users.length) * 100);
              const colors = {
                free: { bg: "bg-content-tertiary/20", fill: "bg-content-tertiary" },
                pro: { bg: "bg-brand-500/20", fill: "bg-brand-500" },
                enterprise: { bg: "bg-status-success/20", fill: "bg-status-success" },
              } as const;
              return (
                <Box key={plan} className="flex-1 text-center" role="listitem">
                  <Box className={`h-24 rounded-lg ${colors[plan].bg} flex items-end justify-center p-2 mb-2`}>
                    <Box className={`w-full rounded ${colors[plan].fill}`} style={{ height: `${pct * 2}%` }} />
                  </Box>
                  <Text variant="heading-sm" className="text-content font-bold">{count}</Text>
                  <Text variant="caption" className="text-content-secondary capitalize">{plan} ({pct}%)</Text>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Recent Activity</Text>
          <Box className="flex flex-col gap-3" role="list" aria-label="Recent user activity">
            {[
              { action: "New signup", user: "frank@bigretail.store", time: "6 days ago" },
              { action: "Plan upgrade", user: "grace@financeapp.com", time: "2 weeks ago" },
              { action: "Account suspended", user: "hank@spammer.biz", time: "19 days ago" },
              { action: "Domain verified", user: "kate@edu-platform.edu", time: "1 month ago" },
              { action: "API key generated", user: "iris@saas-platform.io", time: "1 month ago" },
            ].map((activity, i) => (
              <Box key={i} className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0" role="listitem">
                <Box className="flex-1">
                  <Text variant="body-sm" className="text-content">{activity.action}</Text>
                  <Text variant="caption" className="text-content-tertiary">{activity.user}</Text>
                </Box>
                <Text variant="caption" className="text-content-tertiary whitespace-nowrap">{activity.time}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">All Users</Text>
        <DataTable
          columns={userColumns}
          data={users}
          rowKey={(row) => row.id}
          pageSize={10}
          filterPlaceholder="Search by name or email..."
          filterFn={(row, query) => {
            const q = query.toLowerCase();
            return row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q);
          }}
          emptyMessage="No users found"
        />
      </Box>
    </Box>
  );
}
