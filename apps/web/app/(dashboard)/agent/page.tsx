"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import { getAccessToken, refreshSession, redirectToLogin } from "../../../lib/auth-token";
import { PlanGate } from "../../../components/plan-gate";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStatus {
  enabled: boolean;
  schedule: string;
  confidenceThreshold: number;
  processedToday: number;
  timeSavedMinutes: number;
}

interface AgentRun {
  id: string;
  startedAt: string;
  status: "completed" | "running" | "failed";
  totalProcessed: number | null;
  stats: { draftsCreated?: number } | null;
}

interface AgentDraft {
  id: string;
  subject: string;
  to: string[];
  body: string;
  confidence: number;
  emailId: string;
}

interface AgentBriefing {
  briefingMarkdown: string | null;
  startedAt: string;
  pendingDraftCount: number;
}

// ─── API helper ───────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const doFetch = async (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token ?? ""}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const newToken = await refreshSession();
    if (!newToken) { redirectToLogin(); throw new Error("Session expired"); }
    res = await doFetch(newToken);
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confidenceColor(score: number): string {
  if (score >= 0.85) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 0.65) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function statusChip(status: AgentRun["status"]): React.ReactNode {
  const map: Record<AgentRun["status"], { label: string; cls: string }> = {
    completed: { label: "Completed", cls: "bg-green-50 text-green-700 border border-green-200" },
    running: { label: "Running", cls: "bg-blue-50 text-blue-700 border border-blue-200" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700 border border-red-200" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }): React.ReactNode {
  return (
    <Box
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

function LoadingSkeleton({ rows = 3 }: { rows?: number }): React.ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Box
          key={i}
          className="h-16 animate-pulse rounded-lg bg-surface-raised"
        />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

// ─── Stats row ────────────────────────────────────────────────────────────────

interface StatsRowProps {
  processedToday: number;
  draftsCount: number;
  timeSavedMinutes: number;
}

function StatsRow({ processedToday, draftsCount, timeSavedMinutes }: StatsRowProps): React.ReactNode {
  const stats = [
    { label: "Emails processed today", value: processedToday.toString() },
    { label: "Drafts awaiting approval", value: draftsCount.toString() },
    {
      label: "Time saved",
      value:
        timeSavedMinutes >= 60
          ? `${Math.floor(timeSavedMinutes / 60)}h ${timeSavedMinutes % 60}m`
          : `${timeSavedMinutes}m`,
    },
  ];

  return (
    <Box className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent>
            <Text variant="caption" className="text-content-subtle">
              {s.label}
            </Text>
            <Text variant="heading-md" className="mt-1 font-semibold text-content">
              {s.value}
            </Text>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
StatsRow.displayName = "StatsRow";

// ─── Drafts table ─────────────────────────────────────────────────────────────

interface DraftsTableProps {
  drafts: AgentDraft[];
  onAction: (id: string, action: "approve" | "reject") => Promise<void>;
  actingId: string | null;
}

function DraftsTable({ drafts, onAction, actingId }: DraftsTableProps): React.ReactNode {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (drafts.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box className="py-10 text-center">
            <Text variant="heading-sm" className="text-content-subtle">
              No drafts waiting
            </Text>
            <Text variant="body-sm" className="mt-1 text-content-subtle">
              The agent will create drafts here when it processes your inbox overnight.
            </Text>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box className="space-y-2" role="list" aria-label="Drafts awaiting approval">
      {drafts.map((draft) => {
        const isExpanded = expanded === draft.id;
        const confidencePct = Math.round(draft.confidence * 100);

        return (
          <Card key={draft.id} className="border-border">
            <CardContent>
              <Box className="flex items-start justify-between gap-4">
                <Box className="min-w-0 flex-1">
                  <Box className="flex items-center gap-2">
                    <Text variant="body-md" className="truncate font-medium text-content">
                      {draft.subject}
                    </Text>
                    <Box
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceColor(draft.confidence)}`}
                    >
                      {confidencePct}% confident
                    </Box>
                  </Box>
                  <Text variant="body-sm" className="mt-0.5 text-content-subtle">
                    To: {Array.isArray(draft.to) ? draft.to.join(", ") : draft.to}
                  </Text>
                  {isExpanded && (
                    <Box className="mt-3 rounded-md border border-border bg-surface-raised p-3">
                      <Text variant="body-sm" className="whitespace-pre-wrap text-content">
                        {draft.body}
                      </Text>
                    </Box>
                  )}
                </Box>
                <Box className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(isExpanded ? null : draft.id)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Collapse draft body" : "Expand draft body"}
                  >
                    {isExpanded ? "Collapse" : "Preview"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAction(draft.id, "approve")}
                    disabled={actingId === draft.id}
                  >
                    {actingId === draft.id ? "Sending…" : "Approve"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => onAction(draft.id, "reject")}
                    disabled={actingId === draft.id}
                  >
                    Reject
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
DraftsTable.displayName = "DraftsTable";

// ─── Runs timeline ────────────────────────────────────────────────────────────

function RunsTimeline({ runs }: { runs: AgentRun[] }): React.ReactNode {
  if (runs.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box className="py-8 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No runs yet. Enable the agent to start processing.
            </Text>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box className="relative space-y-3 pl-6" role="list" aria-label="Agent run history">
      {/* Vertical line */}
      <Box className="absolute left-2 top-2 h-[calc(100%-1rem)] w-px bg-border" />
      {runs.map((run) => (
        <Box key={run.id} className="relative flex items-start gap-3" role="listitem">
          {/* Dot */}
          <Box
            className={`absolute -left-[18px] top-1.5 h-3 w-3 rounded-full border-2 border-surface ${
              run.status === "completed"
                ? "bg-green-500"
                : run.status === "running"
                  ? "bg-blue-500"
                  : "bg-red-500"
            }`}
            aria-hidden="true"
          />
          <Card className="w-full border-border">
            <CardContent>
              <Box className="flex items-center justify-between gap-4">
                <Box>
                  <Text variant="body-sm" className="font-medium text-content">
                    {formatTime(run.startedAt)}
                  </Text>
                  <Text variant="caption" className="text-content-subtle">
                    {run.totalProcessed ?? 0} email{(run.totalProcessed ?? 0) !== 1 ? "s" : ""} processed
                    {(run.stats?.draftsCreated ?? 0) > 0 && (
                      <> · {run.stats?.draftsCreated} draft{(run.stats?.draftsCreated ?? 0) !== 1 ? "s" : ""} created</>
                    )}
                  </Text>
                </Box>
                {statusChip(run.status)}
              </Box>
            </CardContent>
          </Card>
        </Box>
      ))}
    </Box>
  );
}
RunsTimeline.displayName = "RunsTimeline";

// ─── Morning briefing ─────────────────────────────────────────────────────────

function MorningBriefingCard({ briefing }: { briefing: AgentBriefing | null }): React.ReactNode {
  if (!briefing) {
    return (
      <Card>
        <CardHeader>
          <Text variant="heading-sm">Morning Briefing</Text>
        </CardHeader>
        <CardContent>
          <Text variant="body-sm" className="text-content-subtle">
            No briefing available yet. The agent generates one each morning after processing.
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">Morning Briefing</Text>
          <Text variant="caption" className="text-content-subtle">
            {formatDate(briefing.startedAt)}
          </Text>
        </Box>
      </CardHeader>
      <CardContent>
        <Text variant="body-md" className="text-content">
          {briefing.briefingMarkdown ?? "No briefing content available."}
        </Text>
        {(briefing.pendingDraftCount ?? 0) > 0 && (
          <Text variant="body-sm" className="mt-2 text-brand-700">
            {briefing.pendingDraftCount} draft{briefing.pendingDraftCount !== 1 ? "s" : ""} awaiting your approval below.
          </Text>
        )}
      </CardContent>
    </Card>
  );
}
MorningBriefingCard.displayName = "MorningBriefingCard";

// ─── Config panel ─────────────────────────────────────────────────────────────

interface ConfigPanelProps {
  status: AgentStatus;
  onSave: (config: { enabled: boolean; schedule: string; confidenceThreshold: number }) => Promise<void>;
  saving: boolean;
}

const SCHEDULE_OPTIONS = [
  { value: "0 2 * * *", label: "2:00 AM nightly" },
  { value: "0 3 * * *", label: "3:00 AM nightly" },
  { value: "0 4 * * *", label: "4:00 AM nightly" },
  { value: "0 2 * * 1-5", label: "2:00 AM weeknights only" },
];

function ConfigPanel({ status, onSave, saving }: ConfigPanelProps): React.ReactNode {
  const [enabled, setEnabled] = useState(status.enabled);
  const [schedule, setSchedule] = useState(status.schedule);
  const [threshold, setThreshold] = useState(status.confidenceThreshold);

  const isDirty =
    enabled !== status.enabled ||
    schedule !== status.schedule ||
    threshold !== status.confidenceThreshold;

  const handleSubmit = async (): Promise<void> => {
    await onSave({ enabled, schedule, confidenceThreshold: threshold });
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Agent Configuration</Text>
        <Text variant="body-sm" className="text-content-subtle">
          Control when and how the AI agent processes your inbox.
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-6">
          {/* Enable / Disable toggle */}
          <Box className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-4 py-3">
            <Box>
              <Text variant="body-md" className="font-medium text-content">
                Agent enabled
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                The agent will run on schedule and process your inbox overnight.
              </Text>
            </Box>
            <Box
              as="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Enable or disable the AI agent"
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 ${
                enabled ? "bg-brand-600" : "bg-border"
              }`}
            >
              <Box
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </Box>
          </Box>

          {/* Schedule selector */}
          <Box>
            <Text variant="body-sm" className="mb-1.5 font-medium text-content">
              Run schedule
            </Text>
            <select
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              value={schedule}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSchedule(e.target.value)}
              aria-label="Agent schedule"
              disabled={!enabled}
            >
              {SCHEDULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Box>

          {/* Confidence threshold slider */}
          <Box>
            <Box className="mb-1.5 flex items-center justify-between">
              <Text variant="body-sm" className="font-medium text-content">
                Confidence threshold
              </Text>
              <Text variant="body-sm" className="font-medium text-brand-600">
                {Math.round(threshold * 100)}%
              </Text>
            </Box>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setThreshold(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-brand-600 disabled:cursor-not-allowed"
              aria-label="Minimum confidence threshold for drafts"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(threshold * 100)}
              disabled={!enabled}
            />
            <Box className="mt-1 flex justify-between">
              <Text variant="caption" className="text-content-subtle">
                More drafts (lower bar)
              </Text>
              <Text variant="caption" className="text-content-subtle">
                Fewer, surer drafts
              </Text>
            </Box>
          </Box>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!isDirty || saving}
          >
            {saving ? "Saving…" : "Save Configuration"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
ConfigPanel.displayName = "ConfigPanel";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentPage(): React.ReactNode {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [briefing, setBriefing] = useState<AgentBriefing | null>(null);

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [loadingBriefing, setLoadingBriefing] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [actingDraftId, setActingDraftId] = useState<string | null>(null);
  const [togglingAgent, setTogglingAgent] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadAll = useCallback(async (): Promise<void> => {
    setError(null);
    await Promise.allSettled([
      apiFetch<{ data: AgentStatus }>("/v1/agent/status")
        .then((r) => setStatus(r.data))
        .catch((e: unknown) => setError(errMsg(e)))
        .finally(() => setLoadingStatus(false)),
      apiFetch<{ data: AgentRun[] }>("/v1/agent/runs")
        .then((r) => setRuns(r.data))
        .finally(() => setLoadingRuns(false)),
      apiFetch<{ data: { drafts: AgentDraft[] } }>("/v1/agent/drafts")
        .then((r) => setDrafts(r.data.drafts))
        .finally(() => setLoadingDrafts(false)),
      apiFetch<{ data: AgentBriefing }>("/v1/agent/briefing")
        .then((r) => setBriefing(r.data))
        .catch(() => setBriefing(null))
        .finally(() => setLoadingBriefing(false)),
    ]);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleToggleAgent = async (): Promise<void> => {
    if (!status) return;
    setTogglingAgent(true);
    try {
      const next = !status.enabled;
      await apiFetch<{ data: AgentStatus }>("/v1/agent/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: next,
          schedule: status.schedule,
          minDraftConfidence: status.confidenceThreshold,
        }),
      });
      setStatus((prev) => (prev ? { ...prev, enabled: next } : prev));
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setTogglingAgent(false);
    }
  };

  const handleDraftAction = async (id: string, action: "approve" | "reject"): Promise<void> => {
    setActingDraftId(id);
    try {
      await apiFetch<unknown>(`/v1/agent/drafts/${id}/${action}`, { method: "POST" });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setActingDraftId(null);
    }
  };

  const handleSaveConfig = async (config: {
    enabled: boolean;
    schedule: string;
    confidenceThreshold: number;
  }): Promise<void> => {
    setSavingConfig(true);
    try {
      const updated = await apiFetch<{ data: AgentStatus }>("/v1/agent/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: config.enabled,
          schedule: config.schedule,
          minDraftConfidence: config.confidenceThreshold,
        }),
      });
      setStatus(updated.data);
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setSavingConfig(false);
    }
  };

  const agentEnabled = status?.enabled ?? false;

  return (
    <PlanGate feature="ai_agent" required="pro">
      <PageLayout
        title="AI Inbox Agent"
        description="Your AI works while you sleep — processes, triages and drafts replies overnight."
      >
        {error && <ErrorBanner message={error} />}

        {/* Hero banner */}
        <Box className="mb-6 overflow-hidden rounded-xl border border-border bg-surface-raised">
          <Box className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <Box className="flex items-center gap-4">
              {/* Agent status indicator */}
              <Box
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                  agentEnabled ? "bg-brand-100" : "bg-surface"
                } border border-border`}
                aria-hidden="true"
              >
                <Box
                  className={`h-4 w-4 rounded-full ${
                    agentEnabled ? "animate-pulse bg-brand-600" : "bg-border"
                  }`}
                />
              </Box>
              <Box>
                <Text variant="heading-md" className="font-semibold text-content">
                  Your AI works while you sleep
                </Text>
                <Text variant="body-sm" className="text-content-subtle">
                  {agentEnabled
                    ? `Active — running on schedule · ${status?.processedToday ?? 0} emails processed today`
                    : "Agent is paused. Enable it to start processing overnight."}
                </Text>
              </Box>
            </Box>
            <Button
              variant={agentEnabled ? "ghost" : "primary"}
              size="sm"
              onClick={handleToggleAgent}
              disabled={togglingAgent || loadingStatus}
              aria-label={agentEnabled ? "Pause the AI agent" : "Enable the AI agent"}
            >
              {togglingAgent ? "Updating…" : agentEnabled ? "Pause Agent" : "Enable Agent"}
            </Button>
          </Box>
        </Box>

        {/* Stats row */}
        {loadingStatus ? (
          <Box className="mb-6">
            <LoadingSkeleton rows={1} />
          </Box>
        ) : status ? (
          <Box className="mb-6">
            <StatsRow
              processedToday={status.processedToday}
              draftsCount={drafts.length}
              timeSavedMinutes={status.timeSavedMinutes}
            />
          </Box>
        ) : null}

        {/* Two-column layout on wider screens */}
        <Box className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: drafts + runs */}
          <Box className="space-y-6 lg:col-span-2">
            {/* Drafts awaiting approval */}
            <Box>
              <Text variant="heading-sm" className="mb-3 font-semibold text-content">
                Drafts Awaiting Approval
              </Text>
              {loadingDrafts ? (
                <LoadingSkeleton rows={3} />
              ) : (
                <DraftsTable
                  drafts={drafts}
                  onAction={handleDraftAction}
                  actingId={actingDraftId}
                />
              )}
            </Box>

            {/* Recent runs */}
            <Box>
              <Text variant="heading-sm" className="mb-3 font-semibold text-content">
                Recent Runs
              </Text>
              {loadingRuns ? (
                <LoadingSkeleton rows={4} />
              ) : (
                <RunsTimeline runs={runs} />
              )}
            </Box>
          </Box>

          {/* Right: briefing + config */}
          <Box className="space-y-6">
            {loadingBriefing ? (
              <LoadingSkeleton rows={3} />
            ) : (
              <MorningBriefingCard briefing={briefing} />
            )}

            {loadingStatus || !status ? (
              <LoadingSkeleton rows={4} />
            ) : (
              <ConfigPanel
                status={status}
                onSave={handleSaveConfig}
                saving={savingConfig}
              />
            )}
          </Box>
        </Box>
      </PageLayout>
    </PlanGate>
  );
}
