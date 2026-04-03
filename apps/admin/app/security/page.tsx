import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { ChartContainer } from "../../components/chart-container";
import { DataTable } from "../../components/data-table";

interface ThreatEvent {
  readonly id: string;
  readonly type: "phishing" | "spam" | "malware" | "spoofing" | "credential-harvest";
  readonly source: string;
  readonly target: string;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly action: "blocked" | "quarantined" | "flagged";
  readonly detectedBy: string;
  readonly timestamp: string;
}

const recentThreats: readonly ThreatEvent[] = [
  { id: "t-001", type: "phishing", source: "alert@secure-bankx.ru", target: "financeapp.com users", severity: "critical", action: "blocked", detectedBy: "Sentinel AI", timestamp: "4 min ago" },
  { id: "t-002", type: "credential-harvest", source: "support@micr0soft-auth.xyz", target: "Multiple domains", severity: "critical", action: "blocked", detectedBy: "Sentinel AI", timestamp: "12 min ago" },
  { id: "t-003", type: "spam", source: "promo@cheap-pharma.biz", target: "emailed.dev users", severity: "low", action: "blocked", detectedBy: "Content Filter", timestamp: "18 min ago" },
  { id: "t-004", type: "malware", source: "invoice@supplier-portal.cn", target: "acme-corp.com", severity: "critical", action: "quarantined", detectedBy: "Attachment Scanner", timestamp: "27 min ago" },
  { id: "t-005", type: "spoofing", source: "ceo@acme-c0rp.com", target: "acme-corp.com", severity: "high", action: "blocked", detectedBy: "DMARC Check", timestamp: "42 min ago" },
  { id: "t-006", type: "phishing", source: "verify@paypa1-secure.net", target: "Multiple domains", severity: "high", action: "blocked", detectedBy: "Sentinel AI", timestamp: "1 hr ago" },
  { id: "t-007", type: "spam", source: "deals@mega-offers.info", target: "newsletter.io users", severity: "low", action: "blocked", detectedBy: "Content Filter", timestamp: "1.5 hr ago" },
  { id: "t-008", type: "credential-harvest", source: "admin@g00gle-workspace.co", target: "Multiple domains", severity: "critical", action: "blocked", detectedBy: "Sentinel AI", timestamp: "2 hr ago" },
  { id: "t-009", type: "spam", source: "noreply@casino-bonus.win", target: "emailed.dev users", severity: "low", action: "blocked", detectedBy: "Reputation Filter", timestamp: "2.5 hr ago" },
  { id: "t-010", type: "phishing", source: "security@app1e-id.store", target: "devtools.xyz users", severity: "high", action: "blocked", detectedBy: "Sentinel AI", timestamp: "3 hr ago" },
  { id: "t-011", type: "malware", source: "doc@shared-files.link", target: "startup-labs.co", severity: "critical", action: "quarantined", detectedBy: "Attachment Scanner", timestamp: "3.5 hr ago" },
  { id: "t-012", type: "spoofing", source: "billing@ema1led.dev", target: "emailed.dev", severity: "high", action: "blocked", detectedBy: "DKIM Verification", timestamp: "4 hr ago" },
] as const;

const classificationStats = [
  { category: "Legitimate", count: 2834256, percentage: 95.42, color: "bg-status-success" },
  { category: "Spam", count: 98420, percentage: 3.31, color: "bg-status-warning" },
  { category: "Phishing", count: 24180, percentage: 0.81, color: "bg-status-error" },
  { category: "Malware", count: 8240, percentage: 0.28, color: "bg-brand-500" },
  { category: "Spoofing", count: 5320, percentage: 0.18, color: "bg-content-tertiary" },
] as const;

const blocklistAlerts = [
  { id: "b-1", source: "Spamhaus", type: "New phishing kit", description: "Credential harvesting targeting financial institutions via fake login portals", severity: "critical" as const, timestamp: "1 hr ago" },
  { id: "b-2", source: "PhishTank", type: "Campaign update", description: "Known PayPal phishing campaign updated with new URL patterns", severity: "high" as const, timestamp: "3 hr ago" },
  { id: "b-3", source: "Sentinel Intel", type: "Emerging threat", description: "AI-generated spear phishing emails detected with high linguistic quality", severity: "critical" as const, timestamp: "5 hr ago" },
  { id: "b-4", source: "SURBL", type: "Domain reputation", description: "34 new domains added to reputation blocklist from hosting provider abuse reports", severity: "medium" as const, timestamp: "8 hr ago" },
] as const;

const hourlyBlocked = [
  480, 520, 490, 510, 530, 560, 540, 580, 520, 490, 510, 535,
  550, 580, 620, 590, 570, 540, 510, 490, 480, 500, 520, 540,
] as const;

const threatColumns = [
  {
    key: "type",
    header: "Type",
    sortable: true,
    sortValue: (row: ThreatEvent) => row.type,
    render: (row: ThreatEvent) => {
      const typeColors: Record<string, string> = {
        phishing: "bg-status-error/10 text-status-error",
        spam: "bg-status-warning/10 text-status-warning",
        malware: "bg-brand-600/10 text-brand-400",
        spoofing: "bg-status-info/10 text-status-info",
        "credential-harvest": "bg-status-error/10 text-status-error",
      };
      const labels: Record<string, string> = {
        phishing: "Phishing",
        spam: "Spam",
        malware: "Malware",
        spoofing: "Spoofing",
        "credential-harvest": "Credential Harvest",
      };
      return (
        <Box className={`inline-flex rounded-full px-2 py-0.5 ${typeColors[row.type] ?? ""}`}>
          <Text as="span" variant="caption" className="font-medium">{labels[row.type] ?? row.type}</Text>
        </Box>
      );
    },
  },
  {
    key: "source",
    header: "Source",
    render: (row: ThreatEvent) => (
      <Text variant="body-sm" className="text-content font-mono text-body-sm">{row.source}</Text>
    ),
  },
  {
    key: "target",
    header: "Target",
    render: (row: ThreatEvent) => (
      <Text variant="body-sm" className="text-content-secondary">{row.target}</Text>
    ),
  },
  {
    key: "severity",
    header: "Severity",
    sortable: true,
    sortValue: (row: ThreatEvent) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[row.severity] ?? 4;
    },
    render: (row: ThreatEvent) => {
      const map = {
        critical: { status: "critical" as const, label: "Critical" },
        high: { status: "warning" as const, label: "High" },
        medium: { status: "unknown" as const, label: "Medium" },
        low: { status: "healthy" as const, label: "Low" },
      } as const;
      const config = map[row.severity];
      return <StatusBadge status={config.status} label={config.label} />;
    },
  },
  {
    key: "action",
    header: "Action",
    render: (row: ThreatEvent) => {
      const colors: Record<string, string> = {
        blocked: "text-status-error",
        quarantined: "text-status-warning",
        flagged: "text-status-info",
      };
      return (
        <Text variant="body-sm" className={`font-medium capitalize ${colors[row.action] ?? ""}`}>{row.action}</Text>
      );
    },
  },
  {
    key: "detectedBy",
    header: "Detected By",
    render: (row: ThreatEvent) => (
      <Text variant="caption" className="text-content-secondary">{row.detectedBy}</Text>
    ),
  },
  {
    key: "timestamp",
    header: "Time",
    render: (row: ThreatEvent) => (
      <Text variant="caption" className="text-content-tertiary">{row.timestamp}</Text>
    ),
  },
] as const;

export default function SecurityPage() {
  const totalBlocked24h = hourlyBlocked.reduce((sum, v) => sum + v, 0);
  const criticalCount = recentThreats.filter((t) => t.severity === "critical").length;
  const phishingCount = recentThreats.filter((t) => t.type === "phishing" || t.type === "credential-harvest").length;
  const totalClassified = classificationStats.reduce((sum, c) => sum + c.count, 0);

  return (
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Security & Threat Intelligence</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Real-time threat monitoring, spam classification, and blocklist intelligence
        </Text>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Security metrics">
        <MetricCard
          label="Threats Blocked (24h)"
          value={totalBlocked24h.toLocaleString()}
          trend={{ direction: "up", value: "4.2%" }}
          sparklineData={[...hourlyBlocked.slice(-8)]}
        />
        <MetricCard
          label="Critical Threats"
          value={criticalCount.toString()}
          trend={{ direction: "down", value: "2" }}
          description="Last 4 hours"
        />
        <MetricCard
          label="Phishing Attempts"
          value={phishingCount.toString()}
          trend={{ direction: "down", value: "1" }}
          description="Last 4 hours"
        />
        <MetricCard
          label="Detection Rate"
          value="99.87%"
          trend={{ direction: "up", value: "0.02%" }}
          description="False positive rate: 0.004%"
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2">
          <ChartContainer title="Threats Blocked (Last 24h)" description="Hourly count of blocked malicious emails">
            <Box className="flex items-end gap-0.5 h-40" role="img" aria-label="Hourly blocked threats chart">
              {hourlyBlocked.map((count, i) => (
                <Box
                  key={i}
                  className="flex-1 bg-status-error/40 hover:bg-status-error/60 rounded-t transition-colors"
                  style={{ height: `${(count / 650) * 100}%` }}
                  title={`Hour ${i}: ${count} blocked`}
                />
              ))}
            </Box>
          </ChartContainer>
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Classification Stats (24h)</Text>
          <Box className="flex flex-col gap-3" role="list" aria-label="Email classification statistics">
            {classificationStats.map((stat) => (
              <Box key={stat.category} role="listitem">
                <Box className="flex items-center justify-between mb-1">
                  <Text variant="body-sm" className="text-content">{stat.category}</Text>
                  <Box className="flex items-center gap-2">
                    <Text variant="caption" className="text-content-secondary font-mono">
                      {stat.count >= 1000000 ? `${(stat.count / 1000000).toFixed(1)}M` : stat.count >= 1000 ? `${(stat.count / 1000).toFixed(0)}K` : stat.count}
                    </Text>
                    <Text variant="caption" className="text-content-tertiary font-mono w-14 text-right">{stat.percentage}%</Text>
                  </Box>
                </Box>
                <Box className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                  <Box className={`h-full rounded-full ${stat.color}`} style={{ width: `${Math.min(stat.percentage * 2, 100)}%` }} />
                </Box>
              </Box>
            ))}
            <Box className="pt-2 mt-1 border-t border-border/50">
              <Box className="flex items-center justify-between">
                <Text variant="caption" className="text-content-secondary">Total Classified</Text>
                <Text variant="caption" className="text-content font-mono font-medium">{(totalClassified / 1000000).toFixed(1)}M</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box className="rounded-xl bg-surface-secondary border border-border p-5">
        <Text variant="heading-sm" className="text-content font-semibold mb-4">Threat Intelligence Alerts</Text>
        <Box className="flex flex-col gap-3" role="list" aria-label="Threat intelligence alerts">
          {blocklistAlerts.map((alert) => {
            const severityColors: Record<string, string> = {
              critical: "border-l-status-error",
              high: "border-l-status-warning",
              medium: "border-l-status-info",
            };
            return (
              <Box key={alert.id} className={`border-l-2 ${severityColors[alert.severity] ?? "border-l-border"} pl-3 py-2`} role="listitem">
                <Box className="flex items-center gap-2 mb-1">
                  <Text variant="body-sm" className="text-content font-medium">{alert.type}</Text>
                  <Text variant="caption" className="text-content-tertiary">from {alert.source}</Text>
                  <Text variant="caption" className="text-content-tertiary ml-auto">{alert.timestamp}</Text>
                </Box>
                <Text variant="body-sm" className="text-content-secondary">{alert.description}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">Recent Threat Events</Text>
        <DataTable
          columns={threatColumns}
          data={recentThreats}
          rowKey={(row) => row.id}
          pageSize={10}
          filterPlaceholder="Search threats by source, target, or type..."
          filterFn={(row, query) => {
            const q = query.toLowerCase();
            return row.source.toLowerCase().includes(q) || row.target.toLowerCase().includes(q) || row.type.toLowerCase().includes(q);
          }}
          emptyMessage="No threat events found"
        />
      </Box>
    </Box>
  );
}
