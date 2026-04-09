import type {
  IspProvider,
  IspStrategy,
  IspSignal,
  WarmupSchedule,
  WarmupPhase,
  WarmupMetrics,
  WarmupStatus,
  DailySnapshot,
} from '../types';

// ─── Result Pattern ──────────────────────────────────────────────────────────

type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── ISP Strategy Defaults ───────────────────────────────────────────────────

const ISP_STRATEGIES: Record<IspProvider, IspStrategy> = {
  gmail: {
    provider: 'gmail',
    initialVolume: 50,
    growthRate: 1.3,
    maxDailyVolume: 100_000,
    bounceThreshold: 0.03,
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
    bounceThreshold: 0.04,
    complaintThreshold: 0.002,
    deferralThreshold: 0.12,
    preferredSendingHours: [8, 9, 10, 11, 13, 14, 15],
    minimumDays: 21,
  },
  microsoft: {
    provider: 'microsoft',
    initialVolume: 75,
    growthRate: 1.35,
    maxDailyVolume: 120_000,
    bounceThreshold: 0.03,
    complaintThreshold: 0.0015,
    deferralThreshold: 0.08,
    preferredSendingHours: [8, 9, 10, 11, 14, 15, 16, 17],
    minimumDays: 28,
  },
  apple: {
    provider: 'apple',
    initialVolume: 60,
    growthRate: 1.25,
    maxDailyVolume: 50_000,
    bounceThreshold: 0.03,
    complaintThreshold: 0.001,
    deferralThreshold: 0.10,
    preferredSendingHours: [9, 10, 11, 14, 15],
    minimumDays: 30,
  },
  aol: {
    provider: 'aol',
    initialVolume: 100,
    growthRate: 1.5,
    maxDailyVolume: 60_000,
    bounceThreshold: 0.05,
    complaintThreshold: 0.003,
    deferralThreshold: 0.15,
    preferredSendingHours: [8, 9, 10, 11, 12, 13, 14, 15, 16],
    minimumDays: 14,
  },
  comcast: {
    provider: 'comcast',
    initialVolume: 80,
    growthRate: 1.4,
    maxDailyVolume: 40_000,
    bounceThreshold: 0.04,
    complaintThreshold: 0.002,
    deferralThreshold: 0.12,
    preferredSendingHours: [9, 10, 11, 14, 15, 16],
    minimumDays: 21,
  },
  generic: {
    provider: 'generic',
    initialVolume: 100,
    growthRate: 1.5,
    maxDailyVolume: 100_000,
    bounceThreshold: 0.05,
    complaintThreshold: 0.003,
    deferralThreshold: 0.15,
    preferredSendingHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    minimumDays: 14,
  },
};

// ─── Warm-up Orchestrator ────────────────────────────────────────────────────

export class WarmupOrchestrator {
  private readonly schedules: Map<string, WarmupSchedule> = new Map();
  private readonly strategies: Map<IspProvider, IspStrategy>;
  private readonly signalBuffer: Map<string, IspSignal[]> = new Map();

  constructor(customStrategies?: Partial<Record<IspProvider, Partial<IspStrategy>>>) {
    this.strategies = new Map();
    for (const [provider, defaults] of Object.entries(ISP_STRATEGIES)) {
      const custom = customStrategies?.[provider as IspProvider];
      const merged: IspStrategy = custom
        ? { ...defaults, ...custom, provider: provider as IspProvider }
        : { ...defaults };
      this.strategies.set(provider as IspProvider, merged);
    }
  }

  /** Retrieve the strategy for a specific ISP */
  getStrategy(provider: IspProvider): IspStrategy {
    return this.strategies.get(provider) ?? ISP_STRATEGIES.generic;
  }

  /** Generate the warm-up phase schedule for a given ISP strategy */
  generatePhases(strategy: IspStrategy): WarmupPhase[] {
    const phases: WarmupPhase[] = [];
    let volume = strategy.initialVolume;
    let day = 1;

    while (volume < strategy.maxDailyVolume && day <= 90) {
      const dailyVolume = Math.round(volume);
      const hourlyLimit = Math.max(1, Math.round(dailyVolume / strategy.preferredSendingHours.length));

      let description: string;
      if (day <= 3) {
        description = `Initial seeding phase — ${dailyVolume} emails/day to establish baseline`;
      } else if (day <= 14) {
        description = `Early ramp — growing to ${dailyVolume} emails/day, monitoring delivery signals`;
      } else if (day <= 30) {
        description = `Mid ramp — ${dailyVolume} emails/day, building consistent sending history`;
      } else {
        description = `Late ramp — ${dailyVolume} emails/day, approaching target volume`;
      }

      phases.push({ day, dailyVolume, hourlyLimit, description });
      volume = Math.min(volume * strategy.growthRate, strategy.maxDailyVolume);
      day++;
    }

    // Final phase at max volume
    if (phases.length > 0) {
      const lastPhase = phases[phases.length - 1];
      if (lastPhase !== undefined && lastPhase.dailyVolume < strategy.maxDailyVolume) {
        phases.push({
          day,
          dailyVolume: strategy.maxDailyVolume,
          hourlyLimit: Math.round(strategy.maxDailyVolume / strategy.preferredSendingHours.length),
          description: `Full volume — ${strategy.maxDailyVolume} emails/day, warm-up complete`,
        });
      }
    }

    return phases;
  }

  /** Create a new warm-up schedule for an IP+domain+ISP combination */
  createSchedule(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const existing = this.schedules.get(key);

    if (existing && (existing.status === 'active' || existing.status === 'pending')) {
      return err(`Active warm-up schedule already exists for ${ipAddress} -> ${provider}`);
    }

    const strategy = this.getStrategy(provider);
    const phases = this.generatePhases(strategy);

    if (phases.length === 0) {
      return err('Failed to generate warm-up phases: strategy produced zero phases');
    }

    const schedule: WarmupSchedule = {
      ipAddress,
      domain,
      provider,
      phases,
      currentPhase: 0,
      startDate: new Date(),
      status: 'pending',
      adaptiveMultiplier: 1.0,
      metrics: createEmptyMetrics(),
    };

    this.schedules.set(key, schedule);
    this.signalBuffer.set(key, []);

    return ok(schedule);
  }

  /** Start a pending warm-up schedule */
  startSchedule(ipAddress: string, domain: string, provider: IspProvider): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(`No warm-up schedule found for ${ipAddress} -> ${provider}`);
    }

    if (schedule.status !== 'pending' && schedule.status !== 'paused') {
      return err(`Cannot start schedule in '${schedule.status}' status`);
    }

    schedule.status = 'active';
    if (schedule.startDate.getTime() === 0) {
      schedule.startDate = new Date();
    }

    return ok(schedule);
  }

  /** Process an incoming ISP signal and adapt the schedule */
  processSignal(signal: IspSignal): Result<WarmupSchedule> {
    // Find matching schedules by IP
    const matchingKeys: string[] = [];
    for (const [key, schedule] of this.schedules) {
      if (schedule.ipAddress === signal.ipAddress && schedule.status === 'active') {
        matchingKeys.push(key);
      }
    }

    if (matchingKeys.length === 0) {
      return err(`No active warm-up schedule found for IP ${signal.ipAddress}`);
    }

    // Find exact provider match or use first match
    let targetKey = matchingKeys[0];
    for (const key of matchingKeys) {
      const schedule = this.schedules.get(key);
      if (schedule?.provider === signal.provider) {
        targetKey = key;
        break;
      }
    }

    if (targetKey === undefined) {
      return err(`No matching schedule key resolved for IP ${signal.ipAddress}`);
    }

    const schedule = this.schedules.get(targetKey);
    if (!schedule) {
      return err(`Schedule unexpectedly missing for key ${targetKey}`);
    }

    // Buffer the signal
    const buffer = this.signalBuffer.get(targetKey) ?? [];
    buffer.push(signal);
    this.signalBuffer.set(targetKey, buffer);

    // Update metrics based on signal type
    this.updateMetricsFromSignal(schedule, signal);

    // Recalculate adaptive multiplier
    const strategy = this.getStrategy(schedule.provider);
    const adaptationResult = this.computeAdaptiveMultiplier(schedule, strategy);

    if (!adaptationResult.ok) {
      return err(adaptationResult.error);
    }

    schedule.adaptiveMultiplier = adaptationResult.value.multiplier;

    // Check for threshold breaches — auto-pause
    const breachResult = this.checkThresholdBreach(schedule, strategy);
    if (breachResult.breached) {
      schedule.status = 'paused';
      schedule.adaptiveMultiplier = 0.0;
      return ok(schedule);
    }

    return ok(schedule);
  }

  /** Advance to the next phase if conditions are met */
  evaluatePhaseProgression(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<{ advanced: boolean; schedule: WarmupSchedule }> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(`No warm-up schedule found for ${ipAddress} -> ${provider}`);
    }

    if (schedule.status !== 'active') {
      return ok({ advanced: false, schedule });
    }

    const strategy = this.getStrategy(provider);
    const daysSinceStart = this.daysSinceStart(schedule);

    // Check if we've reached enough days for current phase
    const nextPhaseIndex = schedule.currentPhase + 1;
    if (nextPhaseIndex >= schedule.phases.length) {
      // All phases done — mark complete if minimum days met
      if (daysSinceStart >= strategy.minimumDays) {
        schedule.status = 'completed';
      }
      return ok({ advanced: false, schedule });
    }

    const nextPhase = schedule.phases[nextPhaseIndex];
    if (!nextPhase) {
      return ok({ advanced: false, schedule });
    }

    // Only advance if we've spent at least 1 day in the current phase
    // and metrics are within acceptable thresholds
    if (daysSinceStart < nextPhase.day) {
      return ok({ advanced: false, schedule });
    }

    // Verify metrics are healthy before advancing
    if (schedule.metrics.bounceRate > strategy.bounceThreshold) {
      return ok({ advanced: false, schedule });
    }
    if (schedule.metrics.complaintRate > strategy.complaintThreshold) {
      return ok({ advanced: false, schedule });
    }
    if (schedule.metrics.deferralRate > strategy.deferralThreshold) {
      return ok({ advanced: false, schedule });
    }

    schedule.currentPhase = nextPhaseIndex;
    return ok({ advanced: true, schedule });
  }

  /** Get the current sending allowance for an IP+domain+ISP */
  getCurrentAllowance(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): Result<{ dailyVolume: number; hourlyLimit: number; preferredHours: number[] }> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(`No warm-up schedule found for ${ipAddress} -> ${provider}`);
    }

    if (schedule.status !== 'active') {
      return ok({ dailyVolume: 0, hourlyLimit: 0, preferredHours: [] });
    }

    const phase = schedule.phases[schedule.currentPhase];
    if (!phase) {
      return err('Current phase index is out of bounds');
    }

    const strategy = this.getStrategy(provider);
    const adjustedDaily = Math.round(phase.dailyVolume * schedule.adaptiveMultiplier);
    const adjustedHourly = Math.max(1, Math.round(phase.hourlyLimit * schedule.adaptiveMultiplier));

    return ok({
      dailyVolume: adjustedDaily,
      hourlyLimit: adjustedHourly,
      preferredHours: strategy.preferredSendingHours,
    });
  }

  /** Check whether the current hour is a preferred sending hour for the ISP */
  isPreferredSendingHour(provider: IspProvider, hourUtc: number): boolean {
    const strategy = this.getStrategy(provider);
    return strategy.preferredSendingHours.includes(hourUtc);
  }

  /** Pause a warm-up schedule manually */
  pauseSchedule(ipAddress: string, domain: string, provider: IspProvider): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(`No warm-up schedule found for ${ipAddress} -> ${provider}`);
    }

    if (schedule.status !== 'active') {
      return err(`Cannot pause schedule in '${schedule.status}' status`);
    }

    schedule.status = 'paused';
    return ok(schedule);
  }

  /** Resume a paused warm-up schedule, optionally reducing the multiplier */
  resumeSchedule(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
    reducedMultiplier?: number,
  ): Result<WarmupSchedule> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(`No warm-up schedule found for ${ipAddress} -> ${provider}`);
    }

    if (schedule.status !== 'paused') {
      return err(`Cannot resume schedule in '${schedule.status}' status`);
    }

    schedule.status = 'active';
    if (reducedMultiplier !== undefined) {
      schedule.adaptiveMultiplier = clamp(reducedMultiplier, 0.1, 2.0);
    } else {
      // Resume at 50% of previous multiplier for safety
      schedule.adaptiveMultiplier = Math.max(0.25, schedule.adaptiveMultiplier * 0.5);
    }

    return ok(schedule);
  }

  /** Record a daily snapshot for metrics tracking */
  recordDailySnapshot(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
    snapshot: DailySnapshot,
  ): Result<WarmupMetrics> {
    const key = this.scheduleKey(ipAddress, domain, provider);
    const schedule = this.schedules.get(key);

    if (!schedule) {
      return err(`No warm-up schedule found for ${ipAddress} -> ${provider}`);
    }

    schedule.metrics.dailySnapshots.push(snapshot);
    schedule.metrics.totalSent += snapshot.sent;
    schedule.metrics.totalDelivered += snapshot.delivered;
    schedule.metrics.totalBounced += snapshot.bounced;
    schedule.metrics.totalDeferred += snapshot.deferred;
    schedule.metrics.totalComplaints += snapshot.complaints;

    this.recalculateRates(schedule);

    return ok(schedule.metrics);
  }

  /** Get all schedules for an IP */
  getSchedulesForIp(ipAddress: string): WarmupSchedule[] {
    const results: WarmupSchedule[] = [];
    for (const schedule of this.schedules.values()) {
      if (schedule.ipAddress === ipAddress) {
        results.push(schedule);
      }
    }
    return results;
  }

  /** Get a specific schedule */
  getSchedule(
    ipAddress: string,
    domain: string,
    provider: IspProvider,
  ): WarmupSchedule | undefined {
    const key = this.scheduleKey(ipAddress, domain, provider);
    return this.schedules.get(key);
  }

  /** Get all active schedules */
  getActiveSchedules(): WarmupSchedule[] {
    const results: WarmupSchedule[] = [];
    for (const schedule of this.schedules.values()) {
      if (schedule.status === 'active') {
        results.push(schedule);
      }
    }
    return results;
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private scheduleKey(ipAddress: string, domain: string, provider: IspProvider): string {
    return `${ipAddress}:${domain}:${provider}`;
  }

  private daysSinceStart(schedule: WarmupSchedule): number {
    const now = Date.now();
    const start = schedule.startDate.getTime();
    return Math.floor((now - start) / (24 * 60 * 60 * 1000));
  }

  private updateMetricsFromSignal(schedule: WarmupSchedule, signal: IspSignal): void {
    switch (signal.type) {
      case 'delivery':
        schedule.metrics.totalDelivered += 1;
        schedule.metrics.totalSent += 1;
        break;
      case 'bounce':
        schedule.metrics.totalBounced += 1;
        schedule.metrics.totalSent += 1;
        break;
      case 'deferral':
        schedule.metrics.totalDeferred += 1;
        schedule.metrics.totalSent += 1;
        break;
      case 'complaint':
        schedule.metrics.totalComplaints += 1;
        break;
      case 'block':
        schedule.metrics.totalBounced += 1;
        schedule.metrics.totalSent += 1;
        break;
    }

    this.recalculateRates(schedule);
  }

  private recalculateRates(schedule: WarmupSchedule): void {
    const total = schedule.metrics.totalSent;
    if (total === 0) {
      schedule.metrics.deliveryRate = 0;
      schedule.metrics.bounceRate = 0;
      schedule.metrics.complaintRate = 0;
      schedule.metrics.deferralRate = 0;
      return;
    }

    schedule.metrics.deliveryRate = schedule.metrics.totalDelivered / total;
    schedule.metrics.bounceRate = schedule.metrics.totalBounced / total;
    schedule.metrics.deferralRate = schedule.metrics.totalDeferred / total;
    // Complaint rate is relative to delivered, not sent
    const delivered = schedule.metrics.totalDelivered;
    schedule.metrics.complaintRate = delivered > 0
      ? schedule.metrics.totalComplaints / delivered
      : 0;
  }

  private computeAdaptiveMultiplier(
    schedule: WarmupSchedule,
    strategy: IspStrategy,
  ): Result<{ multiplier: number }> {
    const metrics = schedule.metrics;

    if (metrics.totalSent < 10) {
      // Not enough data to adapt
      return ok({ multiplier: 1.0 });
    }

    let multiplier = 1.0;

    // Bounce rate factor: reduce volume proportionally as we approach threshold
    const bounceRatio = metrics.bounceRate / strategy.bounceThreshold;
    if (bounceRatio > 0.7) {
      multiplier *= Math.max(0.3, 1.0 - (bounceRatio - 0.7) * 2.0);
    }

    // Complaint rate factor: complaints are more severe
    const complaintRatio = metrics.complaintRate / strategy.complaintThreshold;
    if (complaintRatio > 0.5) {
      multiplier *= Math.max(0.2, 1.0 - (complaintRatio - 0.5) * 2.5);
    }

    // Deferral rate factor
    const deferralRatio = metrics.deferralRate / strategy.deferralThreshold;
    if (deferralRatio > 0.6) {
      multiplier *= Math.max(0.4, 1.0 - (deferralRatio - 0.6) * 1.5);
    }

    // Good delivery rate bonus: if everything looks great, allow slight acceleration
    if (metrics.deliveryRate > 0.98 && bounceRatio < 0.3 && complaintRatio < 0.2) {
      multiplier = Math.min(multiplier * 1.15, 2.0);
    }

    return ok({ multiplier: clamp(multiplier, 0.1, 2.0) });
  }

  private checkThresholdBreach(
    schedule: WarmupSchedule,
    strategy: IspStrategy,
  ): { breached: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (schedule.metrics.bounceRate > strategy.bounceThreshold * 1.5) {
      reasons.push(
        `Bounce rate ${(schedule.metrics.bounceRate * 100).toFixed(2)}% exceeds critical threshold ` +
        `${(strategy.bounceThreshold * 150).toFixed(2)}%`,
      );
    }

    if (schedule.metrics.complaintRate > strategy.complaintThreshold * 1.5) {
      reasons.push(
        `Complaint rate ${(schedule.metrics.complaintRate * 100).toFixed(4)}% exceeds critical threshold`,
      );
    }

    if (schedule.metrics.deferralRate > strategy.deferralThreshold * 2.0) {
      reasons.push(
        `Deferral rate ${(schedule.metrics.deferralRate * 100).toFixed(2)}% exceeds critical threshold`,
      );
    }

    return { breached: reasons.length > 0, reasons };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createEmptyMetrics(): WarmupMetrics {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createWarmupOrchestrator(
  customStrategies?: Partial<Record<IspProvider, Partial<IspStrategy>>>,
): WarmupOrchestrator {
  return new WarmupOrchestrator(customStrategies);
}
