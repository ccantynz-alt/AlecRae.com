"use client";

import { useState, useCallback } from "react";
import { Box, Text, Card, CardContent, Button } from "@alecrae/ui";
import { motion, AnimatePresence } from "motion/react";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
  SPRING_BOUNCY,
} from "../../../lib/animations";

type FollowUpStatus = "overdue" | "due-soon" | "upcoming" | "completed";
type CommitmentDirection = "by-me" | "to-me";

interface FollowUp {
  id: string;
  subject: string;
  contact: string;
  contactEmail: string;
  commitment: string;
  direction: CommitmentDirection;
  dueDate: string;
  daysLeft: number;
  status: FollowUpStatus;
  threadSubject: string;
  extractedFrom: string;
  nudged: boolean;
}

const MOCK_FOLLOWUPS: FollowUp[] = [
  {
    id: "fu1",
    subject: "Send Q3 budget proposal",
    contact: "Sarah Chen",
    contactEmail: "sarah@acmecorp.com",
    commitment: 'You said: "I\'ll send over the Q3 budget proposal by Monday"',
    direction: "by-me",
    dueDate: "Apr 28",
    daysLeft: -2,
    status: "overdue",
    threadSubject: "Re: Q3 Planning",
    extractedFrom: "Apr 24 email",
    nudged: false,
  },
  {
    id: "fu2",
    subject: "Review design mockups",
    contact: "Alex Rivera",
    contactEmail: "alex.r@startup.io",
    commitment: 'Alex said: "I\'ll have the mockups ready for review by Wednesday"',
    direction: "to-me",
    dueDate: "Apr 30",
    daysLeft: 0,
    status: "due-soon",
    threadSubject: "Re: Homepage Redesign",
    extractedFrom: "Apr 25 email",
    nudged: false,
  },
  {
    id: "fu3",
    subject: "Schedule team offsite",
    contact: "Jordan Lee",
    contactEmail: "jordan@company.com",
    commitment: 'You said: "I\'ll book the venue and send calendar invites this week"',
    direction: "by-me",
    dueDate: "May 2",
    daysLeft: 2,
    status: "due-soon",
    threadSubject: "Team Offsite Planning",
    extractedFrom: "Apr 26 email",
    nudged: false,
  },
  {
    id: "fu4",
    subject: "Share API documentation",
    contact: "Priya Patel",
    contactEmail: "priya@techpartner.com",
    commitment: 'Priya said: "I\'ll share the updated API docs by end of next week"',
    direction: "to-me",
    dueDate: "May 5",
    daysLeft: 5,
    status: "upcoming",
    threadSubject: "Re: Integration Timeline",
    extractedFrom: "Apr 22 email",
    nudged: false,
  },
  {
    id: "fu5",
    subject: "Finalize contract terms",
    contact: "Marcus Webb",
    contactEmail: "marcus@legaldept.com",
    commitment: 'Marcus said: "Legal will have the revised contract terms by May 8th"',
    direction: "to-me",
    dueDate: "May 8",
    daysLeft: 8,
    status: "upcoming",
    threadSubject: "Re: Partnership Agreement v3",
    extractedFrom: "Apr 20 email",
    nudged: false,
  },
  {
    id: "fu6",
    subject: "Submit expense reports",
    contact: "Finance Team",
    contactEmail: "finance@company.com",
    commitment: 'You said: "I\'ll submit all outstanding expense reports by Friday"',
    direction: "by-me",
    dueDate: "May 3",
    daysLeft: 3,
    status: "upcoming",
    threadSubject: "Expense Report Reminder",
    extractedFrom: "Apr 28 email",
    nudged: false,
  },
  {
    id: "fu7",
    subject: "Send client presentation",
    contact: "David Kim",
    contactEmail: "david.k@agency.com",
    commitment: 'You said: "I\'ll share the final presentation deck before our Thursday call"',
    direction: "by-me",
    dueDate: "May 1",
    daysLeft: 1,
    status: "due-soon",
    threadSubject: "Re: Client Demo Prep",
    extractedFrom: "Apr 27 email",
    nudged: false,
  },
  {
    id: "fu8",
    subject: "Provide candidate feedback",
    contact: "Lisa Tran",
    contactEmail: "lisa@hr.company.com",
    commitment: 'Lisa said: "I\'ll get you the interview panel feedback by tomorrow"',
    direction: "to-me",
    dueDate: "Apr 27",
    daysLeft: -3,
    status: "overdue",
    threadSubject: "Re: Senior Dev Interviews",
    extractedFrom: "Apr 25 email",
    nudged: true,
  },
];

const COMPLETED: FollowUp[] = [
  {
    id: "fu9",
    subject: "Send meeting notes",
    contact: "Sarah Chen",
    contactEmail: "sarah@acmecorp.com",
    commitment: 'You said: "I\'ll send the meeting notes by EOD"',
    direction: "by-me",
    dueDate: "Apr 25",
    daysLeft: 0,
    status: "completed",
    threadSubject: "Re: Product Sync",
    extractedFrom: "Apr 25 email",
    nudged: false,
  },
  {
    id: "fu10",
    subject: "Share competitor analysis",
    contact: "Jordan Lee",
    contactEmail: "jordan@company.com",
    commitment: 'Jordan said: "I\'ll pull together the competitor analysis this afternoon"',
    direction: "to-me",
    dueDate: "Apr 24",
    daysLeft: 0,
    status: "completed",
    threadSubject: "Market Research",
    extractedFrom: "Apr 24 email",
    nudged: false,
  },
];

function statusColor(status: FollowUpStatus): string {
  switch (status) {
    case "overdue":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "due-soon":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "upcoming":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "completed":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  }
}

function statusLabel(status: FollowUpStatus): string {
  switch (status) {
    case "overdue":
      return "Overdue";
    case "due-soon":
      return "Due Soon";
    case "upcoming":
      return "Upcoming";
    case "completed":
      return "Completed";
  }
}

function daysLabel(days: number): string {
  if (days < 0) return `${String(Math.abs(days))}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${String(days)}d left`;
}

function directionBadge(direction: CommitmentDirection): { label: string; color: string } {
  return direction === "by-me"
    ? { label: "You promised", color: "bg-violet-500/20 text-violet-400" }
    : { label: "Waiting on them", color: "bg-cyan-500/20 text-cyan-400" };
}

export default function FollowUpsPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [filter, setFilter] = useState<"all" | "by-me" | "to-me">("all");
  const [followUps, setFollowUps] = useState<FollowUp[]>(MOCK_FOLLOWUPS);
  const [showCompleted, setShowCompleted] = useState(false);
  const [nudging, setNudging] = useState<string | null>(null);

  const filtered = followUps.filter((fu) => {
    if (filter === "all") return true;
    return fu.direction === filter;
  });

  const overdue = filtered.filter((f) => f.status === "overdue");
  const dueSoon = filtered.filter((f) => f.status === "due-soon");
  const upcoming = filtered.filter((f) => f.status === "upcoming");

  const overdueCount = followUps.filter((f) => f.status === "overdue").length;
  const waitingCount = followUps.filter((f) => f.direction === "to-me").length;
  const myCount = followUps.filter((f) => f.direction === "by-me").length;

  const nudge = useCallback((id: string): void => {
    setNudging(id);
    setTimeout(() => {
      setFollowUps((prev: FollowUp[]) =>
        prev.map((f) => (f.id === id ? { ...f, nudged: true } : f)),
      );
      setNudging(null);
    }, 1200);
  }, []);

  const markComplete = useCallback((id: string): void => {
    setFollowUps((prev: FollowUp[]) => prev.filter((f) => f.id !== id));
  }, []);

  const renderCard = (item: FollowUp): React.ReactNode => {
    const dir = directionBadge(item.direction);
    return (
      <motion.div
        key={item.id}
        variants={fadeInUp}
        layout
        exit={reduced ? { opacity: 0 } : { opacity: 0, x: -20, height: 0 }}
      >
        <Card className={`border-l-4 ${item.status === "overdue" ? "border-l-red-500" : item.status === "due-soon" ? "border-l-amber-500" : "border-l-blue-500"}`}>
          <CardContent>
            <Box className="space-y-3">
              <Box className="flex items-start justify-between gap-3">
                <Box className="flex-1 min-w-0">
                  <Box className="flex items-center gap-2 flex-wrap">
                    <Text variant="body-sm" className="font-semibold">
                      {item.subject}
                    </Text>
                    <Box className={`px-2 py-0.5 rounded-full text-xs ${statusColor(item.status)}`}>
                      <Text variant="caption" className="font-medium">
                        {statusLabel(item.status)}
                      </Text>
                    </Box>
                    <Box className={`px-2 py-0.5 rounded-full text-xs ${dir.color}`}>
                      <Text variant="caption" className="font-medium">
                        {dir.label}
                      </Text>
                    </Box>
                  </Box>
                  <Text variant="caption" muted className="mt-1">
                    {item.contact} &middot; {item.dueDate} &middot; {daysLabel(item.daysLeft)}
                  </Text>
                </Box>
              </Box>

              <Box className="px-3 py-2 rounded-lg bg-surface-secondary">
                <Text variant="caption" className="italic">
                  {item.commitment}
                </Text>
                <Text variant="caption" muted className="mt-0.5">
                  Extracted from: {item.extractedFrom} in &quot;{item.threadSubject}&quot;
                </Text>
              </Box>

              <Box className="flex items-center gap-2">
                {item.direction === "to-me" && !item.nudged && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => nudge(item.id)}
                    loading={nudging === item.id}
                    disabled={nudging === item.id}
                  >
                    {nudging === item.id ? "Sending..." : "Send Nudge"}
                  </Button>
                )}
                {item.nudged && (
                  <Box className="px-2 py-0.5 rounded-full bg-emerald-500/20">
                    <Text variant="caption" className="text-emerald-400">
                      {"✓"} Nudge sent
                    </Text>
                  </Box>
                )}
                <Button variant="ghost" size="sm" onClick={() => markComplete(item.id)}>
                  Mark Complete
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <Box className="flex-1 overflow-y-auto p-6">
      <motion.div {...withReducedMotion(fadeInUp, reduced)}>
        <Box className="max-w-4xl mx-auto space-y-6">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="heading-lg" className="font-bold">
                Follow-Up Tracker
              </Text>
              <Text variant="body-md" muted className="mt-1">
                Every promise tracked. Nothing falls through the cracks.
              </Text>
            </Box>
          </Box>

          <Box className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Active",
                value: String(followUps.length),
                color: "text-content",
                sub: "commitments tracked",
              },
              {
                label: "Overdue",
                value: String(overdueCount),
                color: overdueCount > 0 ? "text-red-400" : "text-emerald-400",
                sub: overdueCount > 0 ? "need attention" : "all clear",
              },
              {
                label: "Waiting On Others",
                value: String(waitingCount),
                color: "text-cyan-400",
                sub: "promises to you",
              },
              {
                label: "Your Promises",
                value: String(myCount),
                color: "text-violet-400",
                sub: "you committed to",
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent>
                  <Box className="text-center space-y-1">
                    <Text variant="heading-md" className={`font-bold ${stat.color}`}>
                      {stat.value}
                    </Text>
                    <Text variant="caption" className="font-medium">
                      {stat.label}
                    </Text>
                    <Text variant="caption" muted>
                      {stat.sub}
                    </Text>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Box className="flex items-center gap-2">
            {(["all", "by-me", "to-me"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "primary" : "ghost"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "by-me" ? "My Promises" : "Waiting On Others"}
              </Button>
            ))}
          </Box>

          <AnimatePresence mode="popLayout">
            {overdue.length > 0 && (
              <motion.div
                variants={staggerSlow}
                initial="initial"
                animate="animate"
                className="space-y-3"
              >
                <Box className="flex items-center gap-2">
                  <Box className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <Text variant="label" className="text-red-400 font-semibold uppercase tracking-wider text-xs">
                    Overdue ({overdue.length})
                  </Text>
                </Box>
                {overdue.map(renderCard)}
              </motion.div>
            )}

            {dueSoon.length > 0 && (
              <motion.div
                variants={staggerSlow}
                initial="initial"
                animate="animate"
                className="space-y-3"
              >
                <Text variant="label" className="text-amber-400 font-semibold uppercase tracking-wider text-xs">
                  Due Soon ({dueSoon.length})
                </Text>
                {dueSoon.map(renderCard)}
              </motion.div>
            )}

            {upcoming.length > 0 && (
              <motion.div
                variants={staggerSlow}
                initial="initial"
                animate="animate"
                className="space-y-3"
              >
                <Text variant="label" className="text-blue-400 font-semibold uppercase tracking-wider text-xs">
                  Upcoming ({upcoming.length})
                </Text>
                {upcoming.map(renderCard)}
              </motion.div>
            )}
          </AnimatePresence>

          <Box className="pt-4 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCompleted((prev: boolean) => !prev)}
            >
              {showCompleted ? "Hide Completed" : `Show Completed (${String(COMPLETED.length)})`}
            </Button>
            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  className="mt-3 space-y-3"
                >
                  {COMPLETED.map((item) => (
                    <Card key={item.id} className="border-l-4 border-l-emerald-500 opacity-60">
                      <CardContent>
                        <Box className="flex items-center justify-between">
                          <Box>
                            <Box className="flex items-center gap-2">
                              <Text variant="caption" className="text-emerald-400">
                                {"✓"}
                              </Text>
                              <Text variant="body-sm" className="font-medium line-through">
                                {item.subject}
                              </Text>
                            </Box>
                            <Text variant="caption" muted>
                              {item.contact} &middot; Completed {item.dueDate}
                            </Text>
                          </Box>
                          <Box className={`px-2 py-0.5 rounded-full text-xs ${statusColor("completed")}`}>
                            <Text variant="caption" className="font-medium">
                              Done
                            </Text>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </Box>

          <Card>
            <CardContent>
              <Box className="space-y-3">
                <Text variant="label" className="font-semibold">
                  How It Works
                </Text>
                <Box className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Box className="p-4 rounded-xl bg-surface-secondary space-y-2">
                    <Text variant="body-sm" className="font-semibold">
                      {"\u{1F9E0}"} AI Extraction
                    </Text>
                    <Text variant="caption" muted>
                      AI reads every email and detects commitments, promises, and deadlines automatically.
                    </Text>
                  </Box>
                  <Box className="p-4 rounded-xl bg-surface-secondary space-y-2">
                    <Text variant="body-sm" className="font-semibold">
                      {"\u{1F514}"} Smart Reminders
                    </Text>
                    <Text variant="caption" muted>
                      Get notified before deadlines. Never miss a commitment or let others miss theirs.
                    </Text>
                  </Box>
                  <Box className="p-4 rounded-xl bg-surface-secondary space-y-2">
                    <Text variant="body-sm" className="font-semibold">
                      {"\u{1F4E8}"} One-Click Nudge
                    </Text>
                    <Text variant="caption" muted>
                      AI drafts a polite follow-up email. Send it with one click when someone is late.
                    </Text>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </motion.div>
    </Box>
  );
}
