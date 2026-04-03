"use client";

import { useState } from "react";
import { Box, Text, Button } from "@emailed/ui";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { ChartContainer } from "../../components/chart-container";
import { DataTable } from "../../components/data-table";

interface QueueJob {
  readonly id: string;
  readonly type: "outbound" | "inbound" | "bounce" | "webhook" | "notification";
  readonly domain: string;
  readonly status: "queued" | "processing" | "failed" | "stalled";
  readonly priority: "high" | "normal" | "low";
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAt: string;
  readonly error?: string;
}

const queueJobs: readonly QueueJob[] = [
  { id: "job-8a2f1c", type: "outbound", domain: "acme-corp.com", status: "processing", priority: "high", attempts: 1, maxAttempts: 5, createdAt: "12s ago" },
  { id: "job-3b7e4d", type: "outbound", domain: "newsletter.io", status: "queued", priority: "normal", attempts: 0, maxAttempts: 5, createdAt: "28s ago" },
  { id: "job-9c1f8a", type: "bounce", domain: "bulk-news.co", status: "failed", priority: "normal", attempts: 5, maxAttempts: 5, createdAt: "4m ago", error: "Recipient mailbox full (452 4.2.2)" },
  { id: "job-2d5e9b", type: "webhook", domain: "startup-labs.co", status: "queued", priority: "low", attempts: 0, maxAttempts: 3, createdAt: "1m ago" },
  { id: "job-6f3a7c", type: "outbound", domain: "financeapp.com", status: "processing", priority: "high", attempts: 1, maxAttempts: 5, createdAt: "5s ago" },
  { id: "job-1e4b8d", type: "inbound", domain: "emailed.dev", status: "stalled", priority: "high", attempts: 3, maxAttempts: 5, createdAt: "8m ago", error: "AI classification timeout" },
  { id: "job-7a2c3e", type: "notification", domain: "devtools.xyz", status: "queued", priority: "low", attempts: 0, maxAttempts: 3, createdAt: "32s ago" },
  { id: "job-4d9f1b", type: "outbound", domain: "saas-platform.io", status: "failed", priority: "normal", attempts: 5, maxAttempts: 5, createdAt: "12m ago", error: "Connection refused by recipient MX" },
  { id: "job-5c8e2a", type: "outbound", domain: "acme-corp.com", status: "queued", priority: "normal", attempts: 0, maxAttempts: 5, createdAt: "15s ago" },
  { id: "job-8b1d4f", type: "bounce", domain: "edu-platform.edu", status: "processing", priority: "normal", attempts: 1, maxAttempts: 5, createdAt: "22s ago" },
  { id: "job-3e7a9c", type: "outbound", domain: "healthco.org", status: "queued", priority: "normal", attempts: 0, maxAttempts: 5, createdAt: "8s ago" },
  { id: "job-0f2b5d", type: "webhook", domain: "financeapp.com", status: "failed", priority: "low", attempts: 3, maxAttempts: 3, createdAt: "25m ago", error: "Webhook endpoint returned 503" },
] as const;

const priorityDistribution = [
  { label: "High", count: 342, color: "bg-status-error" },
  { label: "Normal", count: 1247, color: "bg-brand-500" },
  { label: "Low", count: 258, color: "bg-content-tertiary" },
] as const;

const throughputData = [
  4100, 4200, 4150, 4300, 4250, 4400, 4350, 4200, 4100, 4300, 4400, 4200,
] as const;

const jobColumns = [
  {
    key: "id",
    header: "Job ID",
    render: (row: QueueJob) => (
      <Text variant="body-sm" className="text-content font-mono">{row.id}</Text>
    ),
  },
  {
    key: "type",
    header: "Type",
    sortable: true,
    sortValue: (row: QueueJob) => row.type,
    render: (row: QueueJob) => {
      const typeColors: Record<string, string> = {
        outbound: "bg-brand-600/10 text-brand-400",
        inbound: "bg-status-info/10 text-status-info",
        bounce: "bg-status-warning/10 text-status-warning",
        webhook: "bg-status-success/10 text-status-success",
        notification: "bg-content-tertiary/10 text-content-secondary",
      };
      return (
        <Box className={`inline-flex rounded-full px-2 py-0.5 ${typeColors[row.type] ?? ""}`}>
          <Text as="span" variant="caption" className="font-medium capitalize">{row.type}</Text>
        </Box>
      );
    },
  },
  {
    key: "domain",
    header: "Domain",
    sortable: true,
    sortValue: (row: QueueJob) => row.domain,
    render: (row: QueueJob) => (
      <Text variant="body-sm" className="text-content-secondary">{row.domain}</Text>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (row: QueueJob) => row.status,
    render: (row: QueueJob) => {
      const map = {
        queued: { status: "unknown" as const, label: "Queued" },
        processing: { status: "healthy" as const, label: "Processing" },
        failed: { status: "critical" as const, label: "Failed" },
        stalled: { status: "warning" as const, label: "Stalled" },
      } as const;
      const config = map[row.status];
      return <StatusBadge status={config.status} label={config.label} />;
    },
  },
  {
    key: "priority",
    header: "Priority",
    sortable: true,
    sortValue: (row: QueueJob) => row.priority === "high" ? 0 : row.priority === "normal" ? 1 : 2,
    render: (row: QueueJob) => {
      const colors: Record<string, string> = { high: "text-status-error", normal: "text-content-secondary", low: "text-content-tertiary" };
      return (
        <Text variant="body-sm" className={`font-medium capitalize ${colors[row.priority] ?? ""}`}>{row.priority}</Text>
      );
    },
  },
  {
    key: "attempts",
    header: "Attempts",
    render: (row: QueueJob) => (
      <Text variant="body-sm" className="text-content-secondary font-mono">{row.attempts}/{row.maxAttempts}</Text>
    ),
  },
  {
    key: "createdAt",
    header: "Age",
    render: (row: QueueJob) => (
      <Text variant="caption" className="text-content-tertiary">{row.createdAt}</Text>
    ),
  },
] as const;

export default function QueuePage() {
  const [queuePaused, setQueuePaused] = useState(false);

  const queuedCount = queueJobs.filter((j) => j.status === "queued").length;
  const processingCount = queueJobs.filter((j) => j.status === "processing").length;
  const failedCount = queueJobs.filter((j) => j.status === "failed").length;
  const stalledCount = queueJobs.filter((j) => j.status === "stalled").length;
  const totalPriority = priorityDistribution.reduce((sum, p) => sum + p.count, 0);

  return (
    <Box className="flex flex-col gap-8">
      <Box className="flex items-start justify-between">
        <Box>
          <Text variant="heading-lg" className="text-content font-bold">Email Queue</Text>
          <Text variant="body-sm" className="text-content-secondary mt-1">
            Monitor queue depth, manage failed and stalled jobs, and control processing
          </Text>
        </Box>
        <Box className="flex items-center gap-3">
          <StatusBadge status={queuePaused ? "warning" : "healthy"} label={queuePaused ? "Paused" : "Running"} />
          <Button
            variant={queuePaused ? "primary" : "secondary"}
            size="sm"
            onClick={() => setQueuePaused(!queuePaused)}
            aria-label={queuePaused ? "Resume queue processing" : "Pause queue processing"}
          >
            {queuePaused ? "Resume" : "Pause"}
          </Button>
        </Box>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Queue metrics">
        <MetricCard
          label="Queue Depth"
          value="1,847"
          trend={{ direction: "down", value: "23.4%" }}
          sparklineData={[3200, 2800, 2500, 2200, 2000, 1900, 1850, 1847]}
        />
        <MetricCard
          label="Failed Jobs"
          value={failedCount.toString()}
          trend={{ direction: "down", value: "2" }}
          description="Last 24 hours"
        />
        <MetricCard
          label="Stalled Jobs"
          value={stalledCount.toString()}
          trend={{ direction: "neutral", value: "stable" }}
          description="Requires attention"
        />
        <MetricCard
          label="Throughput"
          value="4,200/s"
          trend={{ direction: "up", value: "8.2%" }}
          sparklineData={[...throughputData]}
        />
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Box className="lg:col-span-2">
          <ChartContainer title="Throughput (last 60 min)" description="Messages processed per second">
            <Box className="flex items-end gap-1 h-32" role="img" aria-label="Throughput bar chart">
              {throughputData.map((val, i) => (
                <Box
                  key={i}
                  className="flex-1 bg-brand-500/60 hover:bg-brand-500/80 rounded-t transition-colors"
                  style={{ height: `${((val - 3800) / 800) * 100}%` }}
                  title={`${val} msg/s`}
                />
              ))}
            </Box>
          </ChartContainer>
        </Box>

        <Box className="rounded-xl bg-surface-secondary border border-border p-5">
          <Text variant="heading-sm" className="text-content font-semibold mb-4">Priority Distribution</Text>
          <Box className="flex flex-col gap-4" role="list" aria-label="Priority distribution">
            {priorityDistribution.map((p) => (
              <Box key={p.label} role="listitem">
                <Box className="flex items-center justify-between mb-1">
                  <Text variant="body-sm" className="text-content">{p.label}</Text>
                  <Text variant="body-sm" className="text-content-secondary font-mono">{p.count.toLocaleString()}</Text>
                </Box>
                <Box className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                  <Box className={`h-full rounded-full ${p.color}`} style={{ width: `${(p.count / totalPriority) * 100}%` }} />
                </Box>
              </Box>
            ))}
          </Box>

          <Box className="mt-6 pt-4 border-t border-border/50">
            <Box className="flex items-center justify-between mb-1">
              <Text variant="caption" className="text-content-secondary">Queued</Text>
              <Text variant="caption" className="text-content font-mono">{queuedCount}</Text>
            </Box>
            <Box className="flex items-center justify-between mb-1">
              <Text variant="caption" className="text-content-secondary">Processing</Text>
              <Text variant="caption" className="text-content font-mono">{processingCount}</Text>
            </Box>
            <Box className="flex items-center justify-between mb-1">
              <Text variant="caption" className="text-content-secondary">Failed</Text>
              <Text variant="caption" className="text-status-error font-mono">{failedCount}</Text>
            </Box>
            <Box className="flex items-center justify-between">
              <Text variant="caption" className="text-content-secondary">Stalled</Text>
              <Text variant="caption" className="text-status-warning font-mono">{stalledCount}</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box>
        <Text variant="heading-md" className="text-content font-semibold mb-4">Recent Jobs</Text>
        <DataTable
          columns={jobColumns}
          data={queueJobs}
          rowKey={(row) => row.id}
          pageSize={10}
          filterPlaceholder="Search by job ID or domain..."
          filterFn={(row, query) => {
            const q = query.toLowerCase();
            return row.id.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q);
          }}
          emptyMessage="No jobs in queue"
        />
      </Box>
    </Box>
  );
}
