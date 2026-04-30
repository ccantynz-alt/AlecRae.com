"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Text,
  Card,
  CardContent,
  CardHeader,
  Button,
  PageLayout,
  Input,
} from "@alecrae/ui";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
  SPRING_BOUNCY,
} from "../../../lib/animations";

// ─── Types ──────────────────────────────────────────────────────────────────

type TimePeriod = "30d" | "90d" | "1y" | "all";

interface NetworkContact {
  id: string;
  name: string;
  initials: string;
  email: string;
  totalEmails: number;
  sent: number;
  received: number;
  lastContact: string;
  ring: number; // 1 = inner, 2 = middle, 3 = outer
  angleDeg: number;
  frequency: "high" | "medium" | "low";
  cluster: string;
}

interface Cluster {
  id: string;
  name: string;
  color: string;
  memberCount: number;
  totalEmails: number;
}

interface AIInsight {
  id: string;
  title: string;
  description: string;
  type: "trend" | "suggestion" | "alert";
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_CONTACTS: NetworkContact[] = [
  { id: "nc-01", name: "Sarah Chen", initials: "SC", email: "sarah.chen@acme.com", totalEmails: 187, sent: 92, received: 95, lastContact: "2026-04-29", ring: 1, angleDeg: 0, frequency: "high", cluster: "Engineering" },
  { id: "nc-02", name: "Craig Murray", initials: "CM", email: "craig@alecrae.com", totalEmails: 156, sent: 78, received: 78, lastContact: "2026-04-30", ring: 1, angleDeg: 72, frequency: "high", cluster: "Engineering" },
  { id: "nc-03", name: "Amy Zhang", initials: "AZ", email: "amy.z@design.studio", totalEmails: 134, sent: 60, received: 74, lastContact: "2026-04-28", ring: 1, angleDeg: 144, frequency: "high", cluster: "Engineering" },
  { id: "nc-04", name: "Mike Reynolds", initials: "MR", email: "mike@team.io", totalEmails: 112, sent: 55, received: 57, lastContact: "2026-04-27", ring: 1, angleDeg: 216, frequency: "high", cluster: "Engineering" },
  { id: "nc-05", name: "James Wilson", initials: "JW", email: "james.w@startup.io", totalEmails: 89, sent: 40, received: 49, lastContact: "2026-04-26", ring: 1, angleDeg: 288, frequency: "high", cluster: "Clients" },
  { id: "nc-06", name: "Lisa Park", initials: "LP", email: "lisa.park@consultancy.com", totalEmails: 67, sent: 30, received: 37, lastContact: "2026-04-25", ring: 2, angleDeg: 30, frequency: "medium", cluster: "Clients" },
  { id: "nc-07", name: "Tomasz Kowalski", initials: "TK", email: "tomasz@qateam.dev", totalEmails: 58, sent: 28, received: 30, lastContact: "2026-04-24", ring: 2, angleDeg: 90, frequency: "medium", cluster: "Engineering" },
  { id: "nc-08", name: "Rachel Kim", initials: "RK", email: "rachel@marketing.co", totalEmails: 45, sent: 20, received: 25, lastContact: "2026-04-22", ring: 2, angleDeg: 150, frequency: "medium", cluster: "Marketing" },
  { id: "nc-09", name: "David Brown", initials: "DB", email: "david.b@investor.vc", totalEmails: 38, sent: 15, received: 23, lastContact: "2026-04-20", ring: 2, angleDeg: 210, frequency: "medium", cluster: "Clients" },
  { id: "nc-10", name: "Elena Vasquez", initials: "EV", email: "elena@pr-agency.com", totalEmails: 32, sent: 12, received: 20, lastContact: "2026-04-18", ring: 2, angleDeg: 270, frequency: "medium", cluster: "Marketing" },
  { id: "nc-11", name: "Kevin O'Brien", initials: "KO", email: "kevin@freelance.dev", totalEmails: 24, sent: 10, received: 14, lastContact: "2026-04-15", ring: 2, angleDeg: 330, frequency: "medium", cluster: "Engineering" },
  { id: "nc-12", name: "Priya Sharma", initials: "PS", email: "priya@vendor.co", totalEmails: 18, sent: 8, received: 10, lastContact: "2026-04-10", ring: 3, angleDeg: 45, frequency: "low", cluster: "Clients" },
  { id: "nc-13", name: "Alex Turner", initials: "AT", email: "alex@newsletter.io", totalEmails: 14, sent: 3, received: 11, lastContact: "2026-04-08", ring: 3, angleDeg: 135, frequency: "low", cluster: "Personal" },
  { id: "nc-14", name: "Maria Lopez", initials: "ML", email: "maria@hr.alecrae.com", totalEmails: 11, sent: 5, received: 6, lastContact: "2026-04-05", ring: 3, angleDeg: 225, frequency: "low", cluster: "Personal" },
  { id: "nc-15", name: "Nathan Cole", initials: "NC", email: "nathan@blog.tech", totalEmails: 8, sent: 2, received: 6, lastContact: "2026-04-02", ring: 3, angleDeg: 315, frequency: "low", cluster: "Personal" },
];

const MOCK_CLUSTERS: Cluster[] = [
  { id: "cl-01", name: "Engineering", color: "bg-blue-500", memberCount: 6, totalEmails: 567 },
  { id: "cl-02", name: "Marketing", color: "bg-purple-500", memberCount: 2, totalEmails: 77 },
  { id: "cl-03", name: "Clients", color: "bg-emerald-500", memberCount: 4, totalEmails: 212 },
  { id: "cl-04", name: "Personal", color: "bg-amber-500", memberCount: 3, totalEmails: 33 },
];

const MOCK_INSIGHTS: AIInsight[] = [
  {
    id: "ai-01",
    title: "Response time improving",
    description: "Your average response time to Engineering contacts has decreased by 23% over the last 30 days, from 4.2h to 3.2h.",
    type: "trend",
  },
  {
    id: "ai-02",
    title: "Reconnect with David Brown",
    description: "You have not exchanged emails with David Brown (investor.vc) in 10 days. Previous cadence was every 3-4 days.",
    type: "suggestion",
  },
  {
    id: "ai-03",
    title: "Marketing cluster growing",
    description: "Your Marketing cluster added 2 new contacts this month. Consider creating a shared inbox for marketing communications.",
    type: "alert",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFrequencyColor(freq: "high" | "medium" | "low"): string {
  const map: Record<string, string> = {
    high: "bg-emerald-500 border-emerald-400",
    medium: "bg-amber-500 border-amber-400",
    low: "bg-gray-400 border-gray-300",
  };
  return map[freq] ?? "bg-gray-400 border-gray-300";
}

function getFrequencyTextColor(freq: "high" | "medium" | "low"): string {
  const map: Record<string, string> = {
    high: "text-emerald-600",
    medium: "text-amber-600",
    low: "text-gray-500",
  };
  return map[freq] ?? "text-gray-500";
}

function getNodeSize(totalEmails: number): string {
  if (totalEmails >= 100) return "w-14 h-14 text-xs";
  if (totalEmails >= 50) return "w-12 h-12 text-xs";
  if (totalEmails >= 20) return "w-10 h-10 text-[10px]";
  return "w-8 h-8 text-[9px]";
}

function getRingRadius(ring: number): number {
  const map: Record<number, number> = { 1: 100, 2: 170, 3: 230 };
  return map[ring] ?? 230;
}

function getInsightTypeStyle(type: "trend" | "suggestion" | "alert"): string {
  const map: Record<string, string> = {
    trend: "bg-blue-50 border-blue-200 text-blue-800",
    suggestion: "bg-emerald-50 border-emerald-200 text-emerald-800",
    alert: "bg-amber-50 border-amber-200 text-amber-800",
  };
  return map[type] ?? "bg-gray-50 border-gray-200 text-gray-800";
}

function getInsightIcon(type: "trend" | "suggestion" | "alert"): string {
  const map: Record<string, string> = {
    trend: "↗",
    suggestion: "→",
    alert: "!",
  };
  return map[type] ?? "•";
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function NetworkVisualization({
  contacts,
  variants,
}: {
  contacts: NetworkContact[];
  variants: Variants;
}): React.ReactNode {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const centerX = 250;
  const centerY = 250;

  return (
    <motion.div variants={variants}>
      <Card>
        <CardHeader>
          <Text className="text-sm font-semibold text-content">Network Map</Text>
        </CardHeader>
        <CardContent>
          <Box className="relative w-full overflow-hidden" style={{ height: 500 }}>
            {/* Container centered within the card */}
            <Box
              className="absolute"
              style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
            >
              {/* Ring guides */}
              {[100, 170, 230].map((radius) => (
                <Box
                  key={radius}
                  className="absolute rounded-full border border-dashed border-border"
                  style={{
                    width: radius * 2,
                    height: radius * 2,
                    left: centerX - radius,
                    top: centerY - radius,
                  }}
                />
              ))}

              {/* Connection lines */}
              {contacts.map((contact) => {
                const radius = getRingRadius(contact.ring);
                const rad = (contact.angleDeg * Math.PI) / 180;
                const x = centerX + radius * Math.cos(rad);
                const y = centerY + radius * Math.sin(rad);
                const dx = x - centerX;
                const dy = y - centerY;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

                return (
                  <Box
                    key={`line-${contact.id}`}
                    className={`absolute origin-left ${
                      hoveredId === contact.id ? "bg-content-secondary" : "bg-border"
                    }`}
                    style={{
                      left: centerX,
                      top: centerY,
                      width: length,
                      height: hoveredId === contact.id ? 2 : 1,
                      transform: `rotate(${angleDeg}deg)`,
                      transition: "height 150ms, background-color 150ms",
                    }}
                  />
                );
              })}

              {/* Center node (You) */}
              <Box
                className="absolute w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-lg flex items-center justify-center z-10"
                style={{
                  left: centerX - 32,
                  top: centerY - 32,
                }}
              >
                <Text className="text-xs font-bold text-white">You</Text>
              </Box>

              {/* Contact nodes */}
              {contacts.map((contact) => {
                const radius = getRingRadius(contact.ring);
                const rad = (contact.angleDeg * Math.PI) / 180;
                const x = centerX + radius * Math.cos(rad);
                const y = centerY + radius * Math.sin(rad);
                const sizeClass = getNodeSize(contact.totalEmails);
                const colorClass = getFrequencyColor(contact.frequency);
                const isHovered = hoveredId === contact.id;

                return (
                  <Box key={contact.id}>
                    <Box
                      className={`absolute rounded-full border-2 flex items-center justify-center cursor-pointer transition-transform duration-150 z-10 ${sizeClass} ${colorClass} ${
                        isHovered ? "scale-125 shadow-lg" : "shadow-sm"
                      }`}
                      style={{
                        left: x,
                        top: y,
                        transform: `translate(-50%, -50%) ${isHovered ? "scale(1.25)" : "scale(1)"}`,
                      }}
                      onMouseEnter={(): void => setHoveredId(contact.id)}
                      onMouseLeave={(): void => setHoveredId(null)}
                    >
                      <Text className="font-bold text-white">{contact.initials}</Text>
                    </Box>

                    {/* Hover tooltip */}
                    {isHovered ? (
                      <Box
                        className="absolute z-20 bg-surface border border-border rounded-lg shadow-xl px-3 py-2 pointer-events-none"
                        style={{
                          left: x + 20,
                          top: y - 40,
                          minWidth: 180,
                        }}
                      >
                        <Text className="text-sm font-medium text-content">
                          {contact.name}
                        </Text>
                        <Text className="text-xs text-content-tertiary">
                          {contact.email}
                        </Text>
                        <Box className="flex items-center gap-3 mt-1">
                          <Text className="text-xs text-content-secondary">
                            {contact.totalEmails} emails
                          </Text>
                          <Text className={`text-xs font-medium ${getFrequencyTextColor(contact.frequency)}`}>
                            {contact.frequency} freq
                          </Text>
                        </Box>
                        <Text className="text-xs text-content-tertiary mt-0.5">
                          {contact.cluster}
                        </Text>
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TopConnectionsList({
  contacts,
  variants,
}: {
  contacts: NetworkContact[];
  variants: Variants;
}): React.ReactNode {
  const top8 = useMemo((): NetworkContact[] => {
    return [...contacts].sort((a, b) => b.totalEmails - a.totalEmails).slice(0, 8);
  }, [contacts]);

  const maxEmails = top8[0]?.totalEmails ?? 1;

  return (
    <motion.div variants={variants}>
      <Card>
        <CardHeader>
          <Text className="text-sm font-semibold text-content">Top Connections</Text>
        </CardHeader>
        <CardContent>
          <Box className="space-y-3">
            {top8.map((contact) => {
              const sentPct = Math.round((contact.sent / maxEmails) * 100);
              const receivedPct = Math.round((contact.received / maxEmails) * 100);

              return (
                <Box key={contact.id}>
                  <Box className="flex items-center justify-between mb-1">
                    <Box className="flex items-center gap-2">
                      <Box
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${getFrequencyColor(contact.frequency)}`}
                      >
                        <Text className="text-[9px] font-bold text-white">
                          {contact.initials}
                        </Text>
                      </Box>
                      <Text className="text-sm text-content font-medium">
                        {contact.name}
                      </Text>
                    </Box>
                    <Text className="text-xs text-content-tertiary">
                      {contact.totalEmails} emails
                    </Text>
                  </Box>
                  <Box className="flex gap-1 h-2">
                    <Box
                      className="bg-blue-400 rounded-l"
                      style={{ width: `${sentPct}%` }}
                      title={`Sent: ${contact.sent}`}
                    />
                    <Box
                      className="bg-emerald-400 rounded-r"
                      style={{ width: `${receivedPct}%` }}
                      title={`Received: ${contact.received}`}
                    />
                  </Box>
                  <Box className="flex items-center gap-3 mt-0.5">
                    <Text className="text-[10px] text-blue-500">
                      Sent: {contact.sent}
                    </Text>
                    <Text className="text-[10px] text-emerald-500">
                      Received: {contact.received}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ClusterCards({
  clusters,
  variants,
}: {
  clusters: Cluster[];
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div variants={variants}>
      <Card>
        <CardHeader>
          <Text className="text-sm font-semibold text-content">Communication Clusters</Text>
        </CardHeader>
        <CardContent>
          <Box className="grid grid-cols-2 gap-3">
            {clusters.map((cluster) => (
              <Box
                key={cluster.id}
                className="rounded-lg border border-border p-3"
              >
                <Box className="flex items-center gap-2 mb-2">
                  <Box className={`w-3 h-3 rounded-full ${cluster.color}`} />
                  <Text className="text-sm font-medium text-content">
                    {cluster.name}
                  </Text>
                </Box>
                <Box className="flex items-center gap-3">
                  <Box>
                    <Text className="text-xs text-content-tertiary">Members</Text>
                    <Text className="text-lg font-bold text-content">
                      {cluster.memberCount}
                    </Text>
                  </Box>
                  <Box>
                    <Text className="text-xs text-content-tertiary">Emails</Text>
                    <Text className="text-lg font-bold text-content">
                      {cluster.totalEmails}
                    </Text>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function InsightCards({
  insights,
  variants,
}: {
  insights: AIInsight[];
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div variants={variants}>
      <Card>
        <CardHeader>
          <Text className="text-sm font-semibold text-content">AI Insights</Text>
        </CardHeader>
        <CardContent>
          <Box className="space-y-3">
            {insights.map((insight) => (
              <Box
                key={insight.id}
                className={`rounded-lg border p-3 ${getInsightTypeStyle(insight.type)}`}
              >
                <Box className="flex items-start gap-2">
                  <Box className="w-5 h-5 rounded-full bg-white flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Text className="text-xs font-bold">{getInsightIcon(insight.type)}</Text>
                  </Box>
                  <Box className="flex-1">
                    <Text className="text-sm font-medium mb-0.5">{insight.title}</Text>
                    <Text className="text-xs leading-relaxed">{insight.description}</Text>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function NetworkPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  const [period, setPeriod] = useState<TimePeriod>("90d");

  const periodOptions: { value: TimePeriod; label: string }[] = [
    { value: "30d", label: "30 Days" },
    { value: "90d", label: "90 Days" },
    { value: "1y", label: "1 Year" },
    { value: "all", label: "All Time" },
  ];

  const totalContacts = 47;
  const mostFrequent = MOCK_CONTACTS[0]?.name ?? "N/A";
  const clusterCount = MOCK_CLUSTERS.length;
  const avgEmailsPerDay = 12.4;

  return (
    <PageLayout
      title="Email Network"
      description="Visualize your communication patterns and key relationships."
    >
      {/* Period Selector */}
      <motion.div variants={itemVariants} initial="initial" animate="animate">
        <Box className="flex flex-wrap gap-2 mb-6">
          {periodOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? "default" : "ghost"}
              size="sm"
              onClick={(): void => setPeriod(opt.value)}
            >
              <Text className="text-xs font-medium">{opt.label}</Text>
            </Button>
          ))}
        </Box>
      </motion.div>

      {/* Stats Banner */}
      <motion.div variants={itemVariants} initial="initial" animate="animate">
        <Card className="mb-6">
          <CardContent>
            <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-6 py-2">
              <Box>
                <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                  Total Contacts
                </Text>
                <Text className="text-2xl font-bold text-content">{totalContacts}</Text>
              </Box>
              <Box className="w-px h-10 bg-border hidden sm:block" />
              <Box>
                <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                  Most Frequent
                </Text>
                <Text className="text-2xl font-bold text-content">{mostFrequent}</Text>
              </Box>
              <Box className="w-px h-10 bg-border hidden sm:block" />
              <Box>
                <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                  Clusters
                </Text>
                <Text className="text-2xl font-bold text-content">{clusterCount}</Text>
              </Box>
              <Box className="w-px h-10 bg-border hidden sm:block" />
              <Box>
                <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                  Avg Emails/Day
                </Text>
                <Text className="text-2xl font-bold text-content">{avgEmailsPerDay}</Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </motion.div>

      {/* Network Visualization */}
      <motion.div
        variants={staggerSlow}
        initial="initial"
        animate="animate"
      >
        <Box className="mb-6">
          <NetworkVisualization contacts={MOCK_CONTACTS} variants={itemVariants} />
        </Box>

        {/* Legend */}
        <motion.div variants={itemVariants}>
          <Card className="mb-6">
            <CardContent>
              <Box className="flex flex-wrap items-center gap-6 py-1">
                <Box className="flex items-center gap-2">
                  <Box className="w-3 h-3 rounded-full bg-emerald-500" />
                  <Text className="text-xs text-content-secondary">High frequency</Text>
                </Box>
                <Box className="flex items-center gap-2">
                  <Box className="w-3 h-3 rounded-full bg-amber-500" />
                  <Text className="text-xs text-content-secondary">Medium frequency</Text>
                </Box>
                <Box className="flex items-center gap-2">
                  <Box className="w-3 h-3 rounded-full bg-gray-400" />
                  <Text className="text-xs text-content-secondary">Low frequency</Text>
                </Box>
                <Box className="flex items-center gap-2">
                  <Text className="text-xs text-content-tertiary">Node size = email volume</Text>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </motion.div>

        {/* Bottom Grid: Top Connections + Clusters + AI Insights */}
        <Box className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TopConnectionsList contacts={MOCK_CONTACTS} variants={itemVariants} />
          <ClusterCards clusters={MOCK_CLUSTERS} variants={itemVariants} />
          <InsightCards insights={MOCK_INSIGHTS} variants={itemVariants} />
        </Box>
      </motion.div>
    </PageLayout>
  );
}
