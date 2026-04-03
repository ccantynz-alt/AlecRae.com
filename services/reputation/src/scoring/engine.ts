/**
 * @emailed/reputation — Reputation Scoring Engine
 *
 * Calculates a multi-factor reputation score (0-100) for IP addresses
 * and domains. The score is a weighted composite of:
 *
 *   - Bounce rate (inverse — lower is better)
 *   - Complaint rate (inverse — lower is better)
 *   - Spam trap hits (inverse)
 *   - Engagement score (open/click rates)
 *   - Volume consistency (stable sending patterns)
 *   - Age (older, established senders score higher)
 *   - Authentication pass rate (SPF/DKIM/DMARC)
 *   - Blocklist presence (critical negative factor)
 *
 * The engine maintains score history for trend analysis and emits
 * alerts when scores cross configurable thresholds.
 */

import type {
  IpReputationScore,
  DomainReputationScore,
  ReputationCategory,
  ReputationSignal,
  ReputationFactors,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Factor weights — must sum to 1.0 */
const FACTOR_WEIGHTS = {
  deliveryRate: 0.20,
  bounceRate: 0.15,
  complaintRate: 0.20,
  spamTrapHits: 0.10,
  blocklistPresence: 0.10,
  authenticationScore: 0.10,
  engagementScore: 0.10,
  volumeConsistency: 0.03,
  ageInDays: 0.02,
} as const satisfies Record<keyof ReputationFactors, number>;

/** Score thresholds for category classification */
const CATEGORY_THRESHOLDS: Readonly<Record<ReputationCategory, { min: number; max: number }>> = {
  excellent: { min: 90, max: 100 },
  good: { min: 70, max: 89 },
  neutral: { min: 50, max: 69 },
  poor: { min: 25, max: 49 },
  critical: { min: 0, max: 24 },
} as const;

/** Default alert thresholds */
const DEFAULT_ALERT_THRESHOLDS = {
  /** Alert when score drops below this value */
  scoreDropThreshold: 50,
  /** Alert when score drops by this many points in a single recalculation */
  suddenDropThreshold: 15,
  /** Alert when entering "critical" category */
  criticalCategoryAlert: true,
} as const;

/** Maximum history entries per entity */
const MAX_HISTORY_ENTRIES = 365;

/** Minimum age in days before age bonus kicks in */
const AGE_MATURITY_DAYS = 90;

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
// Alert Types
// ---------------------------------------------------------------------------

export interface ReputationAlert {
  id: string;
  entity: string;
  entityType: 'ip' | 'domain';
  alertType: 'score_drop' | 'sudden_drop' | 'critical_category' | 'blocklist_detected';
  message: string;
  previousScore: number;
  currentScore: number;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Score History Entry
// ---------------------------------------------------------------------------

export interface ScoreHistoryEntry {
  score: number;
  category: ReputationCategory;
  factors: ReputationFactors;
  calculatedAt: Date;
}

// ---------------------------------------------------------------------------
// Trend Analysis
// ---------------------------------------------------------------------------

export interface TrendAnalysis {
  entity: string;
  entityType: 'ip' | 'domain';
  currentScore: number;
  averageScore7d: number;
  averageScore30d: number;
  trend: 'improving' | 'stable' | 'declining';
  changeRate: number;
  dataPoints: number;
}

// ---------------------------------------------------------------------------
// Engine Configuration
// ---------------------------------------------------------------------------

export interface ReputationEngineConfig {
  /** Override factor weights */
  weightOverrides?: Partial<Record<keyof ReputationFactors, number>>;
  /** Custom alert thresholds */
  alertThresholds?: Partial<typeof DEFAULT_ALERT_THRESHOLDS>;
}

// ---------------------------------------------------------------------------
// Reputation Engine
// ---------------------------------------------------------------------------

/**
 * Multi-factor reputation scoring engine.
 *
 * Calculates weighted reputation scores for IP addresses and domains,
 * tracks score history for trend analysis, and emits alerts when
 * thresholds are breached.
 */
export class ReputationEngine {
  private readonly weights: Record<keyof ReputationFactors, number>;
  private readonly alertThresholds: typeof DEFAULT_ALERT_THRESHOLDS;

  /** Score history keyed by "ip::address" or "domain::name" */
  private readonly history: Map<string, ScoreHistoryEntry[]> = new Map();

  /** Pending alerts */
  private readonly alerts: ReputationAlert[] = [];

  /** Monotonic alert ID counter */
  private alertCounter = 0;

  constructor(config: ReputationEngineConfig = {}) {
    // Merge weight overrides
    this.weights = { ...FACTOR_WEIGHTS };
    if (config.weightOverrides) {
      for (const [key, value] of Object.entries(config.weightOverrides)) {
        const factorKey = key as keyof ReputationFactors;
        if (typeof value === 'number' && factorKey in this.weights) {
          this.weights[factorKey] = value;
        }
      }
    }

    this.alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...config.alertThresholds };
  }

  /**
   * Calculate a reputation score for an IP address.
   * Returns a score between 0-100 with contributing signals.
   */
  calculateIpScore(ipAddress: string, factors: ReputationFactors): Result<IpReputationScore> {
    const scoreResult = this.computeCompositeScore(factors);
    if (!scoreResult.ok) {
      return scoreResult;
    }

    const { score, signals } = scoreResult.value;
    const category = this.categorize(score);

    const result: IpReputationScore = {
      ipAddress,
      overallScore: score,
      category,
      signals,
      calculatedAt: new Date(),
      factors,
    };

    // Record history and check alerts
    const key = `ip::${ipAddress}`;
    this.recordHistory(key, score, category, factors);
    this.checkAlerts(key, 'ip', ipAddress, score);

    return ok(result);
  }

  /**
   * Calculate a reputation score for a domain.
   * Returns a score between 0-100 with contributing signals.
   */
  calculateDomainScore(domain: string, factors: ReputationFactors): Result<DomainReputationScore> {
    const scoreResult = this.computeCompositeScore(factors);
    if (!scoreResult.ok) {
      return scoreResult;
    }

    const { score, signals } = scoreResult.value;
    const category = this.categorize(score);

    const result: DomainReputationScore = {
      domain,
      overallScore: score,
      category,
      signals,
      calculatedAt: new Date(),
      factors,
    };

    // Record history and check alerts
    const key = `domain::${domain}`;
    this.recordHistory(key, score, category, factors);
    this.checkAlerts(key, 'domain', domain, score);

    return ok(result);
  }

  /**
   * Analyze score trends over time for an IP or domain.
   * Returns averages and a directional trend indicator.
   */
  analyzeTrend(entity: string, entityType: 'ip' | 'domain'): Result<TrendAnalysis> {
    const key = `${entityType}::${entity}`;
    const entries = this.history.get(key);

    if (!entries || entries.length === 0) {
      return err(new Error(`No history found for ${entityType} "${entity}"`));
    }

    const currentScore = entries[entries.length - 1]?.score ?? 0;

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const recent7d = entries.filter((e) => e.calculatedAt.getTime() >= sevenDaysAgo);
    const recent30d = entries.filter((e) => e.calculatedAt.getTime() >= thirtyDaysAgo);

    const averageScore7d = recent7d.length > 0
      ? recent7d.reduce((sum, e) => sum + e.score, 0) / recent7d.length
      : currentScore;

    const averageScore30d = recent30d.length > 0
      ? recent30d.reduce((sum, e) => sum + e.score, 0) / recent30d.length
      : currentScore;

    // Determine trend direction by comparing recent average to older average
    const changeRate = averageScore7d - averageScore30d;
    let trend: TrendAnalysis['trend'];
    if (changeRate > 3) {
      trend = 'improving';
    } else if (changeRate < -3) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return ok({
      entity,
      entityType,
      currentScore,
      averageScore7d: Math.round(averageScore7d * 100) / 100,
      averageScore30d: Math.round(averageScore30d * 100) / 100,
      trend,
      changeRate: Math.round(changeRate * 100) / 100,
      dataPoints: entries.length,
    });
  }

  /**
   * Get the full score history for an entity.
   */
  getHistory(entity: string, entityType: 'ip' | 'domain'): ScoreHistoryEntry[] {
    const key = `${entityType}::${entity}`;
    return [...(this.history.get(key) ?? [])];
  }

  /**
   * Drain all pending alerts. Returns and clears the alert queue.
   */
  drainAlerts(): ReputationAlert[] {
    const pending = [...this.alerts];
    this.alerts.length = 0;
    return pending;
  }

  /**
   * Peek at pending alerts without draining.
   */
  peekAlerts(): readonly ReputationAlert[] {
    return this.alerts;
  }

  // ─── Internal ───

  /**
   * Compute the weighted composite score from reputation factors.
   * Each factor is normalized to 0-100, then combined by weight.
   */
  private computeCompositeScore(
    factors: ReputationFactors,
  ): Result<{ score: number; signals: ReputationSignal[] }> {
    const signals: ReputationSignal[] = [];
    const now = new Date();

    // Delivery rate: higher is better (0-1 maps to 0-100)
    const deliveryScore = factors.deliveryRate * 100;
    signals.push({
      source: 'delivery_rate',
      score: deliveryScore,
      weight: this.weights.deliveryRate,
      description: `Delivery rate: ${(factors.deliveryRate * 100).toFixed(1)}%`,
      lastUpdated: now,
    });

    // Bounce rate: lower is better (inverted, 0% = 100, 10%+ = 0)
    const bounceScore = Math.max(0, 100 - factors.bounceRate * 1000);
    signals.push({
      source: 'bounce_rate',
      score: bounceScore,
      weight: this.weights.bounceRate,
      description: `Bounce rate: ${(factors.bounceRate * 100).toFixed(2)}% (score: ${bounceScore.toFixed(0)})`,
      lastUpdated: now,
    });

    // Complaint rate: lower is better (inverted, 0% = 100, 0.1%+ = 0)
    const complaintScore = Math.max(0, 100 - factors.complaintRate * 100_000);
    signals.push({
      source: 'complaint_rate',
      score: complaintScore,
      weight: this.weights.complaintRate,
      description: `Complaint rate: ${(factors.complaintRate * 100).toFixed(3)}% (score: ${complaintScore.toFixed(0)})`,
      lastUpdated: now,
    });

    // Spam trap hits: 0 = perfect, each hit reduces score significantly
    const spamTrapScore = Math.max(0, 100 - factors.spamTrapHits * 25);
    signals.push({
      source: 'spam_traps',
      score: spamTrapScore,
      weight: this.weights.spamTrapHits,
      description: `Spam trap hits: ${factors.spamTrapHits} (score: ${spamTrapScore.toFixed(0)})`,
      lastUpdated: now,
    });

    // Blocklist presence: each listing is a severe penalty
    const blocklistScore = Math.max(0, 100 - factors.blocklistPresence * 33);
    signals.push({
      source: 'blocklist_presence',
      score: blocklistScore,
      weight: this.weights.blocklistPresence,
      description: `Blocklists: ${factors.blocklistPresence} listing(s) (score: ${blocklistScore.toFixed(0)})`,
      lastUpdated: now,
    });

    // Authentication: SPF/DKIM/DMARC pass rate (0-1 maps to 0-100)
    const authScore = factors.authenticationScore * 100;
    signals.push({
      source: 'authentication',
      score: authScore,
      weight: this.weights.authenticationScore,
      description: `Authentication pass rate: ${(factors.authenticationScore * 100).toFixed(1)}%`,
      lastUpdated: now,
    });

    // Engagement: open/click rate proxy (0-1 maps to 0-100)
    const engagementScore = factors.engagementScore * 100;
    signals.push({
      source: 'engagement',
      score: engagementScore,
      weight: this.weights.engagementScore,
      description: `Engagement score: ${(factors.engagementScore * 100).toFixed(1)}%`,
      lastUpdated: now,
    });

    // Volume consistency: how stable the sending pattern is (0-1 maps to 0-100)
    const volumeScore = factors.volumeConsistency * 100;
    signals.push({
      source: 'volume_consistency',
      score: volumeScore,
      weight: this.weights.volumeConsistency,
      description: `Volume consistency: ${(factors.volumeConsistency * 100).toFixed(1)}%`,
      lastUpdated: now,
    });

    // Age: logarithmic bonus that plateaus at maturity
    const ageScore = Math.min(100, (Math.log2(Math.max(1, factors.ageInDays)) / Math.log2(AGE_MATURITY_DAYS)) * 100);
    signals.push({
      source: 'age',
      score: ageScore,
      weight: this.weights.ageInDays,
      description: `Age: ${factors.ageInDays} days (score: ${ageScore.toFixed(0)})`,
      lastUpdated: now,
    });

    // Weighted composite
    let totalWeight = 0;
    let weightedSum = 0;

    for (const signal of signals) {
      weightedSum += signal.score * signal.weight;
      totalWeight += signal.weight;
    }

    const compositeScore = totalWeight > 0
      ? Math.round(Math.max(0, Math.min(100, weightedSum / totalWeight)))
      : 0;

    return ok({ score: compositeScore, signals });
  }

  /** Classify a score into a reputation category */
  private categorize(score: number): ReputationCategory {
    for (const [category, range] of Object.entries(CATEGORY_THRESHOLDS)) {
      if (score >= range.min && score <= range.max) {
        return category as ReputationCategory;
      }
    }
    return 'critical';
  }

  /** Record a score in the history, pruning old entries */
  private recordHistory(
    key: string,
    score: number,
    category: ReputationCategory,
    factors: ReputationFactors,
  ): void {
    let entries = this.history.get(key);
    if (!entries) {
      entries = [];
      this.history.set(key, entries);
    }

    entries.push({
      score,
      category,
      factors: { ...factors },
      calculatedAt: new Date(),
    });

    // Prune old entries
    if (entries.length > MAX_HISTORY_ENTRIES) {
      entries.splice(0, entries.length - MAX_HISTORY_ENTRIES);
    }
  }

  /** Check alert conditions and emit alerts as needed */
  private checkAlerts(
    key: string,
    entityType: 'ip' | 'domain',
    entity: string,
    currentScore: number,
  ): void {
    const entries = this.history.get(key);
    if (!entries || entries.length < 2) return;

    const previousEntry = entries[entries.length - 2];
    if (!previousEntry) return;

    const previousScore = previousEntry.score;

    // Score dropped below threshold
    if (currentScore < this.alertThresholds.scoreDropThreshold && previousScore >= this.alertThresholds.scoreDropThreshold) {
      this.emitAlert(entity, entityType, 'score_drop',
        `Reputation score dropped below ${this.alertThresholds.scoreDropThreshold} (${previousScore} -> ${currentScore})`,
        previousScore, currentScore);
    }

    // Sudden drop
    const drop = previousScore - currentScore;
    if (drop >= this.alertThresholds.suddenDropThreshold) {
      this.emitAlert(entity, entityType, 'sudden_drop',
        `Reputation score dropped ${drop} points in one calculation (${previousScore} -> ${currentScore})`,
        previousScore, currentScore);
    }

    // Entered critical category
    if (this.alertThresholds.criticalCategoryAlert) {
      const currentCategory = this.categorize(currentScore);
      const previousCategory = this.categorize(previousScore);
      if (currentCategory === 'critical' && previousCategory !== 'critical') {
        this.emitAlert(entity, entityType, 'critical_category',
          `Reputation entered CRITICAL category (score: ${currentScore})`,
          previousScore, currentScore);
      }
    }
  }

  /** Create and queue an alert */
  private emitAlert(
    entity: string,
    entityType: 'ip' | 'domain',
    alertType: ReputationAlert['alertType'],
    message: string,
    previousScore: number,
    currentScore: number,
  ): void {
    this.alertCounter++;
    this.alerts.push({
      id: `alert-${this.alertCounter}-${Date.now()}`,
      entity,
      entityType,
      alertType,
      message,
      previousScore,
      currentScore,
      timestamp: new Date(),
    });
  }
}
