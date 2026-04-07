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

interface ServiceStatus {
  name: string;
  identifier: string;
  status: "operational" | "degraded" | "partial-outage" | "major-outage";
  uptime30d: number;
  latencyP50Ms: number;
  latencyP99Ms: number;
  errorRate: number;
  instanceCount: number;
  cpuPercent: number;
  memoryPercent: number;
  version: string;
  lastDeployed: string;
}

interface QueueStatus {
  name: string;
  depth: number;
  processingRate: number;
  oldestMessageAge: string;
  workers: number;
  failedJobs24h: number;
  status: "healthy" | "backlogged" | "stalled";
}

interface RecentIncident {
  id: string;
  title: string;
  severity: "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  startedAt: string;
  resolvedAt: string | null;
  affectedServices: string[];
  description: string;
}

const services: ServiceStatus[] = [
  {
    name: "Mail Transfer Agent",
    identifier: "mta",
    status: "operational",
    uptime30d: 99.99,
    latencyP50Ms: 12,
    latencyP99Ms: 85,
    errorRate: 0.01,
    instanceCount: 6,
    cpuPercent: 42,
    memoryPercent: 58,
    version: "0.14.2",
    lastDeployed: "2026-04-05T18:00:00Z",
  },
  {
    name: "JMAP Server",
    identifier: "jmap",
    status: "operational",
    uptime30d: 99.99,
    latencyP50Ms: 8,
    latencyP99Ms: 45,
    errorRate: 0.005,
    instanceCount: 4,
    cpuPercent: 35,
    memoryPercent: 52,
    version: "0.9.1",
    lastDeployed: "2026-04-04T14:30:00Z",
  },
  {
    name: "DNS Authority",
    identifier: "dns",
    status: "operational",
    uptime30d: 100.0,
    latencyP50Ms: 2,
    latencyP99Ms: 8,
    errorRate: 0.0,
    instanceCount: 3,
    cpuPercent: 12,
    memoryPercent: 28,
    version: "0.6.0",
    lastDeployed: "2026-03-28T10:00:00Z",
  },
  {
    name: "Sentinel Pipeline",
    identifier: "sentinel",
    status: "operational",
    uptime30d: 99.99,
    latencyP50Ms: 0.4,
    latencyP99Ms: 12,
    errorRate: 0.001,
    instanceCount: 8,
    cpuPercent: 55,
    memoryPercent: 68,
    version: "1.2.0",
    lastDeployed: "2026-04-06T08:00:00Z",
  },
  {
    name: "AI Engine",
    identifier: "ai-engine",
    status: "degraded",
    uptime30d: 99.95,
    latencyP50Ms: 120,
    latencyP99Ms: 480,
    errorRate: 0.15,
    instanceCount: 5,
    cpuPercent: 78,
    memoryPercent: 82,
    version: "0.11.3",
    lastDeployed: "2026-04-06T06:00:00Z",
  },
  {
    name: "Inbound Processing",
    identifier: "inbound",
    status: "operational",
    uptime30d: 99.98,
    latencyP50Ms: 35,
    latencyP99Ms: 180,
    errorRate: 0.02,
    instanceCount: 4,
    cpuPercent: 48,
    memoryPercent: 61,
    version: "0.8.4",
    lastDeployed: "2026-04-03T16:00:00Z",
  },
  {
    name: "Reputation Engine",
    identifier: "reputation",
    status: "operational",
    uptime30d: 99.99,
    latencyP50Ms: 18,
    latencyP99Ms: 65,
    errorRate: 0.008,
    instanceCount: 3,
    cpuPercent: 30,
    memoryPercent: 45,
    version: "0.7.1",
    lastDeployed: "2026-04-02T12:00:00Z",
  },
  {
    name: "Analytics Service",
    identifier: "analytics",
    status: "operational",
    uptime30d: 99.97,
    latencyP50Ms: 25,
    latencyP99Ms: 120,
    errorRate: 0.03,
    instanceCount: 2,
    cpuPercent: 22,
    memoryPercent: 38,
    version: "0.5.0",
    lastDeployed: "2026-04-01T09:00:00Z",
  },
];

const queues: QueueStatus[] = [
  { name: "outbound-send", depth: 12450, processingRate: 8500, oldestMessageAge: "1.5s", workers: 12, failedJobs24h: 23, status: "healthy" },
  { name: "inbound-process", depth: 340, processingRate: 2100, oldestMessageAge: "0.2s", workers: 8, failedJobs24h: 5, status: "healthy" },
  { name: "bounce-process", depth: 89, processingRate: 450, oldestMessageAge: "0.8s", workers: 4, failedJobs24h: 0, status: "healthy" },
  { name: "ai-classification", depth: 5200, processingRate: 1200, oldestMessageAge: "4.3s", workers: 6, failedJobs24h: 42, status: "backlogged" },
  { name: "webhook-delivery", depth: 2100, processingRate: 3200, oldestMessageAge: "0.7s", workers: 6, failedJobs24h: 12, status: "healthy" },
  { name: "dns-propagation", depth: 15, processingRate: 30, oldestMessageAge: "0.5s", workers: 2, failedJobs24h: 0, status: "healthy" },
  { name: "warmup-scheduler", depth: 8, processingRate: 2, oldestMessageAge: "12s", workers: 1, failedJobs24h: 0, status: "healthy" },
];

const recentIncidents: RecentIncident[] = [
  {
    id: "INC-042",
    title: "AI Engine elevated latency",
    severity: "minor",
    status: "monitoring",
    startedAt: "2026-04-06T14:00:00Z",
    resolvedAt: null,
    affectedServices: ["ai-engine"],
    description: "Claude API response times elevated. Auto-scaling applied. Monitoring for recovery.",
  },
  {
    id: "INC-041",
    title: "MTA queue backlog during traffic spike",
    severity: "major",
    status: "resolved",
    startedAt: "2026-04-04T09:15:00Z",
    resolvedAt: "2026-04-04T09:45:00Z",
    affectedServices: ["mta"],
    description: "Unexpected traffic spike from enterprise customer caused 30-minute queue backlog. Auto-scaling resolved.",
  },
  {
    id: "INC-040",
    title: "DNS propagation delay for new domains",
    severity: "minor",
    status: "resolved",
    startedAt: "2026-04-02T16:00:00Z",
    resolvedAt: "2026-04-02T17:30:00Z",
    affectedServices: ["dns"],
    description: "New domain DNS records took longer than expected to propagate. Root cause: upstream resolver caching.",
  },
];

const errorRateData: ChartDataPoint[] = [
  { label: "00:00", value: 0.02 },
  { label: "04:00", value: 0.01 },
  { label: "08:00", value: 0.03 },
  { label: "12:00", value: 0.05 },
  { label: "14:00", value: 0.15 },
  { label: "15:00", value: 0.12 },
];

const throughputData: ChartDataPoint[] = [
  { label: "00:00", value: 45000 },
  { label: "04:00", value: 28000 },
  { label: "08:00", value: 125000 },
  { label: "12:00", value: 180000 },
  { label: "14:00", value: 165000 },
  { label: "15:00", value: 155000 },
];

const serviceStatusStyles: Record<ServiceStatus["status"], { dot: string; text: string; label: string }> = {
  operational: { dot: "bg-status-success", text: "text-status-success", label: "Operational" },
  degraded: { dot: "bg-status-warning", text: "text-status-warning", label: "Degraded" },
  "partial-outage": { dot: "bg-status-error", text: "text-status-error", label: "Partial Outage" },
  "major-outage": { dot: "bg-status-error", text: "text-status-error", label: "Major Outage" },
};

const queueStatusStyles: Record<QueueStatus["status"], { bg: string; text: string }> = {
  healthy: { bg: "bg-emerald-50", text: "text-status-success" },
  backlogged: { bg: "bg-amber-50", text: "text-status-warning" },
  stalled: { bg: "bg-red-50", text: "text-status-error" },
};

const incidentSeverityStyles: Record<RecentIncident["severity"], { bg: string; text: string }> = {
  minor: { bg: "bg-amber-50", text: "text-status-warning" },
  major: { bg: "bg-orange-50", text: "text-orange-700" },
  critical: { bg: "bg-red-50", text: "text-status-error" },
};

const incidentStatusStyles: Record<RecentIncident["status"], { label: string; color: string }> = {
  investigating: { label: "Investigating", color: "text-status-error" },
  identified: { label: "Identified", color: "text-status-warning" },
  monitoring: { label: "Monitoring", color: "text-status-info" },
  resolved: { label: "Resolved", color: "text-status-success" },
};

export default function SystemPage() {
  const operationalCount = services.filter((s) => s.status === "operational").length;
  const totalQueueDepth = queues.reduce((sum, q) => sum + q.depth, 0);
  const avgErrorRate = services.reduce((sum, s) => sum + s.errorRate, 0) / services.length;
  const avgCpu = Math.round(services.reduce((sum, s) => sum + s.cpuPercent, 0) / services.length);

  return (
    <PageLayout
      title="System Health"
      description="Real-time service status, queue depths, error rates, and resource utilization"
      actions={
        <Box className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            Refresh
          </Button>
          <Button variant="secondary" size="sm">
            Incident History
          </Button>
        </Box>
      }
    >
      <Box className="space-y-6">
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Services Operational"
            value={`${operationalCount}/${services.length}`}
            trend={operationalCount === services.length ? "up" : "down"}
            description="across all services"
          />
          <StatCard
            label="Total Queue Depth"
            value={totalQueueDepth.toLocaleString()}
            trend="neutral"
            description="messages in queues"
          />
          <StatCard
            label="Avg Error Rate"
            value={`${(avgErrorRate * 100).toFixed(2)}%`}
            trend={avgErrorRate < 0.05 ? "up" : "down"}
            description="across all services"
          />
          <StatCard
            label="Avg CPU Usage"
            value={`${avgCpu}%`}
            trend="neutral"
            description="across all instances"
          />
        </Box>

        <ServiceStatusGrid services={services} />

        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalyticsChart
            title="Error Rate (today)"
            description="Platform-wide error rate over time"
            data={errorRateData}
            chartType="line"
            height={180}
            formatValue={(v) => `${v}%`}
          />
          <AnalyticsChart
            title="Throughput (today)"
            description="Emails processed per hour"
            data={throughputData}
            chartType="area"
            height={180}
            formatValue={(v) => `${(v / 1000).toFixed(0)}K/hr`}
          />
        </Box>

        <QueueStatusTable queues={queues} />
        <ResourceUtilizationPanel services={services} />
        <IncidentTimeline incidents={recentIncidents} />
      </Box>
    </PageLayout>
  );
}

function ServiceStatusGrid({ services: allServices }: { services: ServiceStatus[] }) {
  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">Service Status</Text>
          <Text variant="caption" muted>
            Last checked: just now
          </Text>
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {allServices.map((service) => (
            <ServiceStatusCard key={service.identifier} service={service} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function ServiceStatusCard({ service }: { service: ServiceStatus }) {
  const style = serviceStatusStyles[service.status];

  return (
    <Box className="p-4 rounded-lg border border-border hover:shadow-card-hover transition-shadow">
      <Box className="flex items-center justify-between mb-3">
        <Text variant="body-sm" className="font-medium">
          {service.name}
        </Text>
        <Box className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
      </Box>
      <Box className="space-y-1.5">
        <Box className="flex items-center justify-between">
          <Text variant="caption" muted>Status</Text>
          <Text variant="caption" className={`font-medium ${style.text}`}>
            {style.label}
          </Text>
        </Box>
        <Box className="flex items-center justify-between">
          <Text variant="caption" muted>Uptime</Text>
          <Text variant="caption" className="font-medium">
            {service.uptime30d}%
          </Text>
        </Box>
        <Box className="flex items-center justify-between">
          <Text variant="caption" muted>p50 / p99</Text>
          <Text variant="caption" className="font-mono">
            {service.latencyP50Ms}ms / {service.latencyP99Ms}ms
          </Text>
        </Box>
        <Box className="flex items-center justify-between">
          <Text variant="caption" muted>Errors</Text>
          <Text variant="caption" className={service.errorRate > 0.1 ? "text-status-error font-medium" : ""}>
            {service.errorRate}%
          </Text>
        </Box>
        <Box className="flex items-center justify-between">
          <Text variant="caption" muted>Instances</Text>
          <Text variant="caption">{service.instanceCount}</Text>
        </Box>
        <Box className="flex items-center justify-between">
          <Text variant="caption" muted>Version</Text>
          <Text variant="caption" className="font-mono">v{service.version}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function QueueStatusTable({ queues: allQueues }: { queues: QueueStatus[] }) {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Queue Status</Text>
      </CardHeader>
      <CardContent>
        <Box className="overflow-x-auto">
          <Box as="table" className="w-full">
            <Box as="thead">
              <Box as="tr" className="border-b border-border">
                <TableHeader label="Queue" />
                <TableHeader label="Depth" />
                <TableHeader label="Rate" />
                <TableHeader label="Oldest" />
                <TableHeader label="Workers" />
                <TableHeader label="Failed (24h)" />
                <TableHeader label="Status" />
              </Box>
            </Box>
            <Box as="tbody">
              {allQueues.map((queue) => (
                <QueueRow key={queue.name} queue={queue} />
              ))}
            </Box>
          </Box>
        </Box>
      </CardContent>
      <CardFooter>
        <Text variant="caption" muted>
          Queues are monitored by Sentinel. Auto-scaling triggers when depth exceeds 2x processing rate.
        </Text>
      </CardFooter>
    </Card>
  );
}

function QueueRow({ queue }: { queue: QueueStatus }) {
  const style = queueStatusStyles[queue.status];

  return (
    <Box as="tr" className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm" className="font-mono font-medium">
          {queue.name}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm" className={queue.depth > 5000 ? "font-medium text-status-warning" : ""}>
          {queue.depth.toLocaleString()}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm">
          {queue.processingRate.toLocaleString()}/s
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm">{queue.oldestMessageAge}</Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm">{queue.workers}</Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm" className={queue.failedJobs24h > 20 ? "text-status-error font-medium" : ""}>
          {queue.failedJobs24h}
        </Text>
      </Box>
      <Box as="td" className="py-3">
        <Box className={`inline-flex px-2 py-0.5 rounded-full ${style.bg}`}>
          <Text variant="caption" className={`font-medium capitalize ${style.text}`}>
            {queue.status}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function ResourceUtilizationPanel({ services: allServices }: { services: ServiceStatus[] }) {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Resource Utilization</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          {allServices.map((service) => (
            <ResourceRow key={service.identifier} service={service} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function ResourceRow({ service }: { service: ServiceStatus }) {
  return (
    <Box className="flex items-center gap-4 py-2 border-b border-border last:border-0">
      <Text variant="body-sm" className="font-medium w-44 flex-shrink-0">
        {service.name}
      </Text>
      <Box className="flex-1 space-y-1">
        <Box className="flex items-center gap-2">
          <Text variant="caption" className="w-10 text-right text-content-tertiary">CPU</Text>
          <Box className="flex-1 h-2 rounded-full bg-surface-tertiary overflow-hidden">
            <Box
              className={`h-full rounded-full ${
                service.cpuPercent >= 80 ? "bg-status-error" :
                service.cpuPercent >= 60 ? "bg-status-warning" :
                "bg-status-success"
              }`}
              style={{ width: `${service.cpuPercent}%` }}
            />
          </Box>
          <Text variant="caption" className="w-10 text-content-tertiary">
            {service.cpuPercent}%
          </Text>
        </Box>
        <Box className="flex items-center gap-2">
          <Text variant="caption" className="w-10 text-right text-content-tertiary">MEM</Text>
          <Box className="flex-1 h-2 rounded-full bg-surface-tertiary overflow-hidden">
            <Box
              className={`h-full rounded-full ${
                service.memoryPercent >= 80 ? "bg-status-error" :
                service.memoryPercent >= 60 ? "bg-status-warning" :
                "bg-brand-500"
              }`}
              style={{ width: `${service.memoryPercent}%` }}
            />
          </Box>
          <Text variant="caption" className="w-10 text-content-tertiary">
            {service.memoryPercent}%
          </Text>
        </Box>
      </Box>
      <Text variant="caption" className="text-content-tertiary w-20 text-right">
        {service.instanceCount} pods
      </Text>
    </Box>
  );
}

function IncidentTimeline({ incidents }: { incidents: RecentIncident[] }) {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Recent Incidents</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          {incidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function IncidentRow({ incident }: { incident: RecentIncident }) {
  const severity = incidentSeverityStyles[incident.severity];
  const status = incidentStatusStyles[incident.status];
  const startTime = new Date(incident.startedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Box className={`p-4 rounded-lg ${severity.bg} border border-border`}>
      <Box className="flex items-start justify-between">
        <Box className="flex-1">
          <Box className="flex items-center gap-2 mb-1">
            <Text variant="caption" className="font-mono text-content-tertiary">
              {incident.id}
            </Text>
            <Box className={`px-2 py-0.5 rounded ${severity.bg}`}>
              <Text variant="caption" className={`font-medium capitalize ${severity.text}`}>
                {incident.severity}
              </Text>
            </Box>
            <Text variant="caption" className={`font-medium ${status.color}`}>
              {status.label}
            </Text>
          </Box>
          <Text variant="body-sm" className="font-medium">
            {incident.title}
          </Text>
          <Text variant="caption" muted className="mt-1">
            {incident.description}
          </Text>
          <Box className="flex items-center gap-2 mt-2">
            <Text variant="caption" muted>
              Started: {startTime}
            </Text>
            {incident.resolvedAt && (
              <Text variant="caption" className="text-status-success">
                Resolved: {new Date(incident.resolvedAt).toLocaleString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            )}
          </Box>
        </Box>
        <Box className="flex flex-wrap gap-1 ml-4">
          {incident.affectedServices.map((svc) => (
            <Box key={svc} className="px-2 py-0.5 rounded bg-white/60">
              <Text variant="caption" className="font-mono">
                {svc}
              </Text>
            </Box>
          ))}
        </Box>
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
