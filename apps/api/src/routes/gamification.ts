/**
 * Gamification Route (A7) — Inbox Zero Rituals
 *
 * Streaks, achievements, daily stats, and team leaderboards.
 * Superhuman proved gamification is a killer retention mechanic.
 *
 * GET  /v1/gamification/stats           — Current streak, achievements, weekly stats
 * POST /v1/gamification/check-zero      — Check if inbox is at zero, update streak
 * GET  /v1/gamification/achievements    — All achievements with unlock status
 * GET  /v1/gamification/leaderboard     — Team leaderboard (Team plan only)
 * PUT  /v1/gamification/settings        — Toggle gamification on/off
 * POST /v1/gamification/track           — Track an event (focus session, AI compose, etc.)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  userStreaks,
  userAchievements,
  dailyStats,
} from "@emailed/db";

// ─── Achievement definitions ─────────────────────────────────────────────────

interface AchievementDefinition {
  key: AchievementKey;
  name: string;
  description: string;
  icon: string;
  target: number;
  category: "streak" | "speed" | "time" | "action" | "milestone";
}

type AchievementKey =
  | "first_zero"
  | "week_warrior"
  | "monthly_master"
  | "speed_demon"
  | "early_bird"
  | "night_owl"
  | "unsubscribe_champion"
  | "focus_master"
  | "ai_native"
  | "zero_hero";

const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    key: "first_zero",
    name: "First Zero",
    description: "Reach inbox zero for the first time",
    icon: "trophy",
    target: 1,
    category: "milestone",
  },
  {
    key: "week_warrior",
    name: "Week Warrior",
    description: "Maintain a 7-day inbox zero streak",
    icon: "flame",
    target: 7,
    category: "streak",
  },
  {
    key: "monthly_master",
    name: "Monthly Master",
    description: "Maintain a 30-day inbox zero streak",
    icon: "crown",
    target: 30,
    category: "streak",
  },
  {
    key: "speed_demon",
    name: "Speed Demon",
    description: "Process 50 emails in under 10 minutes",
    icon: "zap",
    target: 50,
    category: "speed",
  },
  {
    key: "early_bird",
    name: "Early Bird",
    description: "Reach inbox zero before 9am",
    icon: "sunrise",
    target: 1,
    category: "time",
  },
  {
    key: "night_owl",
    name: "Night Owl",
    description: "Reach inbox zero after 10pm",
    icon: "moon",
    target: 1,
    category: "time",
  },
  {
    key: "unsubscribe_champion",
    name: "Unsubscribe Champion",
    description: "Unsubscribe from 10 or more mailing lists",
    icon: "shield",
    target: 10,
    category: "action",
  },
  {
    key: "focus_master",
    name: "Focus Master",
    description: "Complete 5 focus mode sessions",
    icon: "target",
    target: 5,
    category: "action",
  },
  {
    key: "ai_native",
    name: "AI Native",
    description: "Use AI compose 100 times",
    icon: "sparkles",
    target: 100,
    category: "action",
  },
  {
    key: "zero_hero",
    name: "Zero Hero",
    description: "Reach inbox zero 100 times total",
    icon: "star",
    target: 100,
    category: "milestone",
  },
] as const;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const CheckZeroSchema = z.object({
  /** Current number of unread/unprocessed emails in inbox. */
  inboxCount: z.number().int().min(0),
  /** User's local hour (0-23) for time-based achievements. */
  localHour: z.number().int().min(0).max(23),
  /** User's local date (YYYY-MM-DD) for streak tracking. */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** How many emails were processed in this session. */
  emailsProcessed: z.number().int().min(0).optional(),
  /** Duration of processing session in seconds. */
  sessionDurationSec: z.number().int().min(0).optional(),
});

type CheckZeroInput = z.infer<typeof CheckZeroSchema>;

const TrackEventSchema = z.object({
  event: z.enum([
    "focus_session_complete",
    "ai_compose_used",
    "unsubscribe_action",
    "emails_processed",
    "email_sent",
    "email_received",
  ]),
  /** User's local date (YYYY-MM-DD). */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Count for batch events. */
  count: z.number().int().min(1).default(1),
  /** Extra metadata for the event. */
  metadata: z.record(z.unknown()).optional(),
});

type TrackEventInput = z.infer<typeof TrackEventSchema>;

const SettingsSchema = z.object({
  enabled: z.boolean(),
});

const StatsQuerySchema = z.object({
  /** Number of days to include in weekly/monthly stats. */
  days: z.coerce.number().int().min(1).max(90).default(7),
});

type StatsQuery = z.infer<typeof StatsQuerySchema>;

const LeaderboardQuerySchema = z.object({
  /** "streak" | "zeros" | "processed" */
  sortBy: z.enum(["streak", "zeros", "processed"]).default("streak"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `gam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function todayDateString(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function isConsecutiveDay(lastDate: string | null, currentDate: string): boolean {
  if (!lastDate) return false;
  const last = new Date(lastDate);
  const current = new Date(currentDate);
  const diffMs = current.getTime() - last.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

function isSameDay(lastDate: string | null, currentDate: string): boolean {
  if (!lastDate) return false;
  return lastDate === currentDate;
}

// ─── Route ────────────────────────────────────────────────────────────────────

const gamification = new Hono();

// ─── GET /stats ───────────────────────────────────────────────────────────────

gamification.get(
  "/stats",
  requireScope("analytics:read"),
  validateQuery(StatsQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const query = getValidatedQuery<StatsQuery>(c);
    const db = getDatabase();

    // Get or create streak record
    const [streak] = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.accountId, auth.accountId))
      .limit(1);

    const streakData = streak ?? {
      currentStreak: 0,
      longestStreak: 0,
      totalZeros: 0,
      lastZeroDate: null,
      enabled: true,
    };

    // Fetch daily stats for the requested period
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - query.days);
    const fromDateStr = fromDate.toISOString().split("T")[0] ?? "";

    const stats = await db
      .select()
      .from(dailyStats)
      .where(
        and(
          eq(dailyStats.accountId, auth.accountId),
          gte(dailyStats.statDate, fromDateStr),
        ),
      )
      .orderBy(desc(dailyStats.statDate));

    // Aggregate weekly stats
    let totalProcessed = 0;
    let totalSent = 0;
    let totalReceived = 0;
    let totalFocusSessions = 0;
    let totalAiComposes = 0;
    let totalUnsubscribes = 0;
    let responseTimeSum = 0;
    let responseTimeCount = 0;
    const hourlyAgg: Record<string, number> = {};

    for (const day of stats) {
      totalProcessed += day.emailsProcessed;
      totalSent += day.emailsSent;
      totalReceived += day.emailsReceived;
      totalFocusSessions += day.focusSessions;
      totalAiComposes += day.aiComposeUses;
      totalUnsubscribes += day.unsubscribeCount;

      if (day.avgResponseTimeSec !== null) {
        responseTimeSum += day.avgResponseTimeSec;
        responseTimeCount += 1;
      }

      const breakdown = day.hourlyBreakdown as Record<string, number> | null;
      if (breakdown) {
        for (const [hour, count] of Object.entries(breakdown)) {
          hourlyAgg[hour] = (hourlyAgg[hour] ?? 0) + count;
        }
      }
    }

    // Find most productive hour
    let mostProductiveHour: number | null = null;
    let maxHourCount = 0;
    for (const [hour, count] of Object.entries(hourlyAgg)) {
      if (count > maxHourCount) {
        maxHourCount = count;
        mostProductiveHour = parseInt(hour, 10);
      }
    }

    // Get achievement count
    const [achievementCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.accountId, auth.accountId),
          sql`${userAchievements.progress} >= ${userAchievements.target}`,
        ),
      );

    return c.json({
      data: {
        streak: {
          current: streakData.currentStreak,
          longest: streakData.longestStreak,
          totalZeros: streakData.totalZeros,
          lastZeroDate: streakData.lastZeroDate,
        },
        enabled: streakData.enabled,
        period: {
          days: query.days,
          emailsProcessed: totalProcessed,
          emailsSent: totalSent,
          emailsReceived: totalReceived,
          focusSessions: totalFocusSessions,
          aiComposeUses: totalAiComposes,
          unsubscribes: totalUnsubscribes,
          avgResponseTimeSec:
            responseTimeCount > 0
              ? Math.round(responseTimeSum / responseTimeCount)
              : null,
          mostProductiveHour,
        },
        achievementsUnlocked: achievementCount?.count ?? 0,
        achievementsTotal: ACHIEVEMENT_DEFINITIONS.length,
        dailyStats: stats.map((day) => ({
          date: day.statDate,
          emailsProcessed: day.emailsProcessed,
          emailsSent: day.emailsSent,
          emailsReceived: day.emailsReceived,
          reachedZero: day.reachedZero,
          focusSessions: day.focusSessions,
          aiComposeUses: day.aiComposeUses,
        })),
      },
    });
  },
);

// ─── POST /check-zero ────────────────────────────────────────────────────────

gamification.post(
  "/check-zero",
  requireScope("analytics:read"),
  validateBody(CheckZeroSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<CheckZeroInput>(c);
    const db = getDatabase();
    const isZero = body.inboxCount === 0;

    // Get or create streak record
    let [streak] = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.accountId, auth.accountId))
      .limit(1);

    if (!streak) {
      const newId = generateId();
      const [created] = await db
        .insert(userStreaks)
        .values({
          id: newId,
          accountId: auth.accountId,
          currentStreak: 0,
          longestStreak: 0,
          totalZeros: 0,
          enabled: true,
        })
        .returning();
      streak = created!;
    }

    // Check if gamification is disabled
    if (!streak.enabled) {
      return c.json({
        data: {
          isZero,
          streakUpdated: false,
          currentStreak: streak.currentStreak,
          newAchievements: [],
          celebrate: false,
        },
      });
    }

    const newAchievements: AchievementDefinition[] = [];
    let streakUpdated = false;

    if (isZero) {
      const alreadyZeroToday = isSameDay(streak.lastZeroDate, body.localDate);

      if (!alreadyZeroToday) {
        const consecutive = isConsecutiveDay(streak.lastZeroDate, body.localDate);
        const newStreak = consecutive ? streak.currentStreak + 1 : 1;
        const newLongest = Math.max(streak.longestStreak, newStreak);
        const newTotal = streak.totalZeros + 1;

        await db
          .update(userStreaks)
          .set({
            currentStreak: newStreak,
            longestStreak: newLongest,
            totalZeros: newTotal,
            lastZeroDate: body.localDate,
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userStreaks.id, streak.id));

        streak = {
          ...streak,
          currentStreak: newStreak,
          longestStreak: newLongest,
          totalZeros: newTotal,
          lastZeroDate: body.localDate,
        };
        streakUpdated = true;

        // Check achievements
        const achievementsToCheck: Array<{
          key: AchievementKey;
          progress: number;
          target: number;
        }> = [
          { key: "first_zero", progress: newTotal, target: 1 },
          { key: "zero_hero", progress: newTotal, target: 100 },
          { key: "week_warrior", progress: newStreak, target: 7 },
          { key: "monthly_master", progress: newStreak, target: 30 },
        ];

        // Time-based achievements
        if (body.localHour < 9) {
          achievementsToCheck.push({
            key: "early_bird",
            progress: 1,
            target: 1,
          });
        }
        if (body.localHour >= 22) {
          achievementsToCheck.push({
            key: "night_owl",
            progress: 1,
            target: 1,
          });
        }

        // Speed demon check
        if (
          body.emailsProcessed !== undefined &&
          body.sessionDurationSec !== undefined &&
          body.emailsProcessed >= 50 &&
          body.sessionDurationSec <= 600
        ) {
          achievementsToCheck.push({
            key: "speed_demon",
            progress: body.emailsProcessed,
            target: 50,
          });
        }

        for (const check of achievementsToCheck) {
          const unlocked = await tryUnlockAchievement(
            db,
            auth.accountId,
            check.key,
            check.progress,
            check.target,
          );
          if (unlocked) {
            const def = ACHIEVEMENT_DEFINITIONS.find(
              (d) => d.key === check.key,
            );
            if (def) {
              newAchievements.push(def);
            }
          }
        }
      }

      // Update daily stats
      await upsertDailyStat(db, auth.accountId, body.localDate, {
        reachedZero: true,
        zeroReachedAt: new Date(),
        emailsProcessed: body.emailsProcessed ?? 0,
      });
    }

    return c.json({
      data: {
        isZero,
        streakUpdated,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalZeros: streak.totalZeros,
        newAchievements: newAchievements.map((a) => ({
          key: a.key,
          name: a.name,
          description: a.description,
          icon: a.icon,
        })),
        celebrate: isZero && streakUpdated,
      },
    });
  },
);

// ─── GET /achievements ────────────────────────────────────────────────────────

gamification.get(
  "/achievements",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Fetch all user achievements
    const userAchievementRows = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.accountId, auth.accountId));

    const userAchievementMap = new Map(
      userAchievementRows.map((a) => [a.achievementKey, a]),
    );

    const achievements = ACHIEVEMENT_DEFINITIONS.map((def) => {
      const userAch = userAchievementMap.get(def.key);
      const progress = userAch?.progress ?? 0;
      const unlocked = progress >= def.target;

      return {
        key: def.key,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        target: def.target,
        progress,
        unlocked,
        unlockedAt: unlocked ? userAch?.unlockedAt?.toISOString() ?? null : null,
      };
    });

    return c.json({
      data: {
        achievements,
        unlocked: achievements.filter((a) => a.unlocked).length,
        total: achievements.length,
      },
    });
  },
);

// ─── GET /leaderboard ─────────────────────────────────────────────────────────

gamification.get(
  "/leaderboard",
  requireScope("analytics:read"),
  validateQuery(LeaderboardQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const query = getValidatedQuery<LeaderboardQuery>(c);
    const db = getDatabase();

    // For team leaderboard, we query all streaks.
    // In production, this would be scoped to the team. For now, we return
    // all users (team scoping will be added when team management is live).
    const orderColumn =
      query.sortBy === "zeros"
        ? userStreaks.totalZeros
        : query.sortBy === "processed"
          ? userStreaks.totalZeros // fallback — daily stats would be joined in production
          : userStreaks.currentStreak;

    const leaderboard = await db
      .select({
        accountId: userStreaks.accountId,
        currentStreak: userStreaks.currentStreak,
        longestStreak: userStreaks.longestStreak,
        totalZeros: userStreaks.totalZeros,
        lastZeroDate: userStreaks.lastZeroDate,
      })
      .from(userStreaks)
      .where(eq(userStreaks.enabled, true))
      .orderBy(desc(orderColumn))
      .limit(query.limit);

    // Find current user's rank
    const userEntry = leaderboard.find(
      (entry) => entry.accountId === auth.accountId,
    );
    const userRank = userEntry
      ? leaderboard.indexOf(userEntry) + 1
      : null;

    return c.json({
      data: {
        entries: leaderboard.map((entry, index) => ({
          rank: index + 1,
          accountId: entry.accountId,
          currentStreak: entry.currentStreak,
          longestStreak: entry.longestStreak,
          totalZeros: entry.totalZeros,
          lastZeroDate: entry.lastZeroDate,
          isCurrentUser: entry.accountId === auth.accountId,
        })),
        currentUserRank: userRank,
        sortBy: query.sortBy,
      },
    });
  },
);

// ─── PUT /settings ────────────────────────────────────────────────────────────

gamification.put(
  "/settings",
  requireScope("analytics:read"),
  validateBody(SettingsSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<{ enabled: boolean }>(c);
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.accountId, auth.accountId))
      .limit(1);

    if (existing) {
      await db
        .update(userStreaks)
        .set({ enabled: body.enabled, updatedAt: new Date() })
        .where(eq(userStreaks.id, existing.id));
    } else {
      await db.insert(userStreaks).values({
        id: generateId(),
        accountId: auth.accountId,
        currentStreak: 0,
        longestStreak: 0,
        totalZeros: 0,
        enabled: body.enabled,
      });
    }

    return c.json({
      data: { enabled: body.enabled },
    });
  },
);

// ─── POST /track ──────────────────────────────────────────────────────────────

gamification.post(
  "/track",
  requireScope("analytics:read"),
  validateBody(TrackEventSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<TrackEventInput>(c);
    const db = getDatabase();

    const updates: Partial<{
      focusSessions: number;
      aiComposeUses: number;
      unsubscribeCount: number;
      emailsProcessed: number;
      emailsSent: number;
      emailsReceived: number;
    }> = {};

    switch (body.event) {
      case "focus_session_complete":
        updates.focusSessions = body.count;
        break;
      case "ai_compose_used":
        updates.aiComposeUses = body.count;
        break;
      case "unsubscribe_action":
        updates.unsubscribeCount = body.count;
        break;
      case "emails_processed":
        updates.emailsProcessed = body.count;
        break;
      case "email_sent":
        updates.emailsSent = body.count;
        break;
      case "email_received":
        updates.emailsReceived = body.count;
        break;
    }

    await upsertDailyStat(db, auth.accountId, body.localDate, updates);

    // Check cumulative achievements
    const newAchievements: AchievementDefinition[] = [];

    if (body.event === "focus_session_complete") {
      const [totalFocus] = await db
        .select({
          total: sql<number>`coalesce(sum(${dailyStats.focusSessions}), 0)::int`,
        })
        .from(dailyStats)
        .where(eq(dailyStats.accountId, auth.accountId));

      const total = totalFocus?.total ?? 0;
      const unlocked = await tryUnlockAchievement(
        db,
        auth.accountId,
        "focus_master",
        total,
        5,
      );
      if (unlocked) {
        const def = ACHIEVEMENT_DEFINITIONS.find(
          (d) => d.key === "focus_master",
        );
        if (def) newAchievements.push(def);
      }
    }

    if (body.event === "ai_compose_used") {
      const [totalAi] = await db
        .select({
          total: sql<number>`coalesce(sum(${dailyStats.aiComposeUses}), 0)::int`,
        })
        .from(dailyStats)
        .where(eq(dailyStats.accountId, auth.accountId));

      const total = totalAi?.total ?? 0;
      const unlocked = await tryUnlockAchievement(
        db,
        auth.accountId,
        "ai_native",
        total,
        100,
      );
      if (unlocked) {
        const def = ACHIEVEMENT_DEFINITIONS.find(
          (d) => d.key === "ai_native",
        );
        if (def) newAchievements.push(def);
      }
    }

    if (body.event === "unsubscribe_action") {
      const [totalUnsub] = await db
        .select({
          total: sql<number>`coalesce(sum(${dailyStats.unsubscribeCount}), 0)::int`,
        })
        .from(dailyStats)
        .where(eq(dailyStats.accountId, auth.accountId));

      const total = totalUnsub?.total ?? 0;
      const unlocked = await tryUnlockAchievement(
        db,
        auth.accountId,
        "unsubscribe_champion",
        total,
        10,
      );
      if (unlocked) {
        const def = ACHIEVEMENT_DEFINITIONS.find(
          (d) => d.key === "unsubscribe_champion",
        );
        if (def) newAchievements.push(def);
      }
    }

    return c.json({
      data: {
        tracked: true,
        event: body.event,
        newAchievements: newAchievements.map((a) => ({
          key: a.key,
          name: a.name,
          description: a.description,
          icon: a.icon,
        })),
      },
    });
  },
);

// ─── Helper: upsert daily stat ────────────────────────────────────────────────

async function upsertDailyStat(
  db: ReturnType<typeof getDatabase>,
  accountId: string,
  statDate: string,
  updates: Partial<{
    emailsProcessed: number;
    emailsSent: number;
    emailsReceived: number;
    focusSessions: number;
    aiComposeUses: number;
    unsubscribeCount: number;
    reachedZero: boolean;
    zeroReachedAt: Date;
  }>,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(dailyStats)
    .where(
      and(
        eq(dailyStats.accountId, accountId),
        eq(dailyStats.statDate, statDate),
      ),
    )
    .limit(1);

  if (existing) {
    const setClause: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.emailsProcessed !== undefined) {
      setClause["emailsProcessed"] =
        existing.emailsProcessed + updates.emailsProcessed;
    }
    if (updates.emailsSent !== undefined) {
      setClause["emailsSent"] = existing.emailsSent + updates.emailsSent;
    }
    if (updates.emailsReceived !== undefined) {
      setClause["emailsReceived"] =
        existing.emailsReceived + updates.emailsReceived;
    }
    if (updates.focusSessions !== undefined) {
      setClause["focusSessions"] =
        existing.focusSessions + updates.focusSessions;
    }
    if (updates.aiComposeUses !== undefined) {
      setClause["aiComposeUses"] =
        existing.aiComposeUses + updates.aiComposeUses;
    }
    if (updates.unsubscribeCount !== undefined) {
      setClause["unsubscribeCount"] =
        existing.unsubscribeCount + updates.unsubscribeCount;
    }
    if (updates.reachedZero !== undefined) {
      setClause["reachedZero"] = updates.reachedZero;
    }
    if (updates.zeroReachedAt !== undefined && !existing.zeroReachedAt) {
      setClause["zeroReachedAt"] = updates.zeroReachedAt;
    }

    await db
      .update(dailyStats)
      .set(setClause)
      .where(eq(dailyStats.id, existing.id));
  } else {
    await db.insert(dailyStats).values({
      id: generateId(),
      accountId,
      statDate,
      emailsProcessed: updates.emailsProcessed ?? 0,
      emailsSent: updates.emailsSent ?? 0,
      emailsReceived: updates.emailsReceived ?? 0,
      focusSessions: updates.focusSessions ?? 0,
      aiComposeUses: updates.aiComposeUses ?? 0,
      unsubscribeCount: updates.unsubscribeCount ?? 0,
      reachedZero: updates.reachedZero ?? false,
      zeroReachedAt: updates.zeroReachedAt ?? null,
    });
  }
}

// ─── Helper: try to unlock an achievement ─────────────────────────────────────

async function tryUnlockAchievement(
  db: ReturnType<typeof getDatabase>,
  accountId: string,
  key: AchievementKey,
  progress: number,
  target: number,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(userAchievements)
    .where(
      and(
        eq(userAchievements.accountId, accountId),
        eq(userAchievements.achievementKey, key),
      ),
    )
    .limit(1);

  if (existing) {
    // Already unlocked — just update progress if higher
    if (progress > existing.progress) {
      await db
        .update(userAchievements)
        .set({ progress })
        .where(eq(userAchievements.id, existing.id));
    }
    // Return true only if this update crosses the threshold
    return existing.progress < target && progress >= target;
  }

  // New achievement record
  const isUnlocked = progress >= target;
  await db.insert(userAchievements).values({
    id: generateId(),
    accountId,
    achievementKey: key,
    progress,
    target,
    unlockedAt: isUnlocked ? new Date() : new Date(0),
  });

  return isUnlocked;
}

export { gamification };
