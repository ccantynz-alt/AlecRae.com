"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import {
  aiRulesApi,
  autoResponderApi,
  workflowsApi,
  type EmailRuleData,
  type AutoResponderData,
  type AutoResponderMode,
  type WorkflowData,
  type WorkflowTemplateData,
  type WorkflowStatsData,
} from "../../../lib/api-features";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ErrorBanner({ message }: { message: string }): React.ReactNode {
  return (
    <Box className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
    </Box>
  );
}

ErrorBanner.displayName = "ErrorBanner";

function LoadingSkeleton(): React.ReactNode {
  return (
    <Box className="space-y-4" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
      ))}
    </Box>
  );
}

LoadingSkeleton.displayName = "LoadingSkeleton";

// ─── Main page (tabbed) ──────────────────────────────────────────────────────

type AutomationsTab = "rules" | "responder" | "workflows";

const TABS: { id: AutomationsTab; label: string }[] = [
  { id: "rules", label: "AI Rules" },
  { id: "responder", label: "Auto-Responder" },
  { id: "workflows", label: "Workflows" },
];

export default function AutomationsPage(): React.ReactNode {
  const [tab, setTab] = useState<AutomationsTab>("rules");

  const handleTabKeyDown = (e: React.KeyboardEvent): void => {
    const idx = TABS.findIndex((t) => t.id === tab);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = TABS[(idx + 1) % TABS.length];
      if (next) setTab(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = TABS[(idx - 1 + TABS.length) % TABS.length];
      if (prev) setTab(prev.id);
    }
  };

  return (
    <PageLayout
      title="Automations"
      description="AI rules, vacation auto-responder, and multi-step workflows."
    >
      <Box
        className="mb-6 flex gap-1 rounded-lg border border-border bg-surface-secondary p-1 w-fit"
        role="tablist"
        aria-label="Automation sections"
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((t) => (
          <Box
            key={t.id}
            as="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
              tab === t.id
                ? "bg-surface text-content shadow-sm"
                : "text-content-tertiary hover:text-content"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Box>
        ))}
      </Box>

      <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "rules" && <RulesSection />}
        {tab === "responder" && <AutoResponderSection />}
        {tab === "workflows" && <WorkflowsSection />}
      </Box>
    </PageLayout>
  );
}

// ─── AI Rules ────────────────────────────────────────────────────────────────

function RulesSection(): React.ReactNode {
  const [rules, setRules] = useState<EmailRuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await aiRulesApi.list();
      setRules(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateFromText = async (): Promise<void> => {
    if (!instruction.trim()) return;
    setCreating(true);
    setError(null);
    setPreview(null);
    try {
      const res = await aiRulesApi.createFromText(instruction.trim());
      setRules((prev) => [...prev, res.data.rule]);
      setPreview(res.data.preview);
      setInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (rule: EmailRuleData): Promise<void> => {
    try {
      const res = await aiRulesApi.update(rule.id, { enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? res.data : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule");
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await aiRulesApi.remove(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  return (
    <Box className="space-y-6">
      {error && <ErrorBanner message={error} />}

      <Card>
        <CardHeader>
          <Text variant="heading-sm">Create a rule in plain English</Text>
          <Text variant="body-sm" muted>
            Describe what should happen and AI builds the rule. e.g. &ldquo;Archive
            all newsletters and label them Reading&rdquo;.
          </Text>
        </CardHeader>
        <CardContent>
          <Box className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Box className="flex-1">
              <Input
                label="Instruction"
                variant="text"
                placeholder="e.g. Move emails from billing@ to the Finance folder"
                value={instruction}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInstruction(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") void handleCreateFromText();
                }}
              />
            </Box>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateFromText}
              disabled={creating || !instruction.trim()}
            >
              {creating ? "Generating..." : "Create with AI"}
            </Button>
          </Box>
          {preview && (
            <Box className="mt-3 rounded-md border border-accent/30 bg-accent/10 p-3">
              <Text variant="body-sm" className="text-accent">
                {preview}
              </Text>
            </Box>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <LoadingSkeleton />
      ) : rules.length === 0 ? (
        <Card>
          <CardContent>
            <Box className="py-8 text-center">
              <Text variant="heading-sm" muted className="mb-2">
                No rules yet
              </Text>
              <Text variant="body-sm" muted>
                Create your first AI-powered email rule above.
              </Text>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id} className="border-border">
              <CardContent>
                <Box className="flex items-start justify-between gap-4">
                  <Box className="min-w-0 flex-1">
                    <Box className="flex items-center gap-2">
                      <Text variant="body-md" className="font-semibold truncate">
                        {rule.name}
                      </Text>
                      <Box
                        className={`rounded-full px-2 py-0.5 ${
                          rule.enabled ? "bg-status-success/10" : "bg-surface-secondary"
                        }`}
                      >
                        <Text
                          variant="caption"
                          className={rule.enabled ? "text-status-success" : "text-content-tertiary"}
                        >
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </Text>
                      </Box>
                    </Box>
                    {rule.description && (
                      <Text variant="body-sm" muted className="mt-0.5">
                        {rule.description}
                      </Text>
                    )}
                    <Text variant="caption" muted className="mt-1 block">
                      When {rule.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(rule.matchMode === "all" ? " AND " : " OR ")}
                      {" → "}
                      {rule.actions.map((a) => a.type + (a.value ? ` "${a.value}"` : "")).join(", ")}
                      {" · matched "}
                      {rule.matchCount} time{rule.matchCount !== 1 ? "s" : ""}
                    </Text>
                  </Box>
                  <Box className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleToggle(rule)}>
                      {rule.enabled ? "Disable" : "Enable"}
                    </Button>
                    {deleteConfirmId === rule.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          Confirm
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(rule.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </Button>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}

RulesSection.displayName = "RulesSection";

// ─── Auto-Responder ──────────────────────────────────────────────────────────

const RESPONDER_MODES: { value: AutoResponderMode; label: string }[] = [
  { value: "vacation", label: "Vacation" },
  { value: "busy", label: "Busy" },
  { value: "custom", label: "Custom" },
  { value: "off", label: "Off" },
];

function AutoResponderSection(): React.ReactNode {
  const [config, setConfig] = useState<AutoResponderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AutoResponderMode>("vacation");
  const [subject, setSubject] = useState("");
  const [textBody, setTextBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await autoResponderApi.get();
      setConfig(res.data);
      if (res.data) {
        setMode(res.data.mode);
        setSubject(res.data.subject);
        setTextBody(res.data.textBody ?? "");
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load auto-responder");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (): Promise<void> => {
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await autoResponderApi.upsert({
        mode,
        subject: subject.trim(),
        textBody: textBody.trim(),
      });
      setSavedAt(new Date().toISOString());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save auto-responder");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (): Promise<void> => {
    if (!config) return;
    setToggling(true);
    setError(null);
    try {
      if (config.isActive) {
        await autoResponderApi.deactivate();
      } else {
        await autoResponderApi.activate();
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle auto-responder");
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <Box className="max-w-2xl space-y-6">
      {error && <ErrorBanner message={error} />}

      <Card>
        <CardHeader>
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="heading-sm">Out-of-office reply</Text>
              <Text variant="body-sm" muted>
                Automatically reply to incoming email while you are away.
              </Text>
            </Box>
            {config && (
              <Box
                className={`rounded-full px-3 py-1 ${
                  config.isActive ? "bg-status-success/10" : "bg-surface-secondary"
                }`}
              >
                <Text
                  variant="body-sm"
                  className={config.isActive ? "text-status-success font-medium" : "text-content-tertiary"}
                >
                  {config.isActive ? "Active" : "Inactive"}
                </Text>
              </Box>
            )}
          </Box>
        </CardHeader>
        <CardContent>
          <Box className="space-y-4">
            <Box>
              <Text variant="body-sm" className="mb-1.5 font-medium text-content">
                Mode
              </Text>
              <Box className="flex flex-wrap gap-2" role="radiogroup" aria-label="Auto-responder mode">
                {RESPONDER_MODES.map((m) => (
                  <Button
                    key={m.value}
                    variant={mode === m.value ? "secondary" : "ghost"}
                    size="sm"
                    role="radio"
                    aria-checked={mode === m.value}
                    onClick={() => setMode(m.value)}
                  >
                    {m.label}
                  </Button>
                ))}
              </Box>
            </Box>
            <Input
              label="Reply subject"
              variant="text"
              placeholder="e.g. Out of office until June 20"
              value={subject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
            />
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content">
                Reply message
              </Text>
              <textarea
                className="w-full rounded-md border border-border bg-surface p-3 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                rows={5}
                placeholder="I'm away until June 20 and will reply when I'm back."
                value={textBody}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTextBody(e.target.value)}
                aria-label="Reply message"
              />
            </Box>
            <Box className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || !subject.trim()}
              >
                {saving ? "Saving..." : config ? "Save Changes" : "Create Auto-Responder"}
              </Button>
              {config && (
                <Button
                  variant={config.isActive ? "ghost" : "secondary"}
                  size="sm"
                  onClick={handleToggleActive}
                  disabled={toggling}
                >
                  {toggling
                    ? "Working..."
                    : config.isActive
                      ? "Deactivate"
                      : "Activate"}
                </Button>
              )}
              {savedAt && (
                <Text variant="body-sm" className="text-status-success">
                  Saved
                </Text>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

AutoResponderSection.displayName = "AutoResponderSection";

// ─── Workflows ───────────────────────────────────────────────────────────────

function WorkflowsSection(): React.ReactNode {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateData[]>([]);
  const [stats, setStats] = useState<WorkflowStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [wfRes, tplRes, statsRes] = await Promise.all([
        workflowsApi.list({ limit: 50 }),
        workflowsApi.templates().catch(() => ({ data: [] as WorkflowTemplateData[] })),
        workflowsApi.stats().catch(() => ({ data: null })),
      ]);
      setWorkflows(wfRes.data);
      setTemplates(tplRes.data);
      setStats(statsRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (wf: WorkflowData): Promise<void> => {
    try {
      const res = await workflowsApi.toggle(wf.id);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === wf.id ? { ...w, isActive: res.data.isActive } : w)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle workflow");
    }
  };

  const handleRun = async (wf: WorkflowData): Promise<void> => {
    setRunningId(wf.id);
    setRunResult(null);
    try {
      const res = await workflowsApi.run(wf.id);
      setRunResult(
        `"${wf.name}" ran ${res.data.actionsExecuted}/${res.data.totalActions} actions (${res.data.run.status}).`,
      );
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === wf.id
            ? { ...w, runCount: w.runCount + 1, lastRunAt: new Date().toISOString() }
            : w,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run workflow");
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await workflowsApi.remove(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  };

  const handleUseTemplate = async (tpl: WorkflowTemplateData): Promise<void> => {
    setUsingTemplateId(tpl.id);
    try {
      const res = await workflowsApi.fromTemplate(tpl.id, { name: tpl.name });
      setWorkflows((prev) => [res.data, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create from template");
    } finally {
      setUsingTemplateId(null);
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <Box className="space-y-6">
      {error && <ErrorBanner message={error} />}
      {runResult && (
        <Box className="rounded-md border border-accent/30 bg-accent/10 p-3" role="status">
          <Text variant="body-sm" className="text-accent">
            {runResult}
          </Text>
        </Box>
      )}

      {stats && (
        <Box className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Workflows", value: stats.totalWorkflows },
            { label: "Active", value: stats.activeWorkflows },
            { label: "Total runs", value: stats.totalRuns },
            { label: "Success rate", value: `${stats.successRate}%` },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent>
                <Text variant="caption" muted>
                  {s.label}
                </Text>
                <Text variant="heading-md" className="font-semibold">
                  {s.value}
                </Text>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <CreateWorkflowForm
        onCreated={(wf) => setWorkflows((prev) => [wf, ...prev])}
      />

      {workflows.length === 0 ? (
        <Card>
          <CardContent>
            <Box className="py-8 text-center">
              <Text variant="heading-sm" muted className="mb-2">
                No workflows yet
              </Text>
              <Text variant="body-sm" muted>
                Create a workflow above or start from a template below.
              </Text>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box className="space-y-3">
          {workflows.map((wf) => (
            <Card key={wf.id} className="border-border">
              <CardContent>
                <Box className="flex items-start justify-between gap-4">
                  <Box className="min-w-0 flex-1">
                    <Box className="flex items-center gap-2">
                      <Text variant="body-md" className="font-semibold truncate">
                        {wf.name}
                      </Text>
                      <Box
                        className={`rounded-full px-2 py-0.5 ${
                          wf.isActive ? "bg-status-success/10" : "bg-surface-secondary"
                        }`}
                      >
                        <Text
                          variant="caption"
                          className={wf.isActive ? "text-status-success" : "text-content-tertiary"}
                        >
                          {wf.isActive ? "Active" : "Paused"}
                        </Text>
                      </Box>
                    </Box>
                    {wf.description && (
                      <Text variant="body-sm" muted className="mt-0.5 truncate">
                        {wf.description}
                      </Text>
                    )}
                    <Text variant="caption" muted className="mt-1 block">
                      Trigger: {wf.trigger.type.replace(/_/g, " ")} · {wf.actions.length} action
                      {wf.actions.length !== 1 ? "s" : ""} · {wf.runCount} run
                      {wf.runCount !== 1 ? "s" : ""} · last run {formatDate(wf.lastRunAt)}
                    </Text>
                  </Box>
                  <Box className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRun(wf)}
                      disabled={runningId === wf.id}
                    >
                      {runningId === wf.id ? "Running..." : "Run"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggle(wf)}>
                      {wf.isActive ? "Pause" : "Resume"}
                    </Button>
                    {deleteConfirmId === wf.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(wf.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          Confirm
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(wf.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </Button>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Templates</Text>
            <Text variant="body-sm" muted>
              Pre-built workflows you can enable in one click.
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-2">
              {templates.map((tpl) => (
                <Box
                  key={tpl.id}
                  className="flex items-center justify-between gap-4 rounded-lg bg-surface-secondary p-3"
                >
                  <Box className="min-w-0 flex-1">
                    <Text variant="body-sm" className="font-medium">
                      {tpl.name}
                    </Text>
                    {tpl.description && (
                      <Text variant="caption" muted className="truncate">
                        {tpl.description}
                      </Text>
                    )}
                  </Box>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleUseTemplate(tpl)}
                    disabled={usingTemplateId === tpl.id}
                  >
                    {usingTemplateId === tpl.id ? "Adding..." : "Use template"}
                  </Button>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

WorkflowsSection.displayName = "WorkflowsSection";

// ─── Create workflow form ────────────────────────────────────────────────────

const TRIGGER_TYPES = ["email_received", "email_sent", "schedule", "manual"] as const;
const ACTION_TYPES = [
  "label",
  "archive",
  "reply",
  "forward",
  "move",
  "notify",
  "webhook",
  "ai_classify",
] as const;

function CreateWorkflowForm({
  onCreated,
}: {
  onCreated: (wf: WorkflowData) => void;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] =
    useState<(typeof TRIGGER_TYPES)[number]>("email_received");
  const [triggerFrom, setTriggerFrom] = useState("");
  const [actionType, setActionType] = useState<(typeof ACTION_TYPES)[number]>("label");
  const [actionValue, setActionValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await workflowsApi.create({
        name: name.trim(),
        trigger: {
          type: triggerType,
          conditions: triggerFrom.trim() ? { from: triggerFrom.trim() } : {},
        },
        actions: [
          {
            type: actionType,
            config: actionValue.trim() ? { value: actionValue.trim() } : {},
          },
        ],
        isActive: true,
      });
      onCreated(res.data);
      setName("");
      setTriggerFrom("");
      setActionValue("");
      setExpanded(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create workflow");
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <Box>
        <Button variant="primary" size="sm" onClick={() => setExpanded(true)}>
          New Workflow
        </Button>
      </Box>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <Text variant="heading-sm">Create workflow</Text>
      </CardHeader>
      <CardContent>
        {formError && <ErrorBanner message={formError} />}
        <Box className="space-y-4">
          <Input
            label="Workflow name"
            variant="text"
            placeholder="e.g. Label invoices"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
          <Box className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content">
                Trigger
              </Text>
              <select
                className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={triggerType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTriggerType(e.target.value as (typeof TRIGGER_TYPES)[number])
                }
                aria-label="Trigger type"
              >
                {TRIGGER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Box>
            <Input
              label="From filter (optional)"
              variant="text"
              placeholder="e.g. billing@vendor.com"
              value={triggerFrom}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTriggerFrom(e.target.value)}
            />
          </Box>
          <Box className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content">
                Action
              </Text>
              <select
                className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={actionType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setActionType(e.target.value as (typeof ACTION_TYPES)[number])
                }
                aria-label="Action type"
              >
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Box>
            <Input
              label="Action value (optional)"
              variant="text"
              placeholder='e.g. "Invoices" for label/move'
              value={actionValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActionValue(e.target.value)}
            />
          </Box>
          <Box className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !name.trim()}
            >
              {saving ? "Creating..." : "Create Workflow"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

CreateWorkflowForm.displayName = "CreateWorkflowForm";
