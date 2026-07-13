"use client";

/**
 * AlecRae — Sentiment Timeline (Relationship Intelligence)
 *
 * Per-contact sentiment tracked over time, relationship health scoring, and
 * risk alerts when a relationship is trending down — so a cooling relationship
 * is caught before it goes cold.
 *
 * API (mounted at /v1/sentiment — verified in apps/api/src/server.ts, NOT
 * /v1/sentiment-timeline):
 *   GET /v1/sentiment/dashboard                → aggregate stats
 *   GET /v1/sentiment/contacts                 → relationship-health list
 *   GET /v1/sentiment/contacts/:contactEmail   → one contact's health
 *   GET /v1/sentiment/timeline/:contactEmail   → one contact's timeline
 *   GET /v1/sentiment/alerts                   → declining relationships
 *   GET /v1/sentiment/trends                   → aggregate sentiment over time
 *   GET /v1/sentiment/topics                   → topics + average sentiment
 *
 * Plan gate: pro+ (sentiment_timeline).
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
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  SentimentSparkline,
  type SparklinePoint,
} from "../../../components/sentiment-sparkline";
import {
  sentimentTimelineApi,
  type ContactSortBy,
  type RelationshipHealth,
  type RiskLevel,
  type SentimentDashboard,
  type SentimentEntry,
  type TopicSentiment,
  type TrendPoint,
} from "../../../lib/api-sentiment-timeline";

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** 0–1 sentiment average → human label. */
function sentimentLabel(avg: number): string {
  if (avg >= 0.7) return "Very positive";
  if (avg >= 0.55) return "Positive";
  if (avg >= 0.45) return "Neutral";
  if (avg >= 0.3) return "Negative";
  return "Very negative";
}

function healthTone(score: number): PillTone {
  if (score >= 60) return "green";
  if (score >= 45) return "amber";
  return "red";
}

function riskTone(risk: string): PillTone {
  if (risk === "high") return "red";
  if (risk === "medium") return "amber";
  if (risk === "low") return "blue";
  return "gray";
}

function trendTone(trend: string): PillTone {
  if (trend === "improving") return "green";
  if (trend === "declining") return "red";
  return "gray";
}

function trendGlyph(trend: string): string {
  if (trend === "improving") return "↗";
  if (trend === "declining") return "↘";
  return "→";
}

function contactLabel(c: RelationshipHealth): string {
  return c.contactName?.trim() || c.contactEmail;
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

// ─── Dashboard stats ───────────────────────────────────────────────────────────

function DashboardStats({
  dashboard,
  loading,
  error,
  onRetry,
}: {
  dashboard: SentimentDashboard | null;
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
      label: "Emails analyzed",
      value: dashboard.totalAnalyzed.toLocaleString(),
    },
    {
      label: "Average sentiment",
      value: pct(dashboard.averageSentiment),
    },
    {
      label: "Contacts tracked",
      value: (
        dashboard.topPositiveContacts.length +
        dashboard.topNegativeContacts.length
      ).toLocaleString(),
    },
    {
      label: "Relationships at risk",
      value: dashboard.atRiskCount.toLocaleString(),
      alert: dashboard.atRiskCount > 0,
    },
  ];

  return (
    <Box
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      aria-label="Sentiment overview"
    >
      {stats.map(({ label, value, alert }) => (
        <Box
          key={label}
          className={`flex flex-col rounded-lg border px-4 py-3 ${
            alert ? "border-red-200 bg-red-50" : "border-border bg-surface-raised"
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

// ─── Contact detail (timeline sparkline) ───────────────────────────────────────

function ContactDetail({
  contact,
  onClose,
}: {
  contact: RelationshipHealth;
  onClose: () => void;
}): ReactNode {
  const [entries, setEntries] = useState<SentimentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await sentimentTimelineApi.contactTimeline(
        contact.contactEmail,
      );
      setEntries(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [contact.contactEmail]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Oldest → newest for the sparkline (endpoint returns newest-first).
  const points: SparklinePoint[] = [...entries]
    .map((e) => ({
      t: new Date(e.createdAt).getTime(),
      score: e.score,
      label: formatDate(e.createdAt),
    }))
    .sort((a, b) => a.t - b.t);

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-start justify-between gap-3">
          <Box className="min-w-0">
            <Text variant="heading-sm" className="font-semibold truncate">
              {contactLabel(contact)}
            </Text>
            {contact.contactName && (
              <Text variant="caption" className="text-content-subtle block">
                {contact.contactEmail}
              </Text>
            )}
            <Box className="mt-2 flex flex-wrap items-center gap-2">
              <Pill tone={healthTone(contact.healthScore)}>
                Health {Math.round(contact.healthScore)}
              </Pill>
              <Pill tone={trendTone(contact.trendDirection)}>
                {trendGlyph(contact.trendDirection)} {contact.trendDirection}
              </Pill>
              <Pill tone={riskTone(contact.riskLevel)}>
                {contact.riskLevel === "none"
                  ? "no risk"
                  : `${contact.riskLevel} risk`}
              </Pill>
              <Text variant="caption" className="text-content-subtle">
                {contact.totalInteractions} interaction
                {contact.totalInteractions === 1 ? "" : "s"} ·{" "}
                {sentimentLabel(contact.avgSentiment)} ({pct(contact.avgSentiment)})
              </Text>
            </Box>
          </Box>
          <Button
            ref={closeRef}
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close contact detail"
          >
            Close
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          {error && <ErrorBanner message={error} onRetry={() => void load()} />}
          {loading && <LoadingSkeleton rows={3} />}

          {!loading && !error && entries.length === 0 && (
            <EmptyState
              title="No sentiment history for this contact yet."
              hint="History builds as emails from this contact are analyzed."
            />
          )}

          {!loading && !error && points.length > 0 && (
            <>
              <Box className="rounded-lg border border-border bg-surface-raised p-4">
                <Text
                  variant="caption"
                  className="text-content-subtle uppercase tracking-wide font-medium block mb-2"
                >
                  Sentiment over time
                </Text>
                <SentimentSparkline
                  points={points}
                  width={520}
                  height={72}
                  className="max-w-full text-content"
                  ariaLabel={`Sentiment for ${contactLabel(contact)} across ${points.length} analyzed emails, oldest to newest`}
                />
                <Box className="mt-2 flex items-center justify-between">
                  <Text variant="caption" className="text-content-subtle">
                    {points[0] ? formatDate(new Date(points[0].t).toISOString()) : ""}
                  </Text>
                  <Text variant="caption" className="text-content-subtle">
                    {points[points.length - 1]
                      ? formatDate(
                          new Date(
                            points[points.length - 1]?.t ?? Date.now(),
                          ).toISOString(),
                        )
                      : ""}
                  </Text>
                </Box>
              </Box>

              {/* Table fallback / detail list */}
              <Box>
                <Text
                  variant="caption"
                  className="text-content-subtle uppercase tracking-wide font-medium block mb-2"
                >
                  Recent emails
                </Text>
                <Box as="ul" className="space-y-2" aria-label="Analyzed emails">
                  {entries.slice(0, 20).map((e) => (
                    <Box
                      as="li"
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                    >
                      <Box className="min-w-0">
                        <Text variant="body-sm" className="text-content">
                          {e.sentiment.replace("_", " ")}
                        </Text>
                        {e.topics && e.topics.length > 0 && (
                          <Text
                            variant="caption"
                            className="text-content-subtle block truncate"
                          >
                            {e.topics.join(", ")}
                            {e.emotionalTone ? ` · ${e.emotionalTone}` : ""}
                          </Text>
                        )}
                      </Box>
                      <Box className="flex items-center gap-2 flex-shrink-0">
                        <Pill tone={healthTone(e.score * 100)}>{pct(e.score)}</Pill>
                        <Text variant="caption" className="text-content-subtle">
                          {formatDate(e.createdAt)}
                        </Text>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
ContactDetail.displayName = "ContactDetail";

// ─── Contacts section ──────────────────────────────────────────────────────────

function ContactRow({
  contact,
  selected,
  onSelect,
}: {
  contact: RelationshipHealth;
  selected: boolean;
  onSelect: (c: RelationshipHealth) => void;
}): ReactNode {
  return (
    <Box
      as="li"
      className={`rounded-lg border px-4 py-3 ${
        contact.riskLevel === "high"
          ? "border-red-300 bg-red-50 border-l-4 border-l-red-500"
          : "border-border bg-surface-raised"
      }`}
    >
      <Box
        as="button"
        type="button"
        onClick={() => onSelect(contact)}
        aria-pressed={selected}
        aria-label={`View sentiment detail for ${contactLabel(contact)}`}
        className="flex w-full flex-col sm:flex-row sm:items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
      >
        <Box className="flex-1 min-w-0">
          <Text variant="body-sm" className="font-medium text-content truncate">
            {contactLabel(contact)}
          </Text>
          <Box className="mt-1 flex flex-wrap items-center gap-2">
            <Pill tone={healthTone(contact.healthScore)}>
              Health {Math.round(contact.healthScore)}
            </Pill>
            <Pill tone={trendTone(contact.trendDirection)}>
              {trendGlyph(contact.trendDirection)} {contact.trendDirection}
            </Pill>
            {contact.riskLevel !== "none" && (
              <Pill tone={riskTone(contact.riskLevel)}>
                {contact.riskLevel} risk
              </Pill>
            )}
            <Text variant="caption" className="text-content-subtle">
              {contact.totalInteractions} interaction
              {contact.totalInteractions === 1 ? "" : "s"}
            </Text>
          </Box>
        </Box>
        <Box className="flex-shrink-0 text-right">
          <Text variant="caption" className="text-content-subtle block">
            {sentimentLabel(contact.avgSentiment)}
          </Text>
          <Text variant="body-sm" className="font-semibold text-content">
            {pct(contact.avgSentiment)}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
ContactRow.displayName = "ContactRow";

function ContactsSection({
  refreshKey,
  onSelect,
  selectedEmail,
}: {
  refreshKey: number;
  onSelect: (c: RelationshipHealth) => void;
  selectedEmail: string | null;
}): ReactNode {
  const [contacts, setContacts] = useState<RelationshipHealth[]>([]);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [sortBy, setSortBy] = useState<ContactSortBy>("updatedAt");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await sentimentTimelineApi.contacts({
        ...(riskFilter !== "all" ? { riskLevel: riskFilter } : {}),
        sortBy,
        limit: 50,
      });
      setContacts(res.data);
      setCursor(res.pagination?.nextCursor);
      setHasMore(res.pagination?.hasMore ?? false);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [riskFilter, sortBy]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await sentimentTimelineApi.contacts({
        ...(riskFilter !== "all" ? { riskLevel: riskFilter } : {}),
        sortBy,
        limit: 50,
        cursor,
      });
      setContacts((prev) => [...prev, ...res.data]);
      setCursor(res.pagination?.nextCursor);
      setHasMore(res.pagination?.hasMore ?? false);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Box className="space-y-4">
      <Box className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Box className="flex items-center gap-3">
          <Text
            as="label"
            variant="body-sm"
            className="text-content-subtle"
            htmlFor="contact-risk-filter"
          >
            Risk
          </Text>
          <Box
            as="select"
            id="contact-risk-filter"
            value={riskFilter}
            onChange={(e) =>
              setRiskFilter(
                (e.target as HTMLSelectElement).value as RiskLevel | "all",
              )
            }
            aria-label="Filter contacts by risk level"
            className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </Box>
        </Box>
        <Box className="flex items-center gap-3">
          <Text
            as="label"
            variant="body-sm"
            className="text-content-subtle"
            htmlFor="contact-sort"
          >
            Sort by
          </Text>
          <Box
            as="select"
            id="contact-sort"
            value={sortBy}
            onChange={(e) =>
              setSortBy((e.target as HTMLSelectElement).value as ContactSortBy)
            }
            aria-label="Sort contacts"
            className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
          >
            <option value="updatedAt">Recently updated</option>
            <option value="healthScore">Health score</option>
            <option value="totalInteractions">Interactions</option>
          </Box>
        </Box>
      </Box>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={5} />}
      {!loading && !error && contacts.length === 0 && (
        <EmptyState
          title="No tracked relationships yet."
          hint="Sentiment is analyzed automatically as your email syncs. Contacts appear here once their emails are scored."
        />
      )}
      {!loading && contacts.length > 0 && (
        <Box as="ul" className="space-y-3" aria-label="Contacts by sentiment">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              selected={selectedEmail === c.contactEmail}
              onSelect={onSelect}
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
ContactsSection.displayName = "ContactsSection";

// ─── At-risk section ───────────────────────────────────────────────────────────

function AtRiskSection({
  refreshKey,
  onSelect,
}: {
  refreshKey: number;
  onSelect: (c: RelationshipHealth) => void;
}): ReactNode {
  const [alerts, setAlerts] = useState<RelationshipHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await sentimentTimelineApi.alerts();
      setAlerts(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <Box className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={4} />}
      {!loading && !error && alerts.length === 0 && (
        <EmptyState
          title="No relationships are trending down."
          hint="When a contact's sentiment starts declining, they'll surface here so you can reach out."
        />
      )}
      {!loading && alerts.length > 0 && (
        <>
          <Box
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
            role="alert"
          >
            <Text variant="body-sm" className="font-semibold text-red-800">
              {alerts.length} relationship{alerts.length === 1 ? " is" : "s are"}{" "}
              trending down
            </Text>
            <Text variant="caption" className="text-red-700 mt-0.5 block">
              Sentiment is declining. A timely reply can turn these around.
            </Text>
          </Box>
          <Box as="ul" className="space-y-3" aria-label="At-risk relationships">
            {alerts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                selected={false}
                onSelect={onSelect}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
AtRiskSection.displayName = "AtRiskSection";

// ─── Trends section ────────────────────────────────────────────────────────────

function TrendsSection({ refreshKey }: { refreshKey: number }): ReactNode {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [days, setDays] = useState<number>(30);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topics, setTopics] = useState<TopicSentiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [t, tp] = await Promise.all([
        sentimentTimelineApi.trends({ period, days }),
        sentimentTimelineApi.topics().catch(() => ({ data: [] })),
      ]);
      setTrend(t.data);
      setTopics(tp.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [period, days]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const points: SparklinePoint[] = trend.map((p, i) => ({
    t: new Date(p.period).getTime() || i,
    score: p.avgScore,
    label: p.period.slice(0, 10),
  }));

  return (
    <Box className="space-y-5">
      <Box className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Box className="flex items-center gap-3">
          <Text
            as="label"
            variant="body-sm"
            className="text-content-subtle"
            htmlFor="trend-period"
          >
            Period
          </Text>
          <Box
            as="select"
            id="trend-period"
            value={period}
            onChange={(e) =>
              setPeriod(
                (e.target as HTMLSelectElement).value as
                  | "daily"
                  | "weekly"
                  | "monthly",
              )
            }
            aria-label="Trend period"
            className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Box>
        </Box>
        <Box className="flex items-center gap-3">
          <Text
            as="label"
            variant="body-sm"
            className="text-content-subtle"
            htmlFor="trend-range"
          >
            Range
          </Text>
          <Box
            as="select"
            id="trend-range"
            value={String(days)}
            onChange={(e) =>
              setDays(Number((e.target as HTMLSelectElement).value))
            }
            aria-label="Trend date range in days"
            className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </Box>
        </Box>
      </Box>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={3} />}

      {!loading && !error && (
        <>
          <Box className="rounded-lg border border-border bg-surface-raised p-4">
            <Text
              variant="caption"
              className="text-content-subtle uppercase tracking-wide font-medium block mb-2"
            >
              Average sentiment ({period})
            </Text>
            {points.length === 0 ? (
              <EmptyState title="No sentiment data in this range yet." />
            ) : (
              <>
                <SentimentSparkline
                  points={points}
                  width={640}
                  height={80}
                  className="max-w-full text-content"
                  ariaLabel={`Average sentiment ${period} over the selected range, ${points.length} data points`}
                />
                <Box className="mt-2 flex items-center justify-between">
                  <Text variant="caption" className="text-content-subtle">
                    {points[0]?.label ?? ""}
                  </Text>
                  <Text variant="caption" className="text-content-subtle">
                    {points[points.length - 1]?.label ?? ""}
                  </Text>
                </Box>
              </>
            )}
          </Box>

          <Box>
            <Text
              variant="caption"
              className="text-content-subtle uppercase tracking-wide font-medium block mb-2"
            >
              Top topics by volume
            </Text>
            {topics.length === 0 ? (
              <EmptyState title="No topics detected yet." />
            ) : (
              <Box as="ul" className="space-y-2" aria-label="Topics by sentiment">
                {topics.map((t) => (
                  <Box
                    as="li"
                    key={t.topic}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <Text variant="body-sm" className="text-content truncate">
                      {t.topic}
                    </Text>
                    <Box className="flex items-center gap-2 flex-shrink-0">
                      <Pill tone={healthTone(t.avgScore * 100)}>
                        {pct(t.avgScore)}
                      </Pill>
                      <Text variant="caption" className="text-content-subtle">
                        {t.count} email{t.count === 1 ? "" : "s"}
                      </Text>
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
TrendsSection.displayName = "TrendsSection";

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "contacts" | "at-risk" | "trends";

const TABS: { id: TabId; label: string }[] = [
  { id: "contacts", label: "Contacts" },
  { id: "at-risk", label: "At risk" },
  { id: "trends", label: "Trends" },
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
      aria-label="Sentiment views"
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

function SentimentContent(): ReactNode {
  const [dashboard, setDashboard] = useState<SentimentDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("contacts");
  const [selected, setSelected] = useState<RelationshipHealth | null>(null);
  const [refreshKey] = useState(0);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const res = await sentimentTimelineApi.dashboard();
      setDashboard(res.data);
    } catch (err) {
      setDashboardError(errMsg(err));
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function handleSelect(c: RelationshipHealth): void {
    setSelected(c);
  }

  return (
    <Box className="space-y-6">
      <DashboardStats
        dashboard={dashboard}
        loading={dashboardLoading}
        error={dashboardError}
        onRetry={() => void loadDashboard()}
      />

      {selected && (
        <ContactDetail contact={selected} onClose={() => setSelected(null)} />
      )}

      <Card>
        <CardContent>
          <Box className="space-y-4">
            <TabBar active={tab} onChange={setTab} />
            <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === "contacts" && (
                <ContactsSection
                  refreshKey={refreshKey}
                  onSelect={handleSelect}
                  selectedEmail={selected?.contactEmail ?? null}
                />
              )}
              {tab === "at-risk" && (
                <AtRiskSection refreshKey={refreshKey} onSelect={handleSelect} />
              )}
              {tab === "trends" && <TrendsSection refreshKey={refreshKey} />}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
SentimentContent.displayName = "SentimentContent";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SentimentPage(): ReactNode {
  return (
    <PageLayout
      title="Sentiment Timeline"
      description="How every relationship is trending — sentiment tracked over time, with alerts before a relationship goes cold."
    >
      <PlanGate feature="sentiment_timeline" required="pro">
        <SentimentContent />
      </PlanGate>
    </PageLayout>
  );
}
