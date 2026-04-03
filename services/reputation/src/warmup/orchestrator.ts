/**
 * @emailed/reputation — AI-Driven IP Warm-up Orchestrator
 *
 * Manages the gradual ramp-up of sending volume for new IP addresses.
 * Uses ISP-specific strategies and adapts in real-time based on bounce,
 * deferral, and complaint signals from each provider.
 *
 * The orchestrator:
 *  1. Generates a warm-up plan based on IP age and target volume
 *  2. Calculates daily sending limits with gradual ramp-up
 *  3. Applies ISP-specific schedules (Gmail, Yahoo, Outlook, etc.)
 *  4. Adapts in real-time when bounce/complaint rates exceed thresholds
 *  5. Tracks progress and produces reports
 */

import type {
  IspProvider,
  IspStrategy,
  IspSignal,
  WarmupSchedule,
  WarmupPhase,
  WarmupStatus,
  WarmupMetrics,
  DailySnapshot,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Multiplier reduction when negative signals exceed thresholds */
const THROTTLE_REDUCTION = 0.5;

/** Multiplier increase when metrics are healthy */
const HEALTHY_BOOST = 1.1;

/** Maximum adaptive multiplier — never exceed 2x planned volume */
const MAX_MULTIPLIER = 2.0;

/** Minimum adaptive multiplier — never drop below 10% of planned volume */
const MIN_MULTIPLIER = 0.1;

/** Number of consecutive healthy days before advancing a phase early */
const EARLY_ADVANCE_THRESHOLD = 3;

/** Default warm-up plan length in days */
const DEFAULT_PLAN_DAYS = 30;

// ---------------------------------------------------------------------------
// ISP Strategy Defaults
// ---------------------------------------------------------------------------

const ISP_STRATEGIES: Readonly<Record<IspProvider, IspStrategy>> = {
  gmail: {
    provider: 'gmail',
    initialVolume: 50,
    growthRate: 1.5,
    maxDailyVolume: 100_000,
    bounceThreshold: 0.05,
    complaintThreshold: 0.001,
    deferralThreshold: 0.10,
    preferredSendingHours: [9, 10, 11, 14, 15, 16],
    minimumDays: 30,
  },
  yahoo: {
    provider: 'yahoo',
    initialVolume: 100,
    growthRate: 1.4,
    maxDailyVolume: 80_000,
    bounceThreshold: 0.06,
    complaintThreshold: 0.002,
    deferralThreshold: 0.12,
    preferredSendingHours: [8, 9, 10, 13, 14, 15],
    minimumDays: 25,
  },
  microsoft: {
    provider: 'microsoft',
    initialVolume: 75,
    growthRate: 1.4,
    maxDailyVolume: 90_000,
    bounceThreshold: 0.05,
    complaintThreshold: 0.001,
    deferralThreshold: 0.10,
    preferredSendingHours: [8, 9, 10, 11, 14, 15, 16],
    minimumDays: 28,
  },
  apple: {
    provider: 'apple',
    initialVolume: 100,
    growthRate: 1.5,
    maxDailyVolume: 70_000,
    bounceThreshold: 0.06,
    complaintThreshold: 0.002,
    deferralThreshold: 0.12,
    preferredSendingHours: [9, 10, 11, 14, 15],
    minimumDays: 20,
  },
  aol: {
    provider: 'aol',
    initialVolume: 150,
    growthRate: 1.6,
    maxDailyVolume: 50_000,
    bounceThreshold: 0.07,
    complaintThreshold: 0.003,
    deferralThreshold: 0.15,
    preferredSendingHours: [9, 10, 11, 12, 13, 14, 15],
    minimumDays: 18,
  },
  comcast: {
    provider: 'comcast',
    initialVolume: 100,
    growthRate: 1.5,
    maxDailyVolume: 40_000,
    bounceThreshold: 0.07,
    complaintThreshold: 0.003,
    deferralThreshold: 0.15,
    preferredSendingHours: [8, 9, 10, 11, 14, 15, 16],
    minimumDays: 20,
  },
  generic: {
    provider: 'generic',
    initialVolume: 200,
    growthRate: 1.5,
    maxDailyVolume: 60_000,
    bounceThreshold: 0.08,
    complaintThreshold: 0.003,
    deferralThreshold: 0.15,
    preferredSendingHours: [8, 9, 10, 11, 12, 13, 14, 15, 16],
    minimumDays: 20,
  },
} as const;

// ---------------------------------------------------------------------------
// Result Type
// ---------------------------------------------------------------------------

type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Warm-up Progress Report
// ---------------------------------------------------------------------------

export interface WarmupProgressReport {
  ipAddress: string;
  domain: string;
  status: WarmupStatus;
  currentPhase: number;
  totalPhases: number;
  dayNumber: number;
  dailyLimitToday: number;
  sentToday: number;
  adaptiveMultiplier: number;
  metrics: WarmupMetrics;
  healthStatus: 'healthy' | 'warning' | 'critical';
  healthDetails: string[];
  estimatedCompletionDate: string;
}

// ---------------------------------------------------------------------------
// Orchestrator Configuration
// ---------------------------------------------------------------------------

export interface WarmupOrchestratorConfig {
  /** Override default ISP strategies */
  strategyOverrides?: Partial<Record<IspProvider, Partial<IspStrategy>>>;
  /** Target daily volume to reach at end of warm-up */
  targetDailyVolume?: number;
  /** Custom plan length in days (overrides ISP minimum) */
  planDays?: number;
}

// ---------------------------------------------------------------------------
// Warm-up Orchestrator
// ---------------------------------------------------------------------------

/**
 * AI-driven IP warm-up orchestrator.
 *
 * Manages warm-up schedules for one or more IP addresses, adapting sending
 * volume in real-time based on ISP feedback signals. Each IP+domain+ISP
 * combination gets its own schedule with provider-specific thresholds.
 */
export class WarmupOrchestrator {
  private readonly schedules: Map<string, WarmupSchedule> = new Map();
  private readonly strategies: Record<IspProvider, IspStrategy>;
  private readonly config: WarmupOrchestratorConfig;

  /** Track consecutive healthy days per schedule for early advancement */
  private readonly consecutiveHealthyDays: Map<string, number> = new Map();

  constructor(config: WarmupOrchestratorConfig = {}) {
    this.config = config;

    // Merge strategy overrides with defaults
    this.strategies = { ...ISP_STRATEGIES };
    if (config.strategyOverrides) {
      for (const [provider, overrides] of Object.entries(config.strategyOverrides)) {
        const key = provider as IspProvider;
        if (this.strategies[key] && overrides) {
          this.strategies[key] = { ...this.strategies[key], ...overrides };
        }
      }
    }
  }

  /**
   * Generate a warm-up plan for a given IP, domain, and target ISP.
   * The plan consists of a series of phases with gradually increasing
   * daily volumes based on the ISP-specific growth rate.
   */
  generatePlan(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);

    if (this.schedules.has(key)) {
      return err(new Error(`Warm-up schedule already exists for ${key}`));
    }

    const strategy = this.strategies[provider];
    const targetVolume = this.config.targetDailyVolume ?? strategy.maxDailyVolume;
    const planDays = this.config.planDays ?? Math.max(strategy.minimumDays, DEFAULT_PLAN_DAYS);

    const phases = this.buildPhases(strategy, targetVolume, planDays);

    const schedule: WarmupSchedule = {
      ipAddress,
      domain,
      provider,
      phases,
      currentPhase: 0,
      startDate: new Date(),
      status: 'pending',
      adaptiveMultiplier: 1.0,
      metrics: this.createEmptyMetrics(),
    };

    this.schedules.set(key, schedule);
    this.consecutiveHealthyDays.set(key, 0);

    return ok(schedule);
  }

  /**
   * Start a previously generated warm-up plan.
   * The schedule must be in "pending" status.
   */
  startPlan(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(new Error(`No warm-up schedule found for ${key}`));
    }

    if (schedule.status !== 'pending') {
      return err(new Error(`Cannot start schedule in status "${schedule.status}"`));
    }

    schedule.status = 'active';
    schedule.startDate = new Date();

    return ok(schedule);
  }

  /**
   * Calculate the allowed sending limit for today, taking into account
   * the current phase, adaptive multiplier, and ISP strategy constraints.
   */
  getDailyLimit(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<number> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(new Error(`No warm-up schedule found for ${key}`));
    }

    if (schedule.status !== 'active') {
      return ok(0);
    }

    const phase = schedule.phases[schedule.currentPhase];
    if (!phase) {
      return ok(0);
    }

    const strategy = this.strategies[provider];
    const adaptedVolume = Math.round(phase.dailyVolume * schedule.adaptiveMultiplier);

    // Never exceed the ISP max daily volume
    const limit = Math.min(adaptedVolume, strategy.maxDailyVolume);

    return ok(limit);
  }

  /**
   * Get the hourly sending limit for the current phase and hour.
   * Returns 0 if sending is not recommended at this hour for the ISP.
   */
  getHourlyLimit(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
    currentHour: number,
  ): Result<number> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(new Error(`No warm-up schedule found for ${key}`));
    }

    if (schedule.status !== 'active') {
      return ok(0);
    }

    const strategy = this.strategies[provider];
    const phase = schedule.phases[schedule.currentPhase];

    if (!phase) {
      return ok(0);
    }

    // If the current hour is not in the preferred sending window,
    // allow a reduced rate (25% of normal hourly limit)
    const isPreferredHour = strategy.preferredSendingHours.includes(currentHour);
    const baseHourly = Math.round(phase.hourlyLimit * schedule.adaptiveMultiplier);

    return ok(isPreferredHour ? baseHourly : Math.round(baseHourly * 0.25));
  }

  /**
   * Process a signal from an ISP and adapt the warm-up schedule.
   * Negative signals (bounces, complaints, blocks) reduce the adaptive
   * multiplier. Positive signals (deliveries) can increase it.
   */
  processSignal(signal: IspSignal): Result<WarmupSchedule> {
    const key = this.scheduleKey(signal.ipAddress, '', signal.provider);

    // Find matching schedule (may match on IP + provider regardless of domain)
    let schedule: WarmupSchedule | undefined;
    let matchedKey: string | undefined;

    for (const [k, s] of this.schedules) {
      if (s.ipAddress === signal.ipAddress && s.provider === signal.provider && s.status === 'active') {
        schedule = s;
        matchedKey = k;
        break;
      }
    }

    if (!schedule || !matchedKey) {
      return err(new Error(`No active warm-up schedule found for IP ${signal.ipAddress} / ${signal.provider}`));
    }

    // Update metrics
    this.updateMetrics(schedule.metrics, signal);

    // Adapt multiplier based on signal type
    const strategy = this.strategies[signal.provider];

    switch (signal.type) {
      case 'delivery': {
        // Positive signal — gently increase multiplier if under threshold
        if (
          schedule.metrics.bounceRate < strategy.bounceThreshold &&
          schedule.metrics.complaintRate < strategy.complaintThreshold
        ) {
          schedule.adaptiveMultiplier = Math.min(
            MAX_MULTIPLIER,
            schedule.adaptiveMultiplier * HEALTHY_BOOST,
          );
        }
        break;
      }

      case 'bounce': {
        if (schedule.metrics.bounceRate > strategy.bounceThreshold) {
          schedule.adaptiveMultiplier = Math.max(
            MIN_MULTIPLIER,
            schedule.adaptiveMultiplier * THROTTLE_REDUCTION,
          );
        }
        break;
      }

      case 'complaint': {
        if (schedule.metrics.complaintRate > strategy.complaintThreshold) {
          // Complaints are severe — throttle aggressively
          schedule.adaptiveMultiplier = Math.max(
            MIN_MULTIPLIER,
            schedule.adaptiveMultiplier * THROTTLE_REDUCTION * THROTTLE_REDUCTION,
          );
        }
        break;
      }

      case 'deferral': {
        if (schedule.metrics.deferralRate > strategy.deferralThreshold) {
          schedule.adaptiveMultiplier = Math.max(
            MIN_MULTIPLIER,
            schedule.adaptiveMultiplier * THROTTLE_REDUCTION,
          );
        }
        break;
      }

      case 'block': {
        // Block signals are critical — pause the warm-up
        schedule.status = 'paused';
        schedule.adaptiveMultiplier = MIN_MULTIPLIER;
        break;
      }
    }

    return ok(schedule);
  }

  /**
   * Record a daily snapshot and advance the phase if appropriate.
   * Should be called once per day at the end of the sending window.
   */
  recordDailySnapshot(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(new Error(`No warm-up schedule found for ${key}`));
    }

    if (schedule.status !== 'active') {
      return err(new Error(`Schedule is not active (status: ${schedule.status})`));
    }

    // Build daily snapshot from current metrics
    const today = new Date().toISOString().split('T')[0] ?? '';
    const snapshot: DailySnapshot = {
      date: today,
      sent: schedule.metrics.totalSent,
      delivered: schedule.metrics.totalDelivered,
      bounced: schedule.metrics.totalBounced,
      deferred: schedule.metrics.totalDeferred,
      complaints: schedule.metrics.totalComplaints,
    };
    schedule.metrics.dailySnapshots.push(snapshot);

    // Evaluate health and decide whether to advance
    const strategy = this.strategies[provider];
    const isHealthy =
      schedule.metrics.bounceRate < strategy.bounceThreshold &&
      schedule.metrics.complaintRate < strategy.complaintThreshold &&
      schedule.metrics.deferralRate < strategy.deferralThreshold;

    if (isHealthy) {
      const healthyDays = (this.consecutiveHealthyDays.get(key) ?? 0) + 1;
      this.consecutiveHealthyDays.set(key, healthyDays);

      // Advance phase if we have had enough healthy days at current level
      const phase = schedule.phases[schedule.currentPhase];
      const daysSinceStart = this.daysSinceStart(schedule);

      if (phase && daysSinceStart >= phase.day) {
        this.advancePhase(schedule);
      } else if (healthyDays >= EARLY_ADVANCE_THRESHOLD) {
        // Early advancement for consistently good performance
        this.advancePhase(schedule);
        this.consecutiveHealthyDays.set(key, 0);
      }
    } else {
      this.consecutiveHealthyDays.set(key, 0);
    }

    return ok(schedule);
  }

  /**
   * Generate a progress report for a warm-up schedule.
   */
  getProgressReport(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<WarmupProgressReport> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(new Error(`No warm-up schedule found for ${key}`));
    }

    const strategy = this.strategies[provider];
    const { healthStatus, healthDetails } = this.evaluateHealth(schedule, strategy);

    const dailyLimitResult = this.getDailyLimit(ipAddress, domain, provider);
    const dailyLimit = dailyLimitResult.ok ? dailyLimitResult.value : 0;

    const dayNumber = this.daysSinceStart(schedule);
    const remainingPhases = schedule.phases.length - schedule.currentPhase;
    const estimatedDaysRemaining = remainingPhases > 0
      ? schedule.phases.slice(schedule.currentPhase).reduce((sum, p, i) => {
          const nextPhase = schedule.phases[schedule.currentPhase + i + 1];
          return sum + (nextPhase ? nextPhase.day - p.day : 1);
        }, 0)
      : 0;

    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + estimatedDaysRemaining);

    const report: WarmupProgressReport = {
      ipAddress,
      domain,
      status: schedule.status,
      currentPhase: schedule.currentPhase,
      totalPhases: schedule.phases.length,
      dayNumber,
      dailyLimitToday: dailyLimit,
      sentToday: schedule.metrics.totalSent,
      adaptiveMultiplier: schedule.adaptiveMultiplier,
      metrics: schedule.metrics,
      healthStatus,
      healthDetails,
      estimatedCompletionDate: completionDate.toISOString().split('T')[0] ?? '',
    };

    return ok(report);
  }

  /** Pause an active warm-up schedule */
  pause(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(new Error(`No warm-up schedule found for ${key}`));
    }

    if (schedule.status !== 'active') {
      return err(new Error(`Cannot pause schedule in status "${schedule.status}"`));
    }

    schedule.status = 'paused';
    return ok(schedule);
  }

  /** Resume a paused warm-up schedule */
  resume(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(new Error(`No warm-up schedule found for ${key}`));
    }

    if (schedule.status !== 'paused') {
      return err(new Error(`Cannot resume schedule in status "${schedule.status}"`));
    }

    // Reset multiplier to a safe level on resume
    schedule.adaptiveMultiplier = Math.max(MIN_MULTIPLIER, schedule.adaptiveMultiplier);
    schedule.status = 'active';
    return ok(schedule);
  }

  /** Get all active warm-up schedules */
  getActiveSchedules(): WarmupSchedule[] {
    return [...this.schedules.values()].filter((s) => s.status === 'active');
  }

  /** Get the ISP strategy for a given provider */
  getStrategy(provider: IspProvider): IspStrategy {
    return this.strategies[provider];
  }

  // ─── Internal ───

  /**
   * Build warm-up phases from an ISP strategy.
   * Each phase represents a day with a target volume.
   */
  private buildPhases(
    strategy: IspStrategy,
    targetVolume: number,
    totalDays: number,
  ): WarmupPhase[] {
    const phases: WarmupPhase[] = [];
    let currentVolume = strategy.initialVolume;
    const sendingHoursPerDay = strategy.preferredSendingHours.length || 8;

    for (let day = 1; day <= totalDays; day++) {
      const dailyVolume = Math.min(Math.round(currentVolume), targetVolume);
      const hourlyLimit = Math.ceil(dailyVolume / sendingHoursPerDay);

      let description: string;
      if (day <= 3) {
        description = `Initial warm-up (day ${day}) — establishing baseline`;
      } else if (dailyVolume < targetVolume * 0.25) {
        description = `Early ramp-up — ${dailyVolume.toLocaleString()} emails/day`;
      } else if (dailyVolume < targetVolume * 0.75) {
        description = `Mid ramp-up — ${dailyVolume.toLocaleString()} emails/day`;
      } else if (dailyVolume < targetVolume) {
        description = `Final ramp-up — approaching target volume`;
      } else {
        description = `Target volume reached — ${targetVolume.toLocaleString()} emails/day`;
      }

      phases.push({ day, dailyVolume, hourlyLimit, description });

      // Apply growth rate for next day
      currentVolume = currentVolume * strategy.growthRate;
    }

    return phases;
  }

  /** Advance to the next warm-up phase, or complete if at the end */
  private advancePhase(schedule: WarmupSchedule): void {
    if (schedule.currentPhase < schedule.phases.length - 1) {
      schedule.currentPhase++;
    } else {
      schedule.status = 'completed';
    }
  }

  /** Calculate days since warm-up start */
  private daysSinceStart(schedule: WarmupSchedule): number {
    const now = Date.now();
    const start = schedule.startDate.getTime();
    return Math.floor((now - start) / (24 * 60 * 60 * 1000));
  }

  /** Update aggregate metrics from an ISP signal */
  private updateMetrics(metrics: WarmupMetrics, signal: IspSignal): void {
    switch (signal.type) {
      case 'delivery':
        metrics.totalSent++;
        metrics.totalDelivered++;
        break;
      case 'bounce':
        metrics.totalSent++;
        metrics.totalBounced++;
        break;
      case 'deferral':
        metrics.totalSent++;
        metrics.totalDeferred++;
        break;
      case 'complaint':
        metrics.totalComplaints++;
        break;
      case 'block':
        metrics.totalBounced++;
        break;
    }

    // Recompute rates
    if (metrics.totalSent > 0) {
      metrics.deliveryRate = metrics.totalDelivered / metrics.totalSent;
      metrics.bounceRate = metrics.totalBounced / metrics.totalSent;
      metrics.deferralRate = metrics.totalDeferred / metrics.totalSent;
    }
    if (metrics.totalDelivered > 0) {
      metrics.complaintRate = metrics.totalComplaints / metrics.totalDelivered;
    }
  }

  /** Evaluate the health of a warm-up schedule */
  private evaluateHealth(
    schedule: WarmupSchedule,
    strategy: IspStrategy,
  ): { healthStatus: 'healthy' | 'warning' | 'critical'; healthDetails: string[] } {
    const details: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (schedule.metrics.bounceRate > strategy.bounceThreshold) {
      status = 'critical';
      details.push(
        `Bounce rate ${(schedule.metrics.bounceRate * 100).toFixed(2)}% exceeds threshold ${(strategy.bounceThreshold * 100).toFixed(2)}%`,
      );
    } else if (schedule.metrics.bounceRate > strategy.bounceThreshold * 0.75) {
      if (status === 'healthy') status = 'warning';
      details.push(
        `Bounce rate ${(schedule.metrics.bounceRate * 100).toFixed(2)}% approaching threshold`,
      );
    }

    if (schedule.metrics.complaintRate > strategy.complaintThreshold) {
      status = 'critical';
      details.push(
        `Complaint rate ${(schedule.metrics.complaintRate * 100).toFixed(3)}% exceeds threshold ${(strategy.complaintThreshold * 100).toFixed(3)}%`,
      );
    } else if (schedule.metrics.complaintRate > strategy.complaintThreshold * 0.75) {
      if (status === 'healthy') status = 'warning';
      details.push(
        `Complaint rate ${(schedule.metrics.complaintRate * 100).toFixed(3)}% approaching threshold`,
      );
    }

    if (schedule.metrics.deferralRate > strategy.deferralThreshold) {
      if (status !== 'critical') status = 'warning';
      details.push(
        `Deferral rate ${(schedule.metrics.deferralRate * 100).toFixed(2)}% exceeds threshold`,
      );
    }

    if (schedule.adaptiveMultiplier < 0.5) {
      if (status === 'healthy') status = 'warning';
      details.push(
        `Adaptive multiplier reduced to ${schedule.adaptiveMultiplier.toFixed(2)}x`,
      );
    }

    if (details.length === 0) {
      details.push('All metrics within acceptable thresholds');
    }

    return { healthStatus: status, healthDetails: details };
  }

  /** Create empty warm-up metrics */
  private createEmptyMetrics(): WarmupMetrics {
    return {
      totalSent: 0,
      totalDelivered: 0,
      totalBounced: 0,
      totalDeferred: 0,
      totalComplaints: 0,
      deliveryRate: 0,
      bounceRate: 0,
      complaintRate: 0,
      deferralRate: 0,
      dailySnapshots: [],
    };
  }

  /** Generate a unique key for a warm-up schedule */
  private scheduleKey(ipAddress: string, domain: string, provider: IspProvider): string {
    return `${ipAddress}::${domain}::${provider}`;
  }
}
