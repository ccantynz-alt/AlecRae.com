"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, PageLayout } from "@alecrae/ui";
import { gamificationApi, type AchievementData } from "../../../lib/api-features";

const DEFAULT_ACHIEVEMENTS: AchievementData[] = [
  { id: "first-zero", name: "First Zero", description: "Reached inbox zero for the first time", icon: "🎯", unlocked: false },
  { id: "streak-3", name: "3-Day Streak", description: "Achieved inbox zero 3 days in a row", icon: "🔥", unlocked: false, target: 3 },
  { id: "streak-7", name: "Week Warrior", description: "Inbox zero for 7 consecutive days", icon: "⚔️", unlocked: false, target: 7 },
  { id: "streak-30", name: "Month Master", description: "30-day inbox zero streak", icon: "👑", unlocked: false, target: 30 },
  { id: "speed-demon", name: "Speed Demon", description: "Average response time under 1 hour", icon: "⚡", unlocked: false },
  { id: "clean-inbox", name: "Clean Inbox", description: "Fewer than 10 unread emails", icon: "✨", unlocked: false },
  { id: "productivity-pro", name: "Productivity Pro", description: "Processed 500 emails", icon: "🏆", unlocked: false, target: 500 },
];

function AchievementCard({ achievement }: { achievement: AchievementData }): React.ReactNode {
  return (
    <Box
      className={`p-4 rounded-xl border transition-colors ${
        achievement.unlocked
          ? "border-brand-200 bg-brand-50"
          : "border-border bg-surface opacity-50"
      }`}
    >
      <Box className="flex items-start gap-3">
        <Box className={`text-2xl w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0 ${
          achievement.unlocked ? "bg-brand-100" : "bg-surface-secondary"
        }`}>
          {achievement.unlocked ? achievement.icon : "🔒"}
        </Box>
        <Box className="flex-1 min-w-0">
          <Text variant="body-sm" className="font-semibold">{achievement.name}</Text>
          <Text variant="caption" className="text-content-subtle">{achievement.description}</Text>
          {achievement.unlockedAt && (
            <Text variant="caption" className="text-brand-600 mt-1">
              Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
            </Text>
          )}
          {!achievement.unlocked && achievement.progress !== undefined && achievement.target !== undefined && (
            <Box className="mt-2">
              <Box className="h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
                <Box
                  className="h-full rounded-full bg-brand-400 transition-all"
                  style={{ width: `${Math.min(100, (achievement.progress / achievement.target) * 100)}%` }}
                />
              </Box>
              <Text variant="caption" className="text-content-tertiary mt-0.5">
                {achievement.progress}/{achievement.target}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function AchievementsPage(): React.ReactNode {
  const [streak, setStreak] = useState<{ current: number; longest: number } | null>(null);
  const [achievements, setAchievements] = useState<AchievementData[]>(DEFAULT_ACHIEVEMENTS);
  const [weekStats, setWeekStats] = useState<{ emailsProcessed: number; zeroAchieved: number; avgResponseTime: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [streakRes, achRes, statsRes] = await Promise.allSettled([
      gamificationApi.streak(),
      gamificationApi.achievements(),
      gamificationApi.stats(),
    ]);
    if (streakRes.status === "fulfilled") setStreak(streakRes.value.data);
    if (achRes.status === "fulfilled" && achRes.value.data.length > 0) setAchievements(achRes.value.data);
    if (statsRes.status === "fulfilled") setWeekStats(statsRes.value.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unlocked = achievements.filter((a) => a.unlocked);

  return (
    <PageLayout title="Inbox Zero" description="Build streaks, earn achievements, and turn email into a game you actually win.">
      {loading ? (
        <Box className="space-y-4">
          {[1, 2, 3].map((i) => <Box key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />)}
        </Box>
      ) : (
        <Box className="space-y-6">
          {/* Streak hero */}
          <Box className="p-6 rounded-xl border border-brand-200 bg-brand-50 text-center">
            <Box className="text-5xl mb-2">{streak && streak.current > 0 ? "🔥" : "💤"}</Box>
            <Text variant="heading-md" className="text-4xl font-bold text-brand-700 mb-1">
              {streak?.current ?? 0}
            </Text>
            <Text variant="body-sm" className="text-brand-600 font-medium">
              {streak && streak.current > 0
                ? `day streak — keep it going!`
                : "No active streak — reach inbox zero today to start one"}
            </Text>
            {streak && streak.longest > 0 && (
              <Text variant="caption" className="text-brand-500 mt-2 block">
                Personal best: {streak.longest} days
              </Text>
            )}
          </Box>

          {/* This week stats */}
          <Box className="grid grid-cols-3 gap-4">
            {[
              { label: "Emails Processed", value: weekStats?.emailsProcessed ?? 0 },
              { label: "Zero Achieved", value: weekStats?.zeroAchieved ?? 0, suffix: "×" },
              { label: "Avg Response", value: weekStats?.avgResponseTime?.toFixed(1) ?? "—", suffix: "hrs" },
            ].map(({ label, value, suffix }) => (
              <Box key={label} className="p-4 rounded-xl border border-border bg-surface-raised text-center">
                <Box className="flex items-baseline justify-center gap-1">
                  <Text variant="body-sm" className="text-xl font-bold text-content">{value}</Text>
                  {suffix && <Text variant="caption" className="text-content-subtle">{suffix}</Text>}
                </Box>
                <Text variant="caption" className="text-content-subtle mt-1">{label}</Text>
              </Box>
            ))}
          </Box>

          {/* Achievements */}
          <Box>
            <Box className="flex items-center justify-between mb-4">
              <Text variant="body-sm" className="text-sm font-semibold">Achievements</Text>
              <Text variant="caption" className="text-content-subtle">
                {unlocked.length}/{achievements.length} unlocked
              </Text>
            </Box>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {achievements.map((a) => (
                <AchievementCard key={a.id} achievement={a} />
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </PageLayout>
  );
}
