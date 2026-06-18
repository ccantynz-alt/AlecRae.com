"use client";

/**
 * AlecRae — Email Hygiene Dashboard
 *
 * Hygiene score, habit stats, subscription tracker, inbox cleanup suggestions,
 * and goals with progress bars.
 *
 * API:
 *   GET  /v1/email-hygiene/score           → score + stats
 *   GET  /v1/email-hygiene/subscriptions   → subscription[]
 *   POST /v1/email-hygiene/subscriptions/:id/unsubscribe
 *   GET  /v1/email-hygiene/habits          → habit metrics + suggestions
 *   POST /v1/email-hygiene/cleanup         → apply a suggestion
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
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import { getAccessToken } from "../../../lib/auth-token";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface HygieneScore {
  score: number;
  avgResponseHours: number;
  unreadCount: number;
  newslettersPerWeek: number;
  avgInboxSize: number;
}

interface Subscription {
  id: string;
  sender: string;
  email: string;
  frequency: string;
  lastReceived: string;
}

interface CleanupSuggestion {
  id: string;
  title: string;
  description: string;
  count: number;
}

interface HygieneHabits {
  inboxZeroDays: number;
  inboxZeroGoal: number;
  responseRate: number;
  unsubscribeRate: number;
  suggestions: CleanupSuggestion[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

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

// ─── Sub-components ────────────────────────────────────────────────────────────

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

// ─── Hygiene Score Card ────────────────────────────────────────────────────────

function HygieneScoreCard({ data }: { data: HygieneScore }): ReactNode {
  const pct = clamp(data.score, 0, 100);
  const color = scoreColorClass(data.score);
  const barColor = scoreBarClass(data.score);

  const stats: { label: string; value: string }[] = [
    { label: "Avg response time", value: `${data.avgResponseHours.toFixed(1)}h` },
    { label: "Unread emails", value: data.unreadCount.toLocaleString() },
    { label: "Newsletters/week", value: String(data.newslettersPerWeek) },
    { label: "Avg inbox size", value: data.avgInboxSize.toLocaleString() },
  ];

  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Score */}
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
              Hygiene Score
            </Text>
            {/* Progress bar */}
            <Box
              className="h-2 w-full rounded-full bg-surface-raised border border-border overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Hygiene score: ${pct} out of 100`}
            >
              <Box
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </Box>
          </Box>

          {/* Habit stats */}
          <Box className="grid grid-cols-2 gap-4 flex-1">
            {stats.map(({ label, value }) => (
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
        </Box>
      </CardContent>
    </Card>
  );
}
HygieneScoreCard.displayName = "HygieneScoreCard";

// ─── Subscription Tracker ──────────────────────────────────────────────────────

function SubscriptionTracker(): ReactNode {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Subscription[]>("/v1/email-hygiene/subscriptions");
      setSubs(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnsubscribe(id: string): Promise<void> {
    if (!confirm("Unsubscribe from this sender?")) return;
    setUnsubscribingId(id);
    try {
      await apiFetch<unknown>(`/v1/email-hygiene/subscriptions/${id}/unsubscribe`, {
        method: "POST",
      });
      setSubs((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setUnsubscribingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Subscription Tracker
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Senders delivering regular newsletters or mailing-list emails.
        </Text>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={4} />}
        {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {!loading && !error && subs.length === 0 && (
          <Box className="py-8 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No subscriptions detected yet.
            </Text>
          </Box>
        )}
        {!loading && !error && subs.length > 0 && (
          <Box className="overflow-x-auto">
            <Box
              as="table"
              className="w-full text-sm border-collapse"
              aria-label="Subscription list"
            >
              <Box as="thead">
                <Box as="tr" className="border-b border-border">
                  {["Sender", "Email", "Frequency", "Last received", ""].map((h) => (
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
                        {sub.sender}
                      </Text>
                    </Box>
                    <Box as="td" className="py-2.5 pr-4">
                      <Text variant="body-sm" className="text-content-subtle">
                        {sub.email}
                      </Text>
                    </Box>
                    <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                      <Text variant="body-sm" className="text-content-subtle capitalize">
                        {sub.frequency}
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
                        onClick={() => void handleUnsubscribe(sub.id)}
                        disabled={unsubscribingId === sub.id}
                        aria-label={`Unsubscribe from ${sub.sender}`}
                        className="text-red-600 hover:text-red-700"
                      >
                        {unsubscribingId === sub.id ? "Unsubscribing…" : "Unsubscribe"}
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
  );
}
SubscriptionTracker.displayName = "SubscriptionTracker";

// ─── Inbox Cleanup ─────────────────────────────────────────────────────────────

function InboxCleanup({ habits }: { habits: HygieneHabits | null }): ReactNode {
  const [suggestions, setSuggestions] = useState<CleanupSuggestion[]>(
    habits?.suggestions ?? [],
  );
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Sync when parent habits load
  useEffect(() => {
    if (habits?.suggestions) setSuggestions(habits.suggestions);
  }, [habits]);

  async function handleCleanup(id: string): Promise<void> {
    setApplyingId(id);
    setApplyError(null);
    try {
      await apiFetch<unknown>("/v1/email-hygiene/cleanup", {
        method: "POST",
        body: JSON.stringify({ suggestionId: id }),
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setApplyError(errMsg(err));
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Inbox Cleanup
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          AI-powered suggestions to reduce clutter in your inbox.
        </Text>
      </CardHeader>
      <CardContent>
        {applyError && (
          <Box className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
            <Text variant="body-sm" className="text-red-800">
              {applyError}
            </Text>
          </Box>
        )}
        {habits === null && <LoadingSkeleton rows={3} />}
        {habits !== null && suggestions.length === 0 && (
          <Box className="py-8 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              Your inbox is clean — no suggestions right now.
            </Text>
          </Box>
        )}
        {habits !== null && suggestions.length > 0 && (
          <Box className="space-y-3" aria-label="Cleanup suggestions">
            {suggestions.map((sug) => (
              <Box
                key={sug.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-raised px-4 py-3"
              >
                <Box className="flex-1 min-w-0">
                  <Text variant="body-sm" className="font-medium text-content">
                    {sug.title}
                  </Text>
                  <Text variant="caption" className="text-content-subtle">
                    {sug.description}
                  </Text>
                  <Box
                    as="span"
                    className="mt-1 inline-block rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-xs font-medium"
                  >
                    {sug.count.toLocaleString()} emails
                  </Box>
                </Box>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleCleanup(sug.id)}
                  disabled={applyingId === sug.id}
                  aria-label={`Apply cleanup: ${sug.title}`}
                  className="flex-shrink-0"
                >
                  {applyingId === sug.id ? "Applying…" : "Do it"}
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
InboxCleanup.displayName = "InboxCleanup";

// ─── Goals Section ─────────────────────────────────────────────────────────────

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

function GoalsCard({ habits }: { habits: HygieneHabits | null }): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Goals
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Track your email health over time.
        </Text>
      </CardHeader>
      <CardContent>
        {habits === null ? (
          <LoadingSkeleton rows={3} />
        ) : (
          <Box className="space-y-5">
            <GoalBar
              label="Inbox-zero days this month"
              value={habits.inboxZeroDays}
              max={habits.inboxZeroGoal}
              unit=" days"
            />
            <GoalBar
              label="Response rate"
              value={habits.responseRate}
              max={100}
              formatValue={(v) => `${v.toFixed(0)}%`}
            />
            <GoalBar
              label="Unsubscribe rate"
              value={habits.unsubscribeRate}
              max={100}
              formatValue={(v) => `${v.toFixed(0)}%`}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
GoalsCard.displayName = "GoalsCard";

// ─── Inner page (inside plan gate) ────────────────────────────────────────────

function HygieneContent(): ReactNode {
  const [score, setScore] = useState<HygieneScore | null>(null);
  const [loadingScore, setLoadingScore] = useState(true);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [habits, setHabits] = useState<HygieneHabits | null>(null);
  const [loadingHabits, setLoadingHabits] = useState(true);
  const [habitsError, setHabitsError] = useState<string | null>(null);

  const loadScore = useCallback(async (): Promise<void> => {
    setLoadingScore(true);
    setScoreError(null);
    try {
      const data = await apiFetch<HygieneScore>("/v1/email-hygiene/score");
      setScore(data);
    } catch (err) {
      setScoreError(errMsg(err));
    } finally {
      setLoadingScore(false);
    }
  }, []);

  const loadHabits = useCallback(async (): Promise<void> => {
    setLoadingHabits(true);
    setHabitsError(null);
    try {
      const data = await apiFetch<HygieneHabits>("/v1/email-hygiene/habits");
      setHabits(data);
    } catch (err) {
      setHabitsError(errMsg(err));
    } finally {
      setLoadingHabits(false);
    }
  }, []);

  useEffect(() => {
    void loadScore();
    void loadHabits();
  }, [loadScore, loadHabits]);

  return (
    <Box className="space-y-6">
      {/* Score + stat cards */}
      {loadingScore && (
        <Box className="h-36 animate-pulse rounded-xl bg-surface-raised border border-border" />
      )}
      {!loadingScore && scoreError && (
        <ErrorBanner message={scoreError} onRetry={() => void loadScore()} />
      )}
      {!loadingScore && score && <HygieneScoreCard data={score} />}

      {/* Subscription tracker */}
      <SubscriptionTracker />

      {/* Inbox cleanup */}
      {habitsError ? (
        <ErrorBanner message={habitsError} onRetry={() => void loadHabits()} />
      ) : (
        <InboxCleanup habits={loadingHabits ? null : habits} />
      )}

      {/* Goals */}
      {!habitsError && <GoalsCard habits={loadingHabits ? null : habits} />}
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
