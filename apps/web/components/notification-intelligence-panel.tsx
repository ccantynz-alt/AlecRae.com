"use client";

/**
 * Notification Intelligence panel — the AI layer of the Notification Center.
 *
 * Three sections, each wired to /v1/notifications/* (see
 * lib/api-notification-intelligence.ts for the endpoint map):
 *   1. Smart Notification Rules — list / create / toggle / delete AI rules
 *   2. Pending Batches & Digest — AI-batched notifications + digest summary
 *   3. Test an Email — evaluate how a sample email would be handled
 *
 * Self-contained: does its own loading/error/empty handling so the host page
 * (notifications/page.tsx) degrades gracefully if this domain errors.
 */

import { useCallback, useEffect, useState } from "react";
import { Box, Button, Card, CardContent, CardHeader, Input, Text } from "@alecrae/ui";
import {
  notificationIntelligenceApi,
  type EvaluateResult,
  type NotificationBatch,
  type NotificationDigest,
  type NotificationRule,
  type NotificationRuleAction,
  type RuleConditions,
} from "../lib/api-notification-intelligence";

// ─── Constants + helpers ─────────────────────────────────────────────────────

const ACTION_OPTIONS: readonly {
  value: NotificationRuleAction;
  label: string;
}[] = [
  { value: "notify_immediately", label: "Notify immediately" },
  { value: "batch_hourly", label: "Batch hourly" },
  { value: "batch_daily", label: "Batch daily" },
  { value: "summary_only", label: "Summary only" },
  { value: "suppress", label: "Suppress" },
];

const ACTION_LABELS: Record<string, string> = {
  notify_immediately: "Notify immediately",
  batch_hourly: "Batch hourly",
  batch_daily: "Batch daily",
  summary_only: "Summary only",
  suppress: "Suppress",
  deferred: "Deferred (focus session)",
};

const ACTION_BADGE_CLASSES: Record<string, string> = {
  notify_immediately: "bg-brand-100 text-brand-700",
  batch_hourly: "bg-blue-100 text-blue-700",
  batch_daily: "bg-blue-100 text-blue-700",
  summary_only: "bg-purple-100 text-purple-700",
  suppress: "bg-gray-200 text-gray-600",
  deferred: "bg-amber-100 text-amber-700",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function actionBadgeClass(action: string): string {
  return ACTION_BADGE_CLASSES[action] ?? "bg-gray-100 text-gray-600";
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function describeConditions(conditions: RuleConditions): string {
  const parts: string[] = [];
  if (conditions.senderVip) parts.push("VIP senders");
  if (conditions.urgencyMin !== undefined)
    parts.push(`urgency ≥ ${conditions.urgencyMin}`);
  if (conditions.keywords && conditions.keywords.length > 0)
    parts.push(`keywords: ${conditions.keywords.join(", ")}`);
  if (conditions.labels && conditions.labels.length > 0)
    parts.push(`labels: ${conditions.labels.join(", ")}`);
  if (conditions.timeRange)
    parts.push(`between ${conditions.timeRange.start}–${conditions.timeRange.end}`);
  return parts.length > 0 ? parts.join(" · ") : "Matches every email";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Small shared pieces ─────────────────────────────────────────────────────

function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <Box
      className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </Box>
  );
}

function Skeleton({ rows }: { rows: number }): React.JSX.Element {
  return (
    <Box className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-14 animate-pulse rounded-lg bg-surface-raised"
          aria-hidden="true"
        />
      ))}
    </Box>
  );
}

function Switch({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={[
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
        checked ? "bg-brand-600" : "bg-surface-raised border border-border",
        disabled ? "cursor-not-allowed opacity-40" : "",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-content">
      {children}
    </label>
  );
}

// ─── Create-rule form ────────────────────────────────────────────────────────

interface CreateRuleFormProps {
  onCreated: (rule: NotificationRule) => void;
  onCancel: () => void;
}

function CreateRuleForm({ onCreated, onCancel }: CreateRuleFormProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [action, setAction] = useState<NotificationRuleAction>("notify_immediately");
  const [priority, setPriority] = useState("0");
  const [urgencyMin, setUrgencyMin] = useState("");
  const [keywords, setKeywords] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      if (!name.trim()) {
        setError("Give the rule a name");
        return;
      }
      const conditions: RuleConditions = {};
      if (vipOnly) conditions.senderVip = true;
      const urgency = urgencyMin.trim() === "" ? null : Number(urgencyMin);
      if (urgency !== null && Number.isFinite(urgency)) {
        conditions.urgencyMin = Math.min(100, Math.max(0, Math.round(urgency)));
      }
      const kw = keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      if (kw.length > 0) conditions.keywords = kw;
      if (timeStart && timeEnd) conditions.timeRange = { start: timeStart, end: timeEnd };

      const priorityNum = Number(priority);
      setSubmitting(true);
      setError(null);
      try {
        const res = await notificationIntelligenceApi.createRule({
          name: name.trim(),
          conditions,
          action,
          isActive: true,
          priority: Number.isFinite(priorityNum)
            ? Math.min(1000, Math.max(0, Math.round(priorityNum)))
            : 0,
        });
        onCreated({ ...res.data, updatedAt: res.data.createdAt });
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setSubmitting(false);
      }
    },
    [name, action, priority, urgencyMin, keywords, vipOnly, timeStart, timeEnd, onCreated],
  );

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-xl border border-border bg-surface-raised p-4"
      aria-label="Create notification rule"
    >
      {error && (
        <Box className="rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
      )}

      <Box className="grid gap-4 sm:grid-cols-2">
        <Box>
          <FieldLabel htmlFor="ni-rule-name">Rule name</FieldLabel>
          <Input
            id="ni-rule-name"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="e.g. Urgent client emails"
            required
            aria-required="true"
          />
        </Box>
        <Box>
          <FieldLabel htmlFor="ni-rule-action">Action</FieldLabel>
          <Box
            as="select"
            id="ni-rule-action"
            value={action}
            onChange={(e) =>
              setAction((e.target as HTMLSelectElement).value as NotificationRuleAction)
            }
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-content"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Box>
        </Box>
      </Box>

      <Box className="grid gap-4 sm:grid-cols-2">
        <Box>
          <FieldLabel htmlFor="ni-rule-urgency">Minimum urgency (0–100, optional)</FieldLabel>
          <Input
            id="ni-rule-urgency"
            type="number"
            min={0}
            max={100}
            value={urgencyMin}
            onChange={(e) => setUrgencyMin((e.target as HTMLInputElement).value)}
            placeholder="e.g. 70"
          />
        </Box>
        <Box>
          <FieldLabel htmlFor="ni-rule-priority">Rule priority (higher wins)</FieldLabel>
          <Input
            id="ni-rule-priority"
            type="number"
            min={0}
            max={1000}
            value={priority}
            onChange={(e) => setPriority((e.target as HTMLInputElement).value)}
          />
        </Box>
      </Box>

      <Box>
        <FieldLabel htmlFor="ni-rule-keywords">Subject keywords (comma separated, optional)</FieldLabel>
        <Input
          id="ni-rule-keywords"
          value={keywords}
          onChange={(e) => setKeywords((e.target as HTMLInputElement).value)}
          placeholder="invoice, urgent, contract"
        />
      </Box>

      <Box className="grid gap-4 sm:grid-cols-2">
        <Box>
          <FieldLabel htmlFor="ni-rule-time-start">Active from (optional)</FieldLabel>
          <input
            id="ni-rule-time-start"
            type="time"
            value={timeStart}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimeStart(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          />
        </Box>
        <Box>
          <FieldLabel htmlFor="ni-rule-time-end">Active until</FieldLabel>
          <input
            id="ni-rule-time-end"
            type="time"
            value={timeEnd}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimeEnd(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          />
        </Box>
      </Box>

      <Box className="flex items-center justify-between gap-4 py-1">
        <Text variant="body-sm" className="font-medium text-content">
          Only VIP senders
        </Text>
        <Switch
          checked={vipOnly}
          onToggle={() => setVipOnly((v) => !v)}
          label="Only VIP senders"
        />
      </Box>

      <Box className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create rule"}
        </Button>
      </Box>
    </form>
  );
}

// ─── Rule row ────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onToggle,
  onDelete,
  busy,
}: {
  rule: NotificationRule;
  onToggle: (rule: NotificationRule) => void;
  onDelete: (rule: NotificationRule) => void;
  busy: boolean;
}): React.JSX.Element {
  return (
    <Box className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
      <Box className="min-w-0 flex-1">
        <Box className="flex flex-wrap items-center gap-2">
          <Text variant="body-sm" className="font-medium text-content">
            {rule.name}
          </Text>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${actionBadgeClass(rule.action)}`}
          >
            {actionLabel(rule.action)}
          </span>
          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-content-subtle">
            Priority {rule.priority}
          </span>
        </Box>
        <Text variant="body-sm" muted className="mt-0.5 text-xs">
          {describeConditions(rule.conditions)}
        </Text>
      </Box>
      <Box className="flex flex-shrink-0 items-center gap-2">
        <Switch
          checked={rule.isActive}
          onToggle={() => onToggle(rule)}
          label={`${rule.isActive ? "Disable" : "Enable"} rule ${rule.name}`}
          disabled={busy}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(rule)}
          disabled={busy}
          aria-label={`Delete rule ${rule.name}`}
        >
          Delete
        </Button>
      </Box>
    </Box>
  );
}

// ─── Evaluate panel ──────────────────────────────────────────────────────────

function EvaluatePanel(): React.JSX.Element {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [urgency, setUrgency] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateResult | null>(null);

  const handleEvaluate = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      if (!from.trim() || !subject.trim()) {
        setError("Enter a sender and a subject");
        return;
      }
      setRunning(true);
      setError(null);
      setResult(null);
      try {
        const urgencyNum = urgency.trim() === "" ? null : Number(urgency);
        const res = await notificationIntelligenceApi.evaluate({
          emailId: `test-${Date.now().toString(36)}`,
          from: from.trim(),
          subject: subject.trim(),
          ...(urgencyNum !== null && Number.isFinite(urgencyNum)
            ? { urgencyScore: Math.min(100, Math.max(0, Math.round(urgencyNum))) }
            : {}),
        });
        setResult(res.data);
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setRunning(false);
      }
    },
    [from, subject, urgency],
  );

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Test an Email</Text>
        <Text variant="body-sm" muted>
          See how your rules (and any active focus session) would handle an incoming email.
        </Text>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void handleEvaluate(e)}
          className="space-y-4"
          aria-label="Evaluate a sample email"
        >
          <Box className="grid gap-4 sm:grid-cols-2">
            <Box>
              <FieldLabel htmlFor="ni-eval-from">From</FieldLabel>
              <Input
                id="ni-eval-from"
                type="email"
                value={from}
                onChange={(e) => setFrom((e.target as HTMLInputElement).value)}
                placeholder="boss@company.com"
                required
                aria-required="true"
              />
            </Box>
            <Box>
              <FieldLabel htmlFor="ni-eval-urgency">Urgency score (0–100, optional)</FieldLabel>
              <Input
                id="ni-eval-urgency"
                type="number"
                min={0}
                max={100}
                value={urgency}
                onChange={(e) => setUrgency((e.target as HTMLInputElement).value)}
                placeholder="e.g. 85"
              />
            </Box>
          </Box>
          <Box>
            <FieldLabel htmlFor="ni-eval-subject">Subject</FieldLabel>
            <Input
              id="ni-eval-subject"
              value={subject}
              onChange={(e) => setSubject((e.target as HTMLInputElement).value)}
              placeholder="URGENT: contract needs signature today"
              required
              aria-required="true"
            />
          </Box>

          {error && (
            <Box className="rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert">
              <Text variant="body-sm" className="text-red-800">
                {error}
              </Text>
            </Box>
          )}

          <Box className="flex justify-end">
            <Button variant="primary" size="sm" type="submit" disabled={running}>
              {running ? "Evaluating…" : "Evaluate"}
            </Button>
          </Box>
        </form>

        <Box aria-live="polite">
          {result && (
            <Box className="mt-4 rounded-xl border border-border bg-surface-raised px-4 py-3">
              <Box className="flex flex-wrap items-center gap-2">
                <Text variant="body-sm" className="font-medium text-content">
                  Result:
                </Text>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${actionBadgeClass(result.action)}`}
                >
                  {actionLabel(result.action)}
                </span>
              </Box>
              {result.matchedRule ? (
                <Text variant="body-sm" muted className="mt-1 text-xs">
                  Matched rule “{result.matchedRule.name}” (priority{" "}
                  {result.matchedRule.priority})
                </Text>
              ) : result.reason ? (
                <Text variant="body-sm" muted className="mt-1 text-xs">
                  {result.reason}
                </Text>
              ) : null}
              {result.action === "deferred" && result.endsAt && (
                <Text variant="body-sm" muted className="mt-1 text-xs">
                  Focus session{result.focusMode ? ` (${result.focusMode})` : ""} ends{" "}
                  {formatDateTime(result.endsAt)}
                </Text>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function NotificationIntelligencePanel(): React.JSX.Element {
  // Rules state
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [ruleActionError, setRuleActionError] = useState<string | null>(null);

  // Batches + digest state
  const [batches, setBatches] = useState<NotificationBatch[]>([]);
  const [digest, setDigest] = useState<NotificationDigest | null>(null);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);

  const loadRules = useCallback(async (): Promise<void> => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const res = await notificationIntelligenceApi.listRules({ limit: 50 });
      setRules(res.data);
    } catch (e) {
      setRulesError(errMsg(e));
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadBatches = useCallback(async (): Promise<void> => {
    setBatchesLoading(true);
    setBatchesError(null);
    const [batchesRes, digestRes] = await Promise.allSettled([
      notificationIntelligenceApi.listBatches({ limit: 20 }),
      notificationIntelligenceApi.getDigest(),
    ]);
    if (batchesRes.status === "fulfilled") {
      setBatches(batchesRes.value.data);
    } else {
      setBatchesError(errMsg(batchesRes.reason));
    }
    // Digest is a nice-to-have summary — ignore its failure if batches loaded.
    setDigest(digestRes.status === "fulfilled" ? digestRes.value.data : null);
    setBatchesLoading(false);
  }, []);

  useEffect(() => {
    void loadRules();
    void loadBatches();
  }, [loadRules, loadBatches]);

  const handleToggleRule = useCallback(
    async (rule: NotificationRule): Promise<void> => {
      setBusyRuleId(rule.id);
      setRuleActionError(null);
      const nextActive = !rule.isActive;
      // Optimistic flip with rollback.
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: nextActive } : r)),
      );
      try {
        await notificationIntelligenceApi.updateRule(rule.id, { isActive: nextActive });
      } catch (e) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, isActive: rule.isActive } : r)),
        );
        setRuleActionError(errMsg(e));
      } finally {
        setBusyRuleId(null);
      }
    },
    [],
  );

  const handleDeleteRule = useCallback(
    async (rule: NotificationRule): Promise<void> => {
      setBusyRuleId(rule.id);
      setRuleActionError(null);
      try {
        await notificationIntelligenceApi.deleteRule(rule.id);
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
      } catch (e) {
        setRuleActionError(errMsg(e));
      } finally {
        setBusyRuleId(null);
      }
    },
    [],
  );

  const handleDeliverBatch = useCallback(
    async (batch: NotificationBatch): Promise<void> => {
      setDeliveringId(batch.id);
      setBatchesError(null);
      try {
        await notificationIntelligenceApi.deliverBatch(batch.id);
        setBatches((prev) => prev.filter((b) => b.id !== batch.id));
      } catch (e) {
        setBatchesError(errMsg(e));
      } finally {
        setDeliveringId(null);
      }
    },
    [],
  );

  const handleRuleCreated = useCallback((rule: NotificationRule): void => {
    setRules((prev) =>
      [rule, ...prev].sort((a, b) => b.priority - a.priority),
    );
    setShowCreate(false);
  }, []);

  return (
    <Box className="space-y-6">
      {/* ── Smart rules ── */}
      <Card>
        <CardHeader>
          <Box className="flex items-center justify-between gap-3">
            <Box>
              <Text variant="heading-sm">Smart Notification Rules</Text>
              <Text variant="body-sm" muted>
                AI rules decide how each incoming email notifies you — the highest-priority
                matching rule wins.
              </Text>
            </Box>
            {!showCreate && (
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
                New rule
              </Button>
            )}
          </Box>
        </CardHeader>
        <CardContent>
          <Box className="space-y-3">
            {showCreate && (
              <CreateRuleForm
                onCreated={handleRuleCreated}
                onCancel={() => setShowCreate(false)}
              />
            )}

            {ruleActionError && (
              <Box className="rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert">
                <Text variant="body-sm" className="text-red-800">
                  {ruleActionError}
                </Text>
              </Box>
            )}

            {rulesLoading ? (
              <Skeleton rows={3} />
            ) : rulesError ? (
              <SectionError message={rulesError} onRetry={() => void loadRules()} />
            ) : rules.length === 0 ? (
              <Box className="rounded-xl border border-border bg-surface-raised px-4 py-8 text-center">
                <Text variant="body-sm" muted>
                  No smart rules yet. Create one to batch, suppress, or prioritise
                  notifications automatically.
                </Text>
              </Box>
            ) : (
              <Box className="space-y-2">
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onToggle={(r) => void handleToggleRule(r)}
                    onDelete={(r) => void handleDeleteRule(r)}
                    busy={busyRuleId === rule.id}
                  />
                ))}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* ── Pending batches + digest ── */}
      <Card>
        <CardHeader>
          <Text variant="heading-sm">Pending Batches &amp; Digest</Text>
          <Text variant="body-sm" muted>
            Notifications your rules have batched for later delivery.
          </Text>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <Skeleton rows={2} />
          ) : batchesError ? (
            <SectionError message={batchesError} onRetry={() => void loadBatches()} />
          ) : (
            <Box className="space-y-4">
              {digest && (
                <Box className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Box className="rounded-xl border border-border bg-surface-raised px-3 py-2">
                    <Text variant="body-sm" muted className="text-xs">
                      Pending batches
                    </Text>
                    <Text variant="heading-sm">{digest.pendingBatchCount}</Text>
                  </Box>
                  <Box className="rounded-xl border border-border bg-surface-raised px-3 py-2">
                    <Text variant="body-sm" muted className="text-xs">
                      Queued emails
                    </Text>
                    <Text variant="heading-sm">{digest.totalPendingEmails}</Text>
                  </Box>
                  <Box className="rounded-xl border border-border bg-surface-raised px-3 py-2">
                    <Text variant="body-sm" muted className="text-xs">
                      Active rules
                    </Text>
                    <Text variant="heading-sm">{digest.activeRuleCount}</Text>
                  </Box>
                  <Box className="rounded-xl border border-border bg-surface-raised px-3 py-2">
                    <Text variant="body-sm" muted className="text-xs">
                      Focus session
                    </Text>
                    <Text variant="heading-sm">
                      {digest.focusSession ? digest.focusSession.mode : "None"}
                    </Text>
                    {digest.focusSession && (
                      <Text variant="body-sm" muted className="text-xs">
                        {digest.focusSession.emailsDeferred} deferred
                      </Text>
                    )}
                  </Box>
                </Box>
              )}

              {batches.length === 0 ? (
                <Box className="rounded-xl border border-border bg-surface-raised px-4 py-8 text-center">
                  <Text variant="body-sm" muted>
                    No pending batches — you&apos;re all caught up.
                  </Text>
                </Box>
              ) : (
                <Box className="space-y-2">
                  {batches.map((batch) => (
                    <Box
                      key={batch.id}
                      className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3"
                    >
                      <Box className="min-w-0 flex-1">
                        <Text variant="body-sm" className="font-medium text-content">
                          {batch.emailIds.length} email
                          {batch.emailIds.length === 1 ? "" : "s"} · delivers{" "}
                          {formatDateTime(batch.scheduledFor)}
                        </Text>
                        {batch.summary && (
                          <Text variant="body-sm" muted className="mt-0.5 text-xs line-clamp-2">
                            {batch.summary}
                          </Text>
                        )}
                      </Box>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleDeliverBatch(batch)}
                        disabled={deliveringId === batch.id}
                        aria-label={`Deliver batch of ${batch.emailIds.length} emails now`}
                      >
                        {deliveringId === batch.id ? "Delivering…" : "Deliver now"}
                      </Button>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Evaluate ── */}
      <EvaluatePanel />
    </Box>
  );
}
