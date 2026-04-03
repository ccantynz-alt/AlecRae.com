import { Box, Text } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { ChartContainer } from "../../components/chart-container";
import { DataTable } from "../../components/data-table";

interface TopDomain {
  readonly id: string;
  readonly domain: string;
  readonly sent: number;
  readonly delivered: number;
  readonly deliveryRate: number;
  readonly opens: number;
  readonly openRate: number;
  readonly clicks: number;
  readonly clickRate: number;
  readonly bounces: number;
  readonly bounceRate: number;
}

const topDomains: readonly TopDomain[] = [
  { id: "1", domain: "emailed.dev", sent: 452300, delivered: 449200, deliveryRate: 99.3, opens: 156400, openRate: 34.8, clicks: 28300, clickRate: 6.3, bounces: 1420, bounceRate: 0.31 },
  { id: "2", domain: "acme-corp.com", sent: 128400, delivered: 127100, deliveryRate: 98.9, opens: 51200, openRate: 40.3, clicks: 12800, clickRate: 10.1, bounces: 640, bounceRate: 0.50 },
  { id: "3", domain: "newsletter.io", sent: 87200, delivered: 85900, deliveryRate: 98.5, opens: 22400, openRate: 26.1, clicks: 5600, clickRate: 6.5, bounces: 870, bounceRate: 1.01 },
  { id: "4", domain: "bulk-news.co", sent: 245000, delivered: 238500, deliveryRate: 97.3, opens: 42100, openRate: 17.6, clicks: 8200, clickRate: 3.4, bounces: 4900, bounceRate: 2.05 },
  { id: "5", domain: "saas-platform.io", sent: 178600, delivered: 177200, deliveryRate: 99.2, opens: 78400, openRate: 44.2, clicks: 19600, clickRate: 11.1, bounces: 536, bounceRate: 0.30 },
  { id: "6", domain: "financeapp.com", sent: 56800, delivered: 56300, deliveryRate: 99.1, opens: 28400, openRate: 50.4, clicks: 8500, clickRate: 15.1, bounces: 227, bounceRate: 0.40 },
  { id: "7", domain: "startup-labs.co", sent: 34100, delivered: 33600, deliveryRate: 98.5, opens: 10200, openRate: 30.4, clicks: 2700, clickRate: 8.0, bounces: 341, bounceRate: 1.01 },
  { id: "8", domain: "devtools.xyz", sent: 21500, delivered: 21300, deliveryRate: 99.1, opens: 9400, openRate: 44.1, clicks: 3200, clickRate: 15.0, bounces: 86, bounceRate: 0.40 },
] as const;

const dailyDeliveryRates = [
  { day: "Mar 27", rate: 97.8, volume: 1120000 },
  { day: "Mar 28", rate: 98.1, volume: 1145000 },
  { day: "Mar 29", rate: 98.3, volume: 1180000 },
  { day: "Mar 30", rate: 97.9, volume: 1200000 },
  { day: "Mar 31", rate: 98.4, volume: 1150000 },
  { day: "Apr 1", rate: 98.6, volume: 1220000 },
  { day: "Apr 2", rate: 98.8, volume: 1260000 },
  { day: "Apr 3", rate: 98.7, volume: 1284000 },
] as const;

const bounceBreakdown = [
  { type: "Hard bounce - Invalid recipient", count: 2847, percentage: 33.2 },
  { type: "Hard bounce - Domain not found", count: 1203, percentage: 14.0 },
  { type: "Soft bounce - Mailbox full", count: 1892, percentage: 22.1 },
  { type: "Soft bounce - Temp failure", count: 1456, percentage: 17.0 },
  { type: "Soft bounce - Rate limited", count: 684, percentage: 8.0 },
  { type: "Policy bounce - DMARC fail", count: 312, percentage: 3.6 },
  { type: "Policy bounce - Content filter", count: 178, percentage: 2.1 },
] as const;

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

const domainColumns = [
  {
    key: "domain",
    header: "Domain",
    sortable: true,
    sortValue: (row: TopDomain) => row.domain,
    render: (row: TopDomain) => (
      <Text variant="body-sm" className="text-content font-medium">{row.domain}</Text>
    ),
  },
  {
    key: "sent",
    header: "Sent",
    sortable: true,
    sortValue: (row: TopDomain) => row.sent,
    render: (row: TopDomain) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">{formatNumber(row.sent)}</Text>
    ),
  },
  {
    key: "deliveryRate",
    header: "Delivery %",
    sortable: true,
    sortValue: (row: TopDomain) => row.deliveryRate,
    render: (row: TopDomain) => {
      const color = row.deliveryRate >= 99 ? "text-status-success" : row.deliveryRate >= 97 ? "text-status-warning" : "text-status-error";
      return <Text variant="body-sm" className={`font-mono font-medium ${color}`}>{row.deliveryRate}%</Text>;
    },
  },
  {
    key: "openRate",
    header: "Open %",
    sortable: true,
    sortValue: (row: TopDomain) => row.openRate,
    render: (row: TopDomain) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">{row.openRate}%</Text>
    ),
  },
  {
    key: "clickRate",
    header: "Click %",
    sortable: true,
    sortValue: (row: TopDomain) => row.clickRate,
    render: (row: TopDomain) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">{row.clickRate}%</Text>
    ),
  },
  {
    key: "bounceRate",
    header: "Bounce %",
    sortable: true,
    sortValue: (row: TopDomain) => row.bounceRate,
    render: (row: TopDomain) => {
      const color = row.bounceRate < 1 ? "text-status-success" : row.bounceRate < 2 ? "text-status-warning" : "text-status-error";
      return <Text variant="body-sm" className={`font-mono font-medium ${color}`}>{row.bounceRate}%</Text>;
    },
  },
] as const;

export default function AnalyticsPage() {
  const totalSent = topDomains.reduce((sum, d) => sum + d.sent, 0);
  const totalDelivered = topDomains.reduce((sum, d) => sum + d.delivered, 0);
  const overallDeliveryRate = ((totalDelivered / totalSent) * 100).toFixed(1);
  const totalOpens = topDomains.reduce((sum, d) => sum + d.opens, 0);
  const overallOpenRate = ((totalOpens / totalDelivered) * 100).toFixed(1);
  const totalClicks = topDomains.reduce((sum, d) => sum + d.clicks, 0);
  const overallClickRate = ((totalClicks / totalDelivered) * 100).toFixed(1);
  const totalBounces = topDomains.reduce((sum, d) => sum + d.bounces, 0);
  const overallBounceRate = ((totalBounces / totalSent) * 100).toFixed(2);

  return (
    <Box className="flex flex-col gap-8">
      <Box>
        <Text variant="heading-lg" className="text-content font-bold">Analytics</Text>
        <Text variant="body-sm" className="text-content-secondary mt-1">
          Delivery rates, engagement metrics, bounce analysis, and sending domain performance
        </Text>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Analytics summary">
        <MetricCard label="Delivery Rate" value={`${overallDeliveryRate}%`} trend={{ direction: "up", value: "0.3%" }} sparklineData={dailyDeliveryRates.map((d) => d.rate)} />
        <MetricCard label="Open Rate" value={`${overallOpenRate}%`} trend={{ direction: "up", value: "1.2%" }} />
        <MetricCard label="Click Rate" value={`${overallClickRate}%`} trend={{ direction: "up", value: "0.4%" }} />
        <MetricCard label="Bounce Rate" value={`${overallBounceRate}%`} trend={{ direction: "down", value: "0.08%" }} />
      </Box>

      <ChartContainer title="Delivery Rate Over Time (7 days)" description="Daily delivery rate with volume overlay">
        <Box className="flex flex-col gap-4">
          <Box className="flex items-end gap-3 h-48" role="img" aria-label="Delivery rate trend chart">
            {dailyDeliveryRates.map((day) => (
              <Box key={day.day} className="flex-1 flex flex-col items-center gap-1">
                <Text variant="caption" className="text-status-success font-mono font-medium">{day.rate}%</Text>
                <Box className="w-full flex flex-col justify-end" style={{ height: "140px" }}>
                  <Box
                    className="w-full bg-brand-500/60 hover:bg-brand-500/80 rounded-t transition-colors"
                    style={{ height: `${(day.volume / 1400000) * 100}%` }}
                    title={`${formatNumber(day.volume)} messages`}
                  />
                </Box>
                <Text variant="caption" className="text-content-tertiary">{day.day.split(" ")[1]}</Text>
              </Box>
            ))}
          </Box>
          <Box className="flex items-center gap-4 pt-2 border-t border-border/50">
            <Box className="flex items-center gap-2">
              <Box className="w-3 h-3 rounded bg-brand-500/60" />
              <Text variant="caption" className="text-content-secondary">Volume</Text>
            </Box>
            <Box className="flex items-center gap-2">
              <Text variant="caption" className="text-status-success font-mono">%</Text>
              <Text variant="caption" className="text-content-secondary">Delivery Rate</Text>
            </Box>
          </Box>
        </Box>
      </ChartContainer>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartContainer title="Bounce Breakdown" description="Distribution of bounce types (last 24h)">
          <Box className="flex flex-col gap-3" role="list" aria-label="Bounce type breakdown">
            {bounceBreakdown.map((item) => (
              <Box key={item.type} role="listitem">
                <Box className="flex items-center justify-between mb-1">
                  <Text variant="body-sm" className="text-content">{item.type}</Text>
                  <Box className="flex items-center gap-2">
                    <Text variant="caption" className="text-content-secondary font-mono">{item.count.toLocaleString()}</Text>
                    <Text variant="caption" className="text-content-tertiary font-mono w-12 text-right">{item.percentage}%</Text>
                  </Box>
                </Box>
                <Box className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                  <Box className="h-full rounded-full bg-status-error/60" style={{ width: `${item.percentage}%` }} />
                </Box>
              </Box>
            ))}
          </Box>
        </ChartContainer>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Engagement Summary</Text>
          <Box className="flex flex-col gap-4" role="list" aria-label="Engagement summary">
            <Box className="flex items-center justify-between py-2 border-b border-border/30" role="listitem">
              <Text variant="body-sm" className="text-content">Total Sent (24h)</Text>
              <Text variant="body-sm" className="text-content font-mono font-medium">{formatNumber(totalSent)}</Text>
            </Box>
            <Box className="flex items-center justify-between py-2 border-b border-border/30" role="listitem">
              <Text variant="body-sm" className="text-content">Delivered</Text>
              <Text variant="body-sm" className="text-status-success font-mono font-medium">{formatNumber(totalDelivered)}</Text>
            </Box>
            <Box className="flex items-center justify-between py-2 border-b border-border/30" role="listitem">
              <Text variant="body-sm" className="text-content">Unique Opens</Text>
              <Text variant="body-sm" className="text-content font-mono font-medium">{formatNumber(totalOpens)}</Text>
            </Box>
            <Box className="flex items-center justify-between py-2 border-b border-border/30" role="listitem">
              <Text variant="body-sm" className="text-content">Unique Clicks</Text>
              <Text variant="body-sm" className="text-content font-mono font-medium">{formatNumber(totalClicks)}</Text>
            </Box>
            <Box className="flex items-center justify-between py-2 border-b border-border/30" role="listitem">
              <Text variant="body-sm" className="text-content">Total Bounces</Text>
              <Text variant="body-sm" className="text-status-error font-mono font-medium">{totalBounces.toLocaleString()}</Text>
            </Box>
            <Box className="flex items-center justify-between py-2" role="listitem">
              <Text variant="body-sm" className="text-content">Spam Complaints</Text>
              <Text variant="body-sm" className="text-content font-mono font-medium">38</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">Top Sending Domains</Text>
        <DataTable
          columns={domainColumns}
          data={topDomains}
          rowKey={(row) => row.id}
          pageSize={10}
          filterPlaceholder="Search domains..."
          filterFn={(row, query) => row.domain.toLowerCase().includes(query.toLowerCase())}
          emptyMessage="No domain data available"
        />
      </Box>
    </Box>
  );
}
