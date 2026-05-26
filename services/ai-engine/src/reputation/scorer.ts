// =============================================================================
// @alecrae/ai-engine — Sender Reputation Scoring Engine
// =============================================================================
// Computes a 0-100 reputation score from multiple weighted factors: sending
// volume, bounce rate, complaint rate, authentication status, content quality,
// engagement, list hygiene, and infrastructure age.

import type {
  ReputationScore,
  ReputationGrade,
  ReputationFactors,
  FactorScore,
  SenderProfile,
  ReputationSnapshot,
  Result,
} from '../types.js';

// ---------------------------------------------------------------------------
// Factor Weights (must sum to 1.0)
// ---------------------------------------------------------------------------

const FACTOR_WEIGHTS = {
  sendingVolume: 0.10,
  bounceRate: 0.20,
  complaintRate: 0.20,
  authentication: 0.15,
  contentQuality: 0.10,
  engagementRate: 0.10,
  listHygiene: 0.10,
  infrastructureAge: 0.05,
} as const satisfies Record<string, number>;

// ---------------------------------------------------------------------------
// Scoring Curves
// ---------------------------------------------------------------------------

/**
 * Maps a raw metric value to a 0-100 score using a piecewise-linear
 * transfer function. Each curve is defined by breakpoints: [inputValue, outputScore].
 * Values between breakpoints are linearly interpolated.
 */
function applyTransferFunction(value: number, breakpoints: readonly [number, number][]): number {
  if (breakpoints.length === 0) return 50;

  const first = breakpoints[0];
  if (!first) return 50;
  if (value <= first[0]) return first[1];

  const last = breakpoints[breakpoints.length - 1];
  if (!last) return 50;
  if (value >= last[0]) return last[1];

  for (let i = 1; i < breakpoints.length; i++) {
    const prev = breakpoints[i - 1];
    const curr = breakpoints[i];
    if (!prev || !curr) continue;
    if (value <= curr[0]) {
      const t = (value - prev[0]) / (curr[0] - prev[0]);
      return prev[1] + t * (curr[1] - prev[1]);
    }
  }

  return last[1];
}

// Bounce rate: lower is better. 0% = 100, 2% = 80, 5% = 50, 10% = 20, 20%+ = 0
const BOUNCE_RATE_CURVE: readonly [number, number][] = [
  [0.00, 100], [0.01, 90], [0.02, 80], [0.05, 50], [0.10, 20], [0.20, 0],
];

// Complaint rate: lower is better. 0% = 100, 0.1% = 80, 0.3% = 50, 0.5% = 20, 1%+ = 0
const COMPLAINT_RATE_CURVE: readonly [number, number][] = [
  [0.000, 100], [0.001, 80], [0.003, 50], [0.005, 20], [0.010, 0],
];

// Authentication pass rate: higher is better. 100% = 100, 90% = 80, 70% = 50, 50% = 20, <50% = 0
const AUTH_RATE_CURVE: readonly [number, number][] = [
  [0.0, 0], [0.50, 20], [0.70, 50], [0.90, 80], [1.0, 100],
];

// Engagement rate (opens): higher is better. 0% = 0, 10% = 40, 20% = 60, 30% = 80, 50%+ = 100
const ENGAGEMENT_CURVE: readonly [number, number][] = [
  [0.0, 0], [0.05, 20], [0.10, 40], [0.20, 60], [0.30, 80], [0.50, 100],
];

// Infrastructure age in days: older is better. 0d = 10, 30d = 40, 90d = 60, 180d = 80, 365d+ = 100
const AGE_CURVE: readonly [number, number][] = [
  [0, 10], [30, 40], [90, 60], [180, 80], [365, 100],
];

// Volume consistency: ratio of current to average. 1.0 = 100, 2x = 70, 5x = 30, 10x+ = 0
const VOLUME_SPIKE_CURVE: readonly [number, number][] = [
  [0.5, 70], [1.0, 100], [2.0, 70], [5.0, 30], [10.0, 0],
];

// ---------------------------------------------------------------------------
// Reputation Scorer
// ---------------------------------------------------------------------------

export interface ReputationScorerConfig {
  /** Override default weights */
  weights?: Partial<Record<keyof typeof FACTOR_WEIGHTS, number>>;
  /** Historical snapshots for trend analysis (newest first) */
  history?: readonly ReputationSnapshot[];
}

export class ReputationScorer {
  private readonly weights: Record<string, number>;
  private readonly history: ReputationSnapshot[];

  constructor(config: ReputationScorerConfig = {}) {
    this.weights = { ...FACTOR_WEIGHTS, ...config.weights };
    this.history = [...(config.history ?? [])];
  }

  /**
   * Compute a comprehensive reputation score for a sender profile.
   */
  score(
    profile: SenderProfile,
    contentQualityScore?: number,
    listHygieneScore?: number,
  ): Result<ReputationScore> {
    try {
      const now = Date.now();
      const ageDays = (now - profile.firstSeen) / (1000 * 60 * 60 * 24);

      // --- Factor computations ---

      // Sending volume: consistency vs. spikes
      // We use a simple heuristic: if total sent is 0, volume is unknown
      const avgDailyVolume = ageDays > 0 ? profile.totalSent / ageDays : 0;
      // For now, assume current daily volume is near average (real system would have time-series data)
      const volumeRatio = avgDailyVolume > 0 ? 1.0 : 0.5;
      const sendingVolume = this.buildFactor(
        applyTransferFunction(volumeRatio, VOLUME_SPIKE_CURVE),
        this.weights['sendingVolume'] ?? FACTOR_WEIGHTS.sendingVolume,
        `Average daily volume: ${avgDailyVolume.toFixed(1)}`,
        volumeRatio,
      );

      // Bounce rate
      const bounceRate = profile.totalSent > 0 ? profile.totalBounced / profile.totalSent : 0;
      const bounceRateFactor = this.buildFactor(
        applyTransferFunction(bounceRate, BOUNCE_RATE_CURVE),
        this.weights['bounceRate'] ?? FACTOR_WEIGHTS.bounceRate,
        `Bounce rate: ${(bounceRate * 100).toFixed(2)}%`,
        bounceRate,
      );

      // Complaint rate
      const complaintRate = profile.totalSent > 0 ? profile.totalComplaints / profile.totalSent : 0;
      const complaintRateFactor = this.buildFactor(
        applyTransferFunction(complaintRate, COMPLAINT_RATE_CURVE),
        this.weights['complaintRate'] ?? FACTOR_WEIGHTS.complaintRate,
        `Complaint rate: ${(complaintRate * 100).toFixed(3)}%`,
        complaintRate,
      );

      // Authentication
      const authRate = (
        profile.authenticationRecord.spfPassRate +
        profile.authenticationRecord.dkimPassRate +
        profile.authenticationRecord.dmarcPassRate +
        profile.authenticationRecord.tlsUsageRate
      ) / 4;
      const authenticationFactor = this.buildFactor(
        applyTransferFunction(authRate, AUTH_RATE_CURVE),
        this.weights['authentication'] ?? FACTOR_WEIGHTS.authentication,
        `Auth pass rate: ${(authRate * 100).toFixed(1)}%`,
        authRate,
      );

      // Content quality (externally provided or default)
      const contentQuality = this.buildFactor(
        contentQualityScore ?? 70,
        this.weights['contentQuality'] ?? FACTOR_WEIGHTS.contentQuality,
        contentQualityScore !== undefined
          ? `Content quality score: ${contentQualityScore}`
          : 'Content quality: default (not yet analyzed)',
        (contentQualityScore ?? 70) / 100,
      );

      // Engagement rate
      const openRate = profile.totalSent > 0 ? profile.totalOpens / profile.totalSent : 0;
      const engagementRateFactor = this.buildFactor(
        applyTransferFunction(openRate, ENGAGEMENT_CURVE),
        this.weights['engagementRate'] ?? FACTOR_WEIGHTS.engagementRate,
        `Open rate: ${(openRate * 100).toFixed(1)}%`,
        openRate,
      );

      // List hygiene (externally provided or default)
      const listHygiene = this.buildFactor(
        listHygieneScore ?? 60,
        this.weights['listHygiene'] ?? FACTOR_WEIGHTS.listHygiene,
        listHygieneScore !== undefined
          ? `List hygiene score: ${listHygieneScore}`
          : 'List hygiene: default (not yet analyzed)',
        (listHygieneScore ?? 60) / 100,
      );

      // Infrastructure age
      const infrastructureAge = this.buildFactor(
        applyTransferFunction(ageDays, AGE_CURVE),
        this.weights['infrastructureAge'] ?? FACTOR_WEIGHTS.infrastructureAge,
        `Domain/IP age: ${Math.floor(ageDays)} days`,
        ageDays,
      );

      const factors: ReputationFactors = {
        sendingVolume,
        bounceRate: bounceRateFactor,
        complaintRate: complaintRateFactor,
        authentication: authenticationFactor,
        contentQuality,
        engagementRate: engagementRateFactor,
        listHygiene,
        infrastructureAge,
      };

      // Weighted average
      const overallScore = Math.round(
        sendingVolume.score * sendingVolume.weight +
        bounceRateFactor.score * bounceRateFactor.weight +
        complaintRateFactor.score * complaintRateFactor.weight +
        authenticationFactor.score * authenticationFactor.weight +
        contentQuality.score * contentQuality.weight +
        engagementRateFactor.score * engagementRateFactor.weight +
        listHygiene.score * listHygiene.weight +
        infrastructureAge.score * infrastructureAge.weight,
      );

      const clampedScore = Math.max(0, Math.min(100, overallScore));
      const grade = this.scoreToGrade(clampedScore);
      const trend = this.computeTrend(clampedScore);

      // Record snapshot
      const snapshot: ReputationSnapshot = {
        timestamp: now,
        score: clampedScore,
        grade,
      };
      this.history.unshift(snapshot);
      // Keep last 90 days of daily snapshots
      if (this.history.length > 90) {
        this.history.length = 90;
      }

      return {
        ok: true,
        value: {
          overallScore: clampedScore,
          grade,
          factors,
          trend,
          lastUpdated: now,
          history: this.history,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'REPUTATION_SCORING_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  private buildFactor(score: number, weight: number, details: string, rawValue: number): FactorScore {
    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      weight,
      details,
      rawValue,
    };
  }

  private scoreToGrade(score: number): ReputationGrade {
    if (score >= 95) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 30) return 'D';
    return 'F';
  }

  private computeTrend(currentScore: number): 'improving' | 'stable' | 'declining' {
    if (this.history.length < 3) return 'stable';

    // Compare against average of last 7 snapshots
    const recentSlice = this.history.slice(0, 7);
    const avgRecent = recentSlice.reduce((sum, s) => sum + s.score, 0) / recentSlice.length;
    const diff = currentScore - avgRecent;

    if (diff > 3) return 'improving';
    if (diff < -3) return 'declining';
    return 'stable';
  }
}
