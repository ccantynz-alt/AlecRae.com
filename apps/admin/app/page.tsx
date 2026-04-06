import {
  PageLayout,
  Box,
  Text,
  Card,
  CardHeader,
  CardContent,
  StatCard,
  AnalyticsChart,
  type ChartDataPoint,
  type StatTrend,
} from "@emailed/ui";

interface SystemHealthIndicator {
  service: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  uptime: string;
}

interface ActiveAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  timestamp: string;
  acknowledged: boolean;
}

const systemHealth: SystemHealthIndicator[] = [
  { service: "MTA (Outbound)", status: "healthy", latencyMs: 12, uptime: "99.99%" },
  { service: "Inbound Processing", status: "healthy", latencyMs: 45, uptime: "99.98%" },
  { service: "JMAP Server", status: "healthy", latencyMs: 8, uptime: "99.99%" },
  { service: "DNS Authority", status: "healthy", latencyMs: 2, uptime: "100%" },
  { service: "Sentinel Pipeline", status: "healthy", latencyMs: 0.8, uptime: "99.99%" },
  { service: "AI Engine", status: "degraded", latencyMs: 180, uptime: "99.95%" },
];

const activeAlerts: ActiveAlert[] = [
  {
    id: "alert-001",
    severity: "warning",
    title: "AI Engine latency elevated",
    description: "Claude API response times are 2.1x above baseline. Auto-scaling triggered.",
    timestamp: "2026-04-06T14:23:00Z",
    acknowledged: false,
  },
  {
    id: "alert-002",
    severity: "info",
    title: "IP warm-up milestone reached",
    description: "IP block 198.51.100.0/28 has reached Tier 3 sending capacity (50k/day).",
    timestamp: "2026-04-06T13:45:00Z",
    acknowledged: true,
  },
  {
    id: "alert-003",
    severity: "critical",
    title: "Bounce rate spike detected",
    description: "Domain sender.example.com bounce rate exceeded 8% threshold. Sending throttled.",
    timestamp: "2026-04-06T12:10:00Z",
    acknowledged: false,
  },
];

const emailVolumeData: ChartDataPoint[] = [
  { label: "Mon", value: 1240000 },
  { label: "Tue", value: 1380000 },
  { label: "Wed", value: 1510000 },
  { label: "Thu", value: 1420000 },
  { label: "Fri", value: 1290000 },
  { label: "Sat", value: 680000 },
  { label: "Sun", value: 520000 },
];

const deliverabilityData: ChartDataPoint[] = [
  { label: "Mon", value: 98.2 },
  { label: "Tue", value: 98.5 },
  { label: "Wed", value: 97.9 },
  { label: "Thu", value: 98.8 },
  { label: "Fri", value: 98.1 },
  { label: "Sat", value: 99.1 },
  { label: "Sun", value: 99.3 },
];

interface KeyMetricConfig {
  label: string;
  value: string;
  changePercent: number;
  trend: StatTrend;
  description: string;
}

const keyMetrics: KeyMetricConfig[] = [
  {
    label: "Emails Sent (24h)",
    value: "2.4M",
    changePercent: 12.3,
    trend: "up",
    description: "vs previous 24h",
  },
  {
    label: "Deliverability Rate",
    value: "98.7%",
    changePercent: 0.3,
    trend: "up",
    description: "7-day average",
  },
  {
    label: "Active Users",
    value: "14,892",
    changePercent: 4.1,
    trend: "up",
    description: "monthly active",
  },
  {
    label: "AI Resolutions",
    value: "1,247",
    changePercent: 18.5,
    trend: "up",
    description: "support tickets auto-resolved",
  },
  {
    label: "Spam Blocked",
    value: "342K",
    changePercent: 2.8,
    trend: "down",
    description: "inbound spam caught",
  },
  {
    label: "MRR",
    value: "$284K",
    changePercent: 6.2,
    trend: "up",
    description: "monthly recurring revenue",
  },
];

const severityStyles: Record<ActiveAlert["severity"], { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-50", text: "text-status-error", dot: "bg-status-error" },
  warning: { bg: "bg-amber-50", text: "text-status-warning", dot: "bg-status-warning" },
  info: { bg: "bg-blue-50", text: "text-status-info", dot: "bg-status-info" },
};

const statusStyles: Record<SystemHealthIndicator["status"], { dot: string; label: string }> = {
  healthy: { dot: "bg-status-success", label: "Healthy" },
  degraded: { dot: "bg-status-warning", label: "Degraded" },
  down: { dot: "bg-status-error", label: "Down" },
};

export default function AdminDashboardPage() {
  return (
    <PageLayout
      title="Dashboard Overview"
      description="Real-time platform health and key performance indicators"
    >
      <Box className="space-y-6">
        <KeyMetricsGrid metrics={keyMetrics} />
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalyticsChart
            title="Email Volume (7 days)"
            description="Total emails processed per day"
            data={emailVolumeData}
            chartType="bar"
            height={180}
            formatValue={(v) => `${(v / 1000000).toFixed(1)}M`}
          />
          <AnalyticsChart
            title="Deliverability Rate (7 days)"
            description="Percentage of emails successfully delivered"
            data={deliverabilityData}
            chartType="line"
            height={180}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
        </Box>
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SystemHealthPanel indicators={systemHealth} />
          <ActiveAlertsPanel alerts={activeAlerts} />
        </Box>
      </Box>
    </PageLayout>
  );
}

function KeyMetricsGrid({ metrics }: { metrics: KeyMetricConfig[] }) {
  return (
    <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {metrics.map((metric) => (
        <StatCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          changePercent={metric.changePercent}
          trend={metric.trend}
          description={metric.description}
        />
      ))}
    </Box>
  );
}

function SystemHealthPanel({ indicators }: { indicators: SystemHealthIndicator[] }) {
  const healthyCount = indicators.filter((i) => i.status === "healthy").length;
  const totalCount = indicators.length;

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">System Health</Text>
          <Text variant="body-sm" className="font-medium text-status-success">
            {healthyCount}/{totalCount} Healthy
          </Text>
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="space-y-3">
          {indicators.map((indicator) => (
            <SystemHealthRow key={indicator.service} indicator={indicator} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function SystemHealthRow({ indicator }: { indicator: SystemHealthIndicator }) {
  const style = statusStyles[indicator.status];
  return (
    <Box className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <Box className="flex items-center gap-3">
        <Box className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
        <Text variant="body-sm" className="font-medium">
          {indicator.service}
        </Text>
      </Box>
      <Box className="flex items-center gap-4">
        <Text variant="caption" muted>
          {indicator.latencyMs}ms
        </Text>
        <Text variant="caption" muted>
          {indicator.uptime}
        </Text>
        <Text variant="caption" className={`font-medium ${
          indicator.status === "healthy" ? "text-status-success" :
          indicator.status === "degraded" ? "text-status-warning" :
          "text-status-error"
        }`}>
          {style.label}
        </Text>
      </Box>
    </Box>
  );
}

function ActiveAlertsPanel({ alerts }: { alerts: ActiveAlert[] }) {
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">Active Alerts</Text>
          {unacknowledgedCount > 0 && (
            <Box className="px-2 py-0.5 rounded-full bg-status-error/10">
              <Text variant="caption" className="font-medium text-status-error">
                {unacknowledgedCount} unacknowledged
              </Text>
            </Box>
          )}
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="space-y-3">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function AlertRow({ alert }: { alert: ActiveAlert }) {
  const style = severityStyles[alert.severity];
  const timeString = new Date(alert.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Box className={`p-3 rounded-lg ${style.bg} ${alert.acknowledged ? "opacity-60" : ""}`}>
      <Box className="flex items-start gap-3">
        <Box className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${style.dot}`} />
        <Box className="flex-1 min-w-0">
          <Box className="flex items-center justify-between gap-2">
            <Text variant="body-sm" className="font-medium truncate">
              {alert.title}
            </Text>
            <Text variant="caption" muted className="flex-shrink-0">
              {timeString}
            </Text>
          </Box>
          <Text variant="caption" muted className="mt-0.5">
            {alert.description}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
