import {
  PageLayout,
  Box,
  Text,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  StatCard,
  AnalyticsChart,
  Button,
  type ChartDataPoint,
  type StatTrend,
} from "@emailed/ui";

interface IpReputationEntry {
  address: string;
  pool: string;
  score: number;
  status: "excellent" | "good" | "fair" | "poor" | "blocked";
  warmupTier: number;
  maxTier: number;
  dailyCapacity: number;
  sentToday: number;
  bounceRate: number;
  complaintRate: number;
}

interface DomainReputationEntry {
  domain: string;
  owner: string;
  score: number;
  dmarcPolicy: "none" | "quarantine" | "reject";
  spfAligned: boolean;
  dkimAligned: boolean;
  bounceRate: number;
  complaintRate: number;
  lastChecked: string;
}

interface BlocklistEntry {
  listName: string;
  listUrl: string;
  affectedIps: string[];
  detectedAt: string;
  status: "listed" | "delisting-requested" | "delisted";
  estimatedRemovalHours: number;
}

const ipReputations: IpReputationEntry[] = [
  {
    address: "198.51.100.1",
    pool: "transactional-primary",
    score: 95,
    status: "excellent",
    warmupTier: 5,
    maxTier: 5,
    dailyCapacity: 500000,
    sentToday: 342100,
    bounceRate: 0.8,
    complaintRate: 0.01,
  },
  {
    address: "198.51.100.2",
    pool: "transactional-primary",
    score: 92,
    status: "excellent",
    warmupTier: 5,
    maxTier: 5,
    dailyCapacity: 500000,
    sentToday: 289400,
    bounceRate: 1.1,
    complaintRate: 0.02,
  },
  {
    address: "198.51.100.10",
    pool: "marketing-pool",
    score: 78,
    status: "good",
    warmupTier: 3,
    maxTier: 5,
    dailyCapacity: 50000,
    sentToday: 41200,
    bounceRate: 2.4,
    complaintRate: 0.08,
  },
  {
    address: "198.51.100.20",
    pool: "warmup-queue",
    score: 55,
    status: "fair",
    warmupTier: 1,
    maxTier: 5,
    dailyCapacity: 5000,
    sentToday: 3200,
    bounceRate: 4.1,
    complaintRate: 0.15,
  },
  {
    address: "198.51.100.30",
    pool: "quarantine",
    score: 22,
    status: "poor",
    warmupTier: 0,
    maxTier: 5,
    dailyCapacity: 0,
    sentToday: 0,
    bounceRate: 12.3,
    complaintRate: 0.92,
  },
];

const domainReputations: DomainReputationEntry[] = [
  {
    domain: "acme.com",
    owner: "Acme Corp",
    score: 97,
    dmarcPolicy: "reject",
    spfAligned: true,
    dkimAligned: true,
    bounceRate: 0.5,
    complaintRate: 0.01,
    lastChecked: "2026-04-06T14:30:00Z",
  },
  {
    domain: "startup.io",
    owner: "StartupIO Inc",
    score: 84,
    dmarcPolicy: "quarantine",
    spfAligned: true,
    dkimAligned: true,
    bounceRate: 1.8,
    complaintRate: 0.05,
    lastChecked: "2026-04-06T14:28:00Z",
  },
  {
    domain: "newsletter.co",
    owner: "NewsletterCo",
    score: 62,
    dmarcPolicy: "none",
    spfAligned: true,
    dkimAligned: false,
    bounceRate: 4.2,
    complaintRate: 0.22,
    lastChecked: "2026-04-06T14:25:00Z",
  },
];

const blocklistEntries: BlocklistEntry[] = [
  {
    listName: "Spamhaus SBL",
    listUrl: "https://www.spamhaus.org/sbl/",
    affectedIps: ["198.51.100.30"],
    detectedAt: "2026-04-05T08:00:00Z",
    status: "delisting-requested",
    estimatedRemovalHours: 12,
  },
  {
    listName: "Barracuda BRBL",
    listUrl: "https://www.barracudacentral.org/",
    affectedIps: ["198.51.100.30"],
    detectedAt: "2026-04-05T10:30:00Z",
    status: "listed",
    estimatedRemovalHours: 48,
  },
];

const warmupProgressData: ChartDataPoint[] = [
  { label: "Week 1", value: 500 },
  { label: "Week 2", value: 2000 },
  { label: "Week 3", value: 5000 },
  { label: "Week 4", value: 15000 },
  { label: "Week 5", value: 35000 },
  { label: "Week 6", value: 50000 },
];

const complaintTrendData: ChartDataPoint[] = [
  { label: "Jan", value: 0.12 },
  { label: "Feb", value: 0.09 },
  { label: "Mar", value: 0.07 },
  { label: "Apr", value: 0.05 },
];

const reputationStatusStyles: Record<IpReputationEntry["status"], { bg: string; text: string }> = {
  excellent: { bg: "bg-emerald-50", text: "text-status-success" },
  good: { bg: "bg-blue-50", text: "text-status-info" },
  fair: { bg: "bg-amber-50", text: "text-status-warning" },
  poor: { bg: "bg-red-50", text: "text-status-error" },
  blocked: { bg: "bg-red-100", text: "text-status-error" },
};

const blocklistStatusStyles: Record<BlocklistEntry["status"], { bg: string; text: string; label: string }> = {
  listed: { bg: "bg-red-50", text: "text-status-error", label: "Listed" },
  "delisting-requested": { bg: "bg-amber-50", text: "text-status-warning", label: "Delisting Requested" },
  delisted: { bg: "bg-emerald-50", text: "text-status-success", label: "Delisted" },
};

export default function ReputationPage() {
  const avgScore = Math.round(
    ipReputations.reduce((sum, ip) => sum + ip.score, 0) / ipReputations.length
  );
  const listedCount = blocklistEntries.filter((b) => b.status !== "delisted").length;
  const avgBounceRate = (
    ipReputations.reduce((sum, ip) => sum + ip.bounceRate, 0) / ipReputations.length
  ).toFixed(2);
  const avgComplaintRate = (
    ipReputations.reduce((sum, ip) => sum + ip.complaintRate, 0) / ipReputations.length
  ).toFixed(3);

  return (
    <PageLayout
      title="Reputation Management"
      description="IP and domain reputation monitoring, blocklist status, and warm-up progress"
    >
      <Box className="space-y-6">
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Avg IP Score"
            value={avgScore}
            trend={avgScore >= 70 ? "up" : "down"}
            changePercent={2.1}
            description="across all IPs"
          />
          <StatCard
            label="Blocklist Listings"
            value={listedCount}
            trend={listedCount > 0 ? "down" : "up"}
            description="active listings"
          />
          <StatCard
            label="Avg Bounce Rate"
            value={`${avgBounceRate}%`}
            trend="down"
            changePercent={0.3}
            description="7-day average"
          />
          <StatCard
            label="Avg Complaint Rate"
            value={`${avgComplaintRate}%`}
            trend="down"
            changePercent={0.01}
            description="below 0.1% threshold"
          />
        </Box>

        <IpReputationTable entries={ipReputations} />

        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalyticsChart
            title="Warm-up Progress (198.51.100.20)"
            description="Daily sending capacity over warm-up period"
            data={warmupProgressData}
            chartType="area"
            height={180}
            formatValue={(v) => v.toLocaleString()}
          />
          <AnalyticsChart
            title="Complaint Rate Trend"
            description="Platform-wide complaint rate by month"
            data={complaintTrendData}
            chartType="line"
            height={180}
            formatValue={(v) => `${v}%`}
          />
        </Box>

        <DomainReputationTable entries={domainReputations} />
        <BlocklistPanel entries={blocklistEntries} />
      </Box>
    </PageLayout>
  );
}

function IpReputationTable({ entries }: { entries: IpReputationEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">IP Reputation Scores</Text>
          <Button variant="secondary" size="sm">
            Refresh Scores
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="overflow-x-auto">
          <Box as="table" className="w-full">
            <Box as="thead">
              <Box as="tr" className="border-b border-border">
                <TableHeader label="IP Address" />
                <TableHeader label="Pool" />
                <TableHeader label="Score" />
                <TableHeader label="Status" />
                <TableHeader label="Warm-up" />
                <TableHeader label="Capacity" />
                <TableHeader label="Bounce" />
                <TableHeader label="Complaint" />
              </Box>
            </Box>
            <Box as="tbody">
              {entries.map((entry) => (
                <IpReputationRow key={entry.address} entry={entry} />
              ))}
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function IpReputationRow({ entry }: { entry: IpReputationEntry }) {
  const style = reputationStatusStyles[entry.status];
  const capacityPercent = entry.dailyCapacity > 0
    ? Math.round((entry.sentToday / entry.dailyCapacity) * 100)
    : 0;

  return (
    <Box as="tr" className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm" className="font-mono font-medium">
          {entry.address}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm" muted>
          {entry.pool}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <ScoreBadge score={entry.score} />
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Box className={`inline-flex px-2 py-0.5 rounded-full ${style.bg}`}>
          <Text variant="caption" className={`font-medium capitalize ${style.text}`}>
            {entry.status}
          </Text>
        </Box>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Box className="flex items-center gap-2">
          <Box className="w-16 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
            <Box
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${(entry.warmupTier / entry.maxTier) * 100}%` }}
            />
          </Box>
          <Text variant="caption" muted>
            {entry.warmupTier}/{entry.maxTier}
          </Text>
        </Box>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm">
          {entry.sentToday.toLocaleString()}/{entry.dailyCapacity.toLocaleString()}
        </Text>
        <Text variant="caption" muted>
          {capacityPercent}% used
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm" className={entry.bounceRate > 5 ? "text-status-error font-medium" : ""}>
          {entry.bounceRate}%
        </Text>
      </Box>
      <Box as="td" className="py-3">
        <Text variant="body-sm" className={entry.complaintRate > 0.1 ? "text-status-error font-medium" : ""}>
          {entry.complaintRate}%
        </Text>
      </Box>
    </Box>
  );
}

function DomainReputationTable({ entries }: { entries: DomainReputationEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Domain Reputation</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          {entries.map((entry) => (
            <DomainReputationRow key={entry.domain} entry={entry} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function DomainReputationRow({ entry }: { entry: DomainReputationEntry }) {
  return (
    <Box className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <Box className="flex items-center gap-4">
        <ScoreBadge score={entry.score} />
        <Box>
          <Text variant="body-sm" className="font-medium">
            {entry.domain}
          </Text>
          <Text variant="caption" muted>
            {entry.owner}
          </Text>
        </Box>
      </Box>
      <Box className="flex items-center gap-6">
        <Box className="flex items-center gap-2">
          <AuthBadge label="SPF" aligned={entry.spfAligned} />
          <AuthBadge label="DKIM" aligned={entry.dkimAligned} />
          <Box className={`px-2 py-0.5 rounded text-caption font-medium ${
            entry.dmarcPolicy === "reject" ? "bg-emerald-50 text-status-success" :
            entry.dmarcPolicy === "quarantine" ? "bg-amber-50 text-status-warning" :
            "bg-red-50 text-status-error"
          }`}>
            <Text as="span" variant="caption">
              DMARC: {entry.dmarcPolicy}
            </Text>
          </Box>
        </Box>
        <Box className="text-right">
          <Text variant="caption" muted>
            Bounce: {entry.bounceRate}% | Complaint: {entry.complaintRate}%
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function BlocklistPanel({ entries }: { entries: BlocklistEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">Blocklist Monitor</Text>
          <Text variant="caption" muted>
            Checking 142 blocklists every 15 minutes
          </Text>
        </Box>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <Box className="py-8 text-center">
            <Text variant="body-sm" className="text-status-success font-medium">
              No active blocklist entries
            </Text>
          </Box>
        ) : (
          <Box className="space-y-3">
            {entries.map((entry) => (
              <BlocklistRow key={`${entry.listName}-${entry.affectedIps.join(",")}`} entry={entry} />
            ))}
          </Box>
        )}
      </CardContent>
      <CardFooter>
        <Text variant="caption" muted>
          Automated delisting requests are sent when AI confidence in remediation exceeds 90%.
        </Text>
      </CardFooter>
    </Card>
  );
}

function BlocklistRow({ entry }: { entry: BlocklistEntry }) {
  const style = blocklistStatusStyles[entry.status];
  return (
    <Box className={`p-3 rounded-lg ${style.bg}`}>
      <Box className="flex items-center justify-between">
        <Box>
          <Text variant="body-sm" className="font-medium">
            {entry.listName}
          </Text>
          <Text variant="caption" muted>
            Affected: {entry.affectedIps.join(", ")}
          </Text>
        </Box>
        <Box className="text-right">
          <Box className={`inline-flex px-2 py-0.5 rounded-full`}>
            <Text variant="caption" className={`font-medium ${style.text}`}>
              {style.label}
            </Text>
          </Box>
          <Text variant="caption" muted className="block mt-0.5">
            Est. removal: {entry.estimatedRemovalHours}h
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-status-success bg-emerald-50" :
    score >= 60 ? "text-status-warning bg-amber-50" :
    "text-status-error bg-red-50";

  return (
    <Box className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
      <Text variant="body-sm" className="font-bold">
        {score}
      </Text>
    </Box>
  );
}

function AuthBadge({ label, aligned }: { label: string; aligned: boolean }) {
  return (
    <Box className={`px-2 py-0.5 rounded ${aligned ? "bg-emerald-50" : "bg-red-50"}`}>
      <Text variant="caption" className={`font-medium ${aligned ? "text-status-success" : "text-status-error"}`}>
        {label}
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
