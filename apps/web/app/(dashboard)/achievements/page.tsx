"use client";

/**
 * AlecRae — Achievements & Inbox Zero Gamification
 *
 * Shows the user's current streak, achievement badges, weekly stats,
 * and motivational messaging to encourage inbox zero habits.
 *
 * API:
 *   GET /v1/gamification/streak
 *   GET /v1/gamification/achievements
 *   GET /v1/gamification/stats
 */

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, PageLayout } from "@alecrae/ui";
import { getAccessToken } from "../../../lib/auth-token";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * View models for this page, derived from the real gamification API.
 *
 * This page used to call GET /v1/gamification/streak, which has never existed
 * (404 on every load), and typed the other two responses as shapes the server
 * does not return. The streak lives inside /stats — there is no separate
 * endpoint and no reason to add one.
 */
interface StreakData {
  currentStreak: number;
  longestStreak: number;
  totalZeros: number;
  lastZeroDate: string | null;
}

interface Achievement {
  /** The server's stable identifier is `key`, not `id`. */
  key: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  icon: string;
  progress: number;
  target: number;
}

interface GamificationStats {
  emailsThisWeek: number;
  /** Null when no response times have been recorded — never shown as 0. */
  avgResponseHours: number | null;
  inboxZeroDaysThisWeek: number;
  totalAchievements: number;
  unlockedAchievements: number;
}

/** Raw `data` from GET /v1/gamification/stats?days=7. */
interface StatsResponse {
  streak: { current: number; longest: number; totalZeros: number; lastZeroDate: string | null };
  period: { emailsProcessed: number; avgResponseTimeSec: number | null };
  achievementsUnlocked: number;
  achievementsTotal: number;
  dailyStats: { date: string; reachedZero: boolean }[];
}

/** Raw `data` from GET /v1/gamification/achievements. */
interface AchievementsResponse {
  achievements: Achievement[];
  unlocked: number;
  total: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";


// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StreakCard({ streak }: { streak: StreakData }): React.JSX.Element {
  const { currentStreak, longestStreak, lastZeroDate } = streak;

  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <Box className="text-6xl select-none" aria-hidden="true">
            🔥
          </Box>
          <Box>
            <Text variant="heading-lg" className="text-4xl font-bold text-brand-600">
              {currentStreak}
            </Text>
            <Text variant="heading-sm" className="text-content">
              day streak
            </Text>
          </Box>
          {currentStreak > 0 ? (
            <Text variant="body-sm" muted>
              Keep it up! Best: {longestStreak} days
              {lastZeroDate ? ` · Last zero: ${formatDate(lastZeroDate)}` : ""}
            </Text>
          ) : (
            <Box className="mt-2 rounded-xl border border-brand-600/20 bg-brand-100 px-5 py-3">
              <Text variant="body-sm" className="text-brand-700 font-medium">
                Start your streak today — archive everything in your inbox to reach inbox zero!
              </Text>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function AchievementBadgeCard({ achievement }: { achievement: Achievement }): React.JSX.Element {
  const { name, description, unlocked, unlockedAt, icon } = achievement;

  return (
    <Box
      className={[
        "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
        unlocked
          ? "border-brand-600/30 bg-brand-100/60"
          : "border-border bg-surface-raised opacity-50 grayscale",
      ].join(" ")}
      aria-label={`${name}: ${unlocked ? "Unlocked" : "Locked"}`}
    >
      <Box className="relative">
        <Box className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-3xl select-none">
          {icon}
        </Box>
        {!unlocked && (
          <Box
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised border border-border text-xs"
            aria-hidden="true"
          >
            🔒
          </Box>
        )}
      </Box>
      <Box>
        <Text
          variant="body-sm"
          className={`font-semibold ${unlocked ? "text-brand-700" : "text-content-subtle"}`}
        >
          {name}
        </Text>
        <Text variant="body-sm" muted className="mt-0.5 text-xs leading-snug">
          {description}
        </Text>
        {unlocked && unlockedAt && (
          <Text variant="body-sm" className="mt-1 text-xs text-brand-600 font-medium">
            Earned {formatDate(unlockedAt)}
          </Text>
        )}
      </Box>
    </Box>
  );
}

function StatItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}): React.JSX.Element {
  return (
    <Box className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface-raised px-4 py-4 text-center">
      <Box className="flex items-baseline gap-1">
        <Text variant="heading-sm" className="text-2xl font-bold text-content">
          {value}
        </Text>
        {unit && (
          <Text variant="body-sm" muted className="text-sm font-normal">
            {unit}
          </Text>
        )}
      </Box>
      <Text variant="body-sm" muted className="text-xs">
        {label}
      </Text>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AchievementsPage(): React.JSX.Element {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Two calls, not three: /stats carries the streak, the weekly period
      // totals and the achievement counts in one response.
      const [statsData, achievementData] = await Promise.all([
        apiFetch<{ data: StatsResponse }>("/v1/gamification/stats?days=7").then((r) => r.data),
        apiFetch<{ data: AchievementsResponse }>("/v1/gamification/achievements").then(
          (r) => r.data,
        ),
      ]);

      setStreak({
        currentStreak: statsData.streak.current,
        longestStreak: statsData.streak.longest,
        totalZeros: statsData.streak.totalZeros,
        lastZeroDate: statsData.streak.lastZeroDate,
      });
      setAchievements(achievementData.achievements);
      setStats({
        emailsThisWeek: statsData.period.emailsProcessed,
        avgResponseHours:
          statsData.period.avgResponseTimeSec === null
            ? null
            : statsData.period.avgResponseTimeSec / 3600,
        inboxZeroDaysThisWeek: statsData.dailyStats.filter((d) => d.reachedZero).length,
        totalAchievements: achievementData.total,
        unlockedAchievements: achievementData.unlocked,
      });
    } catch (e) {
      // Fail visibly. This used to fall back to a hardcoded achievement list,
      // which showed invented badges as if they were the user's real progress —
      // the same fabrication problem this audit is closing elsewhere.
      setStreak(null);
      setAchievements([]);
      setStats(null);
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <PageLayout
      title="Achievements"
      description="Track your inbox zero streaks and unlock achievements as you build better email habits."
    >
      <Box className="space-y-8">
        {/* Error banner */}
        {error && (
          <Box
            className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
            role="alert"
          >
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
            <Button variant="ghost" size="sm" onClick={() => void loadAll()}>
              Retry
            </Button>
          </Box>
        )}

        {/* Streak card */}
        {loading ? (
          <Box
            className="h-56 animate-pulse rounded-2xl bg-surface-raised"
            aria-busy="true"
            aria-label="Loading streak"
          />
        ) : streak ? (
          <StreakCard streak={streak} />
        ) : null}

        {/* This Week stats */}
        <Box>
          <Text variant="heading-sm" className="mb-3">
            This Week
          </Text>
          {loading ? (
            <Box className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-surface-raised"
                  aria-hidden="true"
                />
              ))}
            </Box>
          ) : stats ? (
            <Box className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatItem label="Emails processed" value={stats.emailsThisWeek} />
              {/* Null when nothing has been measured yet — an em dash, not a
                  fabricated 0, which would read as "you reply instantly". */}
              <StatItem
                label="Avg response time"
                value={
                  stats.avgResponseHours === null
                    ? "—"
                    : stats.avgResponseHours < 1
                      ? String(Math.round(stats.avgResponseHours * 60))
                      : stats.avgResponseHours.toFixed(1)
                }
                unit={
                  stats.avgResponseHours === null
                    ? ""
                    : stats.avgResponseHours < 1
                      ? "min"
                      : "hrs"
                }
              />
              <StatItem
                label="Inbox zero days"
                value={stats.inboxZeroDaysThisWeek}
                unit="/ 7"
              />
            </Box>
          ) : (
            <Text variant="body-sm" muted>
              Stats unavailable — check back once your inbox is connected.
            </Text>
          )}
        </Box>

        {/* Achievement badges */}
        <Box>
          <Box className="mb-3 flex items-center justify-between">
            <Text variant="heading-sm">Achievements</Text>
            {stats && (
              <Text variant="body-sm" muted>
                {stats.unlockedAchievements} / {stats.totalAchievements} unlocked
              </Text>
            )}
          </Box>
          {loading ? (
            <Box className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <Box
                  key={i}
                  className="h-32 animate-pulse rounded-2xl bg-surface-raised"
                  aria-hidden="true"
                />
              ))}
            </Box>
          ) : (
            <Box className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {achievements.map((a) => (
                <AchievementBadgeCard key={a.key} achievement={a} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </PageLayout>
  );
}
