/**
 * @alecrae/analytics - AI-Generated Insights
 *
 * Automatically identifies trends, anomalies, and opportunities.
 * Uses statistical methods for anomaly detection and trend analysis,
 * then uses Claude to generate human-readable explanations and recommendations.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Insight,
  InsightType,
  InsightSeverity,
  MetricType,
  TrendAnalysis,
  AnomalyDetectionConfig,
  ReportSummary,
  TimeSeriesDataPoint,
  Result,
} from "../types";
import { ok, err } from "../types";

// ─── Statistical Methods ────────────────────────────────────────────────────

/** Compute mean of a numeric series. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Compute standard deviation. */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/** Compute z-score for a value given series statistics. */
function zScore(value: number, seriesMean: number, seriesStddev: number): number {
  if (seriesStddev === 0) return 0;
  return (value - seriesMean) / seriesStddev;
}

/**
 * Simple moving average with a configurable window.
 */
function movingAverage(values: number[], windowSize: number): number[] {
  if (values.length < windowSize) return values.slice();
  const result: number[] = [];
  for (let i = 0; i <= values.length - windowSize; i++) {
    const window = values.slice(i, i + windowSize);
    result.push(mean(window));
  }
  return result;
}

/**
 * Linear regression using ordinary least squares.
 * Returns slope, intercept, and R-squared.
 */
function linearRegression(
  values: number[],
): { slope: number; intercept: number; rSquared: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, rSquared: 0 };

  // x values are 0, 1, 2, ... n-1
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const v = values[i] ?? 0;
    sumX += i;
    sumY += v;
    sumXY += i * v;
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i] ?? 0;
    const predicted = intercept + slope * i;
    ssRes += (v - predicted) ** 2;
    ssTot += (v - yMean) ** 2;
  }

  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

/**
 * Detect change points in a time series using CUSUM (cumulative sum control).
 */
function detectChangePoints(
  values: number[],
  threshold = 2.0,
): number[] {
  if (values.length < 5) return [];

  const avg = mean(values);
  const sd = stddev(values);
  if (sd === 0) return [];

  const changePoints: number[] = [];
  let cusumPos = 0;
  let cusumNeg = 0;
  const target = threshold * sd;

  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    const normalized = (v - avg) / sd;
    cusumPos = Math.max(0, cusumPos + normalized - 0.5);
    cusumNeg = Math.max(0, cusumNeg - normalized - 0.5);

    if (cusumPos > target || cusumNeg > target) {
      changePoints.push(i);
      cusumPos = 0;
      cusumNeg = 0;
    }
  }

  return changePoints;
}

// ─── Anomaly Detection ──────────────────────────────────────────────────────

export interface AnomalyResult {
  index: number;
  value: number;
  expected: number;
  zScore: number;
  isAnomaly: boolean;
  direction: "high" | "low";
}

/**
 * Detect anomalies in a time series using a moving average baseline
 * and z-score thresholding.
 */
export function detectAnomalies(
  values: number[],
  config: AnomalyDetectionConfig,
): AnomalyResult[] {
  if (values.length < config.minDataPoints) return [];

  const anomalies: AnomalyResult[] = [];
  const smoothed = movingAverage(values, config.movingAverageWindow);
  const residuals: number[] = [];

  // Compute residuals (deviations from moving average)
  const offset = config.movingAverageWindow - 1;
  for (let i = 0; i < smoothed.length; i++) {
    const actual = values[i + offset] ?? 0;
    const smooth = smoothed[i] ?? 0;
    residuals.push(actual - smooth);
  }

  const residualMean = mean(residuals);
  const residualStd = stddev(residuals);

  for (let i = 0; i < residuals.length; i++) {
    const residual = residuals[i] ?? 0;
    const z = zScore(residual, residualMean, residualStd);
    const actualIndex = i + offset;

    if (Math.abs(z) > config.zScoreThreshold) {
      anomalies.push({
        index: actualIndex,
        value: values[actualIndex] ?? 0,
        expected: smoothed[i] ?? 0,
        zScore: z,
        isAnomaly: true,
        direction: z > 0 ? "high" : "low",
      });
    }
  }

  return anomalies;
}

// ─── Trend Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze a metric's trend over time, computing direction,
 * strength, and forecast.
 */
export function analyzeTrend(
  metric: MetricType,
  values: number[],
  forecastPeriods = 7,
): TrendAnalysis {
  const regression = linearRegression(values);

  // Determine direction based on slope significance
  const valueMean = mean(values);
  const slopeSignificance = valueMean !== 0
    ? Math.abs(regression.slope) / Math.abs(valueMean)
    : 0;

  let direction: TrendAnalysis["direction"];
  if (slopeSignificance < 0.01 || regression.rSquared < 0.1) {
    // Check volatility
    const sd = stddev(values);
    const cv = valueMean !== 0 ? sd / Math.abs(valueMean) : 0;
    direction = cv > 0.3 ? "volatile" : "stable";
  } else {
    direction = regression.slope > 0 ? "increasing" : "decreasing";
  }

  // Generate forecast
  const forecast: number[] = [];
  for (let i = 0; i < forecastPeriods; i++) {
    const predicted = regression.intercept + regression.slope * (values.length + i);
    forecast.push(Math.max(0, predicted)); // Clamp to non-negative
  }

  // Detect change points
  const changePointIndices = detectChangePoints(values);
  // Map indices to estimated dates (consumer can map these to actual dates)
  const changePoints = changePointIndices.map((idx) => {
    const ts = new Date();
    ts.setDate(ts.getDate() - (values.length - idx));
    return ts;
  });

  return {
    metric,
    direction,
    slope: regression.slope,
    rSquared: regression.rSquared,
    confidence: Math.min(1, regression.rSquared + 0.1 * Math.min(values.length / 30, 1)),
    forecast,
    changePoints,
  };
}

// ─── Insight Generation ─────────────────────────────────────────────────────

interface InsightCandidate {
  type: InsightType;
  severity: InsightSeverity;
  metric: MetricType;
  title: string;
  currentValue: number;
  previousValue: number;
  change: number;
  context: string;
}

/**
 * Generate insights from comparing current and previous period summaries
 * and time series data.
 */
function generateInsightCandidates(
  current: ReportSummary,
  previous: ReportSummary,
  timeSeries: TimeSeriesDataPoint[],
): InsightCandidate[] {
  const candidates: InsightCandidate[] = [];

  // ── Delivery Rate Changes ─────────────────────────────
  const deliveryRateChange = current.deliveryRate - previous.deliveryRate;
  if (Math.abs(deliveryRateChange) > 0.02) {
    candidates.push({
      type: deliveryRateChange < 0 ? "warning" : "achievement",
      severity: Math.abs(deliveryRateChange) > 0.1 ? "high" : "medium",
      metric: "delivery_rate",
      title: deliveryRateChange < 0
        ? `Delivery rate dropped ${(Math.abs(deliveryRateChange) * 100).toFixed(1)}%`
        : `Delivery rate improved ${(deliveryRateChange * 100).toFixed(1)}%`,
      currentValue: current.deliveryRate,
      previousValue: previous.deliveryRate,
      change: deliveryRateChange,
      context: `Delivery rate is now ${(current.deliveryRate * 100).toFixed(1)}%, ${deliveryRateChange < 0 ? "down" : "up"} from ${(previous.deliveryRate * 100).toFixed(1)}%.`,
    });
  }

  // ── Open Rate Changes ─────────────────────────────────
  const openRateChange = current.openRate - previous.openRate;
  if (Math.abs(openRateChange) > 0.03 && current.totalSent >= 100) {
    candidates.push({
      type: openRateChange < 0 ? "trend" : "achievement",
      severity: Math.abs(openRateChange) > 0.15 ? "high" : "low",
      metric: "open_rate",
      title: openRateChange < 0
        ? `Open rates dropped ${(Math.abs(openRateChange) * 100).toFixed(1)}%`
        : `Open rates increased ${(openRateChange * 100).toFixed(1)}%`,
      currentValue: current.openRate,
      previousValue: previous.openRate,
      change: openRateChange,
      context: `Open rate moved from ${(previous.openRate * 100).toFixed(1)}% to ${(current.openRate * 100).toFixed(1)}%.`,
    });
  }

  // ── Bounce Rate Warnings ──────────────────────────────
  if (current.bounceRate > 0.02) {
    const severity: InsightSeverity = current.bounceRate > 0.05 ? "critical" : current.bounceRate > 0.03 ? "high" : "medium";
    candidates.push({
      type: "warning",
      severity,
      metric: "bounce_rate",
      title: `Bounce rate is ${(current.bounceRate * 100).toFixed(1)}% - above recommended threshold`,
      currentValue: current.bounceRate,
      previousValue: previous.bounceRate,
      change: current.bounceRate - previous.bounceRate,
      context: `Bounce rate of ${(current.bounceRate * 100).toFixed(1)}% exceeds the 2% recommended maximum. ${current.totalBounced} emails bounced out of ${current.totalSent} sent.`,
    });
  }

  // ── Complaint Rate ────────────────────────────────────
  if (current.complaintRate > 0.001) {
    candidates.push({
      type: "warning",
      severity: current.complaintRate > 0.005 ? "critical" : "high",
      metric: "complaint_rate",
      title: `Complaint rate of ${(current.complaintRate * 100).toFixed(3)}% exceeds safe threshold`,
      currentValue: current.complaintRate,
      previousValue: previous.complaintRate,
      change: current.complaintRate - previous.complaintRate,
      context: `${current.totalComplaints} complaints received. Major ISPs may throttle or block delivery when complaint rates exceed 0.1%.`,
    });
  }

  // ── Click-to-Open Rate Opportunity ────────────────────
  if (current.clickToOpenRate < 0.10 && current.openRate > 0.15) {
    candidates.push({
      type: "opportunity",
      severity: "low",
      metric: "click_to_open_rate",
      title: "Click-to-open rate is below average - content engagement opportunity",
      currentValue: current.clickToOpenRate,
      previousValue: previous.clickToOpenRate,
      change: current.clickToOpenRate - previous.clickToOpenRate,
      context: `Recipients are opening emails (${(current.openRate * 100).toFixed(1)}% open rate) but not clicking (${(current.clickToOpenRate * 100).toFixed(1)}% CTO rate). Consider improving email content, CTAs, or link placement.`,
    });
  }

  // ── Volume Changes ────────────────────────────────────
  if (previous.totalSent > 0) {
    const volumeChange = (current.totalSent - previous.totalSent) / previous.totalSent;
    if (Math.abs(volumeChange) > 0.3) {
      candidates.push({
        type: volumeChange > 0 ? "trend" : "warning",
        severity: Math.abs(volumeChange) > 0.5 ? "medium" : "low",
        metric: "deliveries",
        title: volumeChange > 0
          ? `Sending volume increased ${(volumeChange * 100).toFixed(0)}%`
          : `Sending volume decreased ${(Math.abs(volumeChange) * 100).toFixed(0)}%`,
        currentValue: current.totalSent,
        previousValue: previous.totalSent,
        change: volumeChange,
        context: `Sent ${current.totalSent.toLocaleString()} emails compared to ${previous.totalSent.toLocaleString()} in the previous period.`,
      });
    }
  }

  // ── Time Series Anomalies ─────────────────────────────
  if (timeSeries.length >= 7) {
    const deliveryValues = timeSeries
      .map((p) => p.metrics.deliveries ?? 0);
    const anomalies = detectAnomalies(deliveryValues, {
      sensitivityLevel: "medium",
      minDataPoints: 7,
      zScoreThreshold: 2.5,
      movingAverageWindow: 3,
      seasonalityPeriod: 7,
    });

    const latest = anomalies[anomalies.length - 1];
    if (latest) {
      candidates.push({
        type: "anomaly",
        severity: Math.abs(latest.zScore) > 3 ? "high" : "medium",
        metric: "deliveries",
        title: `Unusual ${latest.direction === "high" ? "spike" : "drop"} in sending volume detected`,
        currentValue: latest.value,
        previousValue: latest.expected,
        change: (latest.value - latest.expected) / Math.max(latest.expected, 1),
        context: `Detected ${anomalies.length} anomalous data point(s). Most recent: ${latest.value.toLocaleString()} vs expected ${latest.expected.toLocaleString()} (z-score: ${latest.zScore.toFixed(1)}).`,
      });
    }
  }

  return candidates;
}

// ─── AI Insights Engine ─────────────────────────────────────────────────────

export class AiInsightsEngine {
  private readonly client: Anthropic;
  private readonly modelId: string;

  constructor(modelId = "claude-sonnet-4-20250514") {
    this.client = new Anthropic();
    this.modelId = modelId;
  }

  /**
   * Generate AI-powered insights from analytics data.
   * Combines statistical analysis with LLM-generated explanations.
   */
  async generateInsights(
    accountId: string,
    current: ReportSummary,
    previous: ReportSummary,
    timeSeries: TimeSeriesDataPoint[],
    domains: string[],
  ): Promise<Result<Insight[]>> {
    try {
      // Step 1: Statistical analysis to find candidates
      const candidates = generateInsightCandidates(current, previous, timeSeries);

      if (candidates.length === 0) {
        return ok([]);
      }

      // Step 2: Use Claude to generate human-readable explanations
      const enriched = await this.enrichWithAi(candidates, accountId, domains);

      // Step 3: Build final insight objects
      const now = new Date();
      const insights: Insight[] = enriched.map((item, index) => ({
        id: `ins-${Date.now().toString(36)}-${index}`,
        accountId,
        type: item.type,
        severity: item.severity,
        title: item.title,
        description: item.description,
        recommendation: item.recommendation,
        metrics: [
          {
            name: item.metric,
            currentValue: item.currentValue,
            previousValue: item.previousValue,
            change: item.change,
          },
        ],
        affectedDomains: domains,
        detectedAt: now,
        expiresAt: new Date(now.getTime() + 7 * 86_400_000), // 7 days
        dismissed: false,
      }));

      // Sort by severity
      const severityOrder: Record<InsightSeverity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return ok(insights);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze trend for a specific metric and generate a detailed analysis.
   */
  analyzeTrend(
    metric: MetricType,
    timeSeries: TimeSeriesDataPoint[],
  ): Result<TrendAnalysis> {
    try {
      const values = timeSeries.map((p) => p.metrics[metric] ?? 0);
      if (values.length < 3) {
        return err(new Error("Insufficient data points for trend analysis (minimum 3)"));
      }

      const analysis = analyzeTrend(metric, values);
      return ok(analysis);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Detect anomalies in a metric's time series.
   */
  detectAnomalies(
    metric: MetricType,
    timeSeries: TimeSeriesDataPoint[],
    config?: Partial<AnomalyDetectionConfig>,
  ): Result<AnomalyResult[]> {
    try {
      const values = timeSeries.map((p) => p.metrics[metric] ?? 0);
      const fullConfig: AnomalyDetectionConfig = {
        sensitivityLevel: "medium",
        minDataPoints: 7,
        zScoreThreshold: 2.5,
        movingAverageWindow: 3,
        seasonalityPeriod: 7,
        ...config,
      };

      const anomalies = detectAnomalies(values, fullConfig);
      return ok(anomalies);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async enrichWithAi(
    candidates: InsightCandidate[],
    accountId: string,
    domains: string[],
  ): Promise<
    (InsightCandidate & { description: string; recommendation: string })[]
  > {
    const prompt = `You are an email deliverability expert analyzing metrics for an email platform account.

Account: ${accountId}
Domains: ${domains.join(", ")}

Here are the detected metric changes that need explanation:

${candidates
  .map(
    (c, i) =>
      `${i + 1}. [${c.type.toUpperCase()}] ${c.title}
   Metric: ${c.metric}
   Current: ${c.currentValue}, Previous: ${c.previousValue}
   Context: ${c.context}`,
  )
  .join("\n\n")}

For each insight, provide:
1. A clear, non-technical description of what happened and likely causes (2-3 sentences)
2. A specific, actionable recommendation (1-2 sentences)

Respond as JSON array with objects: { "index": number, "description": string, "recommendation": string }`;

    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 2048,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // Fallback: use candidate context as description
        return candidates.map((c) => ({
          ...c,
          description: c.context,
          recommendation: `Review your ${c.metric.replace(/_/g, " ")} metrics and take appropriate action.`,
        }));
      }

      const enrichments = JSON.parse(jsonMatch[0]) as {
        index: number;
        description: string;
        recommendation: string;
      }[];

      return candidates.map((c, i) => {
        const enrichment = enrichments.find((e) => e.index === i + 1);
        return {
          ...c,
          description: enrichment?.description ?? c.context,
          recommendation:
            enrichment?.recommendation ??
            `Review your ${c.metric.replace(/_/g, " ")} metrics.`,
        };
      });
    } catch {
      // If AI enrichment fails, use statistical context as fallback
      return candidates.map((c) => ({
        ...c,
        description: c.context,
        recommendation: `Review your ${c.metric.replace(/_/g, " ")} metrics and take appropriate action.`,
      }));
    }
  }
}
