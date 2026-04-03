"use client";

import {
  Box,
  PageLayout,
  StatCard,
  AnalyticsChart,
  type ChartDataPoint,
} from "@emailed/ui";

const deliverabilityData: ChartDataPoint[] = [
  { label: "Mon", value: 98.2 },
  { label: "Tue", value: 97.8 },
  { label: "Wed", value: 99.1 },
  { label: "Thu", value: 98.5 },
  { label: "Fri", value: 97.9 },
  { label: "Sat", value: 99.4 },
  { label: "Sun", value: 98.8 },
];

const engagementData: ChartDataPoint[] = [
  { label: "Week 1", value: 42 },
  { label: "Week 2", value: 38 },
  { label: "Week 3", value: 51 },
  { label: "Week 4", value: 47 },
];

const volumeData: ChartDataPoint[] = [
  { label: "Jan", value: 12400 },
  { label: "Feb", value: 15200 },
  { label: "Mar", value: 18900 },
  { label: "Apr", value: 14300 },
];

const bounceData: ChartDataPoint[] = [
  { label: "Mon", value: 1.2 },
  { label: "Tue", value: 0.8 },
  { label: "Wed", value: 0.5 },
  { label: "Thu", value: 1.1 },
  { label: "Fri", value: 0.9 },
  { label: "Sat", value: 0.3 },
  { label: "Sun", value: 0.6 },
];

export default function AnalyticsPage() {
  return (
    <PageLayout
      title="Analytics"
      description="Monitor your email deliverability, engagement metrics, and sender reputation."
    >
      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Deliverability Rate"
          value="98.6%"
          changePercent={0.4}
          trend="up"
          description="vs last week"
        />
        <StatCard
          label="Open Rate"
          value="47.2%"
          changePercent={3.1}
          trend="up"
          description="vs last week"
        />
        <StatCard
          label="Bounce Rate"
          value="0.8%"
          changePercent={0.2}
          trend="down"
          description="vs last week"
        />
        <StatCard
          label="Sender Score"
          value="94"
          changePercent={2}
          trend="up"
          description="out of 100"
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          title="Deliverability Rate"
          description="Percentage of emails successfully delivered over the past week"
          data={deliverabilityData}
          chartType="area"
          height={220}
          formatValue={(v) => `${v}%`}
        />
        <AnalyticsChart
          title="Engagement Rate"
          description="Open and click-through rates by week"
          data={engagementData}
          chartType="bar"
          height={220}
          formatValue={(v) => `${v}%`}
        />
        <AnalyticsChart
          title="Send Volume"
          description="Total emails sent per month"
          data={volumeData}
          chartType="bar"
          height={220}
          formatValue={(v) => v.toLocaleString()}
        />
        <AnalyticsChart
          title="Bounce Rate"
          description="Hard and soft bounces over the past week"
          data={bounceData}
          chartType="line"
          height={220}
          formatValue={(v) => `${v}%`}
        />
      </Box>
    </PageLayout>
  );
}
