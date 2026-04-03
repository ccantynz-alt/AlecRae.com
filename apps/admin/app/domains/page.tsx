import { Box, Text } from "@emailed/ui";
import { StatusBadge } from "../../components/status-badge";
import { MetricCard } from "../../components/metric-card";
import { DataTable } from "../../components/data-table";

interface Domain {
  readonly id: string;
  readonly name: string;
  readonly status: "verified" | "pending" | "failed";
  readonly spf: "pass" | "fail" | "missing";
  readonly dkim: "pass" | "fail" | "missing";
  readonly dmarc: "pass" | "fail" | "missing";
  readonly reputation: number;
  readonly messagesSent24h: number;
  readonly addedAt: string;
}

const domains: readonly Domain[] = [
  { id: "1", name: "emailed.dev", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 98, messagesSent24h: 452300, addedAt: "2025-08-14" },
  { id: "2", name: "acme-corp.com", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 96, messagesSent24h: 128400, addedAt: "2025-09-22" },
  { id: "3", name: "newsletter.io", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 94, messagesSent24h: 87200, addedAt: "2025-10-05" },
  { id: "4", name: "startup-labs.co", status: "verified", spf: "pass", dkim: "pass", dmarc: "fail", reputation: 91, messagesSent24h: 34100, addedAt: "2025-11-18" },
  { id: "5", name: "bigretail.store", status: "pending", spf: "pass", dkim: "missing", dmarc: "missing", reputation: 0, messagesSent24h: 0, addedAt: "2026-03-28" },
  { id: "6", name: "devtools.xyz", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 97, messagesSent24h: 21500, addedAt: "2025-12-01" },
  { id: "7", name: "financeapp.com", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 95, messagesSent24h: 56800, addedAt: "2026-01-10" },
  { id: "8", name: "bulk-news.co", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 82, messagesSent24h: 245000, addedAt: "2026-01-22" },
  { id: "9", name: "new-sender.net", status: "failed", spf: "fail", dkim: "fail", dmarc: "missing", reputation: 0, messagesSent24h: 0, addedAt: "2026-04-01" },
  { id: "10", name: "saas-platform.io", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 99, messagesSent24h: 178600, addedAt: "2025-07-30" },
  { id: "11", name: "healthco.org", status: "verified", spf: "pass", dkim: "pass", dmarc: "pass", reputation: 93, messagesSent24h: 12400, addedAt: "2026-02-14" },
  { id: "12", name: "edu-platform.edu", status: "verified", spf: "pass", dkim: "pass", dmarc: "fail", reputation: 88, messagesSent24h: 8900, addedAt: "2026-02-28" },
] as const;

function DnsStatusIndicator({ value }: { readonly value: "pass" | "fail" | "missing" }) {
  const config = {
    pass: { label: "Pass", className: "text-status-success" },
    fail: { label: "Fail", className: "text-status-error" },
    missing: { label: "Missing", className: "text-content-tertiary" },
  } as const;

  const c = config[value];
  return (
    <Text as="span" variant="caption" className={`font-mono font-medium ${c.className}`}>
      {c.label}
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
    key: "name",
    header: "Domain",
    sortable: true,
    sortValue: (row: Domain) => row.name,
    render: (row: Domain) => (
      <Text variant="body-sm" className="text-content font-medium">{row.name}</Text>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (row: Domain) => row.status,
    render: (row: Domain) => {
      const statusMap = { verified: "healthy", pending: "warning", failed: "critical" } as const;
      const labelMap = { verified: "Verified", pending: "Pending", failed: "Failed" } as const;
      return <StatusBadge status={statusMap[row.status]} label={labelMap[row.status]} />;
    },
  },
  {
    key: "spf",
    header: "SPF",
    render: (row: Domain) => <DnsStatusIndicator value={row.spf} />,
  },
  {
    key: "dkim",
    header: "DKIM",
    render: (row: Domain) => <DnsStatusIndicator value={row.dkim} />,
  },
  {
    key: "dmarc",
    header: "DMARC",
    render: (row: Domain) => <DnsStatusIndicator value={row.dmarc} />,
  },
  {
    key: "reputation",
    header: "Reputation",
    sortable: true,
    sortValue: (row: Domain) => row.reputation,
    render: (row: Domain) => {
      const color = row.reputation >= 90 ? "text-status-success" : row.reputation >= 70 ? "text-status-warning" : row.reputation > 0 ? "text-status-error" : "text-content-tertiary";
      return (
        <Text variant="body-sm" className={`font-mono font-medium ${color}`}>
          {row.reputation > 0 ? row.reputation : "--"}
        </Text>
      );
    },
  },
  {
    key: "messagesSent24h",
    header: "Sent (24h)",
    sortable: true,
    sortValue: (row: Domain) => row.messagesSent24h,
    render: (row: Domain) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">
        {row.messagesSent24h > 0 ? formatNumber(row.messagesSent24h) : "--"}
      </Text>
    ),
  },
  {
    key: "addedAt",
    header: "Added",
    sortable: true,
    sortValue: (row: Domain) => row.addedAt,
    render: (row: Domain) => (
      <Text variant="caption" className="text-content-tertiary">{row.addedAt}</Text>
    ),
  },
] as const;

export default function DomainsPage() {
  const verifiedCount = domains.filter((d) => d.status === "verified").length;
  const pendingCount = domains.filter((d) => d.status === "pending").length;
  const failedCount = domains.filter((d) => d.status === "failed").length;
  const avgReputation = Math.round(
    domains.filter((d) => d.reputation > 0).reduce((sum, d) => sum + d.reputation, 0) /
    domains.filter((d) => d.reputation > 0).length
  );

  return (
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Domain Management</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Manage domains, DNS authentication, and per-domain reputation
        </Text>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Domain summary metrics">
        <MetricCard label="Total Domains" value={domains.length.toString()} />
        <MetricCard label="Verified" value={verifiedCount.toString()} trend={{ direction: "up", value: "+2 this week" }} />
        <MetricCard label="Pending / Failed" value={`${pendingCount} / ${failedCount}`} />
        <MetricCard label="Avg. Reputation" value={avgReputation.toString()} trend={{ direction: "up", value: "1.2" }} />
      </Box>

      <DataTable
        columns={columns}
        data={domains}
        rowKey={(row) => row.id}
        pageSize={10}
        filterPlaceholder="Search domains..."
        filterFn={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
        emptyMessage="No domains found"
      />
    </Box>
  );
}
