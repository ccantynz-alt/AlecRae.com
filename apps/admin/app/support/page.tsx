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

interface SupportTicket {
  id: string;
  subject: string;
  requester: string;
  requesterEmail: string;
  category: "deliverability" | "authentication" | "billing" | "abuse" | "technical" | "general";
  priority: "critical" | "high" | "medium" | "low";
  status: "open" | "ai-handling" | "escalated" | "resolved" | "closed";
  aiConfidence: number;
  aiSuggestedAction: string;
  createdAt: string;
  lastActivityAt: string;
  responseTimeMinutes: number;
}

interface AiPerformanceMetric {
  label: string;
  value: string;
  target: string;
  achieved: boolean;
}

const tickets: SupportTicket[] = [
  {
    id: "TKT-4281",
    subject: "Emails to Gmail going to spam folder",
    requester: "John Martinez",
    requesterEmail: "john@acmecorp.com",
    category: "deliverability",
    priority: "high",
    status: "ai-handling",
    aiConfidence: 0.94,
    aiSuggestedAction: "DKIM alignment issue detected. Auto-fix applied to DNS records.",
    createdAt: "2026-04-06T13:45:00Z",
    lastActivityAt: "2026-04-06T14:02:00Z",
    responseTimeMinutes: 2,
  },
  {
    id: "TKT-4280",
    subject: "SPF record not validating after domain setup",
    requester: "Sarah Chen",
    requesterEmail: "sarah@startup.io",
    category: "authentication",
    priority: "medium",
    status: "ai-handling",
    aiConfidence: 0.91,
    aiSuggestedAction: "DNS propagation in progress. Monitoring validation every 60s.",
    createdAt: "2026-04-06T12:30:00Z",
    lastActivityAt: "2026-04-06T14:15:00Z",
    responseTimeMinutes: 1,
  },
  {
    id: "TKT-4279",
    subject: "Invoice discrepancy for March billing cycle",
    requester: "Mike O'Brien",
    requesterEmail: "mike@enterprise.co",
    category: "billing",
    priority: "medium",
    status: "escalated",
    aiConfidence: 0.42,
    aiSuggestedAction: "Complex billing scenario involving mid-cycle plan change. Requires human review.",
    createdAt: "2026-04-06T11:00:00Z",
    lastActivityAt: "2026-04-06T13:30:00Z",
    responseTimeMinutes: 5,
  },
  {
    id: "TKT-4278",
    subject: "Suspected phishing campaign using our domain",
    requester: "Lisa Wong",
    requesterEmail: "lisa@techfirm.com",
    category: "abuse",
    priority: "critical",
    status: "escalated",
    aiConfidence: 0.67,
    aiSuggestedAction: "Pattern matches spoofing attack. DMARC reject policy recommended. Needs human approval for account action.",
    createdAt: "2026-04-06T09:15:00Z",
    lastActivityAt: "2026-04-06T14:00:00Z",
    responseTimeMinutes: 3,
  },
  {
    id: "TKT-4277",
    subject: "API rate limit too low for our volume",
    requester: "Dev Team",
    requesterEmail: "dev@saascompany.io",
    category: "technical",
    priority: "low",
    status: "resolved",
    aiConfidence: 0.97,
    aiSuggestedAction: "Account upgraded to Business tier. Rate limits increased from 100/min to 1000/min.",
    createdAt: "2026-04-06T08:00:00Z",
    lastActivityAt: "2026-04-06T08:05:00Z",
    responseTimeMinutes: 1,
  },
  {
    id: "TKT-4276",
    subject: "How to set up BIMI record",
    requester: "Marketing Team",
    requesterEmail: "marketing@brand.co",
    category: "general",
    priority: "low",
    status: "resolved",
    aiConfidence: 0.99,
    aiSuggestedAction: "Provided step-by-step BIMI setup guide. Offered to auto-configure via DNS service.",
    createdAt: "2026-04-06T07:30:00Z",
    lastActivityAt: "2026-04-06T07:32:00Z",
    responseTimeMinutes: 1,
  },
];

const aiPerformanceMetrics: AiPerformanceMetric[] = [
  { label: "Avg First Response Time", value: "1.8 min", target: "< 5 min", achieved: true },
  { label: "AI Resolution Rate", value: "73.2%", target: "> 70%", achieved: true },
  { label: "Escalation Rate", value: "14.8%", target: "< 20%", achieved: true },
  { label: "Avg Confidence Score", value: "0.87", target: "> 0.80", achieved: true },
  { label: "False Positive Rate", value: "2.1%", target: "< 5%", achieved: true },
  { label: "Customer Satisfaction", value: "4.6/5", target: "> 4.5", achieved: true },
];

const resolutionTrendData: ChartDataPoint[] = [
  { label: "Jan", value: 62 },
  { label: "Feb", value: 65 },
  { label: "Mar", value: 71 },
  { label: "Apr", value: 73 },
];

const ticketVolumeData: ChartDataPoint[] = [
  { label: "Mon", value: 142 },
  { label: "Tue", value: 168 },
  { label: "Wed", value: 155 },
  { label: "Thu", value: 131 },
  { label: "Fri", value: 119 },
  { label: "Sat", value: 45 },
  { label: "Sun", value: 38 },
];

const csatData: ChartDataPoint[] = [
  { label: "Jan", value: 4.2 },
  { label: "Feb", value: 4.4 },
  { label: "Mar", value: 4.5 },
  { label: "Apr", value: 4.6 },
];

const priorityStyles: Record<SupportTicket["priority"], { bg: string; text: string }> = {
  critical: { bg: "bg-red-50", text: "text-status-error" },
  high: { bg: "bg-amber-50", text: "text-status-warning" },
  medium: { bg: "bg-blue-50", text: "text-status-info" },
  low: { bg: "bg-slate-50", text: "text-content-secondary" },
};

const statusStyles: Record<SupportTicket["status"], { bg: string; text: string; label: string }> = {
  open: { bg: "bg-blue-50", text: "text-status-info", label: "Open" },
  "ai-handling": { bg: "bg-purple-50", text: "text-purple-700", label: "AI Handling" },
  escalated: { bg: "bg-amber-50", text: "text-status-warning", label: "Escalated" },
  resolved: { bg: "bg-emerald-50", text: "text-status-success", label: "Resolved" },
  closed: { bg: "bg-slate-50", text: "text-content-tertiary", label: "Closed" },
};

export default function SupportPage() {
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "ai-handling").length;
  const escalatedTickets = tickets.filter((t) => t.status === "escalated").length;
  const resolvedToday = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  return (
    <PageLayout
      title="AI Support Management"
      description="Autonomous support agent performance, ticket queue, and escalation management"
    >
      <Box className="space-y-6">
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Open Tickets"
            value={openTickets}
            trend="neutral"
            description="being handled"
          />
          <StatCard
            label="Escalated"
            value={escalatedTickets}
            trend={escalatedTickets > 3 ? "down" : "up"}
            description="require human review"
          />
          <StatCard
            label="Resolved Today"
            value={resolvedToday}
            trend="up"
            changePercent={15}
            description="auto-resolved by AI"
          />
          <StatCard
            label="CSAT Score"
            value="4.6/5.0"
            trend="up"
            changePercent={2.3}
            description="30-day average"
          />
        </Box>

        <EscalatedTicketsPanel tickets={tickets.filter((t) => t.status === "escalated")} />
        <TicketQueueTable tickets={tickets} />

        <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AnalyticsChart
            title="AI Resolution Rate"
            description="Percentage of tickets resolved without human intervention"
            data={resolutionTrendData}
            chartType="area"
            height={160}
            formatValue={(v) => `${v}%`}
          />
          <AnalyticsChart
            title="Ticket Volume (7 days)"
            description="New tickets created per day"
            data={ticketVolumeData}
            chartType="bar"
            height={160}
            formatValue={(v) => v.toString()}
          />
          <AnalyticsChart
            title="CSAT Trend"
            description="Customer satisfaction score by month"
            data={csatData}
            chartType="line"
            height={160}
            formatValue={(v) => v.toFixed(1)}
          />
        </Box>

        <AiPerformancePanel metrics={aiPerformanceMetrics} />
      </Box>
    </PageLayout>
  );
}

function EscalatedTicketsPanel({ tickets: escalatedTickets }: { tickets: SupportTicket[] }) {
  if (escalatedTickets.length === 0) {
    return null;
  }

  return (
    <Card className="border-status-warning border-2">
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Box className="flex items-center gap-2">
            <Box className="w-3 h-3 rounded-full bg-status-warning animate-pulse" />
            <Text variant="heading-sm">Escalated Tickets Requiring Human Review</Text>
          </Box>
          <Text variant="body-sm" className="font-medium text-status-warning">
            {escalatedTickets.length} pending
          </Text>
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="space-y-3">
          {escalatedTickets.map((ticket) => (
            <EscalatedTicketRow key={ticket.id} ticket={ticket} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function EscalatedTicketRow({ ticket }: { ticket: SupportTicket }) {
  return (
    <Box className="p-4 rounded-lg bg-amber-50 border border-amber-200">
      <Box className="flex items-start justify-between">
        <Box className="flex-1">
          <Box className="flex items-center gap-2 mb-1">
            <Text variant="caption" className="font-mono text-content-tertiary">
              {ticket.id}
            </Text>
            <PriorityBadge priority={ticket.priority} />
            <CategoryBadge category={ticket.category} />
          </Box>
          <Text variant="body-sm" className="font-medium">
            {ticket.subject}
          </Text>
          <Text variant="caption" muted className="mt-1">
            {ticket.requester} ({ticket.requesterEmail})
          </Text>
        </Box>
        <Box className="flex flex-col items-end gap-2 ml-4">
          <ConfidenceBadge confidence={ticket.aiConfidence} />
          <Button variant="primary" size="sm">
            Review
          </Button>
        </Box>
      </Box>
      <Box className="mt-2 p-2 rounded bg-white/60">
        <Text variant="caption" className="font-medium text-content-secondary">
          AI Assessment:
        </Text>
        <Text variant="caption" muted>
          {ticket.aiSuggestedAction}
        </Text>
      </Box>
    </Box>
  );
}

function TicketQueueTable({ tickets: allTickets }: { tickets: SupportTicket[] }) {
  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">Ticket Queue</Text>
          <Box className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              Export
            </Button>
            <Button variant="secondary" size="sm">
              Filter
            </Button>
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="overflow-x-auto">
          <Box as="table" className="w-full">
            <Box as="thead">
              <Box as="tr" className="border-b border-border">
                <TableHeader label="Ticket" />
                <TableHeader label="Subject" />
                <TableHeader label="Requester" />
                <TableHeader label="Priority" />
                <TableHeader label="Status" />
                <TableHeader label="AI Confidence" />
                <TableHeader label="Response Time" />
              </Box>
            </Box>
            <Box as="tbody">
              {allTickets.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </Box>
          </Box>
        </Box>
      </CardContent>
      <CardFooter>
        <Text variant="caption" muted>
          Showing {allTickets.length} tickets. AI autonomously handles tickets with confidence above 0.85.
        </Text>
      </CardFooter>
    </Card>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const status = statusStyles[ticket.status];

  return (
    <Box as="tr" className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm" className="font-mono font-medium text-brand-600">
          {ticket.id}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4 max-w-xs">
        <Text variant="body-sm" className="truncate">
          {ticket.subject}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Text variant="body-sm">{ticket.requester}</Text>
        <Text variant="caption" muted>
          {ticket.requesterEmail}
        </Text>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <PriorityBadge priority={ticket.priority} />
      </Box>
      <Box as="td" className="py-3 pr-4">
        <Box className={`inline-flex px-2 py-0.5 rounded-full ${status.bg}`}>
          <Text variant="caption" className={`font-medium ${status.text}`}>
            {status.label}
          </Text>
        </Box>
      </Box>
      <Box as="td" className="py-3 pr-4">
        <ConfidenceBadge confidence={ticket.aiConfidence} />
      </Box>
      <Box as="td" className="py-3">
        <Text variant="body-sm">
          {ticket.responseTimeMinutes} min
        </Text>
      </Box>
    </Box>
  );
}

function AiPerformancePanel({ metrics }: { metrics: AiPerformanceMetric[] }) {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">AI Agent Performance Metrics</Text>
      </CardHeader>
      <CardContent>
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((metric) => (
            <AiMetricCard key={metric.label} metric={metric} />
          ))}
        </Box>
      </CardContent>
      <CardFooter>
        <Text variant="caption" muted>
          Metrics calculated over the last 30 days. Model version: claude-opus-4-6. Last retrained: 2026-04-01.
        </Text>
      </CardFooter>
    </Card>
  );
}

function AiMetricCard({ metric }: { metric: AiPerformanceMetric }) {
  return (
    <Box className={`p-4 rounded-lg border ${metric.achieved ? "border-status-success/30 bg-emerald-50/30" : "border-status-error/30 bg-red-50/30"}`}>
      <Text variant="caption" muted>
        {metric.label}
      </Text>
      <Text variant="heading-md" className="mt-1">
        {metric.value}
      </Text>
      <Box className="flex items-center gap-1 mt-1">
        <Box className={`w-1.5 h-1.5 rounded-full ${metric.achieved ? "bg-status-success" : "bg-status-error"}`} />
        <Text variant="caption" muted>
          Target: {metric.target}
        </Text>
      </Box>
    </Box>
  );
}

function PriorityBadge({ priority }: { priority: SupportTicket["priority"] }) {
  const style = priorityStyles[priority];
  return (
    <Box className={`inline-flex px-2 py-0.5 rounded ${style.bg}`}>
      <Text variant="caption" className={`font-medium capitalize ${style.text}`}>
        {priority}
      </Text>
    </Box>
  );
}

function CategoryBadge({ category }: { category: SupportTicket["category"] }) {
  return (
    <Box className="inline-flex px-2 py-0.5 rounded bg-surface-tertiary">
      <Text variant="caption" className="font-medium capitalize text-content-secondary">
        {category}
      </Text>
    </Box>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color = percent >= 85 ? "text-status-success" :
    percent >= 60 ? "text-status-warning" :
    "text-status-error";

  return (
    <Box className="flex items-center gap-1.5">
      <Box className="w-12 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
        <Box
          className={`h-full rounded-full ${
            percent >= 85 ? "bg-status-success" :
            percent >= 60 ? "bg-status-warning" :
            "bg-status-error"
          }`}
          style={{ width: `${percent}%` }}
        />
      </Box>
      <Text variant="caption" className={`font-medium ${color}`}>
        {percent}%
      </Text>
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
