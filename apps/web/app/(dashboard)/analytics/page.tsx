"use client";

import { useEffect, useState } from "react";
import {
  PageLayout,
  StatCard,
  AnalyticsChart,
  type ChartDataPoint,
} from "@alecrae/ui";
import { motion } from "motion/react";
import { analyticsApi, heatmapApi, type OverviewStats } from "../../../lib/api";
import {
  staggerGrid,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../../../lib/animations";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getLast7DaysLabels(): string[] {
  const labels: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1] ?? "");
  }
  return labels;
}

export default function AnalyticsPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [delivChart, setDelivChart] = useState<ChartDataPoint[]>([]);
  const [hourlyChart, setHourlyChart] = useState<ChartDataPoint[]>([]);
  const [volumeChart, setVolumeChart] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dayLabels = getLast7DaysLabels();

    Promise.all([
      analyticsApi.overview().catch(() => null),
      analyticsApi.deliverability({ granularity: "day" }).catch(() => null),
      heatmapApi.hourly({ period: "7d" }).catch(() => null),
      heatmapApi.heatmap({ period: "7d" }).catch(() => null),
    ]).then(([overviewRes, delivRes, hourlyRes, heatmapRes]) => {
      if (overviewRes) {
        setStats(overviewRes.data);
      } else {
        setStats({
          sent: 0, delivered: 0, bounced: 0, complained: 0,
          opened: 0, clicked: 0, deliveryRate: 0, bounceRate: 0,
          openRate: 0, clickRate: 0,
        });
      }

      if (delivRes && Array.isArray(delivRes.data) && delivRes.data.length > 0) {
        setDelivChart(
          delivRes.data.slice(-7).map((d: Record<string, unknown>, i: number) => ({
            label: dayLabels[i] ?? "",
            value: typeof d["deliveryRate"] === "number" ? Math.round(d["deliveryRate"] as number * 100) : 0,
          })),
        );
      } else {
        setDelivChart(dayLabels.map((l) => ({ label: l, value: 0 })));
      }

      if (hourlyRes && Array.isArray(hourlyRes.data) && hourlyRes.data.length > 0) {
        setHourlyChart(
          hourlyRes.data.map((h) => ({
            label: `${h.hour}:00`,
            value: h.sent + h.received,
          })),
        );
      } else {
        setHourlyChart(
          Array.from({ length: 24 }, (_, i) => ({ label: `${i}:00`, value: 0 })),
        );
      }

      if (heatmapRes && Array.isArray(heatmapRes.data) && heatmapRes.data.length > 0) {
        setVolumeChart(
          heatmapRes.data.slice(-7).map((d, i: number) => ({
            label: dayLabels[i] ?? "",
            value: d.sent + d.received,
          })),
        );
      } else {
        setVolumeChart(dayLabels.map((l) => ({ label: l, value: 0 })));
      }

      setLoading(false);
    });
  }, []);

  const deliveryRate = stats ? (stats.deliveryRate * 100).toFixed(1) : "0";
  const openRate = stats ? (stats.openRate * 100).toFixed(1) : "0";
  const bounceRate = stats ? (stats.bounceRate * 100).toFixed(1) : "0";

  const itemVariants = withReducedMotion(fadeInUp, reduced);

  return (
    <PageLayout
      title="Analytics"
      description="Monitor your email deliverability, engagement metrics, and sender reputation."
    >
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        variants={staggerGrid}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={itemVariants}>
          <StatCard
            label="Deliverability Rate"
            value={loading ? "..." : `${deliveryRate}%`}
            changePercent={0}
            trend="up"
            description="last 30 days"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard
            label="Open Rate"
            value={loading ? "..." : `${openRate}%`}
            changePercent={0}
            trend="up"
            description="last 30 days"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard
            label="Bounce Rate"
            value={loading ? "..." : `${bounceRate}%`}
            changePercent={0}
            trend="down"
            description="last 30 days"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard
            label="Emails Sent"
            value={loading ? "..." : String(stats?.sent ?? 0)}
            changePercent={0}
            trend="up"
            description="last 30 days"
          />
        </motion.div>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={staggerGrid}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={itemVariants}>
          <AnalyticsChart
            title="Deliverability Rate"
            description="Percentage of emails successfully delivered over the past week"
            data={delivChart.length > 0 ? delivChart : [{ label: "—", value: 0 }]}
            chartType="area"
            height={220}
            formatValue={(v) => `${v}%`}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AnalyticsChart
            title="Hourly Activity"
            description="Email activity by hour of day"
            data={hourlyChart.length > 0 ? hourlyChart : [{ label: "—", value: 0 }]}
            chartType="bar"
            height={220}
            formatValue={(v) => v.toLocaleString()}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AnalyticsChart
            title="Send Volume"
            description="Total emails sent and received per day"
            data={volumeChart.length > 0 ? volumeChart : [{ label: "—", value: 0 }]}
            chartType="bar"
            height={220}
            formatValue={(v) => v.toLocaleString()}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AnalyticsChart
            title="Bounce Rate"
            description="Hard and soft bounces over the past week"
            data={delivChart.length > 0 ? delivChart.map((d) => ({ label: d.label, value: Math.max(0, 100 - d.value) })) : [{ label: "—", value: 0 }]}
            chartType="line"
            height={220}
            formatValue={(v) => `${v}%`}
          />
        </motion.div>
      </motion.div>
    </PageLayout>
  );
}
