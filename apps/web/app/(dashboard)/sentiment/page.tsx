"use client";

import { useState } from "react";
import { Box, Text, Card, CardContent, Button } from "@alecrae/ui";
import { motion } from "motion/react";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../../../lib/animations";

type Period = "7d" | "30d" | "90d";

interface ContactSentiment {
  name: string;
  email: string;
  score: number;
  trend: "up" | "down" | "stable";
  lastInteraction: string;
}

const DAILY_SCORES_30D = [
  6.8, 7.1, 6.5, 7.3, 7.0, 6.9, 7.5, 7.2, 6.4, 7.8,
  7.1, 6.6, 7.4, 7.0, 6.3, 7.6, 7.3, 7.1, 6.7, 7.9,
  7.2, 6.8, 7.5, 7.0, 6.9, 7.3, 7.6, 7.1, 6.5, 7.2,
];

const CONTACTS: ContactSentiment[] = [
  { name: "Sarah Chen", email: "sarah@acmecorp.com", score: 8.9, trend: "up", lastInteraction: "Today" },
  { name: "Alex Rivera", email: "alex@startup.io", score: 8.4, trend: "stable", lastInteraction: "Yesterday" },
  { name: "Jordan Lee", email: "jordan@company.com", score: 7.8, trend: "up", lastInteraction: "2 days ago" },
  { name: "Priya Patel", email: "priya@techpartner.com", score: 7.5, trend: "stable", lastInteraction: "3 days ago" },
  { name: "Marcus Webb", email: "marcus@legal.com", score: 7.1, trend: "down", lastInteraction: "1 week ago" },
  { name: "Lisa Tran", email: "lisa@hr.company.com", score: 6.8, trend: "down", lastInteraction: "4 days ago" },
  { name: "David Kim", email: "david@agency.com", score: 6.5, trend: "stable", lastInteraction: "Yesterday" },
  { name: "Rachel Green", email: "rachel@design.co", score: 6.2, trend: "down", lastInteraction: "5 days ago" },
];

const WARMING = [
  { name: "Sarah Chen", change: "+1.2", reason: "Positive Q3 planning discussions" },
  { name: "Jordan Lee", change: "+0.8", reason: "Successful project collaboration" },
];

const COOLING = [
  { name: "Marcus Webb", change: "-0.9", reason: "Delayed contract negotiations" },
  { name: "Rachel Green", change: "-0.7", reason: "Missed design review deadlines" },
];

const TONE_BREAKDOWN = [
  { label: "Professional", pct: 42, color: "bg-blue-500" },
  { label: "Casual", pct: 23, color: "bg-violet-500" },
  { label: "Friendly", pct: 18, color: "bg-emerald-500" },
  { label: "Formal", pct: 12, color: "bg-amber-500" },
  { label: "Urgent", pct: 5, color: "bg-red-500" },
];

const AI_INSIGHTS = [
  "Your emails to Engineering are 23% more formal than to Marketing.",
  "Response sentiment improves 15% when you open with a personal note.",
  "Thursday emails receive the most positive replies (avg 8.1/10).",
  "Emails over 200 words get 30% less positive responses than shorter ones.",
];

function scoreColor(score: number): string {
  if (score >= 7.5) return "text-emerald-400";
  if (score >= 5.5) return "text-amber-400";
  return "text-red-400";
}

function barColor(score: number): string {
  if (score >= 7.5) return "bg-emerald-500";
  if (score >= 5.5) return "bg-amber-500";
  return "bg-red-500";
}

function trendIcon(trend: "up" | "down" | "stable"): string {
  switch (trend) {
    case "up": return "↑";
    case "down": return "↓";
    case "stable": return "→";
  }
}

function trendColor(trend: "up" | "down" | "stable"): string {
  switch (trend) {
    case "up": return "text-emerald-400";
    case "down": return "text-red-400";
    case "stable": return "text-content-tertiary";
  }
}

export default function SentimentPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [period, setPeriod] = useState<Period>("30d");

  const maxScore = Math.max(...DAILY_SCORES_30D);
  const minScore = Math.min(...DAILY_SCORES_30D);
  const avgScore = DAILY_SCORES_30D.reduce((a, b) => a + b, 0) / DAILY_SCORES_30D.length;

  return (
    <Box className="flex-1 overflow-y-auto p-6">
      <motion.div {...withReducedMotion(fadeInUp, reduced)}>
        <Box className="max-w-5xl mx-auto space-y-6">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="heading-lg" className="font-bold">
                Email Sentiment
              </Text>
              <Text variant="body-md" muted className="mt-1">
                Track emotional tone across all your conversations
              </Text>
            </Box>
            <Box className="flex items-center gap-1 p-1 rounded-lg bg-surface-secondary">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </Box>
          </Box>

          <Box className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent>
                <Box className="text-center space-y-1">
                  <Text variant="heading-lg" className={`font-bold text-3xl ${scoreColor(avgScore)}`}>
                    {avgScore.toFixed(1)}
                  </Text>
                  <Text variant="body-sm" className="font-medium">
                    Overall Sentiment
                  </Text>
                  <Box className="flex items-center justify-center gap-1">
                    <Text variant="caption" className="text-emerald-400">
                      {"↑"} Positive
                    </Text>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box className="text-center space-y-1">
                  <Text variant="heading-lg" className="font-bold text-3xl text-emerald-400">
                    {maxScore.toFixed(1)}
                  </Text>
                  <Text variant="body-sm" className="font-medium">
                    Best Day
                  </Text>
                  <Text variant="caption" muted>
                    Peak positivity
                  </Text>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box className="text-center space-y-1">
                  <Text variant="heading-lg" className="font-bold text-3xl text-amber-400">
                    {minScore.toFixed(1)}
                  </Text>
                  <Text variant="body-sm" className="font-medium">
                    Lowest Day
                  </Text>
                  <Text variant="caption" muted>
                    Room for improvement
                  </Text>
                </Box>
              </CardContent>
            </Card>
          </Box>

          <Card>
            <CardContent>
              <Box className="space-y-3">
                <Text variant="label" className="font-semibold">
                  Daily Sentiment ({period})
                </Text>
                <Box className="flex items-end gap-1 h-32">
                  {DAILY_SCORES_30D.map((score, i) => (
                    <motion.div
                      key={i}
                      className={`flex-1 rounded-t ${barColor(score)} cursor-pointer`}
                      initial={{ height: 0 }}
                      animate={{ height: `${String(((score - 4) / 6) * 100)}%` }}
                      transition={{ duration: 0.5, delay: i * 0.02 }}
                      title={`Day ${String(i + 1)}: ${String(score)}/10`}
                    />
                  ))}
                </Box>
                <Box className="flex items-center justify-between">
                  <Text variant="caption" muted>30 days ago</Text>
                  <Text variant="caption" muted>Today</Text>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box className="space-y-4">
                <Text variant="label" className="font-semibold">
                  Relationships
                </Text>
                <Box className="space-y-3">
                  {CONTACTS.map((contact) => (
                    <Box key={contact.email} className="flex items-center gap-4">
                      <Box className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Text variant="caption" className="text-brand-400 font-semibold">
                          {contact.name.split(" ").map((n) => n[0]).join("")}
                        </Text>
                      </Box>
                      <Box className="flex-1 min-w-0">
                        <Box className="flex items-center gap-2">
                          <Text variant="body-sm" className="font-medium truncate">
                            {contact.name}
                          </Text>
                          <Text variant="caption" className={`font-semibold ${trendColor(contact.trend)}`}>
                            {trendIcon(contact.trend)}
                          </Text>
                        </Box>
                        <Text variant="caption" muted className="truncate">
                          {contact.email}
                        </Text>
                      </Box>
                      <Box className="w-32 flex items-center gap-2">
                        <Box className="flex-1 h-2 rounded-full bg-surface-secondary overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${barColor(contact.score)}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${String((contact.score / 10) * 100)}%` }}
                            transition={{ duration: 0.6 }}
                          />
                        </Box>
                        <Text variant="caption" className={`font-semibold ${scoreColor(contact.score)} w-8 text-right`}>
                          {contact.score.toFixed(1)}
                        </Text>
                      </Box>
                      <Text variant="caption" muted className="w-20 text-right hidden md:block">
                        {contact.lastInteraction}
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Box className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent>
                <Box className="space-y-3">
                  <Text variant="label" className="font-semibold text-emerald-400">
                    {"↑"} Warming Up
                  </Text>
                  {WARMING.map((item) => (
                    <Box key={item.name} className="p-3 rounded-lg bg-emerald-500/5 space-y-1">
                      <Box className="flex items-center justify-between">
                        <Text variant="body-sm" className="font-medium">
                          {item.name}
                        </Text>
                        <Text variant="caption" className="text-emerald-400 font-semibold">
                          {item.change}
                        </Text>
                      </Box>
                      <Text variant="caption" muted>
                        {item.reason}
                      </Text>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500">
              <CardContent>
                <Box className="space-y-3">
                  <Text variant="label" className="font-semibold text-red-400">
                    {"↓"} Cooling Down
                  </Text>
                  {COOLING.map((item) => (
                    <Box key={item.name} className="p-3 rounded-lg bg-red-500/5 space-y-1">
                      <Box className="flex items-center justify-between">
                        <Text variant="body-sm" className="font-medium">
                          {item.name}
                        </Text>
                        <Text variant="caption" className="text-red-400 font-semibold">
                          {item.change}
                        </Text>
                      </Box>
                      <Text variant="caption" muted>
                        {item.reason}
                      </Text>
                      <Text variant="caption" className="text-amber-400">
                        Suggested: Send a check-in email
                      </Text>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Box>

          <Card>
            <CardContent>
              <Box className="space-y-3">
                <Text variant="label" className="font-semibold">
                  Tone Breakdown
                </Text>
                <Box className="space-y-2">
                  {TONE_BREAKDOWN.map((tone) => (
                    <Box key={tone.label} className="flex items-center gap-3">
                      <Text variant="caption" className="w-24 font-medium">
                        {tone.label}
                      </Text>
                      <Box className="flex-1 h-3 rounded-full bg-surface-secondary overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${tone.color}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${String(tone.pct)}%` }}
                          transition={{ duration: 0.8 }}
                        />
                      </Box>
                      <Text variant="caption" muted className="w-10 text-right">
                        {tone.pct}%
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>

          <motion.div variants={staggerSlow} initial="initial" animate="animate">
            <Card>
              <CardContent>
                <Box className="space-y-3">
                  <Text variant="label" className="font-semibold">
                    AI Insights
                  </Text>
                  <Box className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {AI_INSIGHTS.map((insight, i) => (
                      <motion.div key={i} variants={fadeInUp}>
                        <Box className="p-3 rounded-lg bg-surface-secondary border-l-2 border-l-violet-500">
                          <Text variant="caption">
                            {insight}
                          </Text>
                        </Box>
                      </motion.div>
                    ))}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </motion.div>
        </Box>
      </motion.div>
    </Box>
  );
}
