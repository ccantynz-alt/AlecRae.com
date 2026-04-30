"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Card, CardContent, Button } from "@alecrae/ui";
import { motion, AnimatePresence } from "motion/react";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
  SPRING_BOUNCY,
} from "../../../lib/animations";

interface CoachFeedback {
  id: string;
  type: "tone" | "clarity" | "structure" | "length" | "action" | "subject";
  severity: "suggestion" | "warning" | "critical";
  title: string;
  description: string;
  fix?: string;
  applied: boolean;
}

interface ToneScore {
  label: string;
  value: number;
  color: string;
}

const MOCK_DRAFT =
  "Hey team,\n\nI wanted to circle back on the Q3 deliverables we discussed last week. I think we should probably consider maybe looking into the possibility of adjusting our timeline somewhat.\n\nAlso, the budget numbers look off. Someone needs to fix them ASAP or we're going to have a serious problem.\n\nLet me know your thoughts when you get a chance. No rush but also kind of urgent.\n\nThanks,\nAlex";

const MOCK_IMPROVED =
  "Hi team,\n\nFollowing up on our Q3 deliverables discussion from last Thursday. I'd like to propose extending the timeline by two weeks to account for the design review phase.\n\nI've identified discrepancies in the budget projections (rows 14-18 in the spreadsheet). Could Sarah review and update these by Wednesday?\n\nPlease share your feedback by end of day Friday so we can finalize the plan in Monday's standup.\n\nBest,\nAlex";

function generateFeedback(): CoachFeedback[] {
  return [
    {
      id: "f1",
      type: "tone",
      severity: "warning",
      title: "Passive-aggressive tone detected",
      description:
        '"Someone needs to fix them ASAP or we\'re going to have a serious problem" may come across as blaming. Assign the task directly and constructively.',
      fix: 'Could Sarah review and update these by Wednesday?',
      applied: false,
    },
    {
      id: "f2",
      type: "clarity",
      severity: "critical",
      title: "Contradictory urgency",
      description:
        '"No rush but also kind of urgent" sends mixed signals. Be explicit about the actual deadline.',
      fix: "Please share your feedback by end of day Friday.",
      applied: false,
    },
    {
      id: "f3",
      type: "structure",
      severity: "suggestion",
      title: "Bury the lede",
      description:
        "Your key ask (adjusting the timeline) is buried after filler phrases. Lead with the specific proposal.",
      fix: "I'd like to propose extending the timeline by two weeks.",
      applied: false,
    },
    {
      id: "f4",
      type: "clarity",
      severity: "warning",
      title: "Hedge word overload",
      description:
        '"probably consider maybe looking into the possibility" uses 4 hedge words. State your position directly.',
      fix: undefined,
      applied: false,
    },
    {
      id: "f5",
      type: "length",
      severity: "suggestion",
      title: "Missing specific details",
      description:
        '"The budget numbers look off" is vague. Reference specific line items or attach the data.',
      fix: "I've identified discrepancies in the budget projections (rows 14-18 in the spreadsheet).",
      applied: false,
    },
    {
      id: "f6",
      type: "action",
      severity: "suggestion",
      title: "No clear call-to-action",
      description:
        '"Let me know your thoughts" is too open-ended. Specify what action you need and by when.',
      fix: "Please share your feedback by end of day Friday so we can finalize the plan in Monday's standup.",
      applied: false,
    },
    {
      id: "f7",
      type: "subject",
      severity: "suggestion",
      title: "Consider a stronger subject line",
      description:
        'A subject like "Q3 Timeline Extension Proposal - Feedback Needed by Friday" gives recipients context before opening.',
      fix: undefined,
      applied: false,
    },
  ];
}

const TONE_SCORES: ToneScore[] = [
  { label: "Professional", value: 62, color: "bg-blue-500" },
  { label: "Direct", value: 38, color: "bg-violet-500" },
  { label: "Friendly", value: 71, color: "bg-emerald-500" },
  { label: "Confident", value: 45, color: "bg-amber-500" },
  { label: "Empathetic", value: 29, color: "bg-pink-500" },
];

const IMPROVED_TONE_SCORES: ToneScore[] = [
  { label: "Professional", value: 88, color: "bg-blue-500" },
  { label: "Direct", value: 82, color: "bg-violet-500" },
  { label: "Friendly", value: 65, color: "bg-emerald-500" },
  { label: "Confident", value: 79, color: "bg-amber-500" },
  { label: "Empathetic", value: 54, color: "bg-pink-500" },
];

function severityColor(severity: CoachFeedback["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-red-500 bg-red-500/10";
    case "warning":
      return "border-amber-500 bg-amber-500/10";
    case "suggestion":
      return "border-blue-500 bg-blue-500/10";
  }
}

function severityBadge(severity: CoachFeedback["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/20 text-red-400";
    case "warning":
      return "bg-amber-500/20 text-amber-400";
    case "suggestion":
      return "bg-blue-500/20 text-blue-400";
  }
}

function typeIcon(type: CoachFeedback["type"]): string {
  switch (type) {
    case "tone":
      return "\u{1F3AF}";
    case "clarity":
      return "\u{1F50D}";
    case "structure":
      return "\u{1F4D0}";
    case "length":
      return "\u{1F4CF}";
    case "action":
      return "✅";
    case "subject":
      return "\u{1F4E8}";
  }
}

export default function EmailCoachPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [feedback, setFeedback] = useState<CoachFeedback[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [overallScore, setOverallScore] = useState(0);
  const [improvedScore, setImprovedScore] = useState(0);
  const [showImproved, setShowImproved] = useState(false);
  const [toneScores, setToneScores] = useState<ToneScore[]>(TONE_SCORES);

  const analyze = useCallback((): void => {
    setAnalyzing(true);
    setFeedback([]);
    setAnalyzed(false);
    setShowImproved(false);
    setToneScores(TONE_SCORES);
    setTimeout(() => {
      setFeedback(generateFeedback());
      setOverallScore(52);
      setAnalyzing(false);
      setAnalyzed(true);
    }, 1800);
  }, []);

  const applyFix = useCallback((id: string): void => {
    setFeedback((prev: CoachFeedback[]) =>
      prev.map((f) => (f.id === id ? { ...f, applied: true } : f)),
    );
  }, []);

  const applyAll = useCallback((): void => {
    setFeedback((prev: CoachFeedback[]) => prev.map((f) => ({ ...f, applied: true })));
    setShowImproved(true);
    setImprovedScore(91);
    setToneScores(IMPROVED_TONE_SCORES);
  }, []);

  useEffect(() => {
    const allApplied = feedback.length > 0 && feedback.every((f) => f.applied);
    if (allApplied && !showImproved) {
      setShowImproved(true);
      setImprovedScore(91);
      setToneScores(IMPROVED_TONE_SCORES);
    }
  }, [feedback, showImproved]);

  const appliedCount = feedback.filter((f) => f.applied).length;
  const criticalCount = feedback.filter((f) => f.severity === "critical" && !f.applied).length;
  const warningCount = feedback.filter((f) => f.severity === "warning" && !f.applied).length;

  return (
    <Box className="flex-1 overflow-y-auto p-6">
      <motion.div {...withReducedMotion(fadeInUp, reduced)}>
        <Box className="max-w-6xl mx-auto space-y-6">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="heading-lg" className="font-bold">
                AI Email Coach
              </Text>
              <Text variant="body-md" muted className="mt-1">
                Real-time feedback to make every email more effective
              </Text>
            </Box>
            <Button
              variant="primary"
              onClick={analyze}
              loading={analyzing}
              disabled={analyzing}
            >
              {analyzing ? "Analyzing..." : analyzed ? "Re-analyze" : "Analyze Draft"}
            </Button>
          </Box>

          <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Box className="space-y-4">
              <Text variant="label" className="text-content-tertiary uppercase tracking-wider text-xs font-semibold">
                {showImproved ? "Improved Draft" : "Your Draft"}
              </Text>
              <Card>
                <CardContent>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={showImproved ? "improved" : "original"}
                      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
                      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
                      transition={SPRING_BOUNCY}
                    >
                      <Box className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                        <Text variant="body-sm" className="font-mono leading-relaxed">
                          {showImproved ? MOCK_IMPROVED : MOCK_DRAFT}
                        </Text>
                      </Box>
                    </motion.div>
                  </AnimatePresence>
                </CardContent>
              </Card>

              {analyzed && (
                <motion.div {...withReducedMotion(fadeInUp, reduced)}>
                  <Card>
                    <CardContent>
                      <Box className="space-y-4">
                        <Box className="flex items-center justify-between">
                          <Text variant="label" className="font-semibold">
                            Tone Analysis
                          </Text>
                          {showImproved && (
                            <Box className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20">
                              <Text variant="caption" className="text-emerald-400 font-medium">
                                Improved
                              </Text>
                            </Box>
                          )}
                        </Box>
                        <Box className="space-y-3">
                          {toneScores.map((tone) => (
                            <Box key={tone.label} className="space-y-1">
                              <Box className="flex items-center justify-between">
                                <Text variant="caption" className="font-medium">
                                  {tone.label}
                                </Text>
                                <Text variant="caption" muted>
                                  {tone.value}%
                                </Text>
                              </Box>
                              <Box className="h-2 rounded-full bg-surface-secondary overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${tone.color}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${String(tone.value)}%` }}
                                  transition={{ duration: 0.8, delay: 0.1 }}
                                />
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </Box>

            <Box className="space-y-4">
              <Box className="flex items-center justify-between">
                <Text variant="label" className="text-content-tertiary uppercase tracking-wider text-xs font-semibold">
                  Coach Feedback
                </Text>
                {analyzed && (
                  <Box className="flex items-center gap-3">
                    {criticalCount > 0 && (
                      <Box className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20">
                        <Text variant="caption" className="text-red-400 font-medium">
                          {criticalCount} critical
                        </Text>
                      </Box>
                    )}
                    {warningCount > 0 && (
                      <Box className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20">
                        <Text variant="caption" className="text-amber-400 font-medium">
                          {warningCount} warning
                        </Text>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>

              {!analyzed && !analyzing && (
                <Card>
                  <CardContent>
                    <Box className="py-12 text-center space-y-3">
                      <Text variant="heading-md" className="text-4xl">
                        {"\u{1F9D1}‍\u{1F3EB}"}
                      </Text>
                      <Text variant="body-md" muted>
                        Click &quot;Analyze Draft&quot; to get real-time feedback on your email
                      </Text>
                      <Text variant="caption" muted>
                        The coach checks tone, clarity, structure, and actionability
                      </Text>
                    </Box>
                  </CardContent>
                </Card>
              )}

              {analyzing && (
                <Card>
                  <CardContent>
                    <Box className="py-12 text-center space-y-3">
                      <Box className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/20 animate-pulse">
                        <Text variant="heading-md">{"\u{1F9E0}"}</Text>
                      </Box>
                      <Text variant="body-md" muted>
                        Analyzing tone, clarity, structure...
                      </Text>
                    </Box>
                  </CardContent>
                </Card>
              )}

              {analyzed && (
                <motion.div
                  variants={staggerSlow}
                  initial="initial"
                  animate="animate"
                  className="space-y-3"
                >
                  <motion.div variants={fadeInUp}>
                    <Card>
                      <CardContent>
                        <Box className="flex items-center justify-between">
                          <Box className="flex items-center gap-3">
                            <Box className="relative w-16 h-16">
                              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                                <circle
                                  cx="18"
                                  cy="18"
                                  r="15.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  className="text-surface-secondary"
                                />
                                <motion.circle
                                  cx="18"
                                  cy="18"
                                  r="15.5"
                                  fill="none"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeDasharray={`${String(((showImproved ? improvedScore : overallScore) / 100) * 97.4)} 97.4`}
                                  className={showImproved ? "text-emerald-500 stroke-emerald-500" : "text-amber-500 stroke-amber-500"}
                                  initial={{ strokeDasharray: "0 97.4" }}
                                  animate={{
                                    strokeDasharray: `${String(((showImproved ? improvedScore : overallScore) / 100) * 97.4)} 97.4`,
                                  }}
                                  transition={{ duration: 1 }}
                                />
                              </svg>
                              <Box className="absolute inset-0 flex items-center justify-center">
                                <Text variant="heading-md" className="font-bold text-sm">
                                  {showImproved ? improvedScore : overallScore}
                                </Text>
                              </Box>
                            </Box>
                            <Box>
                              <Text variant="body-md" className="font-semibold">
                                {showImproved ? "Excellent" : "Needs Work"}
                              </Text>
                              <Text variant="caption" muted>
                                {showImproved
                                  ? "Clear, professional, and actionable"
                                  : `${String(feedback.length)} suggestions found`}
                              </Text>
                            </Box>
                          </Box>
                          {!showImproved && feedback.some((f) => f.fix) && (
                            <Button variant="primary" size="sm" onClick={applyAll}>
                              Apply All Fixes
                            </Button>
                          )}
                          {showImproved && (
                            <Box className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20">
                              <Text variant="caption" className="text-emerald-400 font-semibold">
                                +{improvedScore - overallScore} points
                              </Text>
                            </Box>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </motion.div>

                  <AnimatePresence>
                    {feedback.map((item) => (
                      <motion.div
                        key={item.id}
                        variants={fadeInUp}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, x: 20, height: 0 }}
                        layout
                      >
                        <Card
                          className={`border-l-4 transition-opacity ${severityColor(item.severity)} ${item.applied ? "opacity-50" : ""}`}
                        >
                          <CardContent>
                            <Box className="space-y-2">
                              <Box className="flex items-start justify-between gap-3">
                                <Box className="flex items-center gap-2">
                                  <Text variant="body-sm">{typeIcon(item.type)}</Text>
                                  <Text variant="body-sm" className="font-semibold">
                                    {item.title}
                                  </Text>
                                </Box>
                                <Box
                                  className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${severityBadge(item.severity)}`}
                                >
                                  <Text variant="caption" className="font-medium">
                                    {item.severity}
                                  </Text>
                                </Box>
                              </Box>
                              <Text variant="caption" muted>
                                {item.description}
                              </Text>
                              {item.fix && !item.applied && (
                                <Box className="flex items-center gap-2 pt-1">
                                  <Box className="flex-1 px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                    <Text variant="caption" className="text-emerald-400 font-mono">
                                      {item.fix}
                                    </Text>
                                  </Box>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => applyFix(item.id)}
                                  >
                                    Apply
                                  </Button>
                                </Box>
                              )}
                              {item.applied && (
                                <Box className="flex items-center gap-1.5">
                                  <Text variant="caption" className="text-emerald-400">
                                    {"✓"} Applied
                                  </Text>
                                </Box>
                              )}
                            </Box>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </Box>
          </Box>

          {analyzed && (
            <motion.div {...withReducedMotion(fadeInUp, reduced)}>
              <Card>
                <CardContent>
                  <Box className="space-y-4">
                    <Text variant="label" className="font-semibold">
                      Quick Tips for This Email
                    </Text>
                    <Box className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Box className="p-4 rounded-xl bg-surface-secondary space-y-2">
                        <Text variant="body-sm" className="font-semibold">
                          {"\u{1F3AF}"} Lead with the ask
                        </Text>
                        <Text variant="caption" muted>
                          Put your main request in the first paragraph. Busy people read the top and skim the rest.
                        </Text>
                      </Box>
                      <Box className="p-4 rounded-xl bg-surface-secondary space-y-2">
                        <Text variant="body-sm" className="font-semibold">
                          {"\u{1F4C5}"} Add deadlines
                        </Text>
                        <Text variant="caption" muted>
                          Every action item should have a date. &quot;By Wednesday&quot; beats &quot;when you can.&quot;
                        </Text>
                      </Box>
                      <Box className="p-4 rounded-xl bg-surface-secondary space-y-2">
                        <Text variant="body-sm" className="font-semibold">
                          {"\u{1F464}"} Name names
                        </Text>
                        <Text variant="caption" muted>
                          Assign tasks to specific people. &quot;Someone should&quot; means nobody will.
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <motion.div {...withReducedMotion(fadeInUp, reduced)}>
            <Card>
              <CardContent>
                <Box className="space-y-4">
                  <Text variant="label" className="font-semibold">
                    Your Writing Stats
                  </Text>
                  <Box className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Emails Coached", value: "127", trend: "+12 this week" },
                      { label: "Avg. Score", value: "78", trend: "+6 from last month" },
                      { label: "Fixes Applied", value: "342", trend: "89% acceptance rate" },
                      { label: "Tone Consistency", value: "85%", trend: "Professional" },
                    ].map((stat) => (
                      <Box key={stat.label} className="p-4 rounded-xl bg-surface-secondary text-center space-y-1">
                        <Text variant="heading-md" className="font-bold">
                          {stat.value}
                        </Text>
                        <Text variant="caption" className="font-medium">
                          {stat.label}
                        </Text>
                        <Text variant="caption" muted>
                          {stat.trend}
                        </Text>
                      </Box>
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
