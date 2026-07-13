"use client";

/**
 * AlecRae — Email Hygiene Dashboard
 *
 * Productivity score, habit trends, subscription tracker + AI audit, inbox
 * cleanup, response-time + volume analytics, top senders, and productivity
 * goals with progress bars.
 *
 * Backend: apps/api/src/routes/email-hygiene.ts, mounted at /v1/hygiene.
 * All 12 endpoints are wired via lib/api-email-hygiene.ts (hygieneApi):
 *   GET  /v1/hygiene/productivity-score
 *   GET  /v1/hygiene/habits?period=
 *   GET  /v1/hygiene/habits/today
 *   GET  /v1/hygiene/subscriptions
 *   POST /v1/hygiene/subscriptions/:id/wanted
 *   POST /v1/hygiene/subscriptions/audit
 *   POST /v1/hygiene/inbox-cleanup
 *   GET  /v1/hygiene/response-time?period=
 *   GET  /v1/hygiene/email-volume?period=
 *   GET  /v1/hygiene/top-senders?limit=
 *   GET  /v1/hygiene/goals
 *   POST /v1/hygiene/goals
 *
 * Plan gate: personal+
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
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
  hygieneApi,
  type HygienePeriod,
  type ProductivityScore,
  type TodayHabits,
  type EmailHabitDay,
  type HygieneSubscription,
  type SubscriptionAudit,
  type InboxCleanupResult,
  type ResponseTimeAnalytics,
  type EmailVolume,
  type TopSender,
  type GoalsResult,
  type ProductivityGoals,
} from "../../../lib/api-email-hygiene";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function scoreBarClass(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatMinutes(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = mins / 60;
  return `${h.toFixed(1)}h`;
}

function formatPct(rate: number | null): string {
  if (rate === null) return "—";
  // openRate is stored 0..1; render as percent.
  return `${Math.round(rate * 100)}%`;
}

const PERIODS: readonly HygienePeriod[] = ["week", "month", "quarter"] as const;

const PERIOD_LABELS: Record<HygienePeriod, string> = {
  week: "Last 7 days",
  month: "Last month",
  quarter: "Last quarter",
};

type TabKey =
  | "overview"
  | "subscriptions"
  | "cleanup"
  | "activity"
  | "goals";

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "cleanup", label: "Cleanup" },
  { key: "activity", label: "Activity" },
  { key: "goals", label: "Goals" },
] as const;

// ─── Generic sub-components ─────────────────────────────────────────────────────

function LoadingSkeleton({ rows = 3 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-14 animate-pulse rounded-lg bg-surface-raised border border-border"
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
      className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
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

function EmptyState({ message }: { message: string }): ReactNode {
  return (
    <Box className="py-8 text-center">
      <Text variant="body-sm" className="text-content-subtle">
        {message}
      </Text>
    </Box>
  );
}
EmptyState.displayName = "EmptyState";

function StatTile({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <Box className="flex flex-col rounded-lg border border-border bg-surface-raised px-4 py-3">
      <Text variant="heading-md" className="font-bold text-content">
        {value}
      </Text>
      <Text variant="caption" className="text-content-subtle mt-0.5">
        {label}
      </Text>
    </Box>
  );
}
StatTile.displayName = "StatTile";

function PeriodSelect({
  value,
  onChange,
  id,
}: {
  value: HygienePeriod;
  onChange: (p: HygienePeriod) => void;
  id: string;
}): ReactNode {
  return (
    <Box
      as="select"
      id={id}
      value={value}
      onChange={(e) =>
        onChange((e.target as HTMLSelectElement).value as HygienePeriod)
      }
      aria-label="Select time period"
      className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
    >
      {PERIODS.map((p) => (
        <option key={p} value={p}>
          {PERIOD_LABELS[p]}
        </option>
      ))}
    </Box>
  );
}
PeriodSelect.displayName = "PeriodSelect";

// ─── Goal progress bar (retained from previous design) ─────────────────────────

interface GoalBarProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  formatValue?: (v: number) => string;
}

function GoalBar({ label, value, max, unit, formatValue }: GoalBarProps): ReactNode {
  const pct = clamp(max > 0 ? Math.round((value / max) * 100) : 0, 0, 100);
  const barColor = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-brand-600";
  const displayValue = formatValue ? formatValue(value) : `${value}${unit ?? ""}`;
  const displayMax = formatValue ? formatValue(max) : `${max}${unit ?? ""}`;

  return (
    <Box className="space-y-1.5">
      <Box className="flex items-center justify-between gap-2">
        <Text variant="body-sm" className="font-medium text-content">
          {label}
        </Text>
        <Text variant="caption" className="text-content-subtle whitespace-nowrap">
          {displayValue} / {displayMax}
        </Text>
      </Box>
      <Box
        className="h-2.5 w-full rounded-full bg-surface-raised border border-border overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${displayValue} of ${displayMax}`}
      >
        <Box
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </Box>
    </Box>
  );
}
GoalBar.displayName = "GoalBar";

// ─── OVERVIEW: productivity score + today's habits ─────────────────────────────

function ProductivityScoreCard({ data }: { data: ProductivityScore }): ReactNode {
  if (data.overallScore === null) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            message={
              data.message ??
              "Not enough activity yet to calculate a productivity score."
            }
          />
        </CardContent>
      </Card>
    );
  }

  const pct = clamp(data.overallScore, 0, 100);
  const color = scoreColorClass(pct);
  const barColor = scoreBarClass(pct);
  const b = data.breakdown;

  const parts: { label: string; value: string }[] = [];
  if (b.responseTime) {
    parts.push({
      label: "Response time",
      value: `${b.responseTime.score} · ${formatMinutes(b.responseTime.avgMinutes)}`,
    });
  }
  if (b.inboxZeroRate) {
    parts.push({
      label: "Inbox-zero rate",
      value: `${b.inboxZeroRate.score} · ${b.inboxZeroRate.days}/${b.inboxZeroRate.total}d`,
    });
  }
  if (b.archiveRate) {
    parts.push({
      label: "Archive rate",
      value: `${b.archiveRate.score} · ${b.archiveRate.archived}/${b.archiveRate.received}`,
    });
  }
  if (b.consistency) {
    parts.push({
      label: "Consistency",
      value: `${b.consistency.score} · ${b.consistency.activeDays}d active`,
    });
  }

  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <Box className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-40">
            <Box className="flex items-baseline gap-2">
              <Text variant="heading-lg" className={`font-bold leading-none ${color}`}>
                {pct}
              </Text>
              <Text variant="caption" className="text-content-subtle">
                / 100
              </Text>
            </Box>
            <Text variant="caption" className="text-content-subtle uppercase tracking-wide">
              Productivity Score
            </Text>
            <Box
              className="h-2 w-full rounded-full bg-surface-raised border border-border overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Productivity score: ${pct} out of 100`}
            >
              <Box
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </Box>
            <Text variant="caption" className="text-content-subtle">
              {data.daysAnalyzed} day{data.daysAnalyzed === 1 ? "" : "s"} analyzed
            </Text>
          </Box>

          <Box className="grid grid-cols-2 gap-4 flex-1">
            {parts.map(({ label, value }) => (
              <StatTile key={label} label={label} value={value} />
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
ProductivityScoreCard.displayName = "ProductivityScoreCard";

function TodayCard({ data }: { data: TodayHabits }): ReactNode {
  const stats: { label: string; value: string }[] = [
    { label: "Sent", value: data.emailsSent.toLocaleString() },
    { label: "Received", value: data.emailsReceived.toLocaleString() },
    { label: "Archived", value: data.emailsArchived.toLocaleString() },
    { label: "Avg response", value: formatMinutes(data.avgResponseTimeMinutes) },
  ];
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Today
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          {formatDate(data.date)}
          {data.inboxZeroAchieved ? " · Inbox zero reached 🎉" : ""}
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(({ label, value }) => (
            <StatTile key={label} label={label} value={value} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
TodayCard.displayName = "TodayCard";

function HabitsTrendCard({ days }: { days: EmailHabitDay[] }): ReactNode {
  if (days.length === 0) {
    return (
      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Habit history
          </Text>
        </CardHeader>
        <CardContent>
          <EmptyState message="No habit data recorded for this period yet." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Habit history
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Daily sent / received / archived and inbox-zero streak.
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="overflow-x-auto">
          <Box as="table" className="w-full text-sm border-collapse" aria-label="Habit history">
            <Box as="thead">
              <Box as="tr" className="border-b border-border">
                {["Date", "Sent", "Received", "Archived", "Response", "Inbox zero"].map((h) => (
                  <Box
                    key={h}
                    as="th"
                    className="py-2 pr-4 text-left text-content-subtle font-medium text-xs uppercase tracking-wide"
                  >
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              {days.map((d) => (
                <Box
                  key={d.id}
                  as="tr"
                  className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                >
                  <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                    <Text variant="body-sm" className="font-medium text-content">
                      {formatDate(d.date)}
                    </Text>
                  </Box>
                  <Box as="td" className="py-2.5 pr-4">
                    <Text variant="body-sm" className="text-content-subtle">
                      {d.emailsSent}
                    </Text>
                  </Box>
                  <Box as="td" className="py-2.5 pr-4">
                    <Text variant="body-sm" className="text-content-subtle">
                      {d.emailsReceived}
                    </Text>
                  </Box>
                  <Box as="td" className="py-2.5 pr-4">
                    <Text variant="body-sm" className="text-content-subtle">
                      {d.emailsArchived}
                    </Text>
                  </Box>
                  <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                    <Text variant="body-sm" className="text-content-subtle">
                      {formatMinutes(d.avgResponseTimeMinutes)}
                    </Text>
                  </Box>
                  <Box as="td" className="py-2.5">
                    <Text variant="body-sm" className="text-content-subtle">
                      {d.inboxZeroAchieved ? "✓" : "—"}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
HabitsTrendCard.displayName = "HabitsTrendCard";

function OverviewTab(): ReactNode {
  const [score, setScore] = useState<ProductivityScore | null>(null);
  const [today, setToday] = useState<TodayHabits | null>(null);
  const [days, setDays] = useState<EmailHabitDay[] | null>(null);
  const [period, setPeriod] = useState<HygienePeriod>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [scoreRes, todayRes, habitsRes] = await Promise.all([
        hygieneApi.productivityScore(),
        hygieneApi.habitsToday(),
        hygieneApi.habits(period),
      ]);
      setScore(scoreRes.data);
      setToday(todayRes.data);
      setDays(habitsRes.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Box className="space-y-6">
        <Box className="h-36 animate-pulse rounded-xl bg-surface-raised border border-border" />
        <LoadingSkeleton rows={4} />
      </Box>
    );
  }
  if (error) return <ErrorBanner message={error} onRetry={() => void load()} />;

  return (
    <Box className="space-y-6">
      {score && <ProductivityScoreCard data={score} />}
      {today && <TodayCard data={today} />}
      <Box className="flex items-center justify-between gap-3">
        <Text variant="heading-sm" className="font-semibold">
          Trends
        </Text>
        <PeriodSelect id="overview-period" value={period} onChange={setPeriod} />
      </Box>
      <HabitsTrendCard days={days ?? []} />
    </Box>
  );
}
OverviewTab.displayName = "OverviewTab";

// ─── SUBSCRIPTIONS: list + wanted toggle + AI audit ────────────────────────────

function SubscriptionsTab(): ReactNode {
  const [subs, setSubs] = useState<HygieneSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [audit, setAudit] = useState<SubscriptionAudit | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await hygieneApi.subscriptions({ limit: 50 });
      setSubs(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleWanted(sub: HygieneSubscription): Promise<void> {
    const next = !sub.isWanted;
    setBusyId(sub.id);
    setError(null);
    try {
      await hygieneApi.markWanted(sub.id, next);
      setSubs((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, isWanted: next } : s)),
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  async function runAudit(): Promise<void> {
    setAuditing(true);
    setAuditError(null);
    try {
      const res = await hygieneApi.auditSubscriptions();
      setAudit(res.data);
    } catch (err) {
      setAuditError(errMsg(err));
    } finally {
      setAuditing(false);
    }
  }

  return (
    <Box className="space-y-6">
      <Card>
        <CardHeader>
          <Box className="flex items-start justify-between gap-4">
            <Box>
              <Text variant="heading-sm" className="font-semibold">
                Subscription Tracker
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                Newsletters and mailing lists, ranked by volume. Mark ones you no
                longer want.
              </Text>
            </Box>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runAudit()}
              disabled={auditing}
              className="flex-shrink-0"
            >
              {auditing ? "Auditing…" : "AI Audit"}
            </Button>
          </Box>
        </CardHeader>
        <CardContent>
          {auditError && (
            <Box className="mb-3">
              <ErrorBanner message={auditError} onRetry={() => void runAudit()} />
            </Box>
          )}
          {loading && <LoadingSkeleton rows={4} />}
          {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
          {!loading && !error && subs.length === 0 && (
            <EmptyState message="No subscriptions detected yet." />
          )}
          {!loading && !error && subs.length > 0 && (
            <Box className="overflow-x-auto">
              <Box as="table" className="w-full text-sm border-collapse" aria-label="Subscription list">
                <Box as="thead">
                  <Box as="tr" className="border-b border-border">
                    {["Sender", "Received", "Open rate", "Frequency", "Last", ""].map((h) => (
                      <Box
                        key={h}
                        as="th"
                        className="py-2 pr-4 text-left text-content-subtle font-medium text-xs uppercase tracking-wide"
                      >
                        {h}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box as="tbody">
                  {subs.map((sub) => (
                    <Box
                      key={sub.id}
                      as="tr"
                      className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                    >
                      <Box as="td" className="py-2.5 pr-4">
                        <Text variant="body-sm" className="font-medium text-content">
                          {sub.senderName ?? sub.senderEmail}
                        </Text>
                        {sub.senderName && (
                          <Text variant="caption" className="text-content-subtle block">
                            {sub.senderEmail}
                          </Text>
                        )}
                      </Box>
                      <Box as="td" className="py-2.5 pr-4">
                        <Text variant="body-sm" className="text-content-subtle">
                          {sub.totalReceived.toLocaleString()}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4">
                        <Text variant="body-sm" className="text-content-subtle">
                          {formatPct(sub.openRate)}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                        <Text variant="body-sm" className="text-content-subtle capitalize">
                          {sub.frequency ?? "—"}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                        <Text variant="body-sm" className="text-content-subtle">
                          {formatDate(sub.lastReceived)}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleWanted(sub)}
                          disabled={busyId === sub.id}
                          aria-label={
                            sub.isWanted
                              ? `Mark ${sub.senderName ?? sub.senderEmail} as unwanted`
                              : `Mark ${sub.senderName ?? sub.senderEmail} as wanted`
                          }
                          className={sub.isWanted ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                        >
                          {busyId === sub.id
                            ? "Saving…"
                            : sub.isWanted
                              ? "Mark unwanted"
                              : "Mark wanted"}
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {audit && <SubscriptionAuditCard audit={audit} />}
    </Box>
  );
}
SubscriptionsTab.displayName = "SubscriptionsTab";

function SubscriptionAuditCard({ audit }: { audit: SubscriptionAudit }): ReactNode {
  const s = audit.suggestions;
  const groups: { title: string; items: { id: string; label: string; suggestion: string }[] }[] = [
    {
      title: `Never opened (${s.neverOpened.length})`,
      items: s.neverOpened.map((x) => ({
        id: x.id,
        label: x.senderName ?? x.senderEmail,
        suggestion: x.suggestion,
      })),
    },
    {
      title: `Low engagement (${s.lowEngagement.length})`,
      items: s.lowEngagement.map((x) => ({
        id: x.id,
        label: x.senderName ?? x.senderEmail,
        suggestion: x.suggestion,
      })),
    },
    {
      title: `High volume (${s.highVolume.length})`,
      items: s.highVolume.map((x) => ({
        id: x.id,
        label: x.senderName ?? x.senderEmail,
        suggestion: x.suggestion,
      })),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          AI Subscription Audit
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          {audit.totalSubscriptions} total · {audit.wantedCount} wanted ·{" "}
          {audit.unwantedCount} unwanted · ~
          {audit.estimatedTimeSavedMinutesPerWeek} min/week could be saved.
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-5">
          {groups.map((g) => (
            <Box key={g.title} className="space-y-2">
              <Text variant="body-sm" className="font-semibold text-content">
                {g.title}
              </Text>
              {g.items.length === 0 ? (
                <Text variant="caption" className="text-content-subtle">
                  Nothing flagged.
                </Text>
              ) : (
                <Box className="space-y-2">
                  {g.items.map((item) => (
                    <Box
                      key={item.id}
                      className="rounded-lg border border-border bg-surface-raised px-4 py-3"
                    >
                      <Text variant="body-sm" className="font-medium text-content">
                        {item.label}
                      </Text>
                      <Text variant="caption" className="text-content-subtle">
                        {item.suggestion}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
SubscriptionAuditCard.displayName = "SubscriptionAuditCard";

// ─── CLEANUP: inbox-cleanup suggestions ────────────────────────────────────────

function CleanupTab(): ReactNode {
  const [result, setResult] = useState<InboxCleanupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await hygieneApi.inboxCleanup();
      setResult(res.data);
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
        <Box className="flex items-start justify-between gap-4">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Inbox Cleanup
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              AI-generated suggestions to reduce clutter.
            </Text>
          </Box>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="flex-shrink-0"
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {!loading && !error && result && (
          <Box className="space-y-4">
            <Box className="rounded-lg border border-border bg-surface-raised px-4 py-3">
              <Box className="flex items-center justify-between gap-2">
                <Text variant="body-sm" className="font-medium text-content">
                  Unsubscribe candidates
                </Text>
                <Box
                  as="span"
                  className="rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-xs font-medium"
                >
                  {result.suggestions.unsubscribe.count.toLocaleString()}
                </Box>
              </Box>
              {result.suggestions.unsubscribe.candidates.length === 0 ? (
                <Text variant="caption" className="text-content-subtle mt-1 block">
                  No unsubscribe candidates right now.
                </Text>
              ) : (
                <Box className="mt-2 space-y-1.5">
                  {result.suggestions.unsubscribe.candidates.map((cand) => (
                    <Box
                      key={cand.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <Box className="min-w-0">
                        <Text variant="body-sm" className="text-content truncate">
                          {cand.senderName ?? cand.senderEmail}
                        </Text>
                        <Text variant="caption" className="text-content-subtle">
                          {cand.totalReceived.toLocaleString()} received ·{" "}
                          {formatPct(cand.openRate)} open rate
                        </Text>
                      </Box>
                      {cand.unsubscribeUrl && (
                        <Box
                          as="a"
                          href={cand.unsubscribeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 inline-flex items-center h-8 px-3 rounded-md text-body-sm font-medium text-red-600 hover:text-red-700 hover:bg-surface-tertiary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          aria-label={`Open unsubscribe page for ${cand.senderName ?? cand.senderEmail}`}
                        >
                          Unsubscribe
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            <Box className="rounded-lg border border-border bg-surface-raised px-4 py-3">
              <Box className="flex items-center justify-between gap-2">
                <Text variant="body-sm" className="font-medium text-content">
                  Archive habits
                </Text>
                <Text variant="caption" className="text-content-subtle">
                  {result.suggestions.archiveOld.archiveRatio}% archived
                </Text>
              </Box>
              <Text variant="caption" className="text-content-subtle mt-1 block">
                {result.suggestions.archiveOld.suggestion}
              </Text>
            </Box>

            <Box className="rounded-lg border border-border bg-surface-raised px-4 py-3">
              <Text variant="body-sm" className="font-medium text-content">
                Organize with labels
              </Text>
              <Text variant="caption" className="text-content-subtle mt-1 block">
                {result.suggestions.labelOrganize.suggestion}
              </Text>
            </Box>

            <Text variant="caption" className="text-content-subtle">
              Generated {formatDate(result.generatedAt)}
            </Text>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
CleanupTab.displayName = "CleanupTab";

// ─── ACTIVITY: volume + response time + top senders ────────────────────────────

function ActivityTab(): ReactNode {
  const [period, setPeriod] = useState<HygienePeriod>("week");
  const [volume, setVolume] = useState<EmailVolume | null>(null);
  const [respTime, setRespTime] = useState<ResponseTimeAnalytics | null>(null);
  const [senders, setSenders] = useState<TopSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [volRes, rtRes, senderRes] = await Promise.all([
        hygieneApi.emailVolume(period),
        hygieneApi.responseTime(period),
        hygieneApi.topSenders(10),
      ]);
      setVolume(volRes.data);
      setRespTime(rtRes.data);
      setSenders(senderRes.data);
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
    <Box className="space-y-6">
      <Box className="flex items-center justify-between gap-3">
        <Text variant="heading-sm" className="font-semibold">
          Activity
        </Text>
        <PeriodSelect id="activity-period" value={period} onChange={setPeriod} />
      </Box>

      {loading && <LoadingSkeleton rows={4} />}
      {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {!loading && !error && (
        <>
          {volume && (
            <Card>
              <CardHeader>
                <Text variant="heading-sm" className="font-semibold">
                  Email volume
                </Text>
                <Text variant="body-sm" className="text-content-subtle">
                  {formatDate(volume.dateRange.start)} – {formatDate(volume.dateRange.end)}
                </Text>
              </CardHeader>
              <CardContent>
                <Box className="grid grid-cols-3 gap-4">
                  <StatTile label="Sent" value={volume.totals.sent.toLocaleString()} />
                  <StatTile label="Received" value={volume.totals.received.toLocaleString()} />
                  <StatTile label="Archived" value={volume.totals.archived.toLocaleString()} />
                </Box>
              </CardContent>
            </Card>
          )}

          {respTime && (
            <Card>
              <CardHeader>
                <Text variant="heading-sm" className="font-semibold">
                  Response time
                </Text>
                <Text variant="body-sm" className="text-content-subtle">
                  Based on {respTime.overall.daysWithData} day
                  {respTime.overall.daysWithData === 1 ? "" : "s"} with data.
                </Text>
              </CardHeader>
              <CardContent>
                {respTime.overall.daysWithData === 0 ? (
                  <EmptyState message="No response-time data for this period yet." />
                ) : (
                  <Box className="grid grid-cols-3 gap-4">
                    <StatTile
                      label="Average"
                      value={formatMinutes(respTime.overall.avgResponseTimeMinutes)}
                    />
                    <StatTile
                      label="Fastest day"
                      value={formatMinutes(respTime.overall.fastestDayMinutes)}
                    />
                    <StatTile
                      label="Slowest day"
                      value={formatMinutes(respTime.overall.slowestDayMinutes)}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <Text variant="heading-sm" className="font-semibold">
                Top senders
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                Highest-volume senders with engagement.
              </Text>
            </CardHeader>
            <CardContent>
              {senders.length === 0 ? (
                <EmptyState message="No sender data yet." />
              ) : (
                <Box className="overflow-x-auto">
                  <Box as="table" className="w-full text-sm border-collapse" aria-label="Top senders">
                    <Box as="thead">
                      <Box as="tr" className="border-b border-border">
                        {["Sender", "Received", "Opened", "Open rate", "Last"].map((h) => (
                          <Box
                            key={h}
                            as="th"
                            className="py-2 pr-4 text-left text-content-subtle font-medium text-xs uppercase tracking-wide"
                          >
                            {h}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    <Box as="tbody">
                      {senders.map((s) => (
                        <Box
                          key={s.id}
                          as="tr"
                          className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                        >
                          <Box as="td" className="py-2.5 pr-4">
                            <Text variant="body-sm" className="font-medium text-content">
                              {s.senderName ?? s.senderEmail}
                            </Text>
                          </Box>
                          <Box as="td" className="py-2.5 pr-4">
                            <Text variant="body-sm" className="text-content-subtle">
                              {s.totalReceived.toLocaleString()}
                            </Text>
                          </Box>
                          <Box as="td" className="py-2.5 pr-4">
                            <Text variant="body-sm" className="text-content-subtle">
                              {s.totalOpened.toLocaleString()}
                            </Text>
                          </Box>
                          <Box as="td" className="py-2.5 pr-4">
                            <Text variant="body-sm" className="text-content-subtle">
                              {formatPct(s.openRate)}
                            </Text>
                          </Box>
                          <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                            <Text variant="body-sm" className="text-content-subtle">
                              {formatDate(s.lastReceived)}
                            </Text>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
ActivityTab.displayName = "ActivityTab";

// ─── GOALS: get + set ──────────────────────────────────────────────────────────

function GoalsTab(): ReactNode {
  const [result, setResult] = useState<GoalsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [maxDailyChecks, setMaxDailyChecks] = useState("");
  const [targetResponse, setTargetResponse] = useState("");
  const [inboxZeroGoal, setInboxZeroGoal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const applyGoals = useCallback((goals: ProductivityGoals | null): void => {
    setMaxDailyChecks(goals?.maxDailyChecks !== undefined ? String(goals.maxDailyChecks) : "");
    setTargetResponse(
      goals?.targetResponseTimeMinutes !== undefined
        ? String(goals.targetResponseTimeMinutes)
        : "",
    );
    setInboxZeroGoal(goals?.inboxZeroGoal ?? false);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await hygieneApi.goals();
      setResult(res.data);
      applyGoals(res.data.goals);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [applyGoals]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const payload: {
        maxDailyChecks?: number;
        targetResponseTimeMinutes?: number;
        inboxZeroGoal?: boolean;
      } = { inboxZeroGoal };
      const checks = Number.parseInt(maxDailyChecks, 10);
      if (!Number.isNaN(checks)) payload.maxDailyChecks = checks;
      const target = Number.parseInt(targetResponse, 10);
      if (!Number.isNaN(target)) payload.targetResponseTimeMinutes = target;

      await hygieneApi.setGoals(payload);
      setSaved(true);
      await load();
    } catch (err) {
      setSaveError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const progress = result?.progress ?? null;

  return (
    <Box className="space-y-6">
      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Productivity Goals
          </Text>
          <Text variant="body-sm" className="text-content-subtle">
            Set targets and track today's progress against them.
          </Text>
        </CardHeader>
        <CardContent>
          {loading && <LoadingSkeleton rows={3} />}
          {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
          {!loading && !error && (
            <Box className="space-y-5">
              <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Box className="space-y-1.5">
                  <Text
                    as="label"
                    htmlFor="goal-max-checks"
                    variant="body-sm"
                    className="font-medium text-content"
                  >
                    Max daily inbox checks
                  </Text>
                  <Input
                    id="goal-max-checks"
                    type="number"
                    min={1}
                    max={100}
                    value={maxDailyChecks}
                    onChange={(e) => setMaxDailyChecks(e.target.value)}
                    placeholder="e.g. 6"
                    aria-label="Maximum daily inbox checks"
                  />
                </Box>
                <Box className="space-y-1.5">
                  <Text
                    as="label"
                    htmlFor="goal-response"
                    variant="body-sm"
                    className="font-medium text-content"
                  >
                    Target response time (minutes)
                  </Text>
                  <Input
                    id="goal-response"
                    type="number"
                    min={1}
                    max={10080}
                    value={targetResponse}
                    onChange={(e) => setTargetResponse(e.target.value)}
                    placeholder="e.g. 60"
                    aria-label="Target response time in minutes"
                  />
                </Box>
              </Box>

              <Box className="flex items-center gap-2">
                <Box
                  as="input"
                  type="checkbox"
                  id="goal-inbox-zero"
                  checked={inboxZeroGoal}
                  onChange={(e) =>
                    setInboxZeroGoal((e.target as HTMLInputElement).checked)
                  }
                  className="h-4 w-4 rounded border-border text-brand-600"
                />
                <Text
                  as="label"
                  htmlFor="goal-inbox-zero"
                  variant="body-sm"
                  className="text-content"
                >
                  Aim for inbox zero each day
                </Text>
              </Box>

              {saveError && <ErrorBanner message={saveError} />}
              {saved && (
                <Box role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-2">
                  <Text variant="body-sm" className="text-green-800">
                    Goals saved.
                  </Text>
                </Box>
              )}

              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save goals"}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {!loading && !error && progress && (progress.responseTime || progress.inboxZero) && (
        <Card>
          <CardHeader>
            <Text variant="heading-sm" className="font-semibold">
              Today's progress
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-5">
              {progress.responseTime && progress.responseTime.actual !== null && (
                <GoalBar
                  label="Response time vs target"
                  value={clamp(progress.responseTime.target, 0, progress.responseTime.actual)}
                  max={progress.responseTime.actual}
                  formatValue={(v) => formatMinutes(v)}
                />
              )}
              {progress.inboxZero && (
                <Box className="flex items-center justify-between gap-2">
                  <Text variant="body-sm" className="font-medium text-content">
                    Inbox zero today
                  </Text>
                  <Text
                    variant="body-sm"
                    className={
                      progress.inboxZero.achievedToday
                        ? "text-green-600 font-medium"
                        : "text-content-subtle"
                    }
                  >
                    {progress.inboxZero.achievedToday ? "Achieved ✓" : "Not yet"}
                  </Text>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
GoalsTab.displayName = "GoalsTab";

// ─── Inner page (inside plan gate) ─────────────────────────────────────────────

function HygieneContent(): ReactNode {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <Box className="space-y-6">
      <Box
        role="tablist"
        aria-label="Email hygiene sections"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <Button
              key={key}
              role="tab"
              aria-selected={active}
              variant="ghost"
              size="sm"
              onClick={() => setTab(key)}
              className={
                active
                  ? "border-b-2 border-brand-600 text-brand-700 rounded-none"
                  : "text-content-subtle rounded-none"
              }
            >
              {label}
            </Button>
          );
        })}
      </Box>

      <Box role="tabpanel">
        {tab === "overview" && <OverviewTab />}
        {tab === "subscriptions" && <SubscriptionsTab />}
        {tab === "cleanup" && <CleanupTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "goals" && <GoalsTab />}
      </Box>
    </Box>
  );
}
HygieneContent.displayName = "HygieneContent";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HygienePage(): ReactNode {
  return (
    <PageLayout
      title="Email Hygiene"
      description="Track your email habits, manage subscriptions, and keep your inbox healthy."
    >
      <PlanGate feature="email_hygiene" required="personal">
        <HygieneContent />
      </PlanGate>
    </PageLayout>
  );
}
