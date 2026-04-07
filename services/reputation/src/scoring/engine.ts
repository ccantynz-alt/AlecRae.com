import type {
  IpReputationScore,
  DomainReputationScore,
  ReputationCategory,
  ReputationSignal,
  ReputationFactors,
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

// ─── Signal Weight Configuration ─────────────────────────────────────────────

interface SignalWeight {
  name: string;
  weight: number;
  description: string;
}

const DEFAULT_SIGNAL_WEIGHTS: Record<keyof ReputationFactors, SignalWeight> = {
  deliveryRate: {
    name: 'Delivery Rate',
    weight: 0.20,
    description: 'Percentage of emails successfully delivered',
  },
  bounceRate: {
    name: 'Bounce Rate',
    weight: 0.15,
    description: 'Percentage of emails that bounced (inverted)',
  },
  complaintRate: {
    name: 'Complaint Rate',
    weight: 0.18,
    description: 'Percentage of recipients who complained (inverted)',
  },
  spamTrapHits: {
    name: 'Spam Trap Hits',
    weight: 0.15,
    description: 'Number of spam trap addresses contacted (inverted)',
  },
  blocklistPresence: {
    name: 'Blocklist Presence',
    weight: 0.10,
    description: 'Count of blocklists where IP/domain appears (inverted)',
  },
  authenticationScore: {
    name: 'Authentication',
    weight: 0.08,
    description: 'SPF/DKIM/DMARC pass rate',
  },
  engagementScore: {
    name: 'Engagement',
    weight: 0.06,
    description: 'Recipient engagement (opens, clicks, replies)',
  },
  volumeConsistency: {
    name: 'Volume Consistency',
    weight: 0.05,
    description: 'Consistency of sending patterns',
  },
  ageInDays: {
    name: 'Sender Age',
    weight: 0.03,
    description: 'Age of the IP/domain as a sender',
  },
};

// ─── Trend Detection ─────────────────────────────────────────────────────────

export type ReputationTrend = 'improving' | 'declining' | 'stable';

interface ScoreHistoryEntry {
  score: number;
  timestamp: Date;
}

// ─── Reputation Scoring Engine ───────────────────────────────────────────────

export class ReputationScoringEngine {
  private readonly weights: Record<keyof ReputationFactors, SignalWeight>;
  private readonly ipHistory: Map<string, ScoreHistoryEntry[]> = new Map();
  private readonly domainHistory: Map<string, ScoreHistoryEntry[]> = new Map();
  private readonly maxHistorySize: number;

  constructor(
    customWeights?: Partial<Record<keyof ReputationFactors, Partial<SignalWeight>>>,
    maxHistorySize = 90,
  ) {
    this.maxHistorySize = maxHistorySize;
    this.weights = { ...DEFAULT_SIGNAL_WEIGHTS };

    if (customWeights) {
      for (const [key, overrides] of Object.entries(customWeights)) {
        const factorKey = key as keyof ReputationFactors;
        const existing = this.weights[factorKey];
        if (existing && overrides) {
          this.weights[factorKey] = { ...existing, ...overrides };
        }
      }
    }

    // Normalize weights to sum to 1.0
    this.normalizeWeights();
  }

  /** Calculate the reputation score for an IP address */
  scoreIp(ipAddress: string, factors: ReputationFactors): Result<IpReputationScore> {
    const validationError = this.validateFactors(factors);
    if (validationError) {
      return err(validationError);
    }

    const signals = this.computeSignals(factors);
    const overallScore = this.computeOverallScore(signals);
    const category = this.classifyScore(overallScore);

    const result: IpReputationScore = {
      ipAddress,
      overallScore,
      category,
      signals,
      calculatedAt: new Date(),
      factors,
    };

    // Track history
    this.appendHistory(this.ipHistory, ipAddress, overallScore);

    return ok(result);
  }

  /** Calculate the reputation score for a domain */
  scoreDomain(domain: string, factors: ReputationFactors): Result<DomainReputationScore> {
    const validationError = this.validateFactors(factors);
    if (validationError) {
      return err(validationError);
    }

    const signals = this.computeSignals(factors);
    const overallScore = this.computeOverallScore(signals);
    const category = this.classifyScore(overallScore);

    const result: DomainReputationScore = {
      domain,
      overallScore,
      category,
      signals,
      calculatedAt: new Date(),
      factors,
    };

    this.appendHistory(this.domainHistory, domain, overallScore);

    return ok(result);
  }

  /** Detect the trend for an IP's score over time */
  getIpTrend(ipAddress: string): Result<{ trend: ReputationTrend; delta: number }> {
    return this.detectTrend(this.ipHistory, ipAddress);
  }

  /** Detect the trend for a domain's score over time */
  getDomainTrend(domain: string): Result<{ trend: ReputationTrend; delta: number }> {
    return this.detectTrend(this.domainHistory, domain);
  }

  /** Get score history for an IP */
  getIpHistory(ipAddress: string): ScoreHistoryEntry[] {
    return this.ipHistory.get(ipAddress) ?? [];
  }

  /** Get score history for a domain */
  getDomainHistory(domain: string): ScoreHistoryEntry[] {
    return this.domainHistory.get(domain) ?? [];
  }

  /** Classify a numeric score into a category */
  classifyScore(score: number): ReputationCategory {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'neutral';
    if (score >= 30) return 'poor';
    return 'critical';
  }

  /** Compute a composite score from multiple IP scores (e.g., for a pool) */
  computePoolScore(ipScores: IpReputationScore[]): Result<{
    averageScore: number;
    category: ReputationCategory;
    worstIp: string;
    bestIp: string;
  }> {
    if (ipScores.length === 0) {
      return err('Cannot compute pool score from empty list');
    }

    let total = 0;
    let worst: IpReputationScore = ipScores[0]!;
    let best: IpReputationScore = ipScores[0]!;

    for (const score of ipScores) {
      total += score.overallScore;
      if (score.overallScore < worst.overallScore) worst = score;
      if (score.overallScore > best.overallScore) best = score;
    }

    const averageScore = Math.round(total / ipScores.length);

    return ok({
      averageScore,
      category: this.classifyScore(averageScore),
      worstIp: worst.ipAddress,
      bestIp: best.ipAddress,
    });
  }

  /** Identify the factors dragging a score down the most */
  identifyWeakFactors(factors: ReputationFactors, limit = 3): Result<Array<{
    factor: string;
    currentScore: number;
    weight: number;
    impact: number;
    recommendation: string;
  }>> {
    const signals = this.computeSignals(factors);
    const ranked = signals
      .map(signal => ({
        factor: signal.source,
        currentScore: signal.score,
        weight: signal.weight,
        impact: (100 - signal.score) * signal.weight,
        recommendation: this.getRecommendation(signal.source, signal.score),
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, limit);

    return ok(ranked);
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private normalizeWeights(): void {
    let sum = 0;
    for (const config of Object.values(this.weights)) {
      sum += config.weight;
    }

    if (sum === 0) return;

    for (const config of Object.values(this.weights)) {
      config.weight = config.weight / sum;
    }
  }

  private validateFactors(factors: ReputationFactors): string | null {
    if (factors.deliveryRate < 0 || factors.deliveryRate > 1) {
      return 'deliveryRate must be between 0 and 1';
    }
    if (factors.bounceRate < 0 || factors.bounceRate > 1) {
      return 'bounceRate must be between 0 and 1';
    }
    if (factors.complaintRate < 0 || factors.complaintRate > 1) {
      return 'complaintRate must be between 0 and 1';
    }
    if (factors.authenticationScore < 0 || factors.authenticationScore > 1) {
      return 'authenticationScore must be between 0 and 1';
    }
    if (factors.engagementScore < 0 || factors.engagementScore > 1) {
      return 'engagementScore must be between 0 and 1';
    }
    if (factors.volumeConsistency < 0 || factors.volumeConsistency > 1) {
      return 'volumeConsistency must be between 0 and 1';
    }
    if (factors.spamTrapHits < 0) {
      return 'spamTrapHits must be non-negative';
    }
    if (factors.blocklistPresence < 0) {
      return 'blocklistPresence must be non-negative';
    }
    if (factors.ageInDays < 0) {
      return 'ageInDays must be non-negative';
    }
    return null;
  }

  private computeSignals(factors: ReputationFactors): ReputationSignal[] {
    const now = new Date();
    const signals: ReputationSignal[] = [];

    // Delivery rate: direct percentage -> score
    signals.push({
      source: 'deliveryRate',
      score: this.scoreDeliveryRate(factors.deliveryRate),
      weight: this.weights.deliveryRate.weight,
      description: this.weights.deliveryRate.description,
      lastUpdated: now,
    });

    // Bounce rate: inverted — lower is better
    signals.push({
      source: 'bounceRate',
      score: this.scoreBounceRate(factors.bounceRate),
      weight: this.weights.bounceRate.weight,
      description: this.weights.bounceRate.description,
      lastUpdated: now,
    });

    // Complaint rate: inverted — lower is better, very sensitive
    signals.push({
      source: 'complaintRate',
      score: this.scoreComplaintRate(factors.complaintRate),
      weight: this.weights.complaintRate.weight,
      description: this.weights.complaintRate.description,
      lastUpdated: now,
    });

    // Spam trap hits: inverted — zero is perfect
    signals.push({
      source: 'spamTrapHits',
      score: this.scoreSpamTraps(factors.spamTrapHits),
      weight: this.weights.spamTrapHits.weight,
      description: this.weights.spamTrapHits.description,
      lastUpdated: now,
    });

    // Blocklist presence: inverted — zero is perfect
    signals.push({
      source: 'blocklistPresence',
      score: this.scoreBlocklistPresence(factors.blocklistPresence),
      weight: this.weights.blocklistPresence.weight,
      description: this.weights.blocklistPresence.description,
      lastUpdated: now,
    });

    // Authentication: direct percentage
    signals.push({
      source: 'authenticationScore',
      score: Math.round(factors.authenticationScore * 100),
      weight: this.weights.authenticationScore.weight,
      description: this.weights.authenticationScore.description,
      lastUpdated: now,
    });

    // Engagement: direct percentage
    signals.push({
      source: 'engagementScore',
      score: Math.round(factors.engagementScore * 100),
      weight: this.weights.engagementScore.weight,
      description: this.weights.engagementScore.description,
      lastUpdated: now,
    });

    // Volume consistency: direct percentage
    signals.push({
      source: 'volumeConsistency',
      score: Math.round(factors.volumeConsistency * 100),
      weight: this.weights.volumeConsistency.weight,
      description: this.weights.volumeConsistency.description,
      lastUpdated: now,
    });

    // Age: logarithmic curve — older is better, plateaus around 365 days
    signals.push({
      source: 'ageInDays',
      score: this.scoreAge(factors.ageInDays),
      weight: this.weights.ageInDays.weight,
      description: this.weights.ageInDays.description,
      lastUpdated: now,
    });

    return signals;
  }

  private scoreDeliveryRate(rate: number): number {
    // 99%+ = 100, 95% = 80, 90% = 50, below 85% drops fast
    if (rate >= 0.99) return 100;
    if (rate >= 0.97) return 90 + (rate - 0.97) / 0.02 * 10;
    if (rate >= 0.95) return 80 + (rate - 0.95) / 0.02 * 10;
    if (rate >= 0.90) return 50 + (rate - 0.90) / 0.05 * 30;
    if (rate >= 0.80) return 20 + (rate - 0.80) / 0.10 * 30;
    return Math.max(0, Math.round(rate * 25));
  }

  private scoreBounceRate(rate: number): number {
    // 0% = 100, 1% = 90, 3% = 60, 5% = 30, 10%+ = 0
    if (rate <= 0.005) return 100;
    if (rate <= 0.01) return 90 + (0.01 - rate) / 0.005 * 10;
    if (rate <= 0.03) return 60 + (0.03 - rate) / 0.02 * 30;
    if (rate <= 0.05) return 30 + (0.05 - rate) / 0.02 * 30;
    if (rate <= 0.10) return Math.round((0.10 - rate) / 0.05 * 30);
    return 0;
  }

  private scoreComplaintRate(rate: number): number {
    // Complaints are extremely sensitive
    // 0% = 100, 0.01% = 95, 0.05% = 70, 0.1% = 40, 0.3%+ = 0
    if (rate <= 0.0001) return 100;
    if (rate <= 0.0005) return 70 + (0.0005 - rate) / 0.0004 * 30;
    if (rate <= 0.001) return 40 + (0.001 - rate) / 0.0005 * 30;
    if (rate <= 0.003) return Math.round((0.003 - rate) / 0.002 * 40);
    return 0;
  }

  private scoreSpamTraps(hits: number): number {
    // 0 = 100, 1 = 60, 2 = 30, 3 = 10, 4+ = 0
    if (hits === 0) return 100;
    if (hits === 1) return 60;
    if (hits === 2) return 30;
    if (hits === 3) return 10;
    return 0;
  }

  private scoreBlocklistPresence(count: number): number {
    // 0 = 100, 1 = 40 (one listing is already bad), 2 = 15, 3+ = 0
    if (count === 0) return 100;
    if (count === 1) return 40;
    if (count === 2) return 15;
    return 0;
  }

  private scoreAge(days: number): number {
    // Logarithmic: 0 days = 10, 30 days = 40, 90 days = 60, 180 = 80, 365+ = 100
    if (days <= 0) return 10;
    const score = 10 + 90 * (Math.log(days + 1) / Math.log(366));
    return Math.min(100, Math.round(score));
  }

  private computeOverallScore(signals: ReputationSignal[]): number {
    let weightedSum = 0;

    for (const signal of signals) {
      weightedSum += signal.score * signal.weight;
    }

    return Math.round(clamp(weightedSum, 0, 100));
  }

  private appendHistory(
    historyMap: Map<string, ScoreHistoryEntry[]>,
    key: string,
    score: number,
  ): void {
    const history = historyMap.get(key) ?? [];
    history.push({ score, timestamp: new Date() });

    // Trim to max size
    while (history.length > this.maxHistorySize) {
      history.shift();
    }

    historyMap.set(key, history);
  }

  private detectTrend(
    historyMap: Map<string, ScoreHistoryEntry[]>,
    key: string,
  ): Result<{ trend: ReputationTrend; delta: number }> {
    const history = historyMap.get(key);

    if (!history || history.length < 2) {
      return err(`Insufficient history for trend detection (need at least 2 data points for '${key}')`);
    }

    // Use simple linear regression on recent entries (last 14 or whatever's available)
    const recentEntries = history.slice(-14);
    const n = recentEntries.length;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const entry = recentEntries[i]!;
      sumX += i;
      sumY += entry.score;
      sumXY += i * entry.score;
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return ok({ trend: 'stable', delta: 0 });
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    // Delta is the projected change over the window
    const delta = Math.round(slope * n * 10) / 10;

    let trend: ReputationTrend;
    if (Math.abs(delta) < 2) {
      trend = 'stable';
    } else if (delta > 0) {
      trend = 'improving';
    } else {
      trend = 'declining';
    }

    return ok({ trend, delta });
  }

  private getRecommendation(factor: string, score: number): string {
    if (score >= 80) return 'Performing well. Continue current practices.';

    const recommendations: Record<string, string> = {
      deliveryRate: 'Improve list hygiene by removing invalid addresses. Verify recipient addresses before sending.',
      bounceRate: 'Clean your mailing list. Remove hard-bounced addresses immediately. Implement double opt-in.',
      complaintRate: 'Review content for spam-like patterns. Ensure clear unsubscribe mechanisms. Reduce sending frequency.',
      spamTrapHits: 'Audit your mailing list sources. Remove purchased lists. Implement confirmed opt-in. Check for recycled trap addresses.',
      blocklistPresence: 'Investigate blocklist reasons. Submit delisting requests. Review sending practices that triggered the listing.',
      authenticationScore: 'Verify SPF, DKIM, and DMARC records are correctly configured. Ensure all sending IPs are authorized.',
      engagementScore: 'Improve content relevance. Segment your audience. Optimize send times. Re-engage or remove inactive subscribers.',
      volumeConsistency: 'Maintain consistent sending volumes. Avoid sudden spikes. Use warm-up for new IPs or volume increases.',
      ageInDays: 'Continue building sending history. Maintain consistent, quality sending patterns.',
    };

    return recommendations[factor] ?? 'Review this factor and take corrective action.';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createReputationScoringEngine(
  customWeights?: Partial<Record<keyof ReputationFactors, Partial<SignalWeight>>>,
  maxHistorySize?: number,
): ReputationScoringEngine {
  return new ReputationScoringEngine(customWeights, maxHistorySize);
}
