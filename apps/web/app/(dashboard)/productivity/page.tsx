"use client";

/**
 * AlecRae — Productivity Analytics
 *
 * How your time flows through email: where the hours go, when you're at your
 * best, and AI-generated insights on how to reclaim time. Team leaderboard for
 * shared workspaces.
 *
 * API (mounted at /v1/productivity — see apps/api/src/server.ts):
 *   GET  /v1/productivity/time/summary       → time totals by activity
 *   GET  /v1/productivity/insights           → AI insights (cursor)
 *   PUT  /v1/productivity/insights/:id        → action/dismiss insight
 *   POST /v1/productivity/insights/generate   → regenerate insights
 *   GET  /v1/productivity/patterns/predict    → best-hour predictions
 *   GET  /v1/productivity/report              → weekly/monthly report
 *   GET  /v1/productivity/comparison          → compare two periods
 *   GET  /v1/productivity/leaderboard         → team leaderboard
 *
 * Plan gate: pro+ (productivity_analytics)
 */

import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  productivityAnalyticsApi,
  type ActivityType,
  type InsightSeverity,
  type LeaderboardEntry,
  type PredictResult,
  type ProductivityComparison,
  type ProductivityInsight,
  type ProductivityReport,
  type ReportPeriod,
  type TimeSummary,
  type TimeSummaryEntry,
} from "../../../lib/api-productivity-analytics";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ACTIVITY_TYPES: ActivityType[] = [
  "reading",
  "composing",
  "replying",
  "forwarding",
];

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  reading: "Reading",
  composing: "Composing",
  replying: "Replying",
  forwarding: "Forwarding",
};

/** Tailwind bar colours per activity type (bg + light track). */
const ACTIVITY_BAR: Record<ActivityType, string> = {
  reading: "bg-brand-500",
  composing: "bg-blue-500",
  replying: "bg-emerald-500",
  forwarding: "bg-amber-500",
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** "2h 14m" / "14m 3s" / "0s" from a seconds count. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s === 0) return "0s";
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (hours === 0 && seconds > 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(" ") : "0s";
}

/** "3pm" / "12am" / "9am" from an 0-23 hour. */
function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

/** "+12%" / "−8%" / "—" for a signed percentage change. */
function formatChange(pct: number | null): { label: string; tone: ChangeTone } {
  if (pct === null) return { label: "—", tone: "gray" };
  if (pct === 0) return { label: "0%", tone: "gray" };
  const sign = pct > 0 ? "+" : "−";
  return { label: `${sign}${Math.abs(pct)}%`, tone: pct > 0 ? "up" : "down" };
}

type ChangeTone = "up" | "down" | "gray";

const CHANGE_TONE_CLASS: Record<ChangeTone, string> = {
  up: "text-emerald-700",
  down: "text-red-700",
  gray: "text-content-subtle",
};

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

function severityTone(severity: InsightSeverity): "blue" | "amber" | "red" {
  if (severity === "critical") return "red";
  if (severity === "warning") return "amber";
  return "blue";
}

// ─── Report card (headline period stats + time-by-activity bars) ───────────────

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}): ReactNode {
  return (
    <Box className="flex flex-col rounded-lg border border-border bg-surface-raised px-4 py-3">
      <Text variant="heading-md" className="font-bold text-content">
        {value}
      </Text>
      <Text variant="caption" className="text-content-subtle mt-0.5">
        {label}
      </Text>
      {sub && (
        <Text variant="caption" className="text-content-subtle mt-0.5">
          {sub}
        </Text>
      )}
    </Box>
  );
}
StatTile.displayName = "StatTile";

/** Horizontal bar chart of time spent per activity type. */
function ActivityBars({
  summary,
}: {
  summary: TimeSummary;
}): ReactNode {
  const rows: { type: ActivityType; entry: TimeSummaryEntry }[] = ACTIVITY_TYPES
    .map((type) => ({ type, entry: summary[type] }))
    .filter(
      (r): r is { type: ActivityType; entry: TimeSummaryEntry } =>
        r.entry !== undefined,
    );

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No time tracked yet."
        hint="Time is tracked automatically as you read and compose email."
      />
    );
  }

  const maxSeconds = Math.max(...rows.map((r) => r.entry.totalSeconds), 1);

  return (
    <Box className="space-y-3" aria-label="Time spent by activity">
      {rows.map(({ type, entry }) => {
        const pct = Math.round((entry.totalSeconds / maxSeconds) * 100);
        return (
          <Box key={type} className="space-y-1">
            <Box className="flex items-center justify-between gap-3">
              <Text variant="body-sm" className="font-medium text-content">
                {ACTIVITY_LABELS[type]}
              </Text>
              <Text variant="caption" className="text-content-subtle">
                {formatDuration(entry.totalSeconds)} · {entry.count.toLocaleString()}{" "}
                email{entry.count === 1 ? "" : "s"} · avg{" "}
                {formatDuration(entry.avgSeconds)}
              </Text>
            </Box>
            <Box
              className="h-2.5 w-full rounded-full bg-surface overflow-hidden"
              role="img"
              aria-label={`${ACTIVITY_LABELS[type]}: ${formatDuration(
                entry.totalSeconds,
              )}`}
            >
              <Box
                className={`h-full rounded-full ${ACTIVITY_BAR[type]}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
ActivityBars.displayName = "ActivityBars";

function ReportSection(): ReactNode {
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [report, setReport] = useState<ProductivityReport | null>(null);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date(
        Date.now() - (period === "weekly" ? 7 : 30) * 24 * 60 * 60 * 1000,
      ).toISOString();
      const [rep, sum] = await Promise.all([
        productivityAnalyticsApi.report(period),
        productivityAnalyticsApi.timeSummary({ from }),
      ]);
      setReport(rep.data);
      setSummary(sum.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <Box className="flex flex-wrap items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Where your time goes
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Time spent on email over the selected period.
            </Text>
          </Box>
          <Box className="flex items-center gap-3">
            <Text
              as="label"
              variant="body-sm"
              className="text-content-subtle"
              htmlFor="report-period"
            >
              Period
            </Text>
            <Box
              as="select"
              id="report-period"
              value={period}
              onChange={(e) =>
                setPeriod(
                  (e.target as HTMLSelectElement).value as ReportPeriod,
                )
              }
              aria-label="Report period"
              className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
            >
              <option value="weekly">Last 7 days</option>
              <option value="monthly">Last 30 days</option>
            </Box>
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && !error && report && summary && (
          <Box className="space-y-6">
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile
                label="Emails handled"
                value={report.totalEmails.toLocaleString()}
              />
              <StatTile
                label="Total time"
                value={formatDuration(report.totalTimeSeconds)}
              />
              <StatTile
                label="Avg per email"
                value={formatDuration(report.avgTimePerEmail)}
              />
              <StatTile
                label="Insights"
                value={report.insights.total.toLocaleString()}
                sub={`${report.insights.actioned} actioned`}
              />
            </Box>
            <ActivityBars summary={summary} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ReportSection.displayName = "ReportSection";

// ─── Best hours prediction ─────────────────────────────────────────────────────

function PredictSection(): ReactNode {
  const [activity, setActivity] = useState<ActivityType | "all">("all");
  const [predict, setPredict] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await productivityAnalyticsApi.predict(
        activity !== "all" ? { activityType: activity } : undefined,
      );
      setPredict(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [activity]);

  useEffect(() => {
    void load();
  }, [load]);

  const predictions = predict?.predictions ?? [];
  const maxScore = Math.max(...predictions.map((p) => p.score), 1);

  return (
    <Card>
      <CardHeader>
        <Box className="flex flex-wrap items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Your peak hours
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              When your email activity has been most effective.
            </Text>
          </Box>
          <Box className="flex items-center gap-3">
            <Text
              as="label"
              variant="body-sm"
              className="text-content-subtle"
              htmlFor="predict-activity"
            >
              Activity
            </Text>
            <Box
              as="select"
              id="predict-activity"
              value={activity}
              onChange={(e) =>
                setActivity(
                  (e.target as HTMLSelectElement).value as ActivityType | "all",
                )
              }
              aria-label="Activity type for peak-hour prediction"
              className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
            >
              <option value="all">All activity</option>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_LABELS[t]}
                </option>
              ))}
            </Box>
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && !error && predictions.length === 0 && (
          <EmptyState
            title="Not enough data to predict your peak hours yet."
            hint="Keep using AlecRae — patterns emerge as your email activity is tracked."
          />
        )}
        {!loading && !error && predictions.length > 0 && (
          <Box className="space-y-4">
            {predict?.bestHour && (
              <Box className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                <Text variant="body-sm" className="text-brand-800">
                  Your most effective window is around{" "}
                  <Text as="span" variant="body-sm" className="font-semibold">
                    {formatHour(predict.bestHour.hour)}
                  </Text>
                  . Schedule focused email time then.
                </Text>
              </Box>
            )}
            <Box className="space-y-2" aria-label="Peak hour scores">
              {predictions.map((p) => {
                const pct = Math.round((p.score / maxScore) * 100);
                return (
                  <Box key={p.hour} className="flex items-center gap-3">
                    <Text
                      variant="caption"
                      className="text-content-subtle w-12 flex-shrink-0 text-right tabular-nums"
                    >
                      {formatHour(p.hour)}
                    </Text>
                    <Box
                      className="h-2.5 flex-1 rounded-full bg-surface overflow-hidden"
                      role="img"
                      aria-label={`${formatHour(p.hour)}: score ${Math.round(
                        p.score,
                      )}, ${p.sampleCount} samples`}
                    >
                      <Box
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </Box>
                    <Text
                      variant="caption"
                      className="text-content-subtle w-24 flex-shrink-0 tabular-nums"
                    >
                      {p.sampleCount.toLocaleString()} sample
                      {p.sampleCount === 1 ? "" : "s"}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
PredictSection.displayName = "PredictSection";

// ─── Comparison ────────────────────────────────────────────────────────────────

function ComparisonSection(): ReactNode {
  const [comparison, setComparison] = useState<ProductivityComparison | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // This week vs. the 7 days before it.
      const now = Date.now();
      const current = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const previous = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
      const res = await productivityAnalyticsApi.comparison(current, previous);
      setComparison(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const emailChange = formatChange(comparison?.changes.emailCountPercent ?? null);
  const timeChange = formatChange(comparison?.changes.totalTimePercent ?? null);

  const hasData =
    comparison !== null &&
    (comparison.current.totalEmails > 0 || comparison.previous.totalEmails > 0);

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          This week vs. last
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          How the last 7 days compare to the 7 before.
        </Text>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {loading && <LoadingSkeleton rows={2} />}
        {!loading && !error && !hasData && (
          <EmptyState
            title="No activity to compare yet."
            hint="A trend appears once you have at least a week of tracked email."
          />
        )}
        {!loading && !error && hasData && comparison && (
          <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Box className="rounded-lg border border-border bg-surface-raised px-4 py-3">
              <Box className="flex items-baseline justify-between gap-2">
                <Text variant="heading-md" className="font-bold text-content">
                  {comparison.current.totalEmails.toLocaleString()}
                </Text>
                <Text
                  variant="body-sm"
                  className={`font-semibold ${CHANGE_TONE_CLASS[emailChange.tone]}`}
                >
                  {emailChange.label}
                </Text>
              </Box>
              <Text variant="caption" className="text-content-subtle mt-0.5">
                Emails this week ({comparison.previous.totalEmails.toLocaleString()}{" "}
                last week)
              </Text>
            </Box>
            <Box className="rounded-lg border border-border bg-surface-raised px-4 py-3">
              <Box className="flex items-baseline justify-between gap-2">
                <Text variant="heading-md" className="font-bold text-content">
                  {formatDuration(comparison.current.totalSeconds)}
                </Text>
                <Text
                  variant="body-sm"
                  className={`font-semibold ${CHANGE_TONE_CLASS[timeChange.tone]}`}
                >
                  {timeChange.label}
                </Text>
              </Box>
              <Text variant="caption" className="text-content-subtle mt-0.5">
                Time this week ({formatDuration(comparison.previous.totalSeconds)}{" "}
                last week)
              </Text>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ComparisonSection.displayName = "ComparisonSection";

// ─── Insights ──────────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  busy,
  onAction,
  onDismiss,
}: {
  insight: ProductivityInsight;
  busy: boolean;
  onAction: (id: string) => void;
  onDismiss: (id: string) => void;
}): ReactNode {
  const tone = severityTone(insight.severity);
  return (
    <Box
      as="li"
      className={`rounded-lg border px-4 py-3 ${
        insight.severity === "critical"
          ? "border-red-300 bg-red-50 border-l-4 border-l-red-500"
          : "border-border bg-surface-raised"
      }`}
    >
      <Box className="flex flex-col gap-2">
        <Box className="flex flex-wrap items-center gap-2">
          <Text variant="body-sm" className="font-semibold text-content">
            {insight.title}
          </Text>
          <Pill tone={tone}>{insight.severity}</Pill>
          {insight.isActioned && <Pill tone="green">actioned</Pill>}
        </Box>
        <Text variant="body-sm" className="text-content-subtle">
          {insight.description}
        </Text>
        <Box className="rounded-md bg-surface px-3 py-2 border border-border">
          <Text variant="caption" className="text-content">
            <Text as="span" variant="caption" className="font-semibold">
              Recommendation:{" "}
            </Text>
            {insight.recommendation}
          </Text>
        </Box>
        <Box className="flex flex-wrap items-center gap-3">
          <Text variant="caption" className="text-content-subtle tabular-nums">
            {insight.metric}: {insight.currentValue.toLocaleString()}
            {insight.targetValue !== null
              ? ` (target ${insight.targetValue.toLocaleString()})`
              : ""}
          </Text>
          <Box className="ml-auto flex items-center gap-2">
            {!insight.isActioned && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onAction(insight.id)}
                disabled={busy}
                aria-label={`Mark insight actioned: ${insight.title}`}
              >
                Mark actioned
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDismiss(insight.id)}
              disabled={busy}
              aria-label={`Dismiss insight: ${insight.title}`}
              className="text-content-subtle"
            >
              Dismiss
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
InsightCard.displayName = "InsightCard";

function InsightsSection(): ReactNode {
  const [insights, setInsights] = useState<ProductivityInsight[]>([]);
  const [severityFilter, setSeverityFilter] = useState<InsightSeverity | "all">(
    "all",
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await productivityAnalyticsApi.listInsights({
        active: true,
        ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
        limit: 50,
      });
      setInsights(res.data);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [severityFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await productivityAnalyticsApi.listInsights({
        active: true,
        ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
        limit: 50,
        cursor,
      });
      setInsights((prev) => [...prev, ...res.data]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleGenerate(): Promise<void> {
    setGenerating(true);
    setError(null);
    try {
      await productivityAnalyticsApi.generateInsights();
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleAction(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const res = await productivityAnalyticsApi.updateInsight(id, {
        isActioned: true,
      });
      setInsights((prev) => prev.map((i) => (i.id === id ? res.data : i)));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await productivityAnalyticsApi.updateInsight(id, { isDismissed: true });
      // Dismissed insights drop out of the active list.
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex flex-wrap items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              AI insights
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Where AlecRae thinks you can reclaim time.
            </Text>
          </Box>
          <Box className="flex items-center gap-3">
            <Box
              as="select"
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(
                  (e.target as HTMLSelectElement).value as
                    | InsightSeverity
                    | "all",
                )
              }
              aria-label="Filter insights by severity"
              className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </Box>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={generating}
            >
              {generating ? "Analyzing…" : "Regenerate"}
            </Button>
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && !error && insights.length === 0 && (
          <EmptyState
            title="No active insights."
            hint="Click Regenerate to analyze your recent email activity."
          />
        )}
        {!loading && insights.length > 0 && (
          <Box as="ul" className="space-y-3" aria-label="Productivity insights">
            {insights.map((i) => (
              <InsightCard
                key={i.id}
                insight={i}
                busy={busyId === i.id}
                onAction={(id) => void handleAction(id)}
                onDismiss={(id) => void handleDismiss(id)}
              />
            ))}
          </Box>
        )}
        {hasMore && !loading && (
          <Box className="text-center mt-4">
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
      </CardContent>
    </Card>
  );
}
InsightsSection.displayName = "InsightsSection";

// ─── Team leaderboard ──────────────────────────────────────────────────────────

/** Short, stable label for an account id (leaderboard has no display names). */
function shortAccount(accountId: string): string {
  if (accountId.length <= 10) return accountId;
  return `${accountId.slice(0, 6)}…${accountId.slice(-4)}`;
}

function LeaderboardSection(): ReactNode {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await productivityAnalyticsApi.leaderboard();
      setRows(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Team leaderboard
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Most email handled across your workspace in the last 7 days.
        </Text>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState
            title="No leaderboard data yet."
            hint="Rankings appear once workspace members have tracked email activity."
          />
        )}
        {!loading && !error && rows.length > 0 && (
          <Box className="overflow-x-auto">
            <Box
              as="table"
              className="w-full text-sm border-collapse"
              aria-label="Team productivity leaderboard"
            >
              <Box as="thead">
                <Box as="tr" className="border-b border-border text-left">
                  <Box
                    as="th"
                    scope="col"
                    className="py-2 pr-3 font-medium text-content-subtle w-12"
                  >
                    #
                  </Box>
                  <Box
                    as="th"
                    scope="col"
                    className="py-2 pr-3 font-medium text-content-subtle"
                  >
                    Member
                  </Box>
                  <Box
                    as="th"
                    scope="col"
                    className="py-2 pr-3 font-medium text-content-subtle text-right"
                  >
                    Emails
                  </Box>
                  <Box
                    as="th"
                    scope="col"
                    className="py-2 pr-3 font-medium text-content-subtle text-right"
                  >
                    Time
                  </Box>
                  <Box
                    as="th"
                    scope="col"
                    className="py-2 font-medium text-content-subtle text-right"
                  >
                    Avg / email
                  </Box>
                </Box>
              </Box>
              <Box as="tbody">
                {rows.map((row) => (
                  <Box
                    as="tr"
                    key={row.accountId}
                    className="border-b border-border last:border-0"
                  >
                    <Box as="td" className="py-2 pr-3 tabular-nums text-content">
                      {row.rank <= 3 ? (
                        <Pill
                          tone={
                            row.rank === 1
                              ? "amber"
                              : row.rank === 2
                                ? "gray"
                                : "brand"
                          }
                        >
                          {row.rank}
                        </Pill>
                      ) : (
                        row.rank
                      )}
                    </Box>
                    <Box
                      as="td"
                      className="py-2 pr-3 text-content font-mono text-xs"
                    >
                      {shortAccount(row.accountId)}
                    </Box>
                    <Box
                      as="td"
                      className="py-2 pr-3 text-right tabular-nums text-content"
                    >
                      {row.totalEmails.toLocaleString()}
                    </Box>
                    <Box
                      as="td"
                      className="py-2 pr-3 text-right tabular-nums text-content-subtle"
                    >
                      {formatDuration(row.totalSeconds)}
                    </Box>
                    <Box
                      as="td"
                      className="py-2 text-right tabular-nums text-content-subtle"
                    >
                      {formatDuration(row.avgSecondsPerEmail)}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
LeaderboardSection.displayName = "LeaderboardSection";

// ─── Page ──────────────────────────────────────────────────────────────────────

function ProductivityContent(): ReactNode {
  return (
    <Box className="space-y-6">
      <ReportSection />
      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PredictSection />
        <ComparisonSection />
      </Box>
      <InsightsSection />
      <LeaderboardSection />
    </Box>
  );
}
ProductivityContent.displayName = "ProductivityContent";

export default function ProductivityPage(): ReactNode {
  return (
    <PageLayout
      title="Productivity"
      description="Where your time goes in email, when you're at your best, and how to reclaim hours — measured by AlecRae."
    >
      <PlanGate feature="productivity_analytics" required="pro">
        <ProductivityContent />
      </PlanGate>
    </PageLayout>
  );
}
