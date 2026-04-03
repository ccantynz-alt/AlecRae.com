import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../components/metric-card";
import { StatusBadge } from "../components/status-badge";
import { ChartContainer } from "../components/chart-container";

const metrics = [
  {
    label: "Messages Sent (24h)",
    value: "1,284,392",
    trend: { direction: "up" as const, value: "12.3%" },
    description: "vs. 1,143,201 yesterday",
    sparklineData: [980, 1020, 1100, 1050, 1150, 1200, 1180, 1250, 1284],
  },
  {
    label: "Messages Received (24h)",
    value: "2,847,103",
    trend: { direction: "up" as const, value: "8.7%" },
    description: "vs. 2,618,444 yesterday",
    sparklineData: [2400, 2500, 2550, 2600, 2650, 2700, 2750, 2800, 2847],
  },
  {
    label: "Active Users",
    value: "34,219",
    trend: { direction: "up" as const, value: "2.1%" },
    description: "423 new in last 7 days",
    sparklineData: [33100, 33400, 33600, 33800, 33900, 34000, 34100, 34150, 34219],
  },
  {
    label: "Queue Depth",
    value: "1,847",
    trend: { direction: "down" as const, value: "23.4%" },
    description: "Processing at 4,200 msg/s",
    sparklineData: [3200, 2800, 2500, 2200, 2000, 1900, 1850, 1847, 1847],
  },
  {
    label: "Reputation Score",
    value: "97.2",
    trend: { direction: "up" as const, value: "0.3" },
    description: "Excellent across all IPs",
    sparklineData: [96.5, 96.7, 96.8, 96.9, 97.0, 97.0, 97.1, 97.1, 97.2],
  },
  {
    label: "Bounce Rate",
    value: "0.42%",
    trend: { direction: "down" as const, value: "0.08%" },
    description: "Well below 2% threshold",
    sparklineData: [0.55, 0.52, 0.50, 0.48, 0.47, 0.45, 0.44, 0.43, 0.42],
  },
  {
    label: "Spam Detection Rate",
    value: "99.87%",
    trend: { direction: "up" as const, value: "0.02%" },
    description: "12,847 blocked today",
    sparklineData: [99.80, 99.82, 99.83, 99.84, 99.85, 99.85, 99.86, 99.86, 99.87],
  },
  {
    label: "Avg. Delivery Time",
    value: "1.2s",
    trend: { direction: "down" as const, value: "0.3s" },
    description: "p99: 3.8s",
    sparklineData: [1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.3, 1.2, 1.2],
  },
] as const;

const recentAlerts = [
  { id: "1", message: "IP 198.51.100.14 reputation recovered to 95+", status: "healthy" as const, time: "12 min ago" },
  { id: "2", message: "Unusual sending pattern detected for domain bulk-news.co", status: "warning" as const, time: "34 min ago" },
  { id: "3", message: "Spamhaus CBL listing cleared for 203.0.113.42", status: "healthy" as const, time: "1 hr ago" },
  { id: "4", message: "Queue depth spike resolved automatically", status: "healthy" as const, time: "2 hr ago" },
  { id: "5", message: "Failed DKIM verification rate elevated for acme.com", status: "warning" as const, time: "3 hr ago" },
] as const;

const deliveryRateData = [
  { label: "Mon", delivered: 96.2, bounced: 2.1, deferred: 1.7 },
  { label: "Tue", delivered: 96.8, bounced: 1.8, deferred: 1.4 },
  { label: "Wed", delivered: 97.1, bounced: 1.6, deferred: 1.3 },
  { label: "Thu", delivered: 96.9, bounced: 1.9, deferred: 1.2 },
  { label: "Fri", delivered: 97.3, bounced: 1.5, deferred: 1.2 },
  { label: "Sat", delivered: 97.5, bounced: 1.3, deferred: 1.2 },
  { label: "Sun", delivered: 97.8, bounced: 1.2, deferred: 1.0 },
] as const;

export default function DashboardPage() {
  return (
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Dashboard</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Platform overview and real-time operational metrics
        </Text>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Key metrics">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            trend={metric.trend}
            description={metric.description}
            sparklineData={metric.sparklineData}
          />
        ))}
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2">
          <ChartContainer title="Delivery Rate (7 days)" description="Percentage breakdown by delivery outcome">
            <Box className="flex items-end gap-3 h-48" role="img" aria-label="Delivery rate bar chart for the past 7 days">
              {deliveryRateData.map((day) => (
                <Box key={day.label} className="flex-1 flex flex-col items-center gap-1">
                  <Box className="w-full flex flex-col gap-0.5" style={{ height: "160px" }}>
                    <Box
                      className="w-full bg-status-success/80 rounded-t"
                      style={{ height: `${day.delivered * 1.6}px` }}
                      title={`Delivered: ${day.delivered}%`}
                    />
                    <Box
                      className="w-full bg-status-error/60"
                      style={{ height: `${day.bounced * 8}px` }}
                      title={`Bounced: ${day.bounced}%`}
                    />
                    <Box
                      className="w-full bg-status-warning/60 rounded-b"
                      style={{ height: `${day.deferred * 8}px` }}
                      title={`Deferred: ${day.deferred}%`}
                    />
                  </Box>
                  <Text variant="caption" className="text-content-tertiary">{day.label}</Text>
                </Box>
              ))}
            </Box>
            <Box className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
              <Box className="flex items-center gap-2">
                <Box className="w-3 h-3 rounded bg-status-success/80" />
                <Text variant="caption" className="text-content-secondary">Delivered</Text>
              </Box>
              <Box className="flex items-center gap-2">
                <Box className="w-3 h-3 rounded bg-status-error/60" />
                <Text variant="caption" className="text-content-secondary">Bounced</Text>
              </Box>
              <Box className="flex items-center gap-2">
                <Box className="w-3 h-3 rounded bg-status-warning/60" />
                <Text variant="caption" className="text-content-secondary">Deferred</Text>
              </Box>
            </Box>
          </ChartContainer>
        </Box>

        <Box>
          <Box className="rounded-xl bg-surface-secondary border border-border p-5">
            <Text variant="heading-sm" className="text-content font-semibold mb-4">Recent Alerts</Text>
            <Box className="flex flex-col gap-3" role="log" aria-label="Recent platform alerts">
              {recentAlerts.map((alert) => (
                <Box key={alert.id} className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                  <Box className="pt-0.5">
                    <StatusBadge status={alert.status} />
                  </Box>
                  <Box className="flex-1 min-w-0">
                    <Text variant="body-sm" className="text-content leading-snug">
                      {alert.message}
                    </Text>
                    <Text variant="caption" className="text-content-tertiary mt-0.5">
                      {alert.time}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemHealthPanel />
        <AIInsightsPanel />
      </Box>
    </Box>
  );
}

function SystemHealthPanel() {
  const services = [
    { name: "SMTP Outbound (MTA)", status: "healthy" as const, latency: "12ms" },
    { name: "SMTP Inbound", status: "healthy" as const, latency: "8ms" },
    { name: "JMAP Server", status: "healthy" as const, latency: "5ms" },
    { name: "AI Engine", status: "healthy" as const, latency: "42ms" },
    { name: "DNS Authoritative", status: "healthy" as const, latency: "2ms" },
    { name: "Sentinel Pipeline", status: "healthy" as const, latency: "<1ms" },
    { name: "PostgreSQL", status: "healthy" as const, latency: "3ms" },
    { name: "Redis", status: "healthy" as const, latency: "1ms" },
    { name: "ClickHouse", status: "warning" as const, latency: "28ms" },
    { name: "Meilisearch", status: "healthy" as const, latency: "6ms" },
  ] as const;

  return (
    <Box className="rounded-xl bg-surface-secondary border border-border p-5">
      <Text variant="heading-sm" className="text-content font-semibold mb-4">System Health</Text>
      <Box className="flex flex-col gap-2" role="list" aria-label="Service health status">
        {services.map((service) => (
          <Box key={service.name} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0" role="listitem">
            <Box className="flex items-center gap-3">
              <StatusBadge status={service.status} />
              <Text variant="body-sm" className="text-content">{service.name}</Text>
            </Box>
            <Text variant="caption" className="text-content-tertiary font-mono">{service.latency}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

SystemHealthPanel.displayName = "SystemHealthPanel";

function AIInsightsPanel() {
  const insights = [
    {
      id: "1",
      title: "Delivery optimization opportunity",
      description: "Shifting sends for domain newsletter.acme.com to 9-11 AM EST could improve open rates by ~15% based on recipient engagement patterns.",
      priority: "medium",
    },
    {
      id: "2",
      title: "Reputation warming complete",
      description: "IP block 198.51.100.0/28 has completed warm-up. All 16 IPs now have reputation scores above 95. Ready for full volume.",
      priority: "low",
    },
    {
      id: "3",
      title: "Emerging phishing campaign detected",
      description: "Sentinel detected a new credential harvesting pattern targeting financial services domains. Filters updated automatically.",
      priority: "high",
    },
    {
      id: "4",
      title: "ClickHouse storage forecast",
      description: "At current growth rate, analytics storage will reach 80% capacity in 23 days. Consider scaling the cluster.",
      priority: "medium",
    },
  ] as const;

  const priorityColors: Record<string, string> = {
    high: "border-l-status-error",
    medium: "border-l-status-warning",
    low: "border-l-status-info",
  };

  return (
    <Box className="rounded-xl bg-surface-secondary border border-border p-5">
      <Box className="flex items-center gap-2 mb-4">
        <Text variant="heading-sm" className="text-content font-semibold">AI Insights</Text>
        <Box className="px-2 py-0.5 rounded-full bg-brand-600/10">
          <Text variant="caption" className="text-brand-400 font-medium">Live</Text>
        </Box>
      </Box>
      <Box className="flex flex-col gap-3" role="list" aria-label="AI-generated insights">
        {insights.map((insight) => (
          <Box
            key={insight.id}
            className={`border-l-2 ${priorityColors[insight.priority] ?? "border-l-border"} pl-3 py-1`}
            role="listitem"
          >
            <Text variant="body-sm" className="text-content font-medium">{insight.title}</Text>
            <Text variant="caption" className="text-content-secondary mt-0.5 leading-relaxed">
              {insight.description}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

AIInsightsPanel.displayName = "AIInsightsPanel";
