"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import {
  agentApi,
  type AgentRunData,
  type AgentDraftData,
  type AgentConfigData,
} from "../../../lib/api-features";
import { PlanGate } from "../../../components/plan-gate";

function StatusDot({ active }: { active: boolean }): React.ReactNode {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${active ? "bg-green-500" : "bg-gray-300"}`}
      aria-hidden="true"
    />
  );
}

function ConfidencePill({ value }: { value: number }): React.ReactNode {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-green-100 text-green-700" : pct >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {pct}% confidence
    </span>
  );
}

function LoadingSkeleton(): React.ReactNode {
  return (
    <Box className="space-y-4" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
      ))}
    </Box>
  );
}

export default function AgentPage(): React.ReactNode {
  const [status, setStatus] = useState<{ enabled: boolean; lastRun?: string; emailsProcessedToday: number; draftsWaiting: number } | null>(null);
  const [runs, setRuns] = useState<AgentRunData[]>([]);
  const [drafts, setDrafts] = useState<AgentDraftData[]>([]);
  const [config, setConfig] = useState<AgentConfigData | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [statusRes, runsRes, draftsRes, cfgRes, briefRes] = await Promise.allSettled([
        agentApi.status(),
        agentApi.runs(),
        agentApi.drafts(),
        agentApi.config(),
        agentApi.briefing(),
      ]);
      if (statusRes.status === "fulfilled") setStatus(statusRes.value.data);
      if (runsRes.status === "fulfilled") setRuns(runsRes.value.data);
      if (draftsRes.status === "fulfilled") setDrafts(draftsRes.value.data);
      if (cfgRes.status === "fulfilled") setConfig(cfgRes.value.data);
      if (briefRes.status === "fulfilled") setBriefing(briefRes.value.data.text);
    } catch {
      setError("Unable to load agent data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDraftAction = async (id: string, action: "approve" | "reject"): Promise<void> => {
    try {
      if (action === "approve") await agentApi.approveDraft(id);
      else await agentApi.rejectDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError("Failed to process draft");
    }
  };

  const toggleAgent = async (): Promise<void> => {
    if (!config) return;
    const updated = await agentApi.updateConfig({ enabled: !config.enabled });
    setConfig(updated.data);
    setStatus((prev) => prev ? { ...prev, enabled: !config.enabled } : prev);
  };

  return (
    <PlanGate feature="ai_agent" required="pro">
      <PageLayout title="AI Inbox Agent" description="Your AI works while you sleep — triaging, drafting replies, and keeping your inbox clear.">
        {loading ? (
          <LoadingSkeleton />
        ) : error && !status ? (
          <Box className="p-6 text-center">
            <Text className="text-content-subtle">{error}</Text>
          </Box>
        ) : (
          <Box className="space-y-6">
            {/* Status bar */}
            <Box className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-surface-raised border border-border">
              <StatusDot active={status?.enabled ?? false} />
              <Text variant="body-sm" className="font-semibold">
                Agent {status?.enabled ? "Active" : "Paused"}
              </Text>
              {status?.lastRun && (
                <Text variant="caption" className="text-content-subtle">
                  Last run: {new Date(status.lastRun).toLocaleString()}
                </Text>
              )}
              <Box className="ml-auto flex gap-2">
                <Button
                  variant={status?.enabled ? "outline" : "primary"}
                  size="sm"
                  onClick={() => void toggleAgent()}
                >
                  {status?.enabled ? "Pause Agent" : "Enable Agent"}
                </Button>
              </Box>
            </Box>

            {/* Stats row */}
            <Box className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: "Emails Processed Today", value: status?.emailsProcessedToday ?? 0 },
                { label: "Drafts Awaiting Review", value: status?.draftsWaiting ?? drafts.length },
                { label: "Active Runs", value: runs.filter((r) => r.status === "running").length },
              ].map(({ label, value }) => (
                <Box key={label} className="p-4 rounded-xl bg-surface-raised border border-border text-center">
                  <Text variant="body-sm" className="text-2xl font-bold text-content">{value}</Text>
                  <Text variant="caption" className="text-content-subtle mt-1">{label}</Text>
                </Box>
              ))}
            </Box>

            {/* Morning briefing */}
            {briefing && (
              <Card>
                <CardHeader>
                  <Text variant="body-sm" className="text-sm font-semibold">Today's Briefing</Text>
                </CardHeader>
                <CardContent>
                  <Text variant="body-sm" className="text-content-subtle whitespace-pre-line">{briefing}</Text>
                </CardContent>
              </Card>
            )}

            {/* Drafts awaiting approval */}
            <Card>
              <CardHeader>
                <Text variant="body-sm" className="text-sm font-semibold">
                  Drafts Awaiting Approval ({drafts.length})
                </Text>
              </CardHeader>
              <CardContent>
                {drafts.length === 0 ? (
                  <Text variant="body-sm" className="text-content-subtle text-center py-6">
                    No drafts waiting — you're all caught up.
                  </Text>
                ) : (
                  <Box className="space-y-3">
                    {drafts.map((draft) => (
                      <Box
                        key={draft.id}
                        className="p-4 rounded-lg border border-border bg-surface"
                      >
                        <Box className="flex items-start justify-between gap-3 mb-2">
                          <Box>
                            <Text variant="body-sm" className="font-medium">{draft.subject}</Text>
                            <Text variant="caption" className="text-content-subtle">
                              Re: {draft.fromName} ({draft.fromEmail})
                            </Text>
                          </Box>
                          <ConfidencePill value={draft.confidence} />
                        </Box>
                        <Box className="p-3 rounded bg-surface-secondary mb-3">
                          <Text variant="caption" className="text-content-subtle line-clamp-3">
                            {draft.draftBody}
                          </Text>
                        </Box>
                        <Box className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void handleDraftAction(draft.id, "approve")}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDraftAction(draft.id, "reject")}
                          >
                            Reject
                          </Button>
                          <a
                            href={`/compose?replyTo=${draft.emailId}`}
                            className="inline-flex items-center px-3 py-1.5 text-sm rounded-md text-content-subtle hover:text-content hover:bg-surface-secondary transition-colors"
                          >
                            Edit
                          </a>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Recent runs */}
            <Card>
              <CardHeader>
                <Text variant="body-sm" className="text-sm font-semibold">Recent Runs</Text>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <Text variant="body-sm" className="text-content-subtle text-center py-4">
                    No runs yet. Enable the agent to get started.
                  </Text>
                ) : (
                  <Box className="space-y-2">
                    {runs.slice(0, 10).map((run) => (
                      <Box key={run.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <StatusDot active={run.status === "completed"} />
                        <Box className="flex-1">
                          <Text variant="body-sm" className="font-medium capitalize">{run.status}</Text>
                          <Text variant="caption" className="text-content-subtle">
                            {new Date(run.startedAt).toLocaleString()} · {run.emailsProcessed} emails · {run.draftsCreated} drafts
                          </Text>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Config panel */}
            {config && (
              <Card>
                <CardHeader>
                  <Text variant="body-sm" className="text-sm font-semibold">Agent Settings</Text>
                </CardHeader>
                <CardContent>
                  <Box className="space-y-4">
                    <Box className="flex items-center justify-between">
                      <Box>
                        <Text variant="body-sm" className="font-medium">Schedule</Text>
                        <Text variant="caption" className="text-content-subtle">When should the agent run?</Text>
                      </Box>
                      <select
                        className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-content"
                        value={config.schedule}
                        onChange={(e) => {
                          void agentApi.updateConfig({ schedule: e.target.value as AgentConfigData["schedule"] })
                            .then((r) => setConfig(r.data));
                        }}
                      >
                        <option value="overnight">Overnight only</option>
                        <option value="always">Always on</option>
                        <option value="manual">Manual trigger</option>
                      </select>
                    </Box>
                    <Box className="flex items-center justify-between">
                      <Box>
                        <Text variant="body-sm" className="font-medium">Confidence Threshold</Text>
                        <Text variant="caption" className="text-content-subtle">Minimum confidence to create a draft</Text>
                      </Box>
                      <Text variant="body-sm" className="font-semibold text-brand-700">
                        {Math.round(config.confidenceThreshold * 100)}%
                      </Text>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )}
          </Box>
        )}
      </PageLayout>
    </PlanGate>
  );
}
