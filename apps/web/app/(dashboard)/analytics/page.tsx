"use client";

import { useEffect, useState } from "react";
import {
  Box,
  PageLayout,
  StatCard,
  AnalyticsChart,
  type ChartDataPoint,
} from "@emailed/ui";
import { analyticsApi, type OverviewStats } from "../../../lib/api";

// Fallback data for when API is not connected
const fallbackDeliverability: ChartDataPoint[] = [
  { label: "Mon", value: 0 },
  { label: "Tue", value: 0 },
  { label: "Wed", value: 0 },
  { label: "Thu", value: 0 },
  { label: "Fri", value: 0 },
  { label: "Sat", value: 0 },
  { label: "Sun", value: 0 },
];

export default function AnalyticsPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsApi
      .overview()
      .then((res) => setStats(res.data))
      .catch(() => {
        // API not available — show zeroes
        setStats({
          sent: 0,
          delivered: 0,
          bounced: 0,
          complained: 0,
          opened: 0,
          clicked: 0,
          deliveryRate: 0,
          bounceRate: 0,
          openRate: 0,
          clickRate: 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const deliveryRate = stats ? (stats.deliveryRate * 100).toFixed(1) : "0";
  const openRate = stats ? (stats.openRate * 100).toFixed(1) : "0";
  const bounceRate = stats ? (stats.bounceRate * 100).toFixed(1) : "0";

  return (
    <PageLayout
      title="Analytics"
      description="Monitor your email deliverability, engagement metrics, and sender reputation."
    >
      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Deliverability Rate"
          value={loading ? "..." : `${deliveryRate}%`}
          changePercent={0}
          trend="up"
          description="last 30 days"
        />
        <StatCard
          label="Open Rate"
          value={loading ? "..." : `${openRate}%`}
          changePercent={0}
          trend="up"
          description="last 30 days"
        />
        <StatCard
          label="Bounce Rate"
          value={loading ? "..." : `${bounceRate}%`}
          changePercent={0}
          trend="down"
          description="last 30 days"
        />
        <StatCard
          label="Emails Sent"
          value={loading ? "..." : String(stats?.sent ?? 0)}
          changePercent={0}
          trend="up"
          description="last 30 days"
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          title="Deliverability Rate"
          description="Percentage of emails successfully delivered over the past week"
          data={fallbackDeliverability}
          chartType="area"
          height={220}
          formatValue={(v) => `${v}%`}
        />
        <AnalyticsChart
          title="Engagement Rate"
          description="Open and click-through rates by week"
          data={fallbackDeliverability}
          chartType="bar"
          height={220}
          formatValue={(v) => `${v}%`}
        />
        <AnalyticsChart
          title="Send Volume"
          description="Total emails sent per period"
          data={fallbackDeliverability}
          chartType="bar"
          height={220}
          formatValue={(v) => v.toLocaleString()}
        />
        <AnalyticsChart
          title="Bounce Rate"
          description="Hard and soft bounces over the past week"
          data={fallbackDeliverability}
          chartType="line"
          height={220}
          formatValue={(v) => `${v}%`}
        />
      </Box>
    </PageLayout>
  );
}
