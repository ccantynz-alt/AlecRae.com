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

type Sentiment = "positive" | "neutral" | "negative" | "urgent";

interface ThreadMessage {
  id: string;
  senderName: string;
  senderInitials: string;
  senderColor: string;
  timestamp: string;
  preview: string;
  sentiment: Sentiment;
  isDecision: boolean;
  decisionText: string | null;
}

interface ThreadData {
  id: string;
  subject: string;
  participants: string[];
  startDate: string;
  endDate: string;
  messages: ThreadMessage[];
  actionItems: string[];
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_THREADS: ThreadData[] = [
  {
    id: "thread-001",
    subject: "Re: Q2 Product Launch Timeline",
    participants: ["Craig Murray", "Sarah Chen", "Mike Reynolds", "Amy Zhang"],
    startDate: "2026-04-14T09:00:00Z",
    endDate: "2026-04-29T16:45:00Z",
    actionItems: [
      "Finalize feature freeze date by May 2",
      "Amy to deliver final mockups by April 30",
      "Craig to approve staging deployment",
      "Mike to set up load testing environment",
    ],
    messages: [
      {
        id: "msg-001",
        senderName: "Craig Murray",
        senderInitials: "CM",
        senderColor: "bg-blue-600",
        timestamp: "2026-04-14T09:00:00Z",
        preview: "Team, we need to lock down the Q2 launch timeline. Proposing May 15 as our target. Thoughts?",
        sentiment: "neutral",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-002",
        senderName: "Sarah Chen",
        senderInitials: "SC",
        senderColor: "bg-emerald-600",
        timestamp: "2026-04-14T10:32:00Z",
        preview: "May 15 is aggressive but doable if we freeze features by April 28. Backend is 90% there.",
        sentiment: "positive",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-003",
        senderName: "Amy Zhang",
        senderInitials: "AZ",
        senderColor: "bg-purple-600",
        timestamp: "2026-04-14T14:15:00Z",
        preview: "Design-wise I need 3 more days on the dashboard mockups. Can we push feature freeze to May 1?",
        sentiment: "neutral",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-004",
        senderName: "Mike Reynolds",
        senderInitials: "MR",
        senderColor: "bg-orange-600",
        timestamp: "2026-04-15T08:20:00Z",
        preview: "Load testing infrastructure needs 2 days to set up. I can start that in parallel.",
        sentiment: "neutral",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-005",
        senderName: "Craig Murray",
        senderInitials: "CM",
        senderColor: "bg-blue-600",
        timestamp: "2026-04-15T11:00:00Z",
        preview: "Agreed. Feature freeze is May 1, launch target stays May 15. Amy gets her extra days, Mike starts load testing now.",
        sentiment: "positive",
        isDecision: true,
        decisionText: "Feature freeze May 1, launch May 15",
      },
      {
        id: "msg-006",
        senderName: "Sarah Chen",
        senderInitials: "SC",
        senderColor: "bg-emerald-600",
        timestamp: "2026-04-22T09:45:00Z",
        preview: "Backend feature freeze is done on my side. All APIs documented and tested. Moving to bug fixes only.",
        sentiment: "positive",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-007",
        senderName: "Mike Reynolds",
        senderInitials: "MR",
        senderColor: "bg-orange-600",
        timestamp: "2026-04-25T15:30:00Z",
        preview: "Load test results are in. We can handle 10K concurrent users. Need to optimize the search endpoint though.",
        sentiment: "neutral",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-008",
        senderName: "Craig Murray",
        senderInitials: "CM",
        senderColor: "bg-blue-600",
        timestamp: "2026-04-29T16:45:00Z",
        preview: "Great progress everyone. Staging deploy approved. Let's do a final review on May 10 before launch.",
        sentiment: "positive",
        isDecision: true,
        decisionText: "Staging deploy approved, final review May 10",
      },
    ],
  },
  {
    id: "thread-002",
    subject: "Re: Enterprise SSO Integration Issues",
    participants: ["Tomasz Kowalski", "Sarah Chen", "Craig Murray"],
    startDate: "2026-04-20T11:00:00Z",
    endDate: "2026-04-27T14:20:00Z",
    actionItems: [
      "Tomasz to write regression tests for SAML edge cases",
      "Sarah to update the SSO documentation",
      "Craig to reach out to the enterprise client",
    ],
    messages: [
      {
        id: "msg-010",
        senderName: "Tomasz Kowalski",
        senderInitials: "TK",
        senderColor: "bg-red-600",
        timestamp: "2026-04-20T11:00:00Z",
        preview: "Found a critical bug in SAML assertion parsing. Some IdPs send unsigned assertions that we reject incorrectly.",
        sentiment: "negative",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-011",
        senderName: "Sarah Chen",
        senderInitials: "SC",
        senderColor: "bg-emerald-600",
        timestamp: "2026-04-20T13:15:00Z",
        preview: "I can reproduce this with Okta. The issue is in our XML signature verification. I have a fix drafted.",
        sentiment: "neutral",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-012",
        senderName: "Craig Murray",
        senderInitials: "CM",
        senderColor: "bg-blue-600",
        timestamp: "2026-04-21T09:00:00Z",
        preview: "This is blocking our enterprise pilot. Priority one. Sarah, can you have the fix merged today?",
        sentiment: "urgent",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-013",
        senderName: "Sarah Chen",
        senderInitials: "SC",
        senderColor: "bg-emerald-600",
        timestamp: "2026-04-21T17:30:00Z",
        preview: "Fix is merged and deployed to staging. Tested with Okta, Azure AD, and OneLogin. All passing now.",
        sentiment: "positive",
        isDecision: true,
        decisionText: "SSO fix merged and deployed to staging",
      },
      {
        id: "msg-014",
        senderName: "Tomasz Kowalski",
        senderInitials: "TK",
        senderColor: "bg-red-600",
        timestamp: "2026-04-27T14:20:00Z",
        preview: "Confirmed fix works in production. Added 12 regression tests for SAML edge cases. Closing this thread.",
        sentiment: "positive",
        isDecision: false,
        decisionText: null,
      },
    ],
  },
  {
    id: "thread-003",
    subject: "Re: Investor Update - April 2026",
    participants: ["Craig Murray", "James Wilson", "Lisa Park"],
    startDate: "2026-04-18T08:00:00Z",
    endDate: "2026-04-28T10:00:00Z",
    actionItems: [
      "Craig to finalize metrics deck by May 1",
      "Lisa to schedule investor call for May 5",
      "James to prepare competitive analysis slide",
    ],
    messages: [
      {
        id: "msg-020",
        senderName: "Craig Murray",
        senderInitials: "CM",
        senderColor: "bg-blue-600",
        timestamp: "2026-04-18T08:00:00Z",
        preview: "Time for the April investor update. We hit all our milestones. 96 features shipped, zero production incidents.",
        sentiment: "positive",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-021",
        senderName: "James Wilson",
        senderInitials: "JW",
        senderColor: "bg-teal-600",
        timestamp: "2026-04-19T14:00:00Z",
        preview: "I can add a competitive analysis section. Superhuman just raised again but their feature gap is widening.",
        sentiment: "neutral",
        isDecision: false,
        decisionText: null,
      },
      {
        id: "msg-022",
        senderName: "Lisa Park",
        senderInitials: "LP",
        senderColor: "bg-pink-600",
        timestamp: "2026-04-21T10:30:00Z",
        preview: "I will schedule the investor call for the first week of May. Need the deck finalized by May 1 to allow review time.",
        sentiment: "neutral",
        isDecision: true,
        decisionText: "Investor call first week of May, deck due May 1",
      },
      {
        id: "msg-023",
        senderName: "Craig Murray",
        senderInitials: "CM",
        senderColor: "bg-blue-600",
        timestamp: "2026-04-28T10:00:00Z",
        preview: "Deck is 80% done. Adding the ARR projections today. James, can you send the competitive slide by tomorrow?",
        sentiment: "neutral",
        isDecision: false,
        decisionText: null,
      },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
  return `${diffHours}h`;
}

function getGapDuration(prevIso: string, nextIso: string): string {
  const diffMs = new Date(nextIso).getTime() - new Date(prevIso).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
  return `${diffMins}m`;
}

function getSentimentColor(sentiment: Sentiment): string {
  const map: Record<Sentiment, string> = {
    positive: "bg-emerald-500",
    neutral: "bg-gray-400",
    negative: "bg-red-500",
    urgent: "bg-amber-500",
  };
  return map[sentiment];
}

function getSentimentLabel(sentiment: Sentiment): string {
  const map: Record<Sentiment, string> = {
    positive: "Positive",
    neutral: "Neutral",
    negative: "Negative",
    urgent: "Urgent",
  };
  return map[sentiment];
}

function computeAvgResponseTime(messages: ThreadMessage[]): string {
  if (messages.length < 2) return "N/A";
  let totalMs = 0;
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    if (prev && curr) {
      totalMs += new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    }
  }
  const avgMs = totalMs / (messages.length - 1);
  const avgHours = Math.floor(avgMs / (1000 * 60 * 60));
  const avgDays = Math.floor(avgHours / 24);
  if (avgDays > 0) return `${avgDays}d ${avgHours % 24}h`;
  return `${avgHours}h`;
}

function findLongestGap(messages: ThreadMessage[]): string {
  if (messages.length < 2) return "N/A";
  let maxMs = 0;
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    if (prev && curr) {
      const gap = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
      if (gap > maxMs) maxMs = gap;
    }
  }
  const hours = Math.floor(maxMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function TimelineNode({
  message,
  prevMessage,
  isFirst,
  isLast,
  variants,
}: {
  message: ThreadMessage;
  prevMessage: ThreadMessage | null;
  isFirst: boolean;
  isLast: boolean;
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div variants={variants}>
      <Box className="flex gap-4">
        {/* Left: Timestamp + Gap */}
        <Box className="w-28 flex-shrink-0 text-right pt-1">
          <Text className="text-xs text-content-secondary font-medium">
            {formatTimestamp(message.timestamp)}
          </Text>
          {prevMessage ? (
            <Box className="mt-1">
              <Text className="text-xs text-content-tertiary">
                {getGapDuration(prevMessage.timestamp, message.timestamp)} gap
              </Text>
            </Box>
          ) : null}
        </Box>

        {/* Center: Vertical line + node dot */}
        <Box className="flex flex-col items-center flex-shrink-0">
          {/* Connector line above */}
          {!isFirst ? (
            <Box className="w-px h-4 border-l-2 border-dashed border-border" />
          ) : (
            <Box className="w-px h-4" />
          )}
          {/* Node dot */}
          <Box
            className={`w-4 h-4 rounded-full border-2 border-white flex-shrink-0 ${
              message.isDecision ? "bg-amber-500 ring-2 ring-amber-200" : getSentimentColor(message.sentiment)
            }`}
          />
          {/* Connector line below */}
          {!isLast ? (
            <Box className="w-px flex-1 border-l-2 border-dashed border-border min-h-[2rem]" />
          ) : null}
        </Box>

        {/* Right: Message content */}
        <Box className="flex-1 pb-6">
          <Card className={message.isDecision ? "ring-1 ring-amber-300 shadow-sm" : "shadow-sm"}>
            <CardContent className="py-3">
              <Box className="flex items-center gap-3 mb-2">
                <Box
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${message.senderColor}`}
                >
                  <Text className="text-xs font-bold text-white">
                    {message.senderInitials}
                  </Text>
                </Box>
                <Box className="flex-1 min-w-0">
                  <Text className="text-sm font-medium text-content">
                    {message.senderName}
                  </Text>
                </Box>
                <Box className="flex items-center gap-2 flex-shrink-0">
                  <Box
                    className={`w-2 h-2 rounded-full ${getSentimentColor(message.sentiment)}`}
                    title={getSentimentLabel(message.sentiment)}
                  />
                  {message.isDecision ? (
                    <Text className="text-xs text-amber-600 font-medium">
                      {"★ Decision"}
                    </Text>
                  ) : null}
                </Box>
              </Box>
              <Text className="text-sm text-content-secondary leading-relaxed">
                {message.preview}
              </Text>
              {message.decisionText ? (
                <Box className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                  <Text className="text-xs font-medium text-amber-800">
                    {message.decisionText}
                  </Text>
                </Box>
              ) : null}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </motion.div>
  );
}

function StatsPanel({
  thread,
  variants,
}: {
  thread: ThreadData;
  variants: Variants;
}): React.ReactNode {
  const decisions = thread.messages.filter((m) => m.isDecision);

  return (
    <motion.div variants={variants}>
      <Card>
        <CardHeader>
          <Text className="text-sm font-semibold text-content">Thread Stats</Text>
        </CardHeader>
        <CardContent>
          <Box className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <Box>
              <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                Messages
              </Text>
              <Text className="text-xl font-bold text-content">
                {thread.messages.length}
              </Text>
            </Box>
            <Box>
              <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                Avg Response
              </Text>
              <Text className="text-xl font-bold text-content">
                {computeAvgResponseTime(thread.messages)}
              </Text>
            </Box>
            <Box>
              <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                Longest Gap
              </Text>
              <Text className="text-xl font-bold text-content">
                {findLongestGap(thread.messages)}
              </Text>
            </Box>
            <Box>
              <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                Decisions
              </Text>
              <Text className="text-xl font-bold text-amber-500">
                {decisions.length}
              </Text>
            </Box>
          </Box>

          {/* Key Decisions */}
          {decisions.length > 0 ? (
            <Box className="mb-4">
              <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium mb-2">
                Key Decisions
              </Text>
              <Box className="space-y-2">
                {decisions.map((d) => (
                  <Box
                    key={d.id}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200"
                  >
                    <Text className="text-amber-500 text-sm flex-shrink-0">{"★"}</Text>
                    <Text className="text-xs text-amber-800 font-medium">
                      {d.decisionText}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}

          {/* Action Items */}
          {thread.actionItems.length > 0 ? (
            <Box>
              <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium mb-2">
                Action Items
              </Text>
              <Box className="space-y-1.5">
                {thread.actionItems.map((item, idx) => (
                  <Box key={idx} className="flex items-start gap-2">
                    <Text className="text-content-tertiary text-xs flex-shrink-0 mt-0.5">
                      {"○"}
                    </Text>
                    <Text className="text-xs text-content-secondary">{item}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ThreadTimelinePage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  const [selectedThreadId, setSelectedThreadId] = useState(MOCK_THREADS[0]?.id ?? "");

  const selectedThread = useMemo((): ThreadData | undefined => {
    return MOCK_THREADS.find((t) => t.id === selectedThreadId);
  }, [selectedThreadId]);

  return (
    <PageLayout
      title="Thread Timeline"
      description="Visualize email conversations as a timeline with decisions and response patterns."
    >
      {/* Thread Selector */}
      <motion.div variants={itemVariants} initial="initial" animate="animate">
        <Box className="flex flex-col sm:flex-row gap-3 mb-6">
          <Box className="flex-1">
            <Box className="flex flex-wrap gap-2">
              {MOCK_THREADS.map((thread) => (
                <Button
                  key={thread.id}
                  variant={selectedThreadId === thread.id ? "default" : "ghost"}
                  size="sm"
                  onClick={(): void => setSelectedThreadId(thread.id)}
                >
                  <Text className="text-xs font-medium truncate max-w-[200px]">
                    {thread.subject}
                  </Text>
                </Button>
              ))}
            </Box>
          </Box>
        </Box>
      </motion.div>

      <AnimatePresence mode="wait">
        {selectedThread ? (
          <motion.div
            key={selectedThread.id}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SPRING_BOUNCY}
          >
            {/* Thread Info Header */}
            <motion.div variants={itemVariants}>
              <Card className="mb-6">
                <CardContent>
                  <Box className="py-2">
                    <Text className="text-lg font-semibold text-content mb-2">
                      {selectedThread.subject}
                    </Text>
                    <Box className="flex flex-wrap items-center gap-4">
                      <Box className="flex items-center gap-2">
                        <Text className="text-xs text-content-tertiary">Participants:</Text>
                        <Box className="flex items-center gap-1">
                          {selectedThread.participants.map((p) => (
                            <Box
                              key={p}
                              className="px-2 py-0.5 rounded-full bg-surface-secondary"
                            >
                              <Text className="text-xs text-content-secondary font-medium">
                                {p}
                              </Text>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                      <Box className="flex items-center gap-2">
                        <Text className="text-xs text-content-tertiary">Duration:</Text>
                        <Text className="text-xs text-content-secondary font-medium">
                          {formatDuration(selectedThread.startDate, selectedThread.endDate)}
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </motion.div>

            {/* Stats Panel */}
            <Box className="mb-6">
              <StatsPanel thread={selectedThread} variants={itemVariants} />
            </Box>

            {/* Timeline */}
            <motion.div
              variants={staggerSlow}
              initial="initial"
              animate="animate"
            >
              {selectedThread.messages.map((message, idx) => {
                const prevMessage = idx > 0 ? (selectedThread.messages[idx - 1] ?? null) : null;
                return (
                  <TimelineNode
                    key={message.id}
                    message={message}
                    prevMessage={prevMessage}
                    isFirst={idx === 0}
                    isLast={idx === selectedThread.messages.length - 1}
                    variants={itemVariants}
                  />
                );
              })}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            variants={itemVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Box className="flex flex-col items-center justify-center py-24">
              <Text className="text-lg font-medium text-content-secondary mb-1">
                No thread selected
              </Text>
              <Text className="text-sm text-content-tertiary">
                Choose a thread above to view its timeline.
              </Text>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
}
