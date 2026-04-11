/**
 * @emailed/reputation — Domain Warm-up Orchestrator
 *
 * Manages the gradual ramp-up of sending volume for new domains/IPs.
 * Stores all state in PostgreSQL via the `warmup_sessions` table so
 * that decisions survive restarts and are consistent across workers.
 *
 * Features:
 *  - Three schedule templates: conservative (30-day), moderate (21-day), aggressive (14-day)
 *  - `getDailyLimit(domainId)` — returns today's sending limit
 *  - `adjustSchedule(domainId, signals)` — adapts schedule based on delivery signals
 *  - `pauseWarmup` / `resumeWarmup` — manual controls
 *  - Automatic schedule extension on bad signals, acceleration on good signals
 */

import { eq, and } from "drizzle-orm";
import {
  getDatabase,
  warmupSessions,
  domains as domainsTable,
} from "@emailed/db";
import type { WarmupSession } from "@emailed/db";

// ---------------------------------------------------------------------------
// Schedule step: { day, dailyLimit }
// ---------------------------------------------------------------------------

export interface ScheduleStep {
  day: number;
  dailyLimit: number;
}

// ---------------------------------------------------------------------------
// Warm-up Schedule Templates
// ---------------------------------------------------------------------------

/**
 * Auto-trigger warm-up schedule — hardcoded per the reputation-protection
 * spec. This is the schedule that every new sender is placed on when they
 * have no existing warm-up row. It is conservative by design: new domains
 * ramping faster than this will have their reputation permanently damaged
 * by Gmail/Outlook, which cannot be recovered for months.
 *
 * Schema: `{ day, dailyLimit, advanceBounceRate }`
 *
 *  - `day` is the warm-up day that first unlocks `dailyLimit` sends/day
 *  - `advanceBounceRate` is the MAX bounce rate that allows the step to
 *    advance to the next one. If the observed bounce rate over the last
 *    24h exceeds this value the domain stays pinned at the current step.
 */
export interface AutoWarmupStep {
  day: number;
  dailyLimit: number;
  advanceBounceRate: number;
}

export const AUTO_WARMUP_SCHEDULE: readonly AutoWarmupStep[] = [
  { day: 1, dailyLimit: 50, advanceBounceRate: 0.05 },
  { day: 2, dailyLimit: 100, advanceBounceRate: 0.05 },
  { day: 3, dailyLimit: 500, advanceBounceRate: 0.05 },
  { day: 4, dailyLimit: 1_000, advanceBounceRate: 0.04 },
  { day: 7, dailyLimit: 5_000, advanceBounceRate: 0.03 },
  { day: 14, dailyLimit: 25_000, advanceBounceRate: 0.02 },
  { day: 30, dailyLimit: 100_000, advanceBounceRate: 0.01 },
  // day 60+ is effectively "unlimited (plan-capped)" — represented as a
  // very large limit so plan-level caps become the binding constraint.
  { day: 60, dailyLimit: Number.MAX_SAFE_INTEGER, advanceBounceRate: 0.01 },
] as const;

/**
 * Pure helper — resolves which `AutoWarmupStep` applies to a given
 * `currentDay`. Returns the highest step whose `day` ≤ `currentDay`.
 * Exported so unit tests can cover the schedule without a DB.
 */
export function resolveAutoStep(currentDay: number): AutoWarmupStep {
  let step: AutoWarmupStep = AUTO_WARMUP_SCHEDULE[0]!;
  for (const s of AUTO_WARMUP_SCHEDULE) {
    if (s.day <= currentDay) step = s;
    else break;
  }
  return step;
}

/**
 * Pure helper — decides whether a session should advance to a new auto
 * step based on elapsed wall-clock days and the observed 24h bounce rate.
 *
 * Returns the NEW `currentDay` the session should sit at. A session
 * cannot advance past its current step if its `bounceRate24h` exceeds
 * the current step's `advanceBounceRate` threshold — in that case the
 * domain is pinned until bounces recover.
 */
export function computeNextAutoDay(args: {
  currentDay: number;
  elapsedDays: number;
  bounceRate24h: number;
}): number {
  const currentStep = resolveAutoStep(args.currentDay);
  const naturalStep = resolveAutoStep(args.elapsedDays);

  // Not ready to advance yet on wall-clock — stay put.
  if (naturalStep.day <= currentStep.day) return args.currentDay;

  // Bounce rate gate: only advance if under the CURRENT step's threshold.
  if (args.bounceRate24h > currentStep.advanceBounceRate) {
    return args.currentDay;
  }

  return naturalStep.day;
}

/**
 * Error codes returned from `ensureWarmupAndCheck` to the API layer.
 * Callers should map these to a 429 response with a human-readable message.
 */
export const WARMUP_LIMIT_EXCEEDED = "WARMUP_LIMIT_EXCEEDED" as const;

export interface WarmupCheckResult {
  allowed: boolean;
  code?: typeof WARMUP_LIMIT_EXCEEDED | "WARMUP_PAUSED";
  message?: string;
  currentDay?: number;
  dailyLimit?: number;
  sentToday?: number;
  retryAfter?: Date;
}

export const WARMUP_SCHEDULES: Record<
  "conservative" | "moderate" | "aggressive",
  ScheduleStep[]
> = {
  conservative: [
    // 30-day ramp
    { day: 1, dailyLimit: 50 },
    { day: 2, dailyLimit: 100 },
    { day: 3, dailyLimit: 200 },
    { day: 4, dailyLimit: 400 },
    { day: 5, dailyLimit: 800 },
    { day: 7, dailyLimit: 1500 },
    { day: 10, dailyLimit: 3000 },
    { day: 14, dailyLimit: 6000 },
    { day: 18, dailyLimit: 12000 },
    { day: 22, dailyLimit: 25000 },
    { day: 26, dailyLimit: 50000 },
    { day: 30, dailyLimit: 100000 },
  ],
  moderate: [
    // 21-day ramp
    { day: 1, dailyLimit: 100 },
    { day: 2, dailyLimit: 250 },
    { day: 3, dailyLimit: 500 },
    { day: 4, dailyLimit: 1000 },
    { day: 5, dailyLimit: 2000 },
    { day: 7, dailyLimit: 4000 },
    { day: 9, dailyLimit: 8000 },
    { day: 12, dailyLimit: 15000 },
    { day: 15, dailyLimit: 30000 },
    { day: 18, dailyLimit: 60000 },
    { day: 21, dailyLimit: 100000 },
  ],
  aggressive: [
    // 14-day ramp (only for domains with existing reputation)
    { day: 1, dailyLimit: 200 },
    { day: 2, dailyLimit: 500 },
    { day: 3, dailyLimit: 1500 },
    { day: 4, dailyLimit: 3000 },
    { day: 5, dailyLimit: 6000 },
    { day: 7, dailyLimit: 12000 },
    { day: 9, dailyLimit: 25000 },
    { day: 11, dailyLimit: 50000 },
    { day: 14, dailyLimit: 100000 },
  ],
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WarmupScheduleType = keyof typeof WARMUP_SCHEDULES;

export interface WarmupStatus {
  sessionId: string;
  domainId: string;
  scheduleType: WarmupScheduleType;
  status: "active" | "paused" | "completed" | "cancelled";
  currentDay: number;
  dailyLimit: number;
  sentToday: number;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplaints: number;
  bounceRate24h: number;
  complaintRate24h: number;
  consecutiveHealthyDays: number;
  extensionDays: number;
  schedule: ScheduleStep[];
  startedAt: string;
  pausedAt: string | null;
}

export interface WarmupSignals {
  bounceRate: number;
  complaintRate: number;
  deliveredCount: number;
  bouncedCount: number;
  complaintCount: number;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: string): Result<never> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// WarmupOrchestrator
// ---------------------------------------------------------------------------

/**
 * DB-backed domain warm-up orchestrator.
 *
 * All state is persisted in the `warmup_sessions` table. Methods are
 * stateless — each call reads from and writes to the database, so
 * multiple API servers / workers can call them concurrently.
 */
export class WarmupOrchestrator {
  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Start a warm-up session for a domain.
   * Only one active/paused session per domain is allowed.
   */
  async startWarmup(
    domainId: string,
    accountId: string,
    scheduleType: WarmupScheduleType = "conservative",
  ): Promise<Result<WarmupStatus>> {
    const db = getDatabase();

    // Verify the domain exists and belongs to this account
    const [domainRecord] = await db
      .select({ id: domainsTable.id, domain: domainsTable.domain })
      .from(domainsTable)
      .where(
        and(
          eq(domainsTable.id, domainId),
          eq(domainsTable.accountId, accountId),
        ),
      )
      .limit(1);

    if (!domainRecord) {
      return fail("Domain not found or does not belong to this account");
    }

    // Check for existing active/paused session
    const [existing] = await db
      .select({ id: warmupSessions.id, status: warmupSessions.status })
      .from(warmupSessions)
      .where(
        and(
          eq(warmupSessions.domainId, domainId),
          eq(warmupSessions.status, "active"),
        ),
      )
      .limit(1);

    if (existing) {
      return fail(
        `Domain already has an active warm-up session (${existing.id}). Pause or cancel it first.`,
      );
    }

    const [existingPaused] = await db
      .select({ id: warmupSessions.id })
      .from(warmupSessions)
      .where(
        and(
          eq(warmupSessions.domainId, domainId),
          eq(warmupSessions.status, "paused"),
        ),
      )
      .limit(1);

    if (existingPaused) {
      return fail(
        `Domain has a paused warm-up session (${existingPaused.id}). Resume or cancel it first.`,
      );
    }

    // Create a new session
    const schedule = [...WARMUP_SCHEDULES[scheduleType]];
    const id = crypto.randomUUID().replace(/-/g, "");
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0]!;

    await db.insert(warmupSessions).values({
      id,
      accountId,
      domainId,
      scheduleType,
      status: "active",
      startedAt: now,
      currentDay: 1,
      sentToday: 0,
      sentTodayDate: todayStr,
      extensionDays: 0,
      schedule,
      totalSent: 0,
      totalDelivered: 0,
      totalBounced: 0,
      totalComplaints: 0,
      bounceRate24h: 0,
      complaintRate24h: 0,
      consecutiveHealthyDays: 0,
      createdAt: now,
      updatedAt: now,
    });

    return ok(this.toStatus(
      await this.getSession(id),
    ));
  }

  /**
   * Get the current daily sending limit for a domain.
   * Returns null if no active warm-up session exists (domain is not in warm-up).
   * Returns 0 if the warm-up is paused.
   */
  async getDailyLimit(domainId: string): Promise<number | null> {
    const session = await this.getActiveSession(domainId);
    if (!session) return null;

    if (session.status === "paused") return 0;
    if (session.status !== "active") return null;

    // Reset sentToday if the date has rolled over
    await this.maybeResetDailyCounter(session);

    return this.computeDailyLimit(session);
  }

  /**
   * Check whether a domain can send another email.
   * Returns:
   *  - { allowed: true } if not in warm-up or under limit
   *  - { allowed: false, reason, retryAfter } if over limit
   */
  async canSend(domainId: string): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: Date;
  }> {
    const session = await this.getActiveSession(domainId);

    // No active warm-up — domain is not rate-limited by warm-up
    if (!session) return { allowed: true };

    if (session.status === "paused") {
      return {
        allowed: false,
        reason: "Warm-up is paused due to delivery issues",
        retryAfter: undefined,
      };
    }

    if (session.status !== "active") return { allowed: true };

    // Reset counter if needed
    await this.maybeResetDailyCounter(session);

    const limit = this.computeDailyLimit(session);
    if (session.sentToday >= limit) {
      // Next day at midnight UTC
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      return {
        allowed: false,
        reason: `Warm-up daily limit reached (${session.sentToday}/${limit})`,
        retryAfter: tomorrow,
      };
    }

    return { allowed: true };
  }

  /**
   * Auto-trigger guard — call this at queue-accept time BEFORE enqueueing
   * any outbound email. This is the single entry point that enforces the
   * reputation-protection warm-up mandate:
   *
   *  1. If no active/paused session exists for the domain, one is created
   *     on-the-fly using AUTO_WARMUP_SCHEDULE. New senders CANNOT bypass
   *     the warm-up by "not starting one" — the platform enrols them
   *     automatically on first send.
   *
   *  2. The current auto step is recomputed on every call from
   *     days-since-start + the most recent bounce rate. A step is only
   *     advanced when the current step's `advanceBounceRate` threshold
   *     is met; otherwise the domain stays pinned at the current step.
   *
   *  3. If today's send count is already at the current step's daily
   *     limit, this method returns `{ allowed: false, code:
   *     "WARMUP_LIMIT_EXCEEDED" }` with a human-readable message. The
   *     API layer MUST hard-reject — no silent drop.
   */
  async ensureWarmupAndCheck(
    domainId: string,
    accountId: string,
  ): Promise<WarmupCheckResult> {
    const db = getDatabase();

    // Look up existing session (active or paused)
    let session = await this.getActiveSession(domainId);

    // Auto-create if none exists
    if (!session) {
      const schedule = AUTO_WARMUP_SCHEDULE.map((s) => ({
        day: s.day,
        dailyLimit: s.dailyLimit,
      }));
      const id = crypto.randomUUID().replace(/-/g, "");
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0]!;

      try {
        await db.insert(warmupSessions).values({
          id,
          accountId,
          domainId,
          scheduleType: "conservative",
          status: "active",
          startedAt: now,
          currentDay: 1,
          sentToday: 0,
          sentTodayDate: todayStr,
          extensionDays: 0,
          schedule,
          totalSent: 0,
          totalDelivered: 0,
          totalBounced: 0,
          totalComplaints: 0,
          bounceRate24h: 0,
          complaintRate24h: 0,
          consecutiveHealthyDays: 0,
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        // Race condition: another worker may have inserted the row between
        // our read and write. Re-fetch and fall through.
      }

      session = await this.getActiveSession(domainId);
      if (!session) {
        // Something is deeply wrong — return a soft-block so we don't
        // leak reputation while we investigate.
        return {
          allowed: false,
          code: WARMUP_LIMIT_EXCEEDED,
          message:
            "Unable to establish a warm-up session for your domain. Please retry in a few seconds.",
        };
      }
    }

    // Paused session — hard block
    if (session.status === "paused") {
      return {
        allowed: false,
        code: "WARMUP_PAUSED",
        message:
          "Warm-up for this domain is paused due to elevated bounce or complaint rates. Resume it from the dashboard after investigating.",
      };
    }

    if (session.status !== "active") {
      // Completed / cancelled — no warm-up limit applies.
      return { allowed: true };
    }

    // Ensure per-day counter is fresh and advance the schedule step if
    // bounce signals permit.
    await this.maybeResetDailyCounter(session);
    await this.maybeAdvanceAutoStep(session);

    // Refresh the in-memory session after possible mutations above.
    const refreshed = await this.getSession(session.id);

    const { dailyLimit, currentStep } = this.computeAutoStep(refreshed);

    if (refreshed.sentToday >= dailyLimit) {
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);

      const humanLimit =
        dailyLimit >= Number.MAX_SAFE_INTEGER ? "unlimited" : String(dailyLimit);

      return {
        allowed: false,
        code: WARMUP_LIMIT_EXCEEDED,
        message: `Your domain is in warmup day ${currentStep.day}. Limit: ${humanLimit} sends/day. Current: ${refreshed.sentToday}. Resets at midnight UTC.`,
        currentDay: currentStep.day,
        dailyLimit,
        sentToday: refreshed.sentToday,
        retryAfter: tomorrow,
      };
    }

    return {
      allowed: true,
      currentDay: currentStep.day,
      dailyLimit,
      sentToday: refreshed.sentToday,
    };
  }

  /**
   * Increment the sent counter for a domain's warm-up session.
   * Call this after successfully queuing an email.
   */
  async recordSend(domainId: string): Promise<void> {
    const session = await this.getActiveSession(domainId);
    if (!session || session.status !== "active") return;

    await this.maybeResetDailyCounter(session);

    const db = getDatabase();
    await db
      .update(warmupSessions)
      .set({
        sentToday: session.sentToday + 1,
        totalSent: session.totalSent + 1,
        updatedAt: new Date(),
      })
      .where(eq(warmupSessions.id, session.id));
  }

  /**
   * Get the current warm-up status for a domain.
   */
  async checkWarmupStatus(domainId: string): Promise<Result<WarmupStatus>> {
    const session = await this.getActiveSession(domainId);
    if (!session) {
      return fail("No active or paused warm-up session for this domain");
    }

    await this.maybeResetDailyCounter(session);
    await this.maybeAdvanceDay(session);

    return ok(this.toStatus(session));
  }

  /**
   * Adjust the warm-up schedule based on delivery signals.
   *
   * Rules:
   *  - bounce rate >5%: extend schedule by 2 days
   *  - bounce rate >10%: pause warm-up for 24h
   *  - complaint rate >0.1%: pause warm-up
   *  - all signals good after 3 consecutive healthy days: optionally accelerate
   */
  async adjustSchedule(
    domainId: string,
    signals: WarmupSignals,
  ): Promise<Result<WarmupStatus>> {
    const session = await this.getActiveSession(domainId);
    if (!session) {
      return fail("No active warm-up session for this domain");
    }

    if (session.status !== "active") {
      return fail(`Cannot adjust schedule — session is ${session.status}`);
    }

    const db = getDatabase();
    const updates: Partial<WarmupSession> = {
      bounceRate24h: signals.bounceRate,
      complaintRate24h: signals.complaintRate,
      totalDelivered: session.totalDelivered + signals.deliveredCount,
      totalBounced: session.totalBounced + signals.bouncedCount,
      totalComplaints: session.totalComplaints + signals.complaintCount,
      updatedAt: new Date(),
    };

    // Complaint rate >0.1% — pause immediately
    if (signals.complaintRate > 0.001) {
      updates.status = "paused";
      updates.pausedAt = new Date();
      updates.consecutiveHealthyDays = 0;
      await db
        .update(warmupSessions)
        .set(updates)
        .where(eq(warmupSessions.id, session.id));

      const updated = await this.getSession(session.id);
      return ok(this.toStatus(updated));
    }

    // Bounce rate >10% — pause warm-up
    if (signals.bounceRate > 0.10) {
      updates.status = "paused";
      updates.pausedAt = new Date();
      updates.consecutiveHealthyDays = 0;
      await db
        .update(warmupSessions)
        .set(updates)
        .where(eq(warmupSessions.id, session.id));

      const updated = await this.getSession(session.id);
      return ok(this.toStatus(updated));
    }

    // Bounce rate >5% — extend schedule by 2 days
    if (signals.bounceRate > 0.05) {
      const schedule = session.schedule as ScheduleStep[];
      const extended = this.extendSchedule(schedule, 2);
      updates.schedule = extended;
      updates.extensionDays = session.extensionDays + 2;
      updates.consecutiveHealthyDays = 0;
      await db
        .update(warmupSessions)
        .set(updates)
        .where(eq(warmupSessions.id, session.id));

      const updated = await this.getSession(session.id);
      return ok(this.toStatus(updated));
    }

    // All signals healthy
    const newHealthyDays = session.consecutiveHealthyDays + 1;
    updates.consecutiveHealthyDays = newHealthyDays;

    // After 3 consecutive healthy days — accelerate by removing 1 day
    if (newHealthyDays >= 3) {
      const schedule = session.schedule as ScheduleStep[];
      if (schedule.length > 2) {
        const compressed = this.compressSchedule(schedule, 1);
        updates.schedule = compressed;
        updates.consecutiveHealthyDays = 0; // reset counter
      }
    }

    await db
      .update(warmupSessions)
      .set(updates)
      .where(eq(warmupSessions.id, session.id));

    const updated = await this.getSession(session.id);
    return ok(this.toStatus(updated));
  }

  /**
   * Pause the warm-up for a domain.
   */
  async pauseWarmup(domainId: string): Promise<Result<WarmupStatus>> {
    const session = await this.getActiveSession(domainId);
    if (!session) {
      return fail("No active warm-up session for this domain");
    }

    if (session.status !== "active") {
      return fail(`Cannot pause — session is already ${session.status}`);
    }

    const db = getDatabase();
    await db
      .update(warmupSessions)
      .set({
        status: "paused",
        pausedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(warmupSessions.id, session.id));

    const updated = await this.getSession(session.id);
    return ok(this.toStatus(updated));
  }

  /**
   * Resume a paused warm-up session.
   */
  async resumeWarmup(domainId: string): Promise<Result<WarmupStatus>> {
    const [session] = await getDatabase()
      .select()
      .from(warmupSessions)
      .where(
        and(
          eq(warmupSessions.domainId, domainId),
          eq(warmupSessions.status, "paused"),
        ),
      )
      .limit(1);

    if (!session) {
      return fail("No paused warm-up session for this domain");
    }

    const db = getDatabase();
    await db
      .update(warmupSessions)
      .set({
        status: "active",
        pausedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(warmupSessions.id, session.id));

    const updated = await this.getSession(session.id);
    return ok(this.toStatus(updated));
  }

  /**
   * Cancel a warm-up session permanently.
   */
  async cancelWarmup(domainId: string): Promise<Result<{ cancelled: true }>> {
    const session = await this.getActiveSession(domainId);
    if (!session) {
      return fail("No active or paused warm-up session for this domain");
    }

    const db = getDatabase();
    await db
      .update(warmupSessions)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(warmupSessions.id, session.id));

    return ok({ cancelled: true });
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  /**
   * Fetch a session by ID.
   */
  private async getSession(id: string): Promise<WarmupSession> {
    const [session] = await getDatabase()
      .select()
      .from(warmupSessions)
      .where(eq(warmupSessions.id, id))
      .limit(1);

    return session!;
  }

  /**
   * Get the active or paused session for a domain.
   */
  private async getActiveSession(
    domainId: string,
  ): Promise<WarmupSession | null> {
    const db = getDatabase();

    // Check active first
    const [active] = await db
      .select()
      .from(warmupSessions)
      .where(
        and(
          eq(warmupSessions.domainId, domainId),
          eq(warmupSessions.status, "active"),
        ),
      )
      .limit(1);

    if (active) return active;

    // Check paused
    const [paused] = await db
      .select()
      .from(warmupSessions)
      .where(
        and(
          eq(warmupSessions.domainId, domainId),
          eq(warmupSessions.status, "paused"),
        ),
      )
      .limit(1);

    return paused ?? null;
  }

  /**
   * Compute the auto-schedule step that currently applies to a session,
   * based on `currentDay`. Returns the step and its daily limit.
   *
   * This is separate from `computeDailyLimit` because the auto schedule
   * uses strict step thresholds: a domain cannot advance to the next step
   * unless its observed bounce rate is under the current step's threshold.
   */
  private computeAutoStep(session: WarmupSession): {
    currentStep: AutoWarmupStep;
    dailyLimit: number;
  } {
    const step = resolveAutoStep(session.currentDay);
    return { currentStep: step, dailyLimit: step.dailyLimit };
  }

  /**
   * Advance the session's `currentDay` to the next auto-schedule step IF:
   *
   *  1. Enough wall-clock days have elapsed since `startedAt`
   *  2. The bounce rate over the last 24h is below the current step's
   *     `advanceBounceRate` threshold
   *
   * If bounces are too high, `currentDay` is frozen at the current step
   * until they recover. This is hard-enforcement — no soft limits.
   */
  private async maybeAdvanceAutoStep(session: WarmupSession): Promise<void> {
    if (session.status !== "active") return;

    const startDate = new Date(session.startedAt);
    const now = new Date();
    const elapsedMs = now.getTime() - startDate.getTime();
    const elapsedDays = Math.max(
      1,
      Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1,
    );

    const nextDay = computeNextAutoDay({
      currentDay: session.currentDay,
      elapsedDays,
      bounceRate24h: session.bounceRate24h,
    });

    if (nextDay === session.currentDay) return;

    const db = getDatabase();
    await db
      .update(warmupSessions)
      .set({
        currentDay: nextDay,
        updatedAt: new Date(),
      })
      .where(eq(warmupSessions.id, session.id));

    session.currentDay = nextDay;
  }

  /**
   * Compute today's daily limit from the schedule and current day.
   */
  private computeDailyLimit(session: WarmupSession): number {
    const schedule = session.schedule as ScheduleStep[];
    const day = session.currentDay;

    // Find the applicable step: the last step where step.day <= currentDay
    let limit = schedule[0]?.dailyLimit ?? 50;
    for (const step of schedule) {
      if (step.day <= day) {
        limit = step.dailyLimit;
      } else {
        break;
      }
    }

    return limit;
  }

  /**
   * Reset the daily counter if the date has changed (UTC).
   */
  private async maybeResetDailyCounter(
    session: WarmupSession,
  ): Promise<void> {
    const todayStr = new Date().toISOString().split("T")[0]!;
    if (session.sentTodayDate === todayStr) return;

    const db = getDatabase();
    await db
      .update(warmupSessions)
      .set({
        sentToday: 0,
        sentTodayDate: todayStr,
        updatedAt: new Date(),
      })
      .where(eq(warmupSessions.id, session.id));

    // Update the in-memory copy so subsequent code sees the reset
    session.sentToday = 0;
    session.sentTodayDate = todayStr;
  }

  /**
   * Advance the day counter based on how many days have elapsed since start.
   * Also completes the warm-up if we've passed the last day in the schedule.
   */
  private async maybeAdvanceDay(session: WarmupSession): Promise<void> {
    if (session.status !== "active") return;

    const startDate = new Date(session.startedAt);
    const now = new Date();
    const elapsedMs = now.getTime() - startDate.getTime();
    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1; // day 1 on start day

    if (elapsedDays === session.currentDay) return;

    const schedule = session.schedule as ScheduleStep[];
    const lastDay = schedule[schedule.length - 1]?.day ?? 30;

    const db = getDatabase();

    if (elapsedDays > lastDay) {
      // Warm-up is complete
      await db
        .update(warmupSessions)
        .set({
          status: "completed",
          currentDay: elapsedDays,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(warmupSessions.id, session.id));

      session.status = "completed";
      session.currentDay = elapsedDays;
    } else {
      await db
        .update(warmupSessions)
        .set({
          currentDay: elapsedDays,
          updatedAt: now,
        })
        .where(eq(warmupSessions.id, session.id));

      session.currentDay = elapsedDays;
    }
  }

  /**
   * Extend a schedule by adding extra days at the end.
   * Shifts all steps after the current position by `extraDays`.
   */
  private extendSchedule(
    schedule: ScheduleStep[],
    extraDays: number,
  ): ScheduleStep[] {
    if (schedule.length < 2) return schedule;

    // Add interpolated steps between the last two steps
    const last = schedule[schedule.length - 1]!;
    const secondLast = schedule[schedule.length - 2]!;

    const newSteps = [...schedule];
    // Shift the last step out by extraDays
    newSteps[newSteps.length - 1] = {
      day: last.day + extraDays,
      dailyLimit: last.dailyLimit,
    };

    // Insert an intermediate step
    const midDay = secondLast.day + Math.floor((last.day + extraDays - secondLast.day) / 2);
    const midLimit = Math.floor((secondLast.dailyLimit + last.dailyLimit) / 2);

    // Only insert if the mid day is different from existing steps
    const midExists = newSteps.some((s) => s.day === midDay);
    if (!midExists && midDay > secondLast.day && midDay < last.day + extraDays) {
      newSteps.splice(newSteps.length - 1, 0, { day: midDay, dailyLimit: midLimit });
    }

    return newSteps;
  }

  /**
   * Compress a schedule by removing the last N intermediate days.
   */
  private compressSchedule(
    schedule: ScheduleStep[],
    removeDays: number,
  ): ScheduleStep[] {
    if (schedule.length <= 2) return schedule;

    const result = [...schedule];
    // Shift all steps from index 1 onward earlier by removeDays
    for (let i = 1; i < result.length; i++) {
      result[i] = {
        ...result[i]!,
        day: Math.max(result[i]!.day - removeDays, result[i - 1]!.day + 1),
      };
    }

    return result;
  }

  /**
   * Map a DB session row to the public WarmupStatus shape.
   */
  private toStatus(session: WarmupSession): WarmupStatus {
    const schedule = session.schedule as ScheduleStep[];
    return {
      sessionId: session.id,
      domainId: session.domainId,
      scheduleType: session.scheduleType as WarmupScheduleType,
      status: session.status as WarmupStatus["status"],
      currentDay: session.currentDay,
      dailyLimit: this.computeDailyLimit(session),
      sentToday: session.sentToday,
      totalSent: session.totalSent,
      totalDelivered: session.totalDelivered,
      totalBounced: session.totalBounced,
      totalComplaints: session.totalComplaints,
      bounceRate24h: session.bounceRate24h,
      complaintRate24h: session.complaintRate24h,
      consecutiveHealthyDays: session.consecutiveHealthyDays,
      extensionDays: session.extensionDays,
      schedule,
      startedAt: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString() ?? null,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _orchestrator: WarmupOrchestrator | null = null;

export function getWarmupOrchestrator(): WarmupOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new WarmupOrchestrator();
  }
  return _orchestrator;
}
