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

interface WorkflowCondition {
  field: string;
  operator: string;
  value: string;
}

interface WorkflowAction {
  type: string;
  value: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  enabled: boolean;
  runCount: number;
  lastRun: string;
}

const MOCK_WORKFLOWS: Workflow[] = [
  {
    id: "wf1",
    name: "Auto-label invoices",
    description: "Tag emails with invoices or payment requests",
    trigger: "Email received",
    conditions: [
      { field: "Subject", operator: "contains", value: "invoice" },
      { field: "Has attachment", operator: "is", value: "true" },
    ],
    actions: [
      { type: "Apply label", value: "Finance" },
      { type: "Star", value: "" },
    ],
    enabled: true,
    runCount: 234,
    lastRun: "2 hours ago",
  },
  {
    id: "wf2",
    name: "Forward press mentions",
    description: "Route media mentions to the PR team",
    trigger: "Email received",
    conditions: [
      { field: "From", operator: "contains", value: "@press" },
      { field: "Body", operator: "contains", value: "mention" },
    ],
    actions: [
      { type: "Forward to", value: "pr-team@company.com" },
      { type: "Apply label", value: "Press" },
    ],
    enabled: true,
    runCount: 47,
    lastRun: "Yesterday",
  },
  {
    id: "wf3",
    name: "Snooze newsletters until weekend",
    description: "Push non-urgent newsletters to Saturday morning",
    trigger: "Email received",
    conditions: [
      { field: "From", operator: "contains", value: "newsletter" },
      { field: "Subject", operator: "not contains", value: "urgent" },
    ],
    actions: [{ type: "Snooze until", value: "Saturday 9:00 AM" }],
    enabled: true,
    runCount: 189,
    lastRun: "4 hours ago",
  },
  {
    id: "wf4",
    name: "Archive read receipts",
    description: "Automatically archive read receipt notifications",
    trigger: "Email received",
    conditions: [
      { field: "Subject", operator: "contains", value: "Read:" },
      { field: "From", operator: "contains", value: "noreply" },
    ],
    actions: [{ type: "Archive", value: "" }],
    enabled: true,
    runCount: 412,
    lastRun: "1 hour ago",
  },
  {
    id: "wf5",
    name: "Flag VIP emails",
    description: "Star and notify for emails from key contacts",
    trigger: "Email received",
    conditions: [
      { field: "From", operator: "is one of", value: "ceo@company.com, investor@vc.com" },
    ],
    actions: [
      { type: "Star", value: "" },
      { type: "Apply label", value: "VIP" },
      { type: "Move to folder", value: "Priority" },
    ],
    enabled: false,
    runCount: 23,
    lastRun: "3 days ago",
  },
];

const TRIGGER_OPTIONS = ["Email received", "Email sent", "Email starred", "Label added"];
const CONDITION_FIELDS = ["From", "Subject", "Body", "Has attachment"];
const CONDITION_OPERATORS = ["contains", "not contains", "is", "is not", "is one of"];
const ACTION_TYPES = ["Apply label", "Forward to", "Archive", "Star", "Snooze until", "Move to folder"];

function actionColor(type: string): string {
  switch (type) {
    case "Apply label": return "bg-violet-500/20 text-violet-400";
    case "Forward to": return "bg-blue-500/20 text-blue-400";
    case "Archive": return "bg-amber-500/20 text-amber-400";
    case "Star": return "bg-yellow-500/20 text-yellow-400";
    case "Snooze until": return "bg-cyan-500/20 text-cyan-400";
    case "Move to folder": return "bg-emerald-500/20 text-emerald-400";
    default: return "bg-surface-secondary text-content-tertiary";
  }
}

export default function WorkflowsPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [workflows, setWorkflows] = useState<Workflow[]>(MOCK_WORKFLOWS);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderTrigger, setBuilderTrigger] = useState(TRIGGER_OPTIONS[0] ?? "Email received");
  const [builderConditions, setBuilderConditions] = useState<WorkflowCondition[]>([
    { field: "From", operator: "contains", value: "" },
  ]);
  const [builderActions, setBuilderActions] = useState<WorkflowAction[]>([
    { type: "Apply label", value: "" },
  ]);

  const toggleWorkflow = useCallback((id: string): void => {
    setWorkflows((prev: Workflow[]) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)),
    );
  }, []);

  const addCondition = useCallback((): void => {
    setBuilderConditions((prev: WorkflowCondition[]) => [
      ...prev,
      { field: "Subject", operator: "contains", value: "" },
    ]);
  }, []);

  const removeCondition = useCallback((idx: number): void => {
    setBuilderConditions((prev: WorkflowCondition[]) => prev.filter((_, i) => i !== idx));
  }, []);

  const addAction = useCallback((): void => {
    setBuilderActions((prev: WorkflowAction[]) => [
      ...prev,
      { type: "Archive", value: "" },
    ]);
  }, []);

  const removeAction = useCallback((idx: number): void => {
    setBuilderActions((prev: WorkflowAction[]) => prev.filter((_, i) => i !== idx));
  }, []);

  const activeCount = workflows.filter((w) => w.enabled).length;
  const totalRuns = workflows.reduce((sum, w) => sum + w.runCount, 0);

  return (
    <Box className="flex-1 overflow-y-auto p-6">
      <motion.div {...withReducedMotion(fadeInUp, reduced)}>
        <Box className="max-w-4xl mx-auto space-y-6">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="heading-lg" className="font-bold">
                Email Workflows
              </Text>
              <Text variant="body-md" muted className="mt-1">
                Automate your inbox with intelligent rules
              </Text>
            </Box>
            <Button variant="primary" onClick={() => setShowBuilder((p: boolean) => !p)}>
              {showBuilder ? "Cancel" : "Create Workflow"}
            </Button>
          </Box>

          <Box className="flex items-center gap-6">
            <Box className="flex items-center gap-2">
              <Box className="w-2 h-2 rounded-full bg-emerald-500" />
              <Text variant="body-sm" muted>
                {activeCount} active
              </Text>
            </Box>
            <Text variant="body-sm" muted>
              {String(totalRuns)} emails processed
            </Text>
          </Box>

          <AnimatePresence>
            {showBuilder && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={SPRING_BOUNCY}
              >
                <Card className="border-2 border-brand-500/30">
                  <CardContent>
                    <Box className="space-y-5">
                      <Text variant="label" className="font-semibold">
                        New Workflow
                      </Text>

                      <Box className="space-y-2">
                        <Text variant="caption" className="font-medium uppercase tracking-wider text-content-tertiary">
                          When
                        </Text>
                        <Box className="flex flex-wrap gap-2">
                          {TRIGGER_OPTIONS.map((t) => (
                            <Button
                              key={t}
                              variant={builderTrigger === t ? "primary" : "ghost"}
                              size="sm"
                              onClick={() => setBuilderTrigger(t)}
                            >
                              {t}
                            </Button>
                          ))}
                        </Box>
                      </Box>

                      <Box className="space-y-2">
                        <Box className="flex items-center justify-between">
                          <Text variant="caption" className="font-medium uppercase tracking-wider text-content-tertiary">
                            If (conditions)
                          </Text>
                          <Button variant="ghost" size="sm" onClick={addCondition}>
                            + Add
                          </Button>
                        </Box>
                        <Box className="space-y-2">
                          {builderConditions.map((cond, idx) => (
                            <Box
                              key={idx}
                              className="flex items-center gap-2 p-3 rounded-lg bg-surface-secondary"
                            >
                              <Box className="flex items-center gap-2 flex-1 flex-wrap">
                                <Box
                                  as="select"
                                  className="px-2 py-1 rounded bg-surface border border-border text-sm text-content"
                                  value={cond.field}
                                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const val = e.target.value;
                                    setBuilderConditions((prev: WorkflowCondition[]) =>
                                      prev.map((c, i) => (i === idx ? { ...c, field: val } : c)),
                                    );
                                  }}
                                >
                                  {CONDITION_FIELDS.map((f) => (
                                    <Box as="option" key={f} value={f}>
                                      {f}
                                    </Box>
                                  ))}
                                </Box>
                                <Box
                                  as="select"
                                  className="px-2 py-1 rounded bg-surface border border-border text-sm text-content"
                                  value={cond.operator}
                                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const val = e.target.value;
                                    setBuilderConditions((prev: WorkflowCondition[]) =>
                                      prev.map((c, i) => (i === idx ? { ...c, operator: val } : c)),
                                    );
                                  }}
                                >
                                  {CONDITION_OPERATORS.map((o) => (
                                    <Box as="option" key={o} value={o}>
                                      {o}
                                    </Box>
                                  ))}
                                </Box>
                                <Box
                                  as="input"
                                  className="flex-1 min-w-[120px] px-2 py-1 rounded bg-surface border border-border text-sm text-content placeholder:text-content-tertiary"
                                  placeholder="Value..."
                                  value={cond.value}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    const val = e.target.value;
                                    setBuilderConditions((prev: WorkflowCondition[]) =>
                                      prev.map((c, i) => (i === idx ? { ...c, value: val } : c)),
                                    );
                                  }}
                                />
                              </Box>
                              {builderConditions.length > 1 && (
                                <Button variant="ghost" size="sm" onClick={() => removeCondition(idx)}>
                                  {"×"}
                                </Button>
                              )}
                            </Box>
                          ))}
                        </Box>
                      </Box>

                      <Box className="flex items-center gap-2 px-4">
                        <Box className="w-px h-6 bg-border" />
                        <Text variant="caption" muted>
                          then
                        </Text>
                        <Box className="flex-1 h-px bg-border" />
                      </Box>

                      <Box className="space-y-2">
                        <Box className="flex items-center justify-between">
                          <Text variant="caption" className="font-medium uppercase tracking-wider text-content-tertiary">
                            Do (actions)
                          </Text>
                          <Button variant="ghost" size="sm" onClick={addAction}>
                            + Add
                          </Button>
                        </Box>
                        <Box className="space-y-2">
                          {builderActions.map((act, idx) => (
                            <Box
                              key={idx}
                              className="flex items-center gap-2 p-3 rounded-lg bg-surface-secondary"
                            >
                              <Box
                                as="select"
                                className="px-2 py-1 rounded bg-surface border border-border text-sm text-content"
                                value={act.type}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                  const val = e.target.value;
                                  setBuilderActions((prev: WorkflowAction[]) =>
                                    prev.map((a, i) => (i === idx ? { ...a, type: val } : a)),
                                  );
                                }}
                              >
                                {ACTION_TYPES.map((a) => (
                                  <Box as="option" key={a} value={a}>
                                    {a}
                                  </Box>
                                ))}
                              </Box>
                              <Box
                                as="input"
                                className="flex-1 px-2 py-1 rounded bg-surface border border-border text-sm text-content placeholder:text-content-tertiary"
                                placeholder="Value..."
                                value={act.value}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                  const val = e.target.value;
                                  setBuilderActions((prev: WorkflowAction[]) =>
                                    prev.map((a, i) => (i === idx ? { ...a, value: val } : a)),
                                  );
                                }}
                              />
                              {builderActions.length > 1 && (
                                <Button variant="ghost" size="sm" onClick={() => removeAction(idx)}>
                                  {"×"}
                                </Button>
                              )}
                            </Box>
                          ))}
                        </Box>
                      </Box>

                      <Box className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setShowBuilder(false)}>
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={() => setShowBuilder(false)}>
                          Save Workflow
                        </Button>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div variants={staggerSlow} initial="initial" animate="animate" className="space-y-3">
            {workflows.map((wf) => (
              <motion.div key={wf.id} variants={fadeInUp}>
                <Card className={`transition-opacity ${!wf.enabled ? "opacity-50" : ""}`}>
                  <CardContent>
                    <Box className="space-y-3">
                      <Box className="flex items-start justify-between">
                        <Box className="flex-1 min-w-0">
                          <Box className="flex items-center gap-2">
                            <Text variant="body-md" className="font-semibold">
                              {wf.name}
                            </Text>
                            <Box className={`px-2 py-0.5 rounded-full text-xs ${wf.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-surface-secondary text-content-tertiary"}`}>
                              <Text variant="caption" className="font-medium">
                                {wf.enabled ? "Active" : "Paused"}
                              </Text>
                            </Box>
                          </Box>
                          <Text variant="caption" muted className="mt-0.5">
                            {wf.description}
                          </Text>
                        </Box>
                        <Button
                          variant={wf.enabled ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => toggleWorkflow(wf.id)}
                        >
                          {wf.enabled ? "Pause" : "Enable"}
                        </Button>
                      </Box>

                      <Box className="flex items-center gap-2 text-xs">
                        <Box className="px-2 py-1 rounded bg-surface-secondary">
                          <Text variant="caption" className="font-mono">
                            {wf.trigger}
                          </Text>
                        </Box>
                        <Text variant="caption" muted>{"→"}</Text>
                        {wf.conditions.map((c, i) => (
                          <Box key={i} className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20">
                            <Text variant="caption" className="text-blue-400 font-mono">
                              {c.field} {c.operator} &quot;{c.value}&quot;
                            </Text>
                          </Box>
                        ))}
                        <Text variant="caption" muted>{"→"}</Text>
                        {wf.actions.map((a, i) => (
                          <Box key={i} className={`px-2 py-1 rounded ${actionColor(a.type)}`}>
                            <Text variant="caption" className="font-mono">
                              {a.type}{a.value ? `: ${a.value}` : ""}
                            </Text>
                          </Box>
                        ))}
                      </Box>

                      <Box className="flex items-center gap-4 text-xs">
                        <Text variant="caption" muted>
                          {String(wf.runCount)} runs
                        </Text>
                        <Text variant="caption" muted>
                          Last run: {wf.lastRun}
                        </Text>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </Box>
      </motion.div>
    </Box>
  );
}
