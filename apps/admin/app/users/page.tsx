import {
  PageLayout,
  Box,
  Text,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  StatCard,
  Button,
  Input,
} from "@emailed/ui";

interface UserAccount {
  id: string;
  name: string;
  email: string;
  plan: "free" | "starter" | "business" | "enterprise";
  status: "active" | "suspended" | "pending" | "deactivated";
  emailsSent30d: number;
  domainsVerified: number;
  storageUsedMb: number;
  storageLimitMb: number;
  createdAt: string;
  lastActiveAt: string;
  aiComposeCalls30d: number;
  riskScore: number;
}

const users: UserAccount[] = [
  {
    id: "usr_a1b2c3",
    name: "Acme Corporation",
    email: "admin@acmecorp.com",
    plan: "enterprise",
    status: "active",
    emailsSent30d: 1250000,
    domainsVerified: 12,
    storageUsedMb: 48200,
    storageLimitMb: 100000,
    createdAt: "2025-06-15T00:00:00Z",
    lastActiveAt: "2026-04-06T14:30:00Z",
    aiComposeCalls30d: 8420,
    riskScore: 2,
  },
  {
    id: "usr_d4e5f6",
    name: "StartupIO Inc",
    email: "founder@startup.io",
    plan: "business",
    status: "active",
    emailsSent30d: 340000,
    domainsVerified: 3,
    storageUsedMb: 12400,
    storageLimitMb: 50000,
    createdAt: "2025-09-22T00:00:00Z",
    lastActiveAt: "2026-04-06T13:15:00Z",
    aiComposeCalls30d: 2150,
    riskScore: 5,
  },
  {
    id: "usr_g7h8i9",
    name: "NewsletterCo",
    email: "ops@newsletter.co",
    plan: "business",
    status: "active",
    emailsSent30d: 890000,
    domainsVerified: 5,
    storageUsedMb: 8900,
    storageLimitMb: 50000,
    createdAt: "2025-11-01T00:00:00Z",
    lastActiveAt: "2026-04-06T12:00:00Z",
    aiComposeCalls30d: 450,
    riskScore: 28,
  },
  {
    id: "usr_j1k2l3",
    name: "SpamKing LLC",
    email: "contact@spamking.biz",
    plan: "starter",
    status: "suspended",
    emailsSent30d: 0,
    domainsVerified: 1,
    storageUsedMb: 250,
    storageLimitMb: 5000,
    createdAt: "2026-03-15T00:00:00Z",
    lastActiveAt: "2026-03-28T08:00:00Z",
    aiComposeCalls30d: 0,
    riskScore: 95,
  },
  {
    id: "usr_m4n5o6",
    name: "Design Studio Pro",
    email: "hello@designstudio.pro",
    plan: "starter",
    status: "active",
    emailsSent30d: 15000,
    domainsVerified: 2,
    storageUsedMb: 3200,
    storageLimitMb: 5000,
    createdAt: "2026-01-10T00:00:00Z",
    lastActiveAt: "2026-04-06T10:45:00Z",
    aiComposeCalls30d: 890,
    riskScore: 3,
  },
  {
    id: "usr_p7q8r9",
    name: "TechFirm Solutions",
    email: "admin@techfirm.com",
    plan: "enterprise",
    status: "active",
    emailsSent30d: 2100000,
    domainsVerified: 8,
    storageUsedMb: 72000,
    storageLimitMb: 100000,
    createdAt: "2025-04-20T00:00:00Z",
    lastActiveAt: "2026-04-06T14:28:00Z",
    aiComposeCalls30d: 12400,
    riskScore: 1,
  },
  {
    id: "usr_s1t2u3",
    name: "Freelance Jane",
    email: "jane@freelancejane.com",
    plan: "free",
    status: "active",
    emailsSent30d: 420,
    domainsVerified: 1,
    storageUsedMb: 180,
    storageLimitMb: 500,
    createdAt: "2026-02-28T00:00:00Z",
    lastActiveAt: "2026-04-05T16:00:00Z",
    aiComposeCalls30d: 65,
    riskScore: 0,
  },
  {
    id: "usr_v4w5x6",
    name: "Pending Corp",
    email: "setup@pendingcorp.com",
    plan: "business",
    status: "pending",
    emailsSent30d: 0,
    domainsVerified: 0,
    storageUsedMb: 0,
    storageLimitMb: 50000,
    createdAt: "2026-04-05T00:00:00Z",
    lastActiveAt: "2026-04-05T09:00:00Z",
    aiComposeCalls30d: 0,
    riskScore: 0,
  },
];

const planStyles: Record<UserAccount["plan"], { bg: string; text: string }> = {
  free: { bg: "bg-slate-50", text: "text-content-secondary" },
  starter: { bg: "bg-blue-50", text: "text-status-info" },
  business: { bg: "bg-purple-50", text: "text-purple-700" },
  enterprise: { bg: "bg-brand-50", text: "text-brand-700" },
};

const statusStyles: Record<UserAccount["status"], { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-50", text: "text-status-success", label: "Active" },
  suspended: { bg: "bg-red-50", text: "text-status-error", label: "Suspended" },
  pending: { bg: "bg-amber-50", text: "text-status-warning", label: "Pending" },
  deactivated: { bg: "bg-slate-50", text: "text-content-tertiary", label: "Deactivated" },
};

export default function UsersPage() {
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const suspendedUsers = users.filter((u) => u.status === "suspended").length;
  const enterpriseUsers = users.filter((u) => u.plan === "enterprise").length;

  return (
    <PageLayout
      title="User Management"
      description="Search, filter, and manage platform user accounts"
    >
      <Box className="space-y-6">
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Accounts"
            value={totalUsers}
            trend="up"
            changePercent={8.2}
            description="all time"
          />
          <StatCard
            label="Active"
            value={activeUsers}
            trend="up"
            changePercent={5.1}
            description="currently active"
          />
          <StatCard
            label="Suspended"
            value={suspendedUsers}
            trend="down"
            description="AI-flagged accounts"
          />
          <StatCard
            label="Enterprise"
            value={enterpriseUsers}
            trend="up"
            changePercent={12}
            description="top-tier accounts"
          />
        </Box>

        <UserSearchAndFilter />
        <UserTable users={users} />
      </Box>
    </PageLayout>
  );
}

function UserSearchAndFilter() {
  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Box className="flex-1 w-full sm:w-auto">
            <Input
              placeholder="Search by name, email, or account ID..."
              className="w-full"
            />
          </Box>
          <Box className="flex items-center gap-2 flex-wrap">
            <FilterButton label="All Plans" />
            <FilterButton label="All Statuses" />
            <FilterButton label="Risk: Any" />
            <Button variant="primary" size="sm">
              Search
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function FilterButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" size="sm">
      {label}
    </Button>
  );
}

function UserTable({ users: allUsers }: { users: UserAccount[] }) {
  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">User Accounts</Text>
          <Box className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              Export CSV
            </Button>
            <Button variant="primary" size="sm">
              Add User
            </Button>
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="overflow-x-auto">
          <Box as="table" className="w-full">
            <Box as="thead">
              <Box as="tr" className="border-b border-border">
                <TableHeader label="Account" />
                <TableHeader label="Plan" />
                <TableHeader label="Status" />
                <TableHeader label="Emails (30d)" />
                <TableHeader label="Domains" />
                <TableHeader label="Storage" />
                <TableHeader label="Risk" />
                <TableHeader label="Actions" />
              </Box>
            </Box>
            <Box as="tbody">
              {allUsers.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </Box>
          </Box>
        </Box>
      </CardContent>
      <CardFooter>
        <Box className="flex items-center justify-between">
          <Text variant="caption" muted>
            Showing {allUsers.length} accounts
          </Text>
          <Box className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              Previous
            </Button>
            <Text variant="caption" className="font-medium">
              Page 1 of 1
            </Text>
            <Button variant="secondary" size="sm">
              Next
            </Button>
          </Box>
        </Box>
      </CardFooter>
    </Card>
  );
}

function UserRow({ user }: { user: UserAccount }) {
  const plan = planStyles[user.plan];
  const status = statusStyles[user.status];
  const storagePercent = user.storageLimitMb > 0
    ? Math.round((user.storageUsedMb / user.storageLimitMb) * 100)
    : 0;
  const lastActive = formatRelativeTime(user.lastActiveAt);

  return (
    <Box as="tr" className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
      <Box as="td" className="py-3 pr-4">
        <Box className="flex items-center gap-3">
          <Box className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
            <Text as="span" variant="body-sm" className="font-semibold text-brand-700">
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </Box>
          <Box>
            <Text variant="body-sm" className="font-medium">
              {user.name}
            </Text>
            <Text variant="caption" muted>
              {user.email}
            </Text>
            <Text variant="caption" className="text-content-tertiary font-mono">
              {user.id}
            </Text>
          </Box>
        </Box>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Box className={`inline-flex px-2 py-0.5 rounded ${plan.bg}`}>
          <Text variant="caption" className={`font-medium capitalize ${plan.text}`}>
            {user.plan}
          </Text>
        </Box>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Box className={`inline-flex px-2 py-0.5 rounded-full ${status.bg}`}>
          <Text variant="caption" className={`font-medium ${status.text}`}>
            {status.label}
          </Text>
        </Box>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm">
          {user.emailsSent30d.toLocaleString()}
        </Text>
        <Text variant="caption" muted>
          AI compose: {user.aiComposeCalls30d.toLocaleString()}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm">
          {user.domainsVerified}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Box className="flex items-center gap-2">
          <Box className="w-16 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
            <Box
              className={`h-full rounded-full ${
                storagePercent >= 90 ? "bg-status-error" :
                storagePercent >= 70 ? "bg-status-warning" :
                "bg-brand-500"
              }`}
              style={{ width: `${storagePercent}%` }}
            />
          </Box>
          <Text variant="caption" muted>
            {storagePercent}%
          </Text>
        </Box>
        <Text variant="caption" muted>
          {formatStorageSize(user.storageUsedMb)} / {formatStorageSize(user.storageLimitMb)}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <RiskBadge score={user.riskScore} />
      </Box>
      <Box as="td" className="py-3">
        <Box className="flex items-center gap-1">
          {user.status === "active" ? (
            <Button variant="secondary" size="sm">
              Suspend
            </Button>
          ) : user.status === "suspended" ? (
            <Button variant="primary" size="sm">
              Unsuspend
            </Button>
          ) : (
            <Button variant="secondary" size="sm">
              View
            </Button>
          )}
        </Box>
        <Text variant="caption" muted className="mt-1">
          Active {lastActive}
        </Text>
      </Box>
    </Box>
  );
}

function RiskBadge({ score }: { score: number }) {
  const level = score >= 70 ? "critical" :
    score >= 40 ? "high" :
    score >= 15 ? "medium" :
    "low";

  const styles: Record<string, { bg: string; text: string }> = {
    critical: { bg: "bg-red-100", text: "text-status-error" },
    high: { bg: "bg-amber-100", text: "text-status-warning" },
    medium: { bg: "bg-blue-50", text: "text-status-info" },
    low: { bg: "bg-emerald-50", text: "text-status-success" },
  };

  const style = styles[level] ?? styles["low"];

  return (
    <Box className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${style.bg}`}>
      <Text variant="caption" className={`font-medium ${style.text}`}>
        {score}
      </Text>
      <Text variant="caption" className={style.text}>
        {level}
      </Text>
    </Box>
  );
}

function TableHeader({ label }: { label: string }) {
  return (
    <Box as="th" className="py-2 pr-4 text-left">
      <Text variant="caption" className="font-semibold uppercase tracking-wider text-content-tertiary">
        {label}
      </Text>
    </Box>
  );
}

function formatStorageSize(mb: number): string {
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

function formatRelativeTime(isoString: string): string {
  const now = new Date("2026-04-06T15:00:00Z");
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
