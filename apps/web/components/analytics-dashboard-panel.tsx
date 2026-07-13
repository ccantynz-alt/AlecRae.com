"use client";

/**
 * AlecRae — Advanced Analytics Dashboard panel
 *
 * Wires all 12 /v1/analytics/dashboard endpoints into the Analytics page:
 *   Overview   — GET /overview (period comparison stat cards)
 *   Trends     — GET /trends (snapshot history charts + table),
 *                POST /snapshot (record a snapshot), GET /export (JSON download)
 *   Engagement — GET /engagement (open/click/reply/bounce rates + daily bars)
 *   Contacts   — GET /top-senders, GET /top-recipients
 *   Goals      — GET/POST /goals, PUT/DELETE /goals/:id (CRUD + progress)
 *   Compare    — GET /comparison (two ranges side by side)
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AnalyticsChart,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  StatCard,
  Text,
  type ChartDataPoint,
  type StatTrend,
} from "@alecrae/ui";
import {
  analyticsDashboardApi,
  type AnalyticsGoal,
  type ComparisonResult,
  type DashboardOverview,
  type EngagementMetrics,
  type GoalMetric,
  type SnapshotPeriod,
  type TopContact,
  type TrendPoint,
} from "../lib/api-analytics-dashboard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function clampPct(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function trendFor(change: number | null): StatTrend {
  if (change === null || change === 0) return "neutral";
  return change > 0 ? "up" : "down";
}

function shortDate(date: string): string {
  return date.slice(5); // YYYY-MM-DD → MM-DD
}

const PERIODS: SnapshotPeriod[] = ["daily", "weekly", "monthly"];

const GOAL_METRICS: GoalMetric[] = [
  "response_time",
  "open_rate",
  "inbox_zero_days",
  "emails_sent",
];

const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  response_time: "Avg response time (min)",
  open_rate: "Open rate (%)",
  inbox_zero_days: "Inbox-zero days",
  emails_sent: "Emails sent",
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function LoadingRows({ rows = 3 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-12 animate-pulse rounded-lg bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
LoadingRows.displayName = "LoadingRows";

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

function EmptyNote({ children }: { children: ReactNode }): ReactNode {
  return (
    <Box className="py-8 text-center">
      <Text variant="body-sm" className="text-content-subtle">
        {children}
      </Text>
    </Box>
  );
}
EmptyNote.displayName = "EmptyNote";

function PeriodSelect({
  value,
  onChange,
  label,
}: {
  value: SnapshotPeriod;
  onChange: (p: SnapshotPeriod) => void;
  label?: string;
}): ReactNode {
  return (
    <Box className="flex flex-col gap-1.5">
      {label && (
        <Text variant="caption" className="text-content-subtle">
          {label}
        </Text>
      )}
      <Box
        as="select"
        value={value}
        onChange={(e) =>
          onChange((e.target as HTMLSelectElement).value as SnapshotPeriod)
        }
        aria-label={label ?? "Snapshot period"}
        className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-sm"
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </option>
        ))}
      </Box>
    </Box>
  );
}
PeriodSelect.displayName = "PeriodSelect";

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): ReactNode {
  return (
    <Box className="flex flex-col gap-1.5">
      <Text variant="caption" className="text-content-subtle">
        {label}
      </Text>
      <Input
        type="date"
        inputSize="md"
        value={value}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        aria-label={label}
      />
    </Box>
  );
}
DateField.displayName = "DateField";

function MiniBar({
  pct,
  label,
  colorClass = "bg-brand-600",
}: {
  pct: number;
  label: string;
  colorClass?: string;
}): ReactNode {
  const clamped = clampPct(pct);
  return (
    <Box
      className="h-2 w-full rounded-full bg-surface-raised border border-border overflow-hidden"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <Box
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${clamped}%` }}
      />
    </Box>
  );
}
MiniBar.displayName = "MiniBar";

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab(): ReactNode {
  const [period, setPeriod] = useState<SnapshotPeriod>("daily");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsDashboardApi.overview(period);
      setOverview(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards: {
    label: string;
    value: number;
    change: number | null;
  }[] = overview
    ? [
        { label: "Emails Sent", value: overview.current.totalSent, change: overview.changes.sent },
        { label: "Emails Received", value: overview.current.totalReceived, change: overview.changes.received },
        { label: "Opened", value: overview.current.totalOpened, change: overview.changes.opened },
        { label: "Clicked", value: overview.current.totalClicked, change: overview.changes.clicked },
        { label: "Replied", value: overview.current.totalReplied, change: overview.changes.replied },
        { label: "Bounced", value: overview.current.totalBounced, change: overview.changes.bounced },
      ]
    : [];

  return (
    <Box className="space-y-4">
      <Box className="flex flex-wrap items-end justify-between gap-3">
        <Text variant="body-sm" className="text-content-subtle">
          Aggregated snapshot totals vs the previous period
          {overview
            ? ` (${overview.dateRange.start} → ${overview.dateRange.end})`
            : ""}
          .
        </Text>
        <PeriodSelect value={period} onChange={setPeriod} />
      </Box>

      {loading && <LoadingRows rows={2} />}
      {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {!loading && !error && overview && (
        <>
          <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value.toLocaleString()}
                {...(card.change !== null
                  ? { changePercent: card.change }
                  : {})}
                trend={trendFor(card.change)}
                description="vs previous period"
              />
            ))}
          </Box>
          <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Avg Response Time"
              value={
                overview.current.avgResponseTimeMinutes !== null
                  ? `${overview.current.avgResponseTimeMinutes} min`
                  : "—"
              }
              trend="neutral"
              description={
                overview.previous.avgResponseTimeMinutes !== null
                  ? `was ${overview.previous.avgResponseTimeMinutes} min`
                  : "no previous data"
              }
            />
            <StatCard
              label="Snapshots Recorded"
              value={overview.current.snapshotCount}
              trend="neutral"
              description={`previous period: ${overview.previous.snapshotCount}`}
            />
          </Box>
          {overview.current.snapshotCount === 0 && (
            <EmptyNote>
              No snapshots in this range yet — record one from the Trends tab.
            </EmptyNote>
          )}
        </>
      )}
    </Box>
  );
}
OverviewTab.displayName = "OverviewTab";

// ─── Trends tab (trends + snapshot upsert + export) ───────────────────────────

interface SnapshotFormState {
  date: string;
  emailsSent: string;
  emailsReceived: string;
  emailsOpened: string;
  emailsClicked: string;
  emailsBounced: string;
  emailsReplied: string;
}

const SNAPSHOT_FIELDS: { key: keyof Omit<SnapshotFormState, "date">; label: string }[] = [
  { key: "emailsSent", label: "Sent" },
  { key: "emailsReceived", label: "Received" },
  { key: "emailsOpened", label: "Opened" },
  { key: "emailsClicked", label: "Clicked" },
  { key: "emailsBounced", label: "Bounced" },
  { key: "emailsReplied", label: "Replied" },
];

function SnapshotRecorder({
  period,
  onRecorded,
}: {
  period: SnapshotPeriod;
  onRecorded: () => void;
}): ReactNode {
  const [form, setForm] = useState<SnapshotFormState>({
    date: isoDate(new Date()),
    emailsSent: "0",
    emailsReceived: "0",
    emailsOpened: "0",
    emailsClicked: "0",
    emailsBounced: "0",
    emailsReplied: "0",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function setField(key: keyof SnapshotFormState, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    setNotice(null);
    const counts: Record<string, number> = {};
    for (const field of SNAPSHOT_FIELDS) {
      const parsed = Number(form[field.key]);
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        setError(`"${field.label}" must be a non-negative whole number.`);
        return;
      }
      counts[field.key] = parsed;
    }
    setSaving(true);
    try {
      const res = await analyticsDashboardApi.upsertSnapshot({
        period,
        date: form.date,
        emailsSent: counts["emailsSent"] ?? 0,
        emailsReceived: counts["emailsReceived"] ?? 0,
        emailsOpened: counts["emailsOpened"] ?? 0,
        emailsClicked: counts["emailsClicked"] ?? 0,
        emailsBounced: counts["emailsBounced"] ?? 0,
        emailsReplied: counts["emailsReplied"] ?? 0,
      });
      setNotice(
        res.data.upserted === "created"
          ? `Snapshot recorded for ${res.data.date}.`
          : `Snapshot updated for ${res.data.date}.`,
      );
      onRecorded();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Record a Snapshot
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Upserts a {period} snapshot for the chosen date (existing values are
          replaced).
        </Text>
      </CardHeader>
      <CardContent>
        {error && (
          <Box className="mb-3">
            <ErrorBanner message={error} />
          </Box>
        )}
        {notice && (
          <Box
            className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
            role="status"
          >
            <Text variant="body-sm" className="text-green-800">
              {notice}
            </Text>
          </Box>
        )}
        <Box className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          <DateField
            label="Date"
            value={form.date}
            onChange={(v) => setField("date", v)}
          />
          {SNAPSHOT_FIELDS.map((field) => (
            <Box key={field.key} className="flex flex-col gap-1.5">
              <Text variant="caption" className="text-content-subtle">
                {field.label}
              </Text>
              <Input
                type="number"
                min={0}
                step={1}
                inputSize="md"
                value={form[field.key]}
                onChange={(e) =>
                  setField(field.key, (e.target as HTMLInputElement).value)
                }
                aria-label={`${field.label} count`}
              />
            </Box>
          ))}
        </Box>
        <Box className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={saving || form.date === ""}
          >
            {saving ? "Saving…" : "Save Snapshot"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
SnapshotRecorder.displayName = "SnapshotRecorder";

function TrendsTab(): ReactNode {
  const [startDate, setStartDate] = useState<string>(daysAgo(30));
  const [endDate, setEndDate] = useState<string>(isoDate(new Date()));
  const [period, setPeriod] = useState<SnapshotPeriod>("daily");
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsDashboardApi.trends({
        startDate,
        endDate,
        period,
      });
      setPoints(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport(): Promise<void> {
    setExporting(true);
    setExportError(null);
    try {
      const res = await analyticsDashboardApi.exportJson({
        startDate,
        endDate,
        period,
      });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `alecrae-analytics-${startDate}-to-${endDate}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(errMsg(err));
    } finally {
      setExporting(false);
    }
  }

  const sentChart: ChartDataPoint[] = points.map((p) => ({
    label: shortDate(p.date),
    value: p.emailsSent,
  }));
  const receivedChart: ChartDataPoint[] = points.map((p) => ({
    label: shortDate(p.date),
    value: p.emailsReceived,
  }));

  return (
    <Box className="space-y-4">
      <Box className="flex flex-wrap items-end gap-3">
        <DateField label="From" value={startDate} onChange={setStartDate} />
        <DateField label="To" value={endDate} onChange={setEndDate} />
        <PeriodSelect value={period} onChange={setPeriod} label="Period" />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleExport()}
          disabled={exporting || startDate === "" || endDate === ""}
        >
          {exporting ? "Exporting…" : "Export JSON"}
        </Button>
      </Box>

      {exportError && <ErrorBanner message={exportError} />}
      {loading && <LoadingRows rows={3} />}
      {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {!loading && !error && points.length === 0 && (
        <EmptyNote>
          No snapshots in this range. Record one below to start building trend
          history.
        </EmptyNote>
      )}
      {!loading && !error && points.length > 0 && (
        <>
          <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnalyticsChart
              title="Emails Sent"
              description="Per snapshot over the selected range"
              data={sentChart}
              chartType="bar"
              height={200}
            />
            <AnalyticsChart
              title="Emails Received"
              description="Per snapshot over the selected range"
              data={receivedChart}
              chartType="area"
              height={200}
            />
          </Box>
          <Card>
            <CardHeader>
              <Text variant="heading-sm" className="font-semibold">
                Snapshot History
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                {points.length} snapshot{points.length === 1 ? "" : "s"} in
                range.
              </Text>
            </CardHeader>
            <CardContent>
              <Box className="overflow-x-auto">
                <Box
                  as="table"
                  className="w-full text-sm border-collapse"
                  aria-label="Snapshot history"
                >
                  <Box as="thead">
                    <Box as="tr" className="border-b border-border">
                      {["Date", "Sent", "Received", "Opened", "Clicked", "Replied", "Bounced", "Avg response"].map((h) => (
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
                    {points.map((p) => (
                      <Box
                        key={p.id}
                        as="tr"
                        className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                      >
                        <Box as="td" className="py-2 pr-4 whitespace-nowrap">
                          <Text variant="body-sm" className="font-medium text-content">
                            {p.date}
                          </Text>
                        </Box>
                        {[p.emailsSent, p.emailsReceived, p.emailsOpened, p.emailsClicked, p.emailsReplied, p.emailsBounced].map((v, i) => (
                          <Box key={i} as="td" className="py-2 pr-4">
                            <Text variant="body-sm" className="text-content-subtle">
                              {v.toLocaleString()}
                            </Text>
                          </Box>
                        ))}
                        <Box as="td" className="py-2 pr-4 whitespace-nowrap">
                          <Text variant="body-sm" className="text-content-subtle">
                            {p.avgResponseTimeMinutes !== null
                              ? `${Math.round(p.avgResponseTimeMinutes)} min`
                              : "—"}
                          </Text>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </>
      )}

      <SnapshotRecorder period={period} onRecorded={() => void load()} />
    </Box>
  );
}
TrendsTab.displayName = "TrendsTab";

// ─── Engagement tab ───────────────────────────────────────────────────────────

function formatRate(rate: number | null): string {
  return rate !== null ? `${rate}%` : "—";
}

function EngagementTab(): ReactNode {
  const [startDate, setStartDate] = useState<string>(daysAgo(30));
  const [endDate, setEndDate] = useState<string>(isoDate(new Date()));
  const [period, setPeriod] = useState<SnapshotPeriod>("daily");
  const [metrics, setMetrics] = useState<EngagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsDashboardApi.engagement({
        startDate,
        endDate,
        period,
      });
      setMetrics(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, period]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Box className="space-y-4">
      <Box className="flex flex-wrap items-end gap-3">
        <DateField label="From" value={startDate} onChange={setStartDate} />
        <DateField label="To" value={endDate} onChange={setEndDate} />
        <PeriodSelect value={period} onChange={setPeriod} label="Period" />
      </Box>

      {loading && <LoadingRows rows={2} />}
      {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {!loading && !error && metrics && (
        <>
          <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Open Rate"
              value={formatRate(metrics.openRate)}
              trend="neutral"
              description={`${metrics.totals.opened.toLocaleString()} of ${metrics.totals.sent.toLocaleString()} sent`}
            />
            <StatCard
              label="Click Rate"
              value={formatRate(metrics.clickRate)}
              trend="neutral"
              description={`${metrics.totals.clicked.toLocaleString()} clicks`}
            />
            <StatCard
              label="Reply Rate"
              value={formatRate(metrics.replyRate)}
              trend="neutral"
              description={`${metrics.totals.replied.toLocaleString()} of ${metrics.totals.received.toLocaleString()} received`}
            />
            <StatCard
              label="Bounce Rate"
              value={formatRate(metrics.bounceRate)}
              trend="neutral"
              description={`${metrics.totals.bounced.toLocaleString()} bounces`}
            />
          </Box>

          {metrics.daily.length === 0 ? (
            <EmptyNote>No engagement data in this range yet.</EmptyNote>
          ) : (
            <Card>
              <CardHeader>
                <Text variant="heading-sm" className="font-semibold">
                  Engagement by Snapshot
                </Text>
                <Text variant="body-sm" className="text-content-subtle">
                  Open and reply rates per snapshot date.
                </Text>
              </CardHeader>
              <CardContent>
                <Box className="space-y-3">
                  {metrics.daily.map((day) => (
                    <Box
                      key={day.date}
                      className="grid grid-cols-1 sm:grid-cols-[6rem_1fr_1fr] gap-2 sm:gap-4 items-center"
                    >
                      <Text variant="body-sm" className="font-medium text-content whitespace-nowrap">
                        {day.date}
                      </Text>
                      <Box className="flex items-center gap-2">
                        <Box className="flex-1">
                          <MiniBar
                            pct={day.openRate ?? 0}
                            label={`Open rate on ${day.date}: ${formatRate(day.openRate)}`}
                          />
                        </Box>
                        <Text variant="caption" className="text-content-subtle w-16 whitespace-nowrap">
                          open {formatRate(day.openRate)}
                        </Text>
                      </Box>
                      <Box className="flex items-center gap-2">
                        <Box className="flex-1">
                          <MiniBar
                            pct={day.replyRate ?? 0}
                            label={`Reply rate on ${day.date}: ${formatRate(day.replyRate)}`}
                            colorClass="bg-green-500"
                          />
                        </Box>
                        <Text variant="caption" className="text-content-subtle w-16 whitespace-nowrap">
                          reply {formatRate(day.replyRate)}
                        </Text>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
EngagementTab.displayName = "EngagementTab";

// ─── Top contacts tab ─────────────────────────────────────────────────────────

function ContactList({
  title,
  description,
  contacts,
}: {
  title: string;
  description: string;
  contacts: TopContact[];
}): ReactNode {
  const max = contacts.reduce((m, c) => Math.max(m, c.appearances), 1);
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          {title}
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          {description}
        </Text>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <EmptyNote>No data yet for this range.</EmptyNote>
        ) : (
          <Box className="space-y-3">
            {contacts.map((contact) => (
              <Box key={contact.email} className="space-y-1">
                <Box className="flex items-center justify-between gap-2">
                  <Text variant="body-sm" className="font-medium text-content truncate">
                    {contact.email}
                  </Text>
                  <Text variant="caption" className="text-content-subtle whitespace-nowrap">
                    {contact.appearances} snapshot{contact.appearances === 1 ? "" : "s"}
                  </Text>
                </Box>
                <MiniBar
                  pct={(contact.appearances / max) * 100}
                  label={`${contact.email}: appears in ${contact.appearances} snapshots`}
                />
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ContactList.displayName = "ContactList";

function ContactsTab(): ReactNode {
  const [period, setPeriod] = useState<SnapshotPeriod>("daily");
  const [senders, setSenders] = useState<TopContact[]>([]);
  const [recipients, setRecipients] = useState<TopContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [sendersRes, recipientsRes] = await Promise.all([
        analyticsDashboardApi.topSenders({ limit: 10, period }),
        analyticsDashboardApi.topRecipients({ limit: 10, period }),
      ]);
      setSenders(sendersRes.data);
      setRecipients(recipientsRes.data);
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
    <Box className="space-y-4">
      <Box className="flex flex-wrap items-end justify-between gap-3">
        <Text variant="body-sm" className="text-content-subtle">
          How often each address appears in your top-contact snapshots.
        </Text>
        <PeriodSelect value={period} onChange={setPeriod} />
      </Box>
      {loading && <LoadingRows rows={4} />}
      {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {!loading && !error && (
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ContactList
            title="Top Senders"
            description="Addresses most frequently in your top-senders list."
            contacts={senders}
          />
          <ContactList
            title="Top Recipients"
            description="Addresses you email most often."
            contacts={recipients}
          />
        </Box>
      )}
    </Box>
  );
}
ContactsTab.displayName = "ContactsTab";

// ─── Goals tab ────────────────────────────────────────────────────────────────

interface GoalFormState {
  metric: GoalMetric;
  targetValue: string;
  currentValue: string;
  startDate: string;
  endDate: string;
}

function GoalCard({
  goal,
  onChanged,
  onError,
}: {
  goal: AnalyticsGoal;
  onChanged: () => void;
  onError: (message: string) => void;
}): ReactNode {
  const [progressInput, setProgressInput] = useState<string>(
    String(goal.currentValue),
  );
  const [busy, setBusy] = useState(false);

  const pct =
    goal.targetValue > 0
      ? clampPct((goal.currentValue / goal.targetValue) * 100)
      : 0;

  async function handleSaveProgress(): Promise<void> {
    const parsed = Number(progressInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      onError("Progress must be a non-negative number.");
      return;
    }
    setBusy(true);
    try {
      await analyticsDashboardApi.updateGoal(goal.id, { currentValue: parsed });
      onChanged();
    } catch (err) {
      onError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAchieved(): Promise<void> {
    setBusy(true);
    try {
      await analyticsDashboardApi.updateGoal(goal.id, {
        isAchieved: !goal.isAchieved,
      });
      onChanged();
    } catch (err) {
      onError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Delete this goal?")) return;
    setBusy(true);
    try {
      await analyticsDashboardApi.deleteGoal(goal.id);
      onChanged();
    } catch (err) {
      onError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box className="rounded-lg border border-border bg-surface-raised px-4 py-3 space-y-3">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex items-center gap-2">
          <Text variant="body-sm" className="font-medium text-content">
            {GOAL_METRIC_LABELS[goal.metric]}
          </Text>
          {goal.isAchieved && (
            <Box
              as="span"
              className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium"
            >
              Achieved
            </Box>
          )}
        </Box>
        <Text variant="caption" className="text-content-subtle whitespace-nowrap">
          {goal.startDate} → {goal.endDate}
        </Text>
      </Box>

      <Box className="space-y-1.5">
        <Box className="flex items-center justify-between gap-2">
          <Text variant="caption" className="text-content-subtle">
            Progress
          </Text>
          <Text variant="caption" className="text-content-subtle whitespace-nowrap">
            {goal.currentValue.toLocaleString()} / {goal.targetValue.toLocaleString()} ({pct}%)
          </Text>
        </Box>
        <MiniBar
          pct={pct}
          label={`${GOAL_METRIC_LABELS[goal.metric]}: ${goal.currentValue} of ${goal.targetValue}`}
          colorClass={goal.isAchieved ? "bg-green-500" : "bg-brand-600"}
        />
      </Box>

      <Box className="flex flex-wrap items-center gap-2">
        <Box className="w-28">
          <Input
            type="number"
            min={0}
            inputSize="sm"
            value={progressInput}
            onChange={(e) =>
              setProgressInput((e.target as HTMLInputElement).value)
            }
            aria-label={`Update progress for ${GOAL_METRIC_LABELS[goal.metric]}`}
          />
        </Box>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleSaveProgress()}
          disabled={busy}
        >
          Update Progress
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleToggleAchieved()}
          disabled={busy}
        >
          {goal.isAchieved ? "Reopen" : "Mark Achieved"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={busy}
          className="text-red-600 hover:text-red-700"
          aria-label={`Delete goal: ${GOAL_METRIC_LABELS[goal.metric]}`}
        >
          Delete
        </Button>
      </Box>
    </Box>
  );
}
GoalCard.displayName = "GoalCard";

function GoalsTab(): ReactNode {
  const [goals, setGoals] = useState<AnalyticsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<GoalFormState>({
    metric: "emails_sent",
    targetValue: "100",
    currentValue: "0",
    startDate: isoDate(new Date()),
    endDate: daysAgo(-30),
  });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsDashboardApi.listGoals();
      setGoals(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(): Promise<void> {
    setActionError(null);
    const target = Number(form.targetValue);
    const current = Number(form.currentValue);
    if (!Number.isFinite(target) || target < 0) {
      setActionError("Target must be a non-negative number.");
      return;
    }
    if (!Number.isFinite(current) || current < 0) {
      setActionError("Current value must be a non-negative number.");
      return;
    }
    if (form.startDate === "" || form.endDate === "") {
      setActionError("Start and end dates are required.");
      return;
    }
    setCreating(true);
    try {
      await analyticsDashboardApi.createGoal({
        metric: form.metric,
        targetValue: target,
        currentValue: current,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      await load();
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Box className="space-y-4">
      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            New Goal
          </Text>
          <Text variant="body-sm" className="text-content-subtle">
            Set a target for a metric over a date range and track progress.
          </Text>
        </CardHeader>
        <CardContent>
          {actionError && (
            <Box className="mb-3">
              <ErrorBanner message={actionError} />
            </Box>
          )}
          <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <Box className="flex flex-col gap-1.5">
              <Text variant="caption" className="text-content-subtle">
                Metric
              </Text>
              <Box
                as="select"
                value={form.metric}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    metric: (e.target as HTMLSelectElement).value as GoalMetric,
                  }))
                }
                aria-label="Goal metric"
                className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-sm"
              >
                {GOAL_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {GOAL_METRIC_LABELS[m]}
                  </option>
                ))}
              </Box>
            </Box>
            <Box className="flex flex-col gap-1.5">
              <Text variant="caption" className="text-content-subtle">
                Target
              </Text>
              <Input
                type="number"
                min={0}
                inputSize="md"
                value={form.targetValue}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    targetValue: (e.target as HTMLInputElement).value,
                  }))
                }
                aria-label="Target value"
              />
            </Box>
            <Box className="flex flex-col gap-1.5">
              <Text variant="caption" className="text-content-subtle">
                Current
              </Text>
              <Input
                type="number"
                min={0}
                inputSize="md"
                value={form.currentValue}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    currentValue: (e.target as HTMLInputElement).value,
                  }))
                }
                aria-label="Current value"
              />
            </Box>
            <DateField
              label="Start"
              value={form.startDate}
              onChange={(v) => setForm((prev) => ({ ...prev, startDate: v }))}
            />
            <DateField
              label="End"
              value={form.endDate}
              onChange={(v) => setForm((prev) => ({ ...prev, endDate: v }))}
            />
          </Box>
          <Box className="mt-4 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleCreate()}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create Goal"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Your Goals
          </Text>
          <Text variant="body-sm" className="text-content-subtle">
            {goals.length} goal{goals.length === 1 ? "" : "s"} tracked.
          </Text>
        </CardHeader>
        <CardContent>
          {loading && <LoadingRows rows={3} />}
          {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
          {!loading && !error && goals.length === 0 && (
            <EmptyNote>No goals yet — create your first one above.</EmptyNote>
          )}
          {!loading && !error && goals.length > 0 && (
            <Box className="space-y-3">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onChanged={() => void load()}
                  onError={setActionError}
                />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
GoalsTab.displayName = "GoalsTab";

// ─── Compare tab ──────────────────────────────────────────────────────────────

const COMPARISON_ROWS: {
  label: string;
  key: "totalSent" | "totalReceived" | "totalOpened" | "totalClicked" | "totalReplied" | "totalBounced";
  diffKey: "sent" | "received" | "opened" | "clicked" | "replied" | "bounced";
}[] = [
  { label: "Sent", key: "totalSent", diffKey: "sent" },
  { label: "Received", key: "totalReceived", diffKey: "received" },
  { label: "Opened", key: "totalOpened", diffKey: "opened" },
  { label: "Clicked", key: "totalClicked", diffKey: "clicked" },
  { label: "Replied", key: "totalReplied", diffKey: "replied" },
  { label: "Bounced", key: "totalBounced", diffKey: "bounced" },
];

function CompareTab(): ReactNode {
  const [start1, setStart1] = useState<string>(daysAgo(30));
  const [end1, setEnd1] = useState<string>(isoDate(new Date()));
  const [start2, setStart2] = useState<string>(daysAgo(61));
  const [end2, setEnd2] = useState<string>(daysAgo(31));
  const [period, setPeriod] = useState<SnapshotPeriod>("daily");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompare(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsDashboardApi.comparison({
        startDate1: start1,
        endDate1: end1,
        startDate2: start2,
        endDate2: end2,
        period,
      });
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  const ready =
    start1 !== "" && end1 !== "" && start2 !== "" && end2 !== "";

  return (
    <Box className="space-y-4">
      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <Text variant="heading-sm" className="font-semibold">
              Range A
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="flex flex-wrap gap-3">
              <DateField label="From" value={start1} onChange={setStart1} />
              <DateField label="To" value={end1} onChange={setEnd1} />
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Text variant="heading-sm" className="font-semibold">
              Range B
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="flex flex-wrap gap-3">
              <DateField label="From" value={start2} onChange={setStart2} />
              <DateField label="To" value={end2} onChange={setEnd2} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box className="flex flex-wrap items-end gap-3">
        <PeriodSelect value={period} onChange={setPeriod} label="Period" />
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleCompare()}
          disabled={loading || !ready}
        >
          {loading ? "Comparing…" : "Compare Ranges"}
        </Button>
      </Box>

      {error && <ErrorBanner message={error} onRetry={() => void handleCompare()} />}

      {result && !error && (
        <Card>
          <CardHeader>
            <Text variant="heading-sm" className="font-semibold">
              Comparison
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              A: {result.range1.dateRange.start} → {result.range1.dateRange.end}{" "}
              ({result.range1.snapshotCount} snapshots) · B:{" "}
              {result.range2.dateRange.start} → {result.range2.dateRange.end} (
              {result.range2.snapshotCount} snapshots)
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="overflow-x-auto">
              <Box
                as="table"
                className="w-full text-sm border-collapse"
                aria-label="Range comparison"
              >
                <Box as="thead">
                  <Box as="tr" className="border-b border-border">
                    {["Metric", "Range A", "Range B", "Difference (A − B)"].map((h) => (
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
                  {COMPARISON_ROWS.map((row) => {
                    const diff = result.difference[row.diffKey];
                    return (
                      <Box
                        key={row.key}
                        as="tr"
                        className="border-b border-border last:border-0"
                      >
                        <Box as="td" className="py-2 pr-4">
                          <Text variant="body-sm" className="font-medium text-content">
                            {row.label}
                          </Text>
                        </Box>
                        <Box as="td" className="py-2 pr-4">
                          <Text variant="body-sm" className="text-content-subtle">
                            {result.range1[row.key].toLocaleString()}
                          </Text>
                        </Box>
                        <Box as="td" className="py-2 pr-4">
                          <Text variant="body-sm" className="text-content-subtle">
                            {result.range2[row.key].toLocaleString()}
                          </Text>
                        </Box>
                        <Box as="td" className="py-2 pr-4">
                          <Text
                            variant="body-sm"
                            className={
                              diff > 0
                                ? "text-green-600 font-medium"
                                : diff < 0
                                  ? "text-red-600 font-medium"
                                  : "text-content-subtle"
                            }
                          >
                            {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                          </Text>
                        </Box>
                      </Box>
                    );
                  })}
                  <Box as="tr">
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="font-medium text-content">
                        Avg response
                      </Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-content-subtle">
                        {result.range1.avgResponseTimeMinutes !== null
                          ? `${result.range1.avgResponseTimeMinutes} min`
                          : "—"}
                      </Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-content-subtle">
                        {result.range2.avgResponseTimeMinutes !== null
                          ? `${result.range2.avgResponseTimeMinutes} min`
                          : "—"}
                      </Text>
                    </Box>
                    <Box as="td" className="py-2 pr-4">
                      <Text variant="body-sm" className="text-content-subtle">
                        —
                      </Text>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {!result && !error && !loading && (
        <EmptyNote>
          Pick two date ranges and run a comparison to see them side by side.
        </EmptyNote>
      )}
    </Box>
  );
}
CompareTab.displayName = "CompareTab";

// ─── Panel (tab shell) ────────────────────────────────────────────────────────

type DashboardTab =
  | "overview"
  | "trends"
  | "engagement"
  | "contacts"
  | "goals"
  | "compare";

const TABS: { id: DashboardTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "engagement", label: "Engagement" },
  { id: "contacts", label: "Top Contacts" },
  { id: "goals", label: "Goals" },
  { id: "compare", label: "Compare" },
];

export function AnalyticsDashboardPanel(): ReactNode {
  const [tab, setTab] = useState<DashboardTab>("overview");

  return (
    <Card>
      <CardHeader>
        <Box className="flex flex-wrap items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Advanced Dashboard
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Snapshot history, engagement trends, top contacts, and goal
              tracking.
            </Text>
          </Box>
          <Box
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label="Advanced dashboard sections"
          >
            {TABS.map((t) => (
              <Button
                key={t.id}
                variant={tab === t.id ? "primary" : "ghost"}
                size="sm"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        {tab === "overview" && <OverviewTab />}
        {tab === "trends" && <TrendsTab />}
        {tab === "engagement" && <EngagementTab />}
        {tab === "contacts" && <ContactsTab />}
        {tab === "goals" && <GoalsTab />}
        {tab === "compare" && <CompareTab />}
      </CardContent>
    </Card>
  );
}
AnalyticsDashboardPanel.displayName = "AnalyticsDashboardPanel";
