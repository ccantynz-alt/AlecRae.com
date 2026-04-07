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
} from "@emailed/ui";

interface EmailVolumeMetric {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  deliverabilityRate: number;
}

interface RevenueMetric {
  month: string;
  mrr: number;
  newRevenue: number;
  churnedRevenue: number;
  expansionRevenue: number;
  netNewMrr: number;
}

interface AiUsageMetric {
  feature: string;
  calls30d: number;
  change30d: number;
  avgLatencyMs: number;
  successRate: number;
}

const emailVolumeMetrics: EmailVolumeMetric[] = [
  { date: "2026-03-31", sent: 2100000, delivered: 2058000, bounced: 37800, complained: 4200, deliverabilityRate: 98.0 },
  { date: "2026-04-01", sent: 2250000, delivered: 2214750, bounced: 31500, complained: 3750, deliverabilityRate: 98.4 },
  { date: "2026-04-02", sent: 2180000, delivered: 2149260, bounced: 28340, complained: 2400, deliverabilityRate: 98.6 },
  { date: "2026-04-03", sent: 2340000, delivered: 2311560, bounced: 25740, complained: 2700, deliverabilityRate: 98.8 },
  { date: "2026-04-04", sent: 2150000, delivered: 2120850, bounced: 26875, complained: 2275, deliverabilityRate: 98.6 },
  { date: "2026-04-05", sent: 1100000, delivered: 1085900, bounced: 12100, complained: 2000, deliverabilityRate: 98.7 },
  { date: "2026-04-06", sent: 850000, delivered: 839950, bounced: 8500, complained: 1550, deliverabilityRate: 98.8 },
];

const revenueMetrics: RevenueMetric[] = [
  { month: "Jan", mrr: 248000, newRevenue: 18000, churnedRevenue: 4200, expansionRevenue: 6500, netNewMrr: 20300 },
  { month: "Feb", mrr: 261000, newRevenue: 15500, churnedRevenue: 3800, expansionRevenue: 8300, netNewMrr: 20000 },
  { month: "Mar", mrr: 274000, newRevenue: 19200, churnedRevenue: 5100, expansionRevenue: 7900, netNewMrr: 22000 },
  { month: "Apr", mrr: 284000, newRevenue: 14800, churnedRevenue: 3200, expansionRevenue: 5400, netNewMrr: 17000 },
];

const aiUsageMetrics: AiUsageMetric[] = [
  { feature: "Smart Compose", calls30d: 245000, change30d: 22.5, avgLatencyMs: 340, successRate: 99.2 },
  { feature: "Inbox Triage", calls30d: 1820000, change30d: 15.8, avgLatencyMs: 85, successRate: 99.8 },
  { feature: "Spam Classification", calls30d: 4200000, change30d: 8.2, avgLatencyMs: 12, successRate: 99.9 },
  { feature: "Support Agent", calls30d: 38000, change30d: 34.1, avgLatencyMs: 1200, successRate: 97.5 },
  { feature: "Content Analysis", calls30d: 890000, change30d: 11.4, avgLatencyMs: 95, successRate: 99.6 },
  { feature: "Reputation Scoring", calls30d: 2100000, change30d: 5.9, avgLatencyMs: 45, successRate: 99.9 },
  { feature: "Threat Intelligence", calls30d: 560000, change30d: 18.7, avgLatencyMs: 150, successRate: 99.4 },
  { feature: "Sentiment Analysis", calls30d: 720000, change30d: 27.3, avgLatencyMs: 110, successRate: 99.1 },
];

const sentData: ChartDataPoint[] = emailVolumeMetrics.map((m) => ({
  label: m.date.slice(5),
  value: m.sent,
}));

const deliveredData: ChartDataPoint[] = emailVolumeMetrics.map((m) => ({
  label: m.date.slice(5),
  value: m.delivered,
}));

const bouncedData: ChartDataPoint[] = emailVolumeMetrics.map((m) => ({
  label: m.date.slice(5),
  value: m.bounced,
}));

const mrrData: ChartDataPoint[] = revenueMetrics.map((m) => ({
  label: m.month,
  value: m.mrr,
}));

const churnData: ChartDataPoint[] = revenueMetrics.map((m) => ({
  label: m.month,
  value: m.churnedRevenue,
}));

const aiCallsData: ChartDataPoint[] = aiUsageMetrics.slice(0, 6).map((m) => ({
  label: m.feature.split(" ")[0] ?? m.feature,
  value: m.calls30d,
}));

export default function AnalyticsPage() {
  const totalSent7d = emailVolumeMetrics.reduce((sum, m) => sum + m.sent, 0);
  const totalDelivered7d = emailVolumeMetrics.reduce((sum, m) => sum + m.delivered, 0);
  const totalBounced7d = emailVolumeMetrics.reduce((sum, m) => sum + m.bounced, 0);
  const totalComplaints7d = emailVolumeMetrics.reduce((sum, m) => sum + m.complained, 0);
  const avgDeliverability = (totalDelivered7d / totalSent7d * 100).toFixed(1);
  const currentMrr = revenueMetrics[revenueMetrics.length - 1]?.mrr ?? 0;
  const previousMrr = revenueMetrics[revenueMetrics.length - 2]?.mrr ?? 0;
  const mrrGrowth = previousMrr > 0 ? ((currentMrr - previousMrr) / previousMrr * 100).toFixed(1) : "0";

  return (
    <PageLayout
      title="Platform Analytics"
      description="Email volume, revenue metrics, and AI usage across the entire platform"
      actions={
        <Box className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            Last 7 Days
          </Button>
          <Button variant="secondary" size="sm">
            Export Report
          </Button>
        </Box>
      }
    >
      <Box className="space-y-6">
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Emails Sent (7d)"
            value={formatLargeNumber(totalSent7d)}
            trend="up"
            changePercent={9.4}
            description="week over week"
          />
          <StatCard
            label="Deliverability"
            value={`${avgDeliverability}%`}
            trend="up"
            changePercent={0.4}
            description="7-day average"
          />
          <StatCard
            label="MRR"
            value={formatCurrency(currentMrr)}
            trend="up"
            changePercent={parseFloat(mrrGrowth)}
            description="month over month"
          />
          <StatCard
            label="AI Calls (30d)"
            value={formatLargeNumber(aiUsageMetrics.reduce((s, m) => s + m.calls30d, 0))}
            trend="up"
            changePercent={14.2}
            description="total API calls"
          />
        </Box>

        <EmailVolumeSection
          metrics={emailVolumeMetrics}
          sentData={sentData}
          deliveredData={deliveredData}
          bouncedData={bouncedData}
          totalBounced={totalBounced7d}
          totalComplaints={totalComplaints7d}
        />

        <RevenueSection
          metrics={revenueMetrics}
          mrrData={mrrData}
          churnData={churnData}
        />

        <AiUsageSection
          metrics={aiUsageMetrics}
          callsData={aiCallsData}
        />
      </Box>
    </PageLayout>
  );
}

interface EmailVolumeSectionProps {
  metrics: EmailVolumeMetric[];
  sentData: ChartDataPoint[];
  deliveredData: ChartDataPoint[];
  bouncedData: ChartDataPoint[];
  totalBounced: number;
  totalComplaints: number;
}

function EmailVolumeSection({
  metrics,
  sentData,
  deliveredData,
  bouncedData,
  totalBounced,
  totalComplaints,
}: EmailVolumeSectionProps) {
  return (
    <Box className="space-y-4">
      <Text variant="heading-md">Email Volume</Text>
      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          title="Sent Volume (7 days)"
          description="Total emails processed"
          data={sentData}
          chartType="bar"
          height={200}
          formatValue={(v) => formatLargeNumber(v)}
        />
        <AnalyticsChart
          title="Delivered vs Sent"
          description="Successfully delivered emails"
          data={deliveredData}
          chartType="area"
          height={200}
          formatValue={(v) => formatLargeNumber(v)}
        />
      </Box>
      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AnalyticsChart
          title="Bounced Emails"
          description="Hard and soft bounces"
          data={bouncedData}
          chartType="bar"
          color="bg-status-error"
          height={150}
          formatValue={(v) => formatLargeNumber(v)}
        />
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Bounce Breakdown</Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-4">
              <BreakdownRow label="Hard Bounces" value={Math.round(totalBounced * 0.35)} total={totalBounced} color="bg-status-error" />
              <BreakdownRow label="Soft Bounces" value={Math.round(totalBounced * 0.55)} total={totalBounced} color="bg-status-warning" />
              <BreakdownRow label="Policy Rejects" value={Math.round(totalBounced * 0.10)} total={totalBounced} color="bg-status-info" />
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Complaint Sources</Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-4">
              <BreakdownRow label="Gmail FBL" value={Math.round(totalComplaints * 0.42)} total={totalComplaints} color="bg-red-400" />
              <BreakdownRow label="Yahoo FBL" value={Math.round(totalComplaints * 0.28)} total={totalComplaints} color="bg-purple-400" />
              <BreakdownRow label="Outlook FBL" value={Math.round(totalComplaints * 0.22)} total={totalComplaints} color="bg-blue-400" />
              <BreakdownRow label="Other" value={Math.round(totalComplaints * 0.08)} total={totalComplaints} color="bg-slate-400" />
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Card>
        <CardHeader>
          <Text variant="heading-sm">Daily Volume Detail</Text>
        </CardHeader>
        <CardContent>
          <Box className="overflow-x-auto">
            <Box as="table" className="w-full">
              <Box as="thead">
                <Box as="tr" className="border-b border-border">
                  <TableHeader label="Date" />
                  <TableHeader label="Sent" />
                  <TableHeader label="Delivered" />
                  <TableHeader label="Bounced" />
                  <TableHeader label="Complained" />
                  <TableHeader label="Deliverability" />
                </Box>
              </Box>
              <Box as="tbody">
                {metrics.map((m) => (
                  <Box key={m.date} as="tr" className="border-b border-border last:border-0 hover:bg-surface-secondary">
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="font-mono">{m.date}</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm">{m.sent.toLocaleString()}</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-status-success">{m.delivered.toLocaleString()}</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-status-error">{m.bounced.toLocaleString()}</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-status-warning">{m.complained.toLocaleString()}</Text>
                    </Box>
                    <Box as="td" className="py-2">
                      <Text variant="body-sm" className="font-medium">{m.deliverabilityRate}%</Text>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

interface RevenueSectionProps {
  metrics: RevenueMetric[];
  mrrData: ChartDataPoint[];
  churnData: ChartDataPoint[];
}

function RevenueSection({ metrics, mrrData, churnData }: RevenueSectionProps) {
  return (
    <Box className="space-y-4">
      <Text variant="heading-md">Revenue Metrics</Text>
      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          title="MRR Growth"
          description="Monthly recurring revenue trend"
          data={mrrData}
          chartType="area"
          height={180}
          formatValue={(v) => formatCurrency(v)}
        />
        <AnalyticsChart
          title="Churned Revenue"
          description="Revenue lost to churn by month"
          data={churnData}
          chartType="bar"
          color="bg-status-error"
          height={180}
          formatValue={(v) => formatCurrency(v)}
        />
      </Box>
      <Card>
        <CardHeader>
          <Text variant="heading-sm">Revenue Breakdown</Text>
        </CardHeader>
        <CardContent>
          <Box className="overflow-x-auto">
            <Box as="table" className="w-full">
              <Box as="thead">
                <Box as="tr" className="border-b border-border">
                  <TableHeader label="Month" />
                  <TableHeader label="MRR" />
                  <TableHeader label="New" />
                  <TableHeader label="Expansion" />
                  <TableHeader label="Churned" />
                  <TableHeader label="Net New" />
                </Box>
              </Box>
              <Box as="tbody">
                {metrics.map((m) => (
                  <Box key={m.month} as="tr" className="border-b border-border last:border-0 hover:bg-surface-secondary">
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="font-medium">{m.month} 2026</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm">{formatCurrency(m.mrr)}</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-status-success">+{formatCurrency(m.newRevenue)}</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-status-info">+{formatCurrency(m.expansionRevenue)}</Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-status-error">-{formatCurrency(m.churnedRevenue)}</Text>
                    </Box>
                    <Box as="td" className="py-2">
                      <Text variant="body-sm" className="font-medium text-status-success">+{formatCurrency(m.netNewMrr)}</Text>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

interface AiUsageSectionProps {
  metrics: AiUsageMetric[];
  callsData: ChartDataPoint[];
}

function AiUsageSection({ metrics, callsData }: AiUsageSectionProps) {
  return (
    <Box className="space-y-4">
      <Text variant="heading-md">AI Usage</Text>
      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          title="AI Calls by Feature (30d)"
          description="Top features by API call volume"
          data={callsData}
          chartType="bar"
          color="bg-purple-500"
          height={200}
          formatValue={(v) => formatLargeNumber(v)}
        />
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Feature Performance</Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-3">
              {metrics.map((m) => (
                <AiFeatureRow key={m.feature} metric={m} />
              ))}
            </Box>
          </CardContent>
          <CardFooter>
            <Text variant="caption" muted>
              All AI features are backed by fallback logic ensuring degraded-but-functional behavior when AI is unavailable.
            </Text>
          </CardFooter>
        </Card>
      </Box>
    </Box>
  );
}

function AiFeatureRow({ metric }: { metric: AiUsageMetric }) {
  return (
    <Box className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <Box className="flex items-center gap-3">
        <Box className="w-2 h-2 rounded-full bg-purple-500" />
        <Text variant="body-sm" className="font-medium">
          {metric.feature}
        </Text>
      </Box>
      <Box className="flex items-center gap-4">
        <Text variant="caption" muted>
          {formatLargeNumber(metric.calls30d)} calls
        </Text>
        <Text variant="caption" className="text-status-success font-medium">
          +{metric.change30d}%
        </Text>
        <Text variant="caption" muted>
          {metric.avgLatencyMs}ms
        </Text>
        <Text variant="caption" className={metric.successRate >= 99 ? "text-status-success" : "text-status-warning"}>
          {metric.successRate}%
        </Text>
      </Box>
    </Box>
  );
}

function BreakdownRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Box>
      <Box className="flex items-center justify-between mb-1">
        <Text variant="body-sm">{label}</Text>
        <Text variant="caption" muted>
          {value.toLocaleString()} ({percent}%)
        </Text>
      </Box>
      <Box className="w-full h-2 rounded-full bg-surface-tertiary overflow-hidden">
        <Box className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </Box>
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

function formatLargeNumber(n: number): string {
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(0)}K`;
  }
  return n.toString();
}

function formatCurrency(n: number): string {
  return `$${(n / 1000).toFixed(0)}K`;
}
