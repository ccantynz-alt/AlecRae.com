import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { ChartContainer } from "../../components/chart-container";
import { DataTable } from "../../components/data-table";

interface IpReputation {
  readonly id: string;
  readonly ip: string;
  readonly score: number;
  readonly warmupProgress: number;
  readonly status: "active" | "warming" | "cooldown" | "blocked";
  readonly dailyVolume: number;
  readonly maxVolume: number;
  readonly blocklists: number;
  readonly lastChecked: string;
}

const ipReputations: readonly IpReputation[] = [
  { id: "1", ip: "198.51.100.10", score: 98, warmupProgress: 100, status: "active", dailyVolume: 245000, maxVolume: 300000, blocklists: 0, lastChecked: "2 min ago" },
  { id: "2", ip: "198.51.100.11", score: 97, warmupProgress: 100, status: "active", dailyVolume: 198000, maxVolume: 300000, blocklists: 0, lastChecked: "2 min ago" },
  { id: "3", ip: "198.51.100.12", score: 96, warmupProgress: 100, status: "active", dailyVolume: 212000, maxVolume: 300000, blocklists: 0, lastChecked: "2 min ago" },
  { id: "4", ip: "198.51.100.13", score: 95, warmupProgress: 100, status: "active", dailyVolume: 187000, maxVolume: 300000, blocklists: 0, lastChecked: "2 min ago" },
  { id: "5", ip: "198.51.100.14", score: 92, warmupProgress: 100, status: "active", dailyVolume: 156000, maxVolume: 250000, blocklists: 0, lastChecked: "2 min ago" },
  { id: "6", ip: "203.0.113.40", score: 78, warmupProgress: 65, status: "warming", dailyVolume: 42000, maxVolume: 150000, blocklists: 0, lastChecked: "3 min ago" },
  { id: "7", ip: "203.0.113.41", score: 72, warmupProgress: 55, status: "warming", dailyVolume: 35000, maxVolume: 150000, blocklists: 0, lastChecked: "3 min ago" },
  { id: "8", ip: "203.0.113.42", score: 85, warmupProgress: 80, status: "warming", dailyVolume: 68000, maxVolume: 150000, blocklists: 0, lastChecked: "3 min ago" },
  { id: "9", ip: "192.0.2.50", score: 45, warmupProgress: 100, status: "cooldown", dailyVolume: 0, maxVolume: 0, blocklists: 2, lastChecked: "1 min ago" },
] as const;

const blocklistAlerts = [
  { id: "1", ip: "192.0.2.50", list: "Spamhaus CBL", listedSince: "2026-03-30", status: "active" as const, remediationStatus: "In progress" },
  { id: "2", ip: "192.0.2.50", list: "Barracuda BRBL", listedSince: "2026-04-01", status: "active" as const, remediationStatus: "Delisting requested" },
  { id: "3", ip: "198.51.100.14", list: "Spamhaus CBL", listedSince: "2026-03-25", status: "resolved" as const, remediationStatus: "Cleared 2026-04-02" },
] as const;

const complianceMetrics = [
  { label: "CAN-SPAM Compliance", value: "99.98%", status: "healthy" as const },
  { label: "GDPR Consent Rate", value: "99.7%", status: "healthy" as const },
  { label: "CASL Compliance", value: "99.9%", status: "healthy" as const },
  { label: "Unsubscribe Honor Rate", value: "100%", status: "healthy" as const },
  { label: "FBL Processing", value: "< 2s avg", status: "healthy" as const },
  { label: "Abuse Complaints", value: "0.003%", status: "healthy" as const },
] as const;

function formatVolume(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

function WarmupProgressBar({ progress }: { readonly progress: number }) {
  const color = progress === 100 ? "bg-status-success" : progress >= 50 ? "bg-status-warning" : "bg-brand-500";
  return (
    <Box className="flex items-center gap-2">
      <Box className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Warmup progress: ${progress}%`}>
        <Box className={`h-full rounded-full ${color} transition-all`} style={{ width: `${progress}%` }} />
      </Box>
      <Text variant="caption" className="text-content-secondary font-mono w-10 text-right">{progress}%</Text>
    </Box>
  );
}

WarmupProgressBar.displayName = "WarmupProgressBar";

function ScoreGauge({ score }: { readonly score: number }) {
  const color = score >= 90 ? "text-status-success" : score >= 70 ? "text-status-warning" : "text-status-error";
  return (
    <Text variant="body-sm" className={`font-mono font-bold ${color}`}>{score}</Text>
  );
}

ScoreGauge.displayName = "ScoreGauge";

const ipColumns = [
  {
    key: "ip",
    header: "IP Address",
    sortable: true,
    sortValue: (row: IpReputation) => row.ip,
    render: (row: IpReputation) => (
      <Text variant="body-sm" className="text-content font-mono">{row.ip}</Text>
    ),
  },
  {
    key: "score",
    header: "Score",
    sortable: true,
    sortValue: (row: IpReputation) => row.score,
    render: (row: IpReputation) => <ScoreGauge score={row.score} />,
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (row: IpReputation) => row.status,
    render: (row: IpReputation) => {
      const map = {
        active: { status: "healthy" as const, label: "Active" },
        warming: { status: "warning" as const, label: "Warming" },
        cooldown: { status: "critical" as const, label: "Cooldown" },
        blocked: { status: "critical" as const, label: "Blocked" },
      } as const;
      const config = map[row.status];
      return <StatusBadge status={config.status} label={config.label} />;
    },
  },
  {
    key: "warmup",
    header: "Warmup",
    width: "w-40",
    render: (row: IpReputation) => <WarmupProgressBar progress={row.warmupProgress} />,
  },
  {
    key: "volume",
    header: "Daily Volume",
    sortable: true,
    sortValue: (row: IpReputation) => row.dailyVolume,
    render: (row: IpReputation) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">
        {row.dailyVolume > 0 ? `${formatVolume(row.dailyVolume)} / ${formatVolume(row.maxVolume)}` : "--"}
      </Text>
    ),
  },
  {
    key: "blocklists",
    header: "Blocklists",
    sortable: true,
    sortValue: (row: IpReputation) => row.blocklists,
    render: (row: IpReputation) => (
      <Text variant="body-sm" className={`font-mono ${row.blocklists > 0 ? "text-status-error font-medium" : "text-content-tertiary"}`}>
        {row.blocklists}
      </Text>
    ),
  },
  {
    key: "lastChecked",
    header: "Last Check",
    render: (row: IpReputation) => (
      <Text variant="caption" className="text-content-tertiary">{row.lastChecked}</Text>
    ),
  },
] as const;

export default function ReputationPage() {
  const activeIps = ipReputations.filter((ip) => ip.status === "active").length;
  const warmingIps = ipReputations.filter((ip) => ip.status === "warming").length;
  const avgScore = Math.round(ipReputations.reduce((sum, ip) => sum + ip.score, 0) / ipReputations.length);
  const activeBlocklistings = blocklistAlerts.filter((a) => a.status === "active").length;

  return (
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Reputation Management</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          IP and domain reputation scores, warmup progress, blocklist monitoring, and compliance
        </Text>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Reputation summary">
        <MetricCard label="Average IP Score" value={avgScore.toString()} trend={{ direction: "up", value: "2.1" }} sparklineData={[82, 84, 85, 86, 87, 87, 88, 88, avgScore]} />
        <MetricCard label="Active IPs" value={activeIps.toString()} description={`${warmingIps} warming up`} />
        <MetricCard label="Active Blocklistings" value={activeBlocklistings.toString()} trend={{ direction: "down", value: "1" }} />
        <MetricCard label="Compliance Score" value="99.9%" trend={{ direction: "neutral", value: "stable" }} />
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">IP Reputation</Text>
        <DataTable
          columns={ipColumns}
          data={ipReputations}
          rowKey={(row) => row.id}
          pageSize={10}
          filterPlaceholder="Search by IP..."
          filterFn={(row, query) => row.ip.includes(query)}
          emptyMessage="No IPs found"
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Blocklist Alerts</Text>
          <Box className="flex flex-col gap-3" role="list" aria-label="Blocklist alerts">
            {blocklistAlerts.map((alert) => (
              <Box key={alert.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
                <Box className="flex flex-col gap-0.5">
                  <Box className="flex items-center gap-2">
                    <Text variant="body-sm" className="text-content font-mono">{alert.ip}</Text>
                    <StatusBadge status={alert.status === "active" ? "critical" : "healthy"} label={alert.status === "active" ? "Listed" : "Cleared"} />
                  </Box>
                  <Text variant="caption" className="text-content-secondary">
                    {alert.list} - since {alert.listedSince}
                  </Text>
                </Box>
                <Text variant="caption" className="text-content-tertiary">{alert.remediationStatus}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Compliance Metrics</Text>
          <Box className="flex flex-col gap-3" role="list" aria-label="Compliance metrics">
            {complianceMetrics.map((metric) => (
              <Box key={metric.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
                <Box className="flex items-center gap-3">
                  <StatusBadge status={metric.status} />
                  <Text variant="body-sm" className="text-content">{metric.label}</Text>
                </Box>
                <Text variant="body-sm" className="text-content font-mono font-medium">{metric.value}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <ChartContainer title="Reputation Score Trend (30 days)" description="Average IP reputation score across all active IPs">
        <Box className="h-48 flex items-end gap-1" role="img" aria-label="Reputation score trend chart">
          {[85, 86, 86, 87, 87, 87, 88, 88, 88, 89, 89, 89, 89, 90, 90, 90, 91, 91, 91, 91, 92, 92, 92, 92, 93, 93, 93, avgScore, avgScore, avgScore].map((score, i) => (
            <Box
              key={i}
              className="flex-1 bg-brand-500/60 hover:bg-brand-500/80 rounded-t transition-colors"
              style={{ height: `${(score - 80) * 8}%` }}
              title={`Day ${i + 1}: ${score}`}
            />
          ))}
        </Box>
      </ChartContainer>
    </Box>
  );
}
