"use client";

/**
 * AlecRae — Commitments (Context Intelligence)
 *
 * The AI commitments tracker: every promise made in email, every action item,
 * every deadline — extracted, tracked, and surfaced before it slips.
 *
 * API (mounted at /v1/context — see apps/api/src/server.ts):
 *   GET  /v1/context/dashboard             → aggregate counts
 *   GET  /v1/context/promises              → promise list (status filter, cursor)
 *   PUT  /v1/context/promises/:id          → update promise status
 *   GET  /v1/context/promises/follow-up    → promises needing follow-up
 *   GET  /v1/context/action-items          → action item list (status/priority, cursor)
 *   PUT  /v1/context/action-items/:id      → update action item status
 *   GET  /v1/context/deadlines/upcoming    → overdue + next-7-days deadlines
 *   POST /v1/context/deadlines/:id/remind  → set deadline reminder
 *   POST /v1/context/extract               → extract from pasted email content
 *
 * Plan gate: pro+ (context_intelligence)
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  contextIntelligenceApi,
  type ActionItem,
  type ActionItemPriority,
  type ActionItemStatus,
  type ContextDashboard,
  type EmailDeadline,
  type EmailPromise,
  type ExtractResult,
  type FollowUpData,
  type PromiseStatus,
} from "../../../lib/api-context-intelligence";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isOverdue(dueIso: string | null): boolean {
  if (!dueIso) return false;
  return new Date(dueIso).getTime() < Date.now();
}

/** "Overdue by 3 days" / "Due today" / "Due in 5 days" */
function dueLabel(dueIso: string | null): string | null {
  if (!dueIso) return null;
  const diffMs = new Date(dueIso).getTime() - Date.now();
  const diffDays = Math.floor(Math.abs(diffMs) / DAY_MS);
  if (diffMs < 0) {
    return diffDays === 0
      ? "Overdue today"
      : `Overdue by ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays} days`;
}

/** Day heading for the deadlines timeline: Today / Tomorrow / weekday, date. */
function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOfDay = (x: Date): number =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(today)) / DAY_MS);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function LoadingSkeleton({ rows = 3 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-16 animate-pulse rounded-lg bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <Box
      className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

function EmptyState({ title, hint }: { title: string; hint?: string }): ReactNode {
  return (
    <Box className="py-10 text-center">
      <Text variant="body-sm" className="text-content-subtle font-medium">
        {title}
      </Text>
      {hint && (
        <Text variant="caption" className="text-content-subtle mt-1 block">
          {hint}
        </Text>
      )}
    </Box>
  );
}
EmptyState.displayName = "EmptyState";

type PillTone = "green" | "red" | "amber" | "gray" | "brand" | "blue";

const PILL_TONES: Record<PillTone, string> = {
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-600",
  brand: "bg-brand-100 text-brand-700",
  blue: "bg-blue-100 text-blue-700",
};

function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: PillTone;
}): ReactNode {
  return (
    <Box
      as="span"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${PILL_TONES[tone]}`}
    >
      {children}
    </Box>
  );
}
Pill.displayName = "Pill";

function promiseStatusTone(status: PromiseStatus): "green" | "red" | "amber" | "gray" | "brand" {
  if (status === "fulfilled") return "green";
  if (status === "broken") return "red";
  if (status === "expired") return "gray";
  return "brand";
}

function actionStatusTone(status: ActionItemStatus): "green" | "gray" | "blue" | "amber" {
  if (status === "completed") return "green";
  if (status === "dismissed") return "gray";
  if (status === "in_progress") return "blue";
  return "amber";
}

function priorityTone(priority: ActionItemPriority): "red" | "amber" | "blue" | "gray" {
  if (priority === "urgent") return "red";
  if (priority === "high") return "amber";
  if (priority === "medium") return "blue";
  return "gray";
}

// ─── Dashboard stats ───────────────────────────────────────────────────────────

function DashboardStats({
  dashboard,
  loading,
  error,
  onRetry,
}: {
  dashboard: ContextDashboard | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}): ReactNode {
  if (loading) {
    return (
      <Box className="h-24 animate-pulse rounded-xl bg-surface-raised border border-border" />
    );
  }
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (!dashboard) return null;

  const stats: { label: string; value: string; alert?: boolean }[] = [
    {
      label: "Active promises",
      value: dashboard.promises.active.toLocaleString(),
    },
    {
      label: "Need follow-up",
      value: dashboard.promises.needingFollowUp.toLocaleString(),
      alert: dashboard.promises.needingFollowUp > 0,
    },
    {
      label: "Pending action items",
      value: dashboard.actionItems.pending.toLocaleString(),
    },
    {
      label: "Completion rate",
      value: `${dashboard.actionItems.completionRate}%`,
    },
    {
      label: "Deadlines (7 days)",
      value: dashboard.deadlines.upcoming.toLocaleString(),
    },
    {
      label: "Overdue deadlines",
      value: dashboard.deadlines.overdue.toLocaleString(),
      alert: dashboard.deadlines.overdue > 0,
    },
  ];

  return (
    <Box
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
      aria-label="Commitments overview"
    >
      {stats.map(({ label, value, alert }) => (
        <Box
          key={label}
          className={`flex flex-col rounded-lg border px-4 py-3 ${
            alert
              ? "border-red-200 bg-red-50"
              : "border-border bg-surface-raised"
          }`}
        >
          <Text
            variant="heading-md"
            className={`font-bold ${alert ? "text-red-700" : "text-content"}`}
          >
            {value}
          </Text>
          <Text variant="caption" className="text-content-subtle mt-0.5">
            {label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
DashboardStats.displayName = "DashboardStats";

// ─── Extract card ──────────────────────────────────────────────────────────────

function ExtractCard({ onExtracted }: { onExtracted: () => void }): ReactNode {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [participants, setParticipants] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);

  async function handleExtract(): Promise<void> {
    if (!content.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const parsed = participants
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const res = await contextIntelligenceApi.extract({
        emailId: `manual-${Date.now().toString(36)}`,
        content: content.trim(),
        ...(parsed.length > 0 ? { participants: parsed } : {}),
      });
      setResult(res.data);
      setContent("");
      onExtracted();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Scan an email
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Paste email text and AI extracts every promise, action item, and
              deadline in it.
            </Text>
          </Box>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="extract-form"
          >
            {open ? "Hide" : "Scan"}
          </Button>
        </Box>
      </CardHeader>
      {open && (
        <CardContent>
          <Box id="extract-form" className="space-y-3">
            {error && <ErrorBanner message={error} />}
            <Box className="flex flex-col gap-1.5">
              <Text
                as="label"
                variant="body-sm"
                className="font-medium text-content"
                htmlFor="extract-content"
              >
                Email content
              </Text>
              <Box
                as="textarea"
                id="extract-content"
                value={content}
                onChange={(e) =>
                  setContent((e.target as HTMLTextAreaElement).value)
                }
                rows={6}
                placeholder={
                  "Hi Sarah,\n\nI'll send the revised contract by Friday. Can you review the pricing section before our call on Tuesday?\n\nThanks, Mark"
                }
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
                aria-label="Email content to analyze"
              />
            </Box>
            <Box className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <Box className="flex flex-col gap-1.5 flex-1">
                <Text
                  as="label"
                  variant="body-sm"
                  className="font-medium text-content"
                  htmlFor="extract-participants"
                >
                  Participants (optional, comma-separated — sender first)
                </Text>
                <Input
                  id="extract-participants"
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  placeholder="mark@acme.com, sarah@alecrae.com"
                  aria-label="Participants, comma separated, sender first"
                />
              </Box>
              <Button
                variant="primary"
                size="md"
                onClick={() => void handleExtract()}
                disabled={busy || !content.trim()}
              >
                {busy ? "Extracting…" : "Extract commitments"}
              </Button>
            </Box>
            {result && (
              <Box
                className="rounded-lg border border-green-200 bg-green-50 px-4 py-3"
                role="status"
              >
                <Text variant="body-sm" className="text-green-800 font-medium">
                  Extracted {result.promises.length} promise
                  {result.promises.length === 1 ? "" : "s"},{" "}
                  {result.actionItems.length} action item
                  {result.actionItems.length === 1 ? "" : "s"}, and{" "}
                  {result.deadlines.length} deadline
                  {result.deadlines.length === 1 ? "" : "s"}.
                </Text>
              </Box>
            )}
          </Box>
        </CardContent>
      )}
    </Card>
  );
}
ExtractCard.displayName = "ExtractCard";

// ─── Promises section ──────────────────────────────────────────────────────────

function PromiseRow({
  promise,
  busy,
  onUpdate,
}: {
  promise: EmailPromise;
  busy: boolean;
  onUpdate: (id: string, status: PromiseStatus) => void;
}): ReactNode {
  const overdue = promise.status === "active" && isOverdue(promise.dueDate);
  const due = dueLabel(promise.dueDate);

  return (
    <Box
      as="li"
      className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border px-4 py-3 ${
        overdue
          ? "border-red-300 bg-red-50 border-l-4 border-l-red-500"
          : "border-border bg-surface-raised"
      }`}
    >
      <Box className="flex-1 min-w-0">
        <Text variant="body-sm" className="font-medium text-content">
          {promise.promiseText}
        </Text>
        <Box className="mt-1 flex flex-wrap items-center gap-2">
          <Text variant="caption" className="text-content-subtle">
            {promise.promisor} → {promise.promisee}
          </Text>
          <Pill tone={promiseStatusTone(promise.status)}>{promise.status}</Pill>
          {due && (
            <Pill tone={overdue ? "red" : "gray"}>
              {due}
              {promise.dueDate ? ` · ${formatDate(promise.dueDate)}` : ""}
            </Pill>
          )}
          <Text variant="caption" className="text-content-subtle">
            {confidencePct(promise.confidence)} confidence
          </Text>
        </Box>
      </Box>
      <Box className="flex items-center gap-2 flex-shrink-0">
        {promise.status === "active" ? (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onUpdate(promise.id, "fulfilled")}
              disabled={busy}
              aria-label={`Mark promise fulfilled: ${promise.promiseText}`}
            >
              Fulfilled
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(promise.id, "broken")}
              disabled={busy}
              aria-label={`Mark promise broken: ${promise.promiseText}`}
              className="text-red-600 hover:text-red-700"
            >
              Broken
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdate(promise.id, "active")}
            disabled={busy}
            aria-label={`Reopen promise: ${promise.promiseText}`}
          >
            Reopen
          </Button>
        )}
      </Box>
    </Box>
  );
}
PromiseRow.displayName = "PromiseRow";

function PromisesSection({ refreshKey }: { refreshKey: number }): ReactNode {
  const [promises, setPromises] = useState<EmailPromise[]>([]);
  const [followUp, setFollowUp] = useState<FollowUpData | null>(null);
  const [statusFilter, setStatusFilter] = useState<PromiseStatus | "all">("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [list, fu] = await Promise.all([
        contextIntelligenceApi.listPromises({
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          limit: 50,
        }),
        contextIntelligenceApi.promisesNeedingFollowUp().catch(() => null),
      ]);
      setPromises(list.data);
      setCursor(list.cursor);
      setHasMore(list.hasMore);
      setFollowUp(fu ? fu.data : null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const list = await contextIntelligenceApi.listPromises({
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        limit: 50,
        cursor,
      });
      setPromises((prev) => [...prev, ...list.data]);
      setCursor(list.cursor);
      setHasMore(list.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleUpdate(id: string, status: PromiseStatus): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await contextIntelligenceApi.updatePromise(id, status);
      setPromises((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p,
        ),
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  const overdueFollowUps = followUp?.overdue ?? [];

  return (
    <Box className="space-y-4">
      {/* Follow-up alert */}
      {overdueFollowUps.length > 0 && (
        <Box
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
        >
          <Text variant="body-sm" className="font-semibold text-red-800">
            {overdueFollowUps.length} promise
            {overdueFollowUps.length === 1 ? " is" : "s are"} overdue and need
            {overdueFollowUps.length === 1 ? "s" : ""} follow-up
          </Text>
          <Box as="ul" className="mt-1.5 space-y-1">
            {overdueFollowUps.slice(0, 3).map((p) => (
              <Box as="li" key={p.id}>
                <Text variant="caption" className="text-red-700">
                  “{p.promiseText}” — {p.promisor}
                  {p.dueDate ? `, due ${formatDate(p.dueDate)}` : ""}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Filter */}
      <Box className="flex items-center gap-3">
        <Text
          as="label"
          variant="body-sm"
          className="text-content-subtle"
          htmlFor="promise-status-filter"
        >
          Status
        </Text>
        <Box
          as="select"
          id="promise-status-filter"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              (e.target as HTMLSelectElement).value as PromiseStatus | "all",
            )
          }
          aria-label="Filter promises by status"
          className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="broken">Broken</option>
          <option value="expired">Expired</option>
        </Box>
      </Box>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={4} />}
      {!loading && !error && promises.length === 0 && (
        <EmptyState
          title="No promises tracked yet."
          hint="Promises are extracted automatically as email syncs — or scan an email above."
        />
      )}
      {!loading && promises.length > 0 && (
        <Box as="ul" className="space-y-3" aria-label="Promises">
          {promises.map((p) => (
            <PromiseRow
              key={p.id}
              promise={p}
              busy={busyId === p.id}
              onUpdate={(id, status) => void handleUpdate(id, status)}
            />
          ))}
        </Box>
      )}
      {hasMore && !loading && (
        <Box className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
PromisesSection.displayName = "PromisesSection";

// ─── Action items section ──────────────────────────────────────────────────────

function ActionItemRow({
  item,
  busy,
  onUpdate,
}: {
  item: ActionItem;
  busy: boolean;
  onUpdate: (id: string, status: ActionItemStatus) => void;
}): ReactNode {
  const active = item.status === "pending" || item.status === "in_progress";
  const overdue = active && isOverdue(item.dueDate);
  const due = dueLabel(item.dueDate);

  return (
    <Box
      as="li"
      className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border px-4 py-3 ${
        overdue
          ? "border-red-300 bg-red-50 border-l-4 border-l-red-500"
          : "border-border bg-surface-raised"
      }`}
    >
      <Box className="flex-1 min-w-0">
        <Text
          variant="body-sm"
          className={`font-medium ${
            item.status === "completed"
              ? "text-content-subtle line-through"
              : "text-content"
          }`}
        >
          {item.actionText}
        </Text>
        <Box className="mt-1 flex flex-wrap items-center gap-2">
          <Pill tone={priorityTone(item.priority)}>{item.priority}</Pill>
          <Pill tone={actionStatusTone(item.status)}>
            {item.status.replace("_", " ")}
          </Pill>
          {item.assignedTo && (
            <Text variant="caption" className="text-content-subtle">
              Assigned to {item.assignedTo}
            </Text>
          )}
          {due && (
            <Pill tone={overdue ? "red" : "gray"}>
              {due}
              {item.dueDate ? ` · ${formatDate(item.dueDate)}` : ""}
            </Pill>
          )}
          <Text variant="caption" className="text-content-subtle">
            {confidencePct(item.confidence)} confidence
          </Text>
        </Box>
      </Box>
      <Box className="flex items-center gap-2 flex-shrink-0">
        {active && (
          <>
            {item.status === "pending" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUpdate(item.id, "in_progress")}
                disabled={busy}
                aria-label={`Start: ${item.actionText}`}
              >
                Start
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => onUpdate(item.id, "completed")}
              disabled={busy}
              aria-label={`Mark done: ${item.actionText}`}
            >
              Done
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(item.id, "dismissed")}
              disabled={busy}
              aria-label={`Dismiss: ${item.actionText}`}
              className="text-content-subtle"
            >
              Dismiss
            </Button>
          </>
        )}
        {!active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdate(item.id, "pending")}
            disabled={busy}
            aria-label={`Reopen: ${item.actionText}`}
          >
            Reopen
          </Button>
        )}
      </Box>
    </Box>
  );
}
ActionItemRow.displayName = "ActionItemRow";

function ActionItemsSection({ refreshKey }: { refreshKey: number }): ReactNode {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<ActionItemStatus | "all">(
    "all",
  );
  const [priorityFilter, setPriorityFilter] = useState<
    ActionItemPriority | "all"
  >("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await contextIntelligenceApi.listActionItems({
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(priorityFilter !== "all" ? { priority: priorityFilter } : {}),
        limit: 50,
      });
      setItems(list.data);
      setCursor(list.cursor);
      setHasMore(list.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const list = await contextIntelligenceApi.listActionItems({
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(priorityFilter !== "all" ? { priority: priorityFilter } : {}),
        limit: 50,
        cursor,
      });
      setItems((prev) => [...prev, ...list.data]);
      setCursor(list.cursor);
      setHasMore(list.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleUpdate(
    id: string,
    status: ActionItemStatus,
  ): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const res = await contextIntelligenceApi.updateActionItem(id, status);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                status,
                completedAt: res.data.completedAt,
                updatedAt: res.data.updatedAt,
              }
            : it,
        ),
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Box className="space-y-4">
      {/* Filters */}
      <Box className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Box className="flex items-center gap-3">
          <Text
            as="label"
            variant="body-sm"
            className="text-content-subtle"
            htmlFor="action-status-filter"
          >
            Status
          </Text>
          <Box
            as="select"
            id="action-status-filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                (e.target as HTMLSelectElement).value as
                  | ActionItemStatus
                  | "all",
              )
            }
            aria-label="Filter action items by status"
            className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="dismissed">Dismissed</option>
          </Box>
        </Box>
        <Box className="flex items-center gap-3">
          <Text
            as="label"
            variant="body-sm"
            className="text-content-subtle"
            htmlFor="action-priority-filter"
          >
            Priority
          </Text>
          <Box
            as="select"
            id="action-priority-filter"
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(
                (e.target as HTMLSelectElement).value as
                  | ActionItemPriority
                  | "all",
              )
            }
            aria-label="Filter action items by priority"
            className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
          >
            <option value="all">All</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Box>
        </Box>
      </Box>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={4} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="No action items yet."
          hint="Action items are extracted from your email automatically — or scan an email above."
        />
      )}
      {!loading && items.length > 0 && (
        <Box as="ul" className="space-y-3" aria-label="Action items">
          {items.map((it) => (
            <ActionItemRow
              key={it.id}
              item={it}
              busy={busyId === it.id}
              onUpdate={(id, status) => void handleUpdate(id, status)}
            />
          ))}
        </Box>
      )}
      {hasMore && !loading && (
        <Box className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
ActionItemsSection.displayName = "ActionItemsSection";

// ─── Deadlines section ─────────────────────────────────────────────────────────

function DeadlineRow({
  deadline,
  overdue,
  busy,
  onRemind,
}: {
  deadline: EmailDeadline;
  overdue: boolean;
  busy: boolean;
  onRemind: (id: string, deadlineIso: string) => void;
}): ReactNode {
  const reminderSet = Boolean(deadline.reminderAt);
  return (
    <Box
      as="li"
      className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border px-4 py-3 ${
        overdue
          ? "border-red-300 bg-red-50 border-l-4 border-l-red-500"
          : "border-border bg-surface-raised"
      }`}
    >
      <Box className="flex-1 min-w-0">
        <Text variant="body-sm" className="font-medium text-content">
          {deadline.description}
        </Text>
        <Box className="mt-1 flex flex-wrap items-center gap-2">
          <Pill tone={overdue ? "red" : "brand"}>
            {formatDateTime(deadline.deadlineDate)}
          </Pill>
          {overdue && <Pill tone="red">{dueLabel(deadline.deadlineDate)}</Pill>}
          {!deadline.isExplicit && <Pill tone="gray">inferred</Pill>}
          <Text variant="caption" className="text-content-subtle">
            {confidencePct(deadline.confidence)} confidence
          </Text>
          {reminderSet && deadline.reminderAt && (
            <Text variant="caption" className="text-content-subtle">
              Reminder {formatDateTime(deadline.reminderAt)}
            </Text>
          )}
        </Box>
      </Box>
      {!overdue && (
        <Box className="flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemind(deadline.id, deadline.deadlineDate)}
            disabled={busy || reminderSet}
            aria-label={`Set reminder for: ${deadline.description}`}
          >
            {reminderSet ? "Reminder set" : busy ? "Setting…" : "Remind me"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
DeadlineRow.displayName = "DeadlineRow";

function DeadlinesSection({ refreshKey }: { refreshKey: number }): ReactNode {
  const [data, setData] = useState<{
    upcoming: EmailDeadline[];
    overdue: EmailDeadline[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await contextIntelligenceApi.upcomingDeadlines();
      setData({ upcoming: res.data.upcoming, overdue: res.data.overdue });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleRemind(id: string, deadlineIso: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      // Remind 24h before the deadline; if that has already passed, in 1 hour.
      const dayBefore = new Date(deadlineIso).getTime() - DAY_MS;
      const reminderAt = new Date(
        Math.max(dayBefore, Date.now() + 60 * 60 * 1000),
      ).toISOString();
      await contextIntelligenceApi.setDeadlineReminder(id, reminderAt);
      setData((prev) =>
        prev
          ? {
              overdue: prev.overdue,
              upcoming: prev.upcoming.map((d) =>
                d.id === id ? { ...d, reminderAt, reminderSent: false } : d,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  // Group upcoming deadlines by day for a timeline view.
  const grouped: { heading: string; entries: EmailDeadline[] }[] = [];
  if (data) {
    for (const dl of data.upcoming) {
      const heading = dayHeading(dl.deadlineDate);
      const last = grouped.length > 0 ? grouped[grouped.length - 1] : undefined;
      if (last && last.heading === heading) {
        last.entries.push(dl);
      } else {
        grouped.push({ heading, entries: [dl] });
      }
    }
  }

  return (
    <Box className="space-y-5">
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={4} />}

      {!loading && !error && data && (
        <>
          {/* Overdue */}
          {data.overdue.length > 0 && (
            <Box className="space-y-2">
              <Text
                variant="heading-sm"
                className="font-semibold text-red-700"
                as="h3"
              >
                Overdue ({data.overdue.length})
              </Text>
              <Box as="ul" className="space-y-3" aria-label="Overdue deadlines">
                {data.overdue.map((dl) => (
                  <DeadlineRow
                    key={dl.id}
                    deadline={dl}
                    overdue
                    busy={busyId === dl.id}
                    onRemind={(id, iso) => void handleRemind(id, iso)}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Next 7 days timeline */}
          <Box className="space-y-2">
            <Text variant="heading-sm" className="font-semibold" as="h3">
              Next 7 days ({data.upcoming.length})
            </Text>
            {data.upcoming.length === 0 ? (
              <EmptyState
                title="No deadlines in the next 7 days."
                hint="Deadlines are extracted from your email automatically — or scan an email above."
              />
            ) : (
              <Box className="space-y-4">
                {grouped.map(({ heading, entries }) => (
                  <Box key={heading} className="space-y-2">
                    <Text
                      variant="caption"
                      className="text-content-subtle uppercase tracking-wide font-medium"
                      as="h4"
                    >
                      {heading}
                    </Text>
                    <Box
                      as="ul"
                      className="space-y-3 border-l-2 border-border pl-4"
                      aria-label={`Deadlines: ${heading}`}
                    >
                      {entries.map((dl) => (
                        <DeadlineRow
                          key={dl.id}
                          deadline={dl}
                          overdue={false}
                          busy={busyId === dl.id}
                          onRemind={(id, iso) => void handleRemind(id, iso)}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
DeadlinesSection.displayName = "DeadlinesSection";

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "promises" | "actions" | "deadlines";

const TABS: { id: TabId; label: string }[] = [
  { id: "promises", label: "Promises" },
  { id: "actions", label: "Action items" },
  { id: "deadlines", label: "Deadlines" },
];

function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}): ReactNode {
  const refs = useRef<(HTMLElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const currentIndex = TABS.findIndex((t) => t.id === active);
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    else if (e.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const next = TABS[nextIndex];
    if (!next) return;
    onChange(next.id);
    refs.current[nextIndex]?.focus();
  }

  return (
    <Box
      role="tablist"
      aria-label="Commitment views"
      className="flex items-center gap-1 border-b border-border"
      onKeyDown={handleKeyDown}
    >
      {TABS.map((tab, i) => {
        const selected = tab.id === active;
        return (
          <Box
            as="button"
            key={tab.id}
            ref={(el: Element | null) => {
              refs.current[i] = el instanceof HTMLElement ? el : null;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t ${
              selected
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-content-subtle hover:text-content"
            }`}
          >
            {tab.label}
          </Box>
        );
      })}
    </Box>
  );
}
TabBar.displayName = "TabBar";

// ─── Inner page (inside plan gate) ────────────────────────────────────────────

function CommitmentsContent(): ReactNode {
  const [dashboard, setDashboard] = useState<ContextDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("promises");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const res = await contextIntelligenceApi.dashboard();
      setDashboard(res.data);
    } catch (err) {
      setDashboardError(errMsg(err));
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshKey]);

  function handleExtracted(): void {
    setRefreshKey((k) => k + 1);
  }

  return (
    <Box className="space-y-6">
      <DashboardStats
        dashboard={dashboard}
        loading={dashboardLoading}
        error={dashboardError}
        onRetry={() => void loadDashboard()}
      />

      <ExtractCard onExtracted={handleExtracted} />

      <Card>
        <CardContent>
          <Box className="space-y-4">
            <TabBar active={tab} onChange={setTab} />
            <Box
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {tab === "promises" && <PromisesSection refreshKey={refreshKey} />}
              {tab === "actions" && (
                <ActionItemsSection refreshKey={refreshKey} />
              )}
              {tab === "deadlines" && (
                <DeadlinesSection refreshKey={refreshKey} />
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
CommitmentsContent.displayName = "CommitmentsContent";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CommitmentsPage(): ReactNode {
  return (
    <PageLayout
      title="Commitments"
      description="Every promise, action item, and deadline in your email — tracked by AI so nothing slips."
    >
      <PlanGate feature="context_intelligence" required="pro">
        <CommitmentsContent />
      </PlanGate>
    </PageLayout>
  );
}
