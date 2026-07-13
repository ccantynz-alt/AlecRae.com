"use client";

/**
 * AlecRae — Scheduling Intelligence + Send-Time Analytics
 *
 * Two tabbed sections over two backend route files:
 *   • Meeting Intelligence  → /v1/scheduling            (scheduling-intelligence.ts)
 *   • Send-Time Analytics   → /v1/analytics/scheduling   (scheduling-analytics.ts)
 *
 * Plan gate: pro+ (scheduling_intelligence).
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
import { SchedulingHeatmap, type HeatmapCell } from "../../../components/scheduling-heatmap";
import {
  schedulingIntelligenceApi,
  schedulingAnalyticsApi,
  type AvailabilityPattern,
  type BestTimeSlot,
  type BestTimesData,
  type ConflictsData,
  type MeetingProposal,
  type MeetingProposalStatus,
  type RecipientEngagementData,
  type SchedulingAnalyticsData,
  type SchedulingStats,
} from "../../../lib/api-scheduling";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hourClock(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const base = hour % 12 === 0 ? 12 : hour % 12;
  return `${base} ${period}`;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
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

function proposalStatusTone(status: MeetingProposalStatus): PillTone {
  if (status === "accepted") return "green";
  if (status === "declined") return "red";
  if (status === "expired") return "gray";
  return "brand";
}

// ─── Meeting Intelligence: stats ────────────────────────────────────────────────

function MeetingStats({
  stats,
}: {
  stats: SchedulingStats;
}): ReactNode {
  const cards: { label: string; value: string }[] = [
    { label: "Total proposals", value: stats.proposals.total.toLocaleString() },
    { label: "Awaiting reply", value: stats.proposals.proposed.toLocaleString() },
    { label: "Accepted", value: stats.proposals.accepted.toLocaleString() },
    { label: "Accept rate", value: `${stats.acceptRate}%` },
    { label: "Avg duration", value: `${stats.avgDuration}m` },
    {
      label: "Pattern confidence",
      value: `${Math.round(stats.patterns.avgConfidence * 100)}%`,
    },
  ];

  return (
    <Box
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
      aria-label="Meeting intelligence overview"
    >
      {cards.map(({ label, value }) => (
        <Box
          key={label}
          className="flex flex-col rounded-lg border border-border bg-surface-raised px-4 py-3"
        >
          <Text variant="heading-md" className="font-bold text-content">
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
MeetingStats.displayName = "MeetingStats";

// ─── Meeting Intelligence: availability patterns ────────────────────────────────

function AvailabilityCard({
  patterns,
  onSaved,
}: {
  patterns: AvailabilityPattern[];
  onSaved: () => void;
}): ReactNode {
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const patternByDay = new Map<number, AvailabilityPattern>();
  for (const p of patterns) patternByDay.set(p.dayOfWeek, p);

  async function handleSave(): Promise<void> {
    if (endHour <= startHour) {
      setError("End hour must be after start hour.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await schedulingIntelligenceApi.updatePattern({
        dayOfWeek,
        preferredStartHour: startHour,
        preferredEndHour: endHour,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Availability
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Your preferred meeting hours per weekday. AI ranks proposed slots
          against these.
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          {/* Learned patterns grid */}
          <Box
            className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2"
            aria-label="Learned availability per day"
          >
            {DAY_NAMES.map((name, day) => {
              const p = patternByDay.get(day);
              return (
                <Box
                  key={name}
                  className={`flex flex-col items-center rounded-lg border px-2 py-2 text-center ${
                    p ? "border-border bg-surface-raised" : "border-dashed border-border bg-surface"
                  }`}
                >
                  <Text variant="caption" className="text-content-subtle font-medium">
                    {name.slice(0, 3)}
                  </Text>
                  {p ? (
                    <>
                      <Text variant="body-sm" className="font-semibold text-content">
                        {hourClock(p.preferredStartHour)}–{hourClock(p.preferredEndHour)}
                      </Text>
                      <Text variant="caption" className="text-content-subtle text-[10px]">
                        {pct(p.confidence)} conf
                      </Text>
                    </>
                  ) : (
                    <Text variant="caption" className="text-content-subtle text-[10px]">
                      Not set
                    </Text>
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Editor */}
          <Box className="border-t border-border pt-4 space-y-3">
            {error && <ErrorBanner message={error} />}
            <Box className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <Box className="flex flex-col gap-1.5">
                <Text
                  as="label"
                  variant="body-sm"
                  className="font-medium text-content"
                  htmlFor="avail-day"
                >
                  Day
                </Text>
                <Box
                  as="select"
                  id="avail-day"
                  value={String(dayOfWeek)}
                  onChange={(e) =>
                    setDayOfWeek(Number((e.target as HTMLSelectElement).value))
                  }
                  aria-label="Day of week"
                  className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
                >
                  {DAY_NAMES.map((name, day) => (
                    <option key={name} value={String(day)}>
                      {name}
                    </option>
                  ))}
                </Box>
              </Box>
              <Box className="flex flex-col gap-1.5">
                <Text
                  as="label"
                  variant="body-sm"
                  className="font-medium text-content"
                  htmlFor="avail-start"
                >
                  Start hour
                </Text>
                <Box
                  as="select"
                  id="avail-start"
                  value={String(startHour)}
                  onChange={(e) =>
                    setStartHour(Number((e.target as HTMLSelectElement).value))
                  }
                  aria-label="Preferred start hour"
                  className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={String(h)}>
                      {hourClock(h)}
                    </option>
                  ))}
                </Box>
              </Box>
              <Box className="flex flex-col gap-1.5">
                <Text
                  as="label"
                  variant="body-sm"
                  className="font-medium text-content"
                  htmlFor="avail-end"
                >
                  End hour
                </Text>
                <Box
                  as="select"
                  id="avail-end"
                  value={String(endHour)}
                  onChange={(e) =>
                    setEndHour(Number((e.target as HTMLSelectElement).value))
                  }
                  aria-label="Preferred end hour"
                  className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={String(h)}>
                      {hourClock(h)}
                    </option>
                  ))}
                </Box>
              </Box>
              <Button
                variant="primary"
                size="md"
                onClick={() => void handleSave()}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save day"}
              </Button>
              {saved && (
                <Text variant="body-sm" className="text-green-700" role="status">
                  Saved
                </Text>
              )}
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
AvailabilityCard.displayName = "AvailabilityCard";

// ─── Meeting Intelligence: conflicts ────────────────────────────────────────────

function ConflictsCard({ conflicts }: { conflicts: ConflictsData }): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Conflicts
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Overlapping accepted meetings in the next {" "}
              {Math.round(
                (new Date(conflicts.range.end).getTime() -
                  new Date(conflicts.range.start).getTime()) /
                  (24 * 60 * 60 * 1000),
              )}{" "}
              days.
            </Text>
          </Box>
          {conflicts.hasConflicts ? (
            <Pill tone="red">{conflicts.conflicts.length} conflict{conflicts.conflicts.length === 1 ? "" : "s"}</Pill>
          ) : (
            <Pill tone="green">No conflicts</Pill>
          )}
        </Box>
      </CardHeader>
      <CardContent>
        {conflicts.conflicts.length === 0 ? (
          <EmptyState
            title="No overlapping meetings."
            hint={`${conflicts.totalAccepted} accepted meeting${conflicts.totalAccepted === 1 ? "" : "s"} checked.`}
          />
        ) : (
          <Box as="ul" className="space-y-3" aria-label="Scheduling conflicts">
            {conflicts.conflicts.map((c) => (
              <Box
                as="li"
                key={`${c.proposalA}-${c.proposalB}`}
                className="rounded-lg border border-red-300 bg-red-50 border-l-4 border-l-red-500 px-4 py-3"
              >
                <Text variant="body-sm" className="font-medium text-red-800">
                  Overlap: {formatDateTime(c.overlapStart)} → {formatDateTime(c.overlapEnd)}
                </Text>
                <Text variant="caption" className="text-red-700 mt-1 block">
                  Proposals {c.proposalA.slice(0, 8)}… and {c.proposalB.slice(0, 8)}…
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ConflictsCard.displayName = "ConflictsCard";

// ─── Meeting Intelligence: proposal row ─────────────────────────────────────────

function ProposalRow({
  proposal,
  busy,
  onRespond,
}: {
  proposal: MeetingProposal;
  busy: boolean;
  onRespond: (
    id: string,
    action: "accept" | "decline" | "suggest_alternative",
  ) => void;
}): ReactNode {
  const topSlot = proposal.proposedTimes[0];
  return (
    <Box
      as="li"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3"
    >
      <Box className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <Box className="min-w-0">
          <Text variant="body-sm" className="font-medium text-content">
            {proposal.subject}
          </Text>
          <Box className="mt-1 flex flex-wrap items-center gap-2">
            <Pill tone={proposalStatusTone(proposal.status)}>{proposal.status}</Pill>
            <Pill tone="gray">{proposal.duration}m</Pill>
            <Pill tone="blue">{proposal.meetingType.replace(/_/g, " ")}</Pill>
            <Text variant="caption" className="text-content-subtle">
              {proposal.participants.length} participant
              {proposal.participants.length === 1 ? "" : "s"}
            </Text>
          </Box>
        </Box>
      </Box>

      {proposal.aiReasoning && (
        <Text variant="caption" className="text-content-subtle italic">
          {proposal.aiReasoning}
        </Text>
      )}

      {/* Proposed slots */}
      {proposal.proposedTimes.length > 0 && (
        <Box className="flex flex-wrap gap-2" aria-label="Proposed time slots">
          {proposal.proposedTimes.slice(0, 4).map((slot) => {
            const selected =
              proposal.selectedTime !== null &&
              proposal.selectedTime === slot.start;
            return (
              <Box
                key={slot.start}
                className={`rounded-lg border px-3 py-1.5 ${
                  selected
                    ? "border-green-400 bg-green-50"
                    : "border-border bg-surface"
                }`}
              >
                <Text variant="caption" className="font-medium text-content block">
                  {formatDateTime(slot.start)}
                </Text>
                <Text variant="caption" className="text-content-subtle text-[10px]">
                  {pct(slot.confidence)} match{selected ? " · selected" : ""}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Actions — only while awaiting a response */}
      {proposal.status === "proposed" && (
        <Box className="flex items-center gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onRespond(proposal.id, "accept")}
            disabled={busy || !topSlot}
            aria-label={`Accept meeting: ${proposal.subject}`}
          >
            Accept
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRespond(proposal.id, "suggest_alternative")}
            disabled={busy}
            aria-label={`Suggest another time for: ${proposal.subject}`}
          >
            Suggest alternative
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRespond(proposal.id, "decline")}
            disabled={busy}
            aria-label={`Decline meeting: ${proposal.subject}`}
            className="text-red-600 hover:text-red-700"
          >
            Decline
          </Button>
        </Box>
      )}
    </Box>
  );
}
ProposalRow.displayName = "ProposalRow";

// ─── Meeting Intelligence section ───────────────────────────────────────────────

function MeetingIntelligenceSection(): ReactNode {
  const [stats, setStats] = useState<SchedulingStats | null>(null);
  const [patterns, setPatterns] = useState<AvailabilityPattern[]>([]);
  const [conflicts, setConflicts] = useState<ConflictsData | null>(null);
  const [proposals, setProposals] = useState<MeetingProposal[]>([]);
  const [statusFilter, setStatusFilter] = useState<MeetingProposalStatus | "all">(
    "all",
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respondText, setRespondText] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, patternsRes, conflictsRes, proposalsRes] = await Promise.all([
        schedulingIntelligenceApi.getStats(),
        schedulingIntelligenceApi.getPatterns(),
        schedulingIntelligenceApi.getConflicts({ range: 7 }),
        schedulingIntelligenceApi.listProposals({
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          limit: 20,
        }),
      ]);
      setStats(statsRes.data);
      setPatterns(patternsRes.data);
      setConflicts(conflictsRes.data);
      setProposals(proposalsRes.data);
      setCursor(proposalsRes.cursor);
      setHasMore(proposalsRes.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await schedulingIntelligenceApi.listProposals({
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        limit: 20,
        cursor,
      });
      setProposals((prev) => [...prev, ...res.data]);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRespond(
    id: string,
    action: "accept" | "decline" | "suggest_alternative",
  ): Promise<void> {
    setBusyId(id);
    setError(null);
    setRespondText(null);
    try {
      const res = await schedulingIntelligenceApi.autoRespond(id, action);
      setRespondText(res.data.responseText);
      // suggest_alternative keeps the proposal "proposed"; accept/decline change it.
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: res.data.status, updatedAt: new Date().toISOString() }
            : p,
        ),
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={() => void load()} />;
  }

  return (
    <Box className="space-y-6">
      {stats && <MeetingStats stats={stats} />}

      <AvailabilityCard patterns={patterns} onSaved={() => void load()} />

      {conflicts && <ConflictsCard conflicts={conflicts} />}

      <Card>
        <CardHeader>
          <Box className="flex flex-wrap items-center justify-between gap-3">
            <Box>
              <Text variant="heading-sm" className="font-semibold">
                Meeting proposals
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                AI-drafted meeting proposals from your email threads.
              </Text>
            </Box>
            <Box className="flex items-center gap-3">
              <Text
                as="label"
                variant="body-sm"
                className="text-content-subtle"
                htmlFor="proposal-status-filter"
              >
                Status
              </Text>
              <Box
                as="select"
                id="proposal-status-filter"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    (e.target as HTMLSelectElement).value as
                      | MeetingProposalStatus
                      | "all",
                  )
                }
                aria-label="Filter proposals by status"
                className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
              >
                <option value="all">All</option>
                <option value="proposed">Awaiting reply</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined</option>
                <option value="expired">Expired</option>
              </Box>
            </Box>
          </Box>
        </CardHeader>
        <CardContent>
          <Box className="space-y-4">
            {respondText && (
              <Box
                className="rounded-lg border border-green-200 bg-green-50 px-4 py-3"
                role="status"
              >
                <Text variant="caption" className="text-green-700 uppercase tracking-wide font-medium block mb-1">
                  Suggested reply
                </Text>
                <Text variant="body-sm" className="text-green-800">
                  {respondText}
                </Text>
              </Box>
            )}

            {proposals.length === 0 ? (
              <EmptyState
                title="No meeting proposals yet."
                hint="Proposals are drafted automatically when AI detects scheduling intent in your email."
              />
            ) : (
              <Box as="ul" className="space-y-3" aria-label="Meeting proposals">
                {proposals.map((p) => (
                  <ProposalRow
                    key={p.id}
                    proposal={p}
                    busy={busyId === p.id}
                    onRespond={(id, action) => void handleRespond(id, action)}
                  />
                ))}
              </Box>
            )}

            {hasMore && (
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
        </CardContent>
      </Card>
    </Box>
  );
}
MeetingIntelligenceSection.displayName = "MeetingIntelligenceSection";

// ─── Send-Time Analytics: best-times list ───────────────────────────────────────

function BestTimesList({ slots }: { slots: BestTimeSlot[] }): ReactNode {
  if (slots.length === 0) {
    return (
      <EmptyState
        title="Not enough data yet."
        hint="Best send times appear once your sent mail has open/click history."
      />
    );
  }
  return (
    <Box as="ol" className="space-y-2" aria-label="Best send times">
      {slots.map((slot, i) => (
        <Box
          as="li"
          key={`${slot.dayOfWeek}-${slot.hour}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-4 py-2.5"
        >
          <Box className="flex items-center gap-3 min-w-0">
            <Box className="w-6 h-6 flex-shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
              {i + 1}
            </Box>
            <Text variant="body-sm" className="font-medium text-content">
              {slot.dayName} at {hourClock(slot.hour)}
            </Text>
          </Box>
          <Box className="flex items-center gap-2 flex-shrink-0">
            <Pill tone="green">{pct(slot.openRate)} open rate</Pill>
            <Text variant="caption" className="text-content-subtle">
              {slot.opens.toLocaleString()} opens
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
BestTimesList.displayName = "BestTimesList";

// ─── Send-Time Analytics: recipient lookup ──────────────────────────────────────

function RecipientLookup(): ReactNode {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipientEngagementData | null>(null);

  async function handleLookup(): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await schedulingAnalyticsApi.recipient(trimmed);
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Recipient engagement
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          When does a specific recipient actually open your email?
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <Box className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <Box className="flex flex-col gap-1.5 flex-1">
              <Text
                as="label"
                variant="body-sm"
                className="font-medium text-content"
                htmlFor="recipient-email"
              >
                Recipient email
              </Text>
              <Input
                id="recipient-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleLookup();
                }}
                placeholder="sarah@acme.com"
                aria-label="Recipient email to look up"
              />
            </Box>
            <Button
              variant="primary"
              size="md"
              onClick={() => void handleLookup()}
              disabled={busy || !email.trim()}
            >
              {busy ? "Looking up…" : "Look up"}
            </Button>
          </Box>

          {result && !result.found && (
            <EmptyState
              title="No engagement data for this recipient yet."
              {...(result.message ? { hint: result.message } : {})}
            />
          )}

          {result && result.found && (
            <Box className="space-y-4">
              <Box className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Sent", value: result.totalSent ?? 0 },
                  { label: "Opened", value: result.totalOpened ?? 0 },
                  { label: "Clicked", value: result.totalClicked ?? 0 },
                  { label: "Replied", value: result.totalReplied ?? 0 },
                ].map(({ label, value }) => (
                  <Box
                    key={label}
                    className="flex flex-col rounded-lg border border-border bg-surface-raised px-3 py-2"
                  >
                    <Text variant="heading-sm" className="font-bold text-content">
                      {value.toLocaleString()}
                    </Text>
                    <Text variant="caption" className="text-content-subtle">
                      {label}
                    </Text>
                  </Box>
                ))}
              </Box>
              <Box className="flex flex-wrap items-center gap-2">
                {typeof result.bestHour === "number" && (
                  <Pill tone="brand">Best hour: {hourClock(result.bestHour)}</Pill>
                )}
                {typeof result.bestDay === "number" &&
                  result.bestDay >= 0 &&
                  result.bestDay <= 6 && (
                    <Pill tone="brand">
                      Best day: {DAY_NAMES[result.bestDay]}
                    </Pill>
                  )}
                {typeof result.avgOpenDelayHours === "number" && (
                  <Pill tone="gray">
                    Avg open delay: {Math.round(result.avgOpenDelayHours)}h
                  </Pill>
                )}
                {result.lastEngagedAt && (
                  <Text variant="caption" className="text-content-subtle">
                    Last engaged {formatDateTime(result.lastEngagedAt)}
                  </Text>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
RecipientLookup.displayName = "RecipientLookup";

// ─── Send-Time Analytics section ────────────────────────────────────────────────

const PERIOD_OPTIONS = [7, 14, 30, 90, 180, 365] as const;

function SendTimeAnalyticsSection(): ReactNode {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<SchedulingAnalyticsData | null>(null);
  const [bestTimes, setBestTimes] = useState<BestTimesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, bestRes] = await Promise.all([
        schedulingAnalyticsApi.overview(days),
        schedulingAnalyticsApi.bestTimes(days),
      ]);
      setOverview(overviewRes.data);
      setBestTimes(bestRes.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // Build the hour×day heatmap cells from best-times' allSlots (opens per slot).
  const heatmapCells: HeatmapCell[] = (bestTimes?.allSlots ?? []).map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    hour: slot.hour,
    value: slot.opens,
  }));

  const hasHourlyData =
    overview !== null && overview.hourly.some((h) => h.total > 0);

  return (
    <Box className="space-y-6">
      {/* Period selector */}
      <Box className="flex items-center gap-3">
        <Text
          as="label"
          variant="body-sm"
          className="text-content-subtle"
          htmlFor="analytics-period"
        >
          Period
        </Text>
        <Box
          as="select"
          id="analytics-period"
          value={String(days)}
          onChange={(e) => setDays(Number((e.target as HTMLSelectElement).value))}
          aria-label="Analytics period in days"
          className="h-9 px-3 rounded-lg border border-border bg-surface text-content text-sm"
        >
          {PERIOD_OPTIONS.map((d) => (
            <option key={d} value={String(d)}>
              Last {d} days
            </option>
          ))}
        </Box>
      </Box>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={5} />}

      {!loading && !error && (
        <>
          {/* Heatmap */}
          <Card>
            <CardHeader>
              <Text variant="heading-sm" className="font-semibold">
                Engagement heatmap
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                Opens by hour of day and day of week. Darker means more opens.
              </Text>
            </CardHeader>
            <CardContent>
              {heatmapCells.length === 0 ? (
                <EmptyState
                  title="No open data in this period."
                  hint="Send some tracked email, then check back."
                />
              ) : (
                <SchedulingHeatmap
                  cells={heatmapCells}
                  unit="opens"
                  ariaLabel="Opens by hour and day of week"
                />
              )}
            </CardContent>
          </Card>

          {/* Best times */}
          <Card>
            <CardHeader>
              <Text variant="heading-sm" className="font-semibold">
                Best send times
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                The hour × day slots with the highest open rates.
              </Text>
            </CardHeader>
            <CardContent>
              <BestTimesList slots={bestTimes?.bestTimes ?? []} />
            </CardContent>
          </Card>

          {/* Hourly / daily breakdown */}
          <Card>
            <CardHeader>
              <Text variant="heading-sm" className="font-semibold">
                Activity breakdown
              </Text>
            </CardHeader>
            <CardContent>
              {!hasHourlyData ? (
                <EmptyState title="No activity recorded in this period." />
              ) : (
                <Box className="space-y-6">
                  {/* By day of week */}
                  <Box>
                    <Text
                      variant="caption"
                      className="text-content-subtle uppercase tracking-wide font-medium mb-2 block"
                      as="h3"
                    >
                      By day of week
                    </Text>
                    <Box className="space-y-1.5" aria-label="Activity by day of week">
                      {(() => {
                        const maxTotal = Math.max(
                          1,
                          ...(overview?.daily.map((d) => d.total) ?? [0]),
                        );
                        return (overview?.daily ?? []).map((d) => (
                          <Box key={d.dayOfWeek} className="flex items-center gap-3">
                            <Box className="w-20 flex-shrink-0">
                              <Text variant="caption" className="text-content-subtle">
                                {d.dayName}
                              </Text>
                            </Box>
                            <Box className="flex-1 h-5 rounded bg-surface-raised overflow-hidden">
                              <Box
                                className="h-full bg-brand-500"
                                style={{ width: `${(d.total / maxTotal) * 100}%` }}
                                aria-hidden="true"
                              />
                            </Box>
                            <Box className="w-28 flex-shrink-0 text-right">
                              <Text variant="caption" className="text-content-subtle">
                                {d.opens.toLocaleString()} opens ·{" "}
                                {d.clicks.toLocaleString()} clicks
                              </Text>
                            </Box>
                          </Box>
                        ));
                      })()}
                    </Box>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          <RecipientLookup />
        </>
      )}
    </Box>
  );
}
SendTimeAnalyticsSection.displayName = "SendTimeAnalyticsSection";

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "meetings" | "analytics";

const TABS: { id: TabId; label: string }[] = [
  { id: "meetings", label: "Meeting Intelligence" },
  { id: "analytics", label: "Send-Time Analytics" },
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
      aria-label="Scheduling views"
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

// ─── Inner page (inside plan gate) ─────────────────────────────────────────────

function SchedulingContent(): ReactNode {
  const [tab, setTab] = useState<TabId>("meetings");

  return (
    <Box className="space-y-6">
      <TabBar active={tab} onChange={setTab} />
      <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "meetings" && <MeetingIntelligenceSection />}
        {tab === "analytics" && <SendTimeAnalyticsSection />}
      </Box>
    </Box>
  );
}
SchedulingContent.displayName = "SchedulingContent";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulingPage(): ReactNode {
  return (
    <PageLayout
      title="Scheduling"
      description="AI meeting proposals, availability, and the best times to send — so your calendar and your inbox both run on evidence."
    >
      <PlanGate feature="scheduling_intelligence" required="pro">
        <SchedulingContent />
      </PlanGate>
    </PageLayout>
  );
}
