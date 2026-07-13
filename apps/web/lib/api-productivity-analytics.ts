/**
 * API client for the Productivity Analytics feature domain
 * (apps/api/src/routes/productivity-analytics.ts) — email time tracking,
 * AI-generated productivity insights, learned behavior patterns, reports,
 * period comparisons, and the team leaderboard.
 *
 * NB: the router is mounted at /v1/productivity in server.ts
 * (`app.route("/v1/productivity", productivityAnalyticsRouter)`). The
 * `/v1/productivity-analytics/...` paths in the route file's header comment do
 * NOT exist on the server — the real mount prefix is /v1/productivity.
 *
 * Endpoints wired here (true METHOD /path):
 *   GET  /v1/productivity/time/summary        — time totals grouped by activity
 *   GET  /v1/productivity/insights            — AI insights (severity/active filters, cursor)
 *   PUT  /v1/productivity/insights/:id        — action/dismiss an insight
 *   POST /v1/productivity/insights/generate   — regenerate insights from recent activity
 *   GET  /v1/productivity/patterns/predict    — best-hour predictions
 *   GET  /v1/productivity/report              — weekly/monthly report
 *   GET  /v1/productivity/comparison          — compare two periods
 *   GET  /v1/productivity/leaderboard         — team productivity leaderboard
 *
 * Mirrors the module-private featureFetch wrapper in lib/api-features.ts so
 * this domain has its own typed entry point with silent 401 → refresh → retry
 * handling (same pattern as lib/api-delegation.ts / lib/api-context-intelligence.ts).
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface ProductivityApiError {
  error?: {
    type?: string;
    message?: string;
    code?: string;
    details?: unknown;
  };
}

async function productivityFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Silent access-token renewal on expiry — mirrors lib/api.ts apiFetch.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return productivityFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as ProductivityApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Shared enums ──────────────────────────────────────────────────────────────

export type ActivityType = "reading" | "composing" | "replying" | "forwarding";

export type InsightType =
  | "email_overload"
  | "response_time"
  | "peak_hours"
  | "meeting_vs_email"
  | "focus_time"
  | "batch_opportunity"
  | "delegation_suggestion";

export type InsightSeverity = "info" | "warning" | "critical";

export type ReportPeriod = "weekly" | "monthly";

// ─── Time summary ──────────────────────────────────────────────────────────────

export interface TimeSummaryEntry {
  totalSeconds: number;
  count: number;
  avgSeconds: number;
}

/** Map keyed by activity type. The backend omits activity types with no data. */
export type TimeSummary = Partial<Record<ActivityType, TimeSummaryEntry>>;

// ─── Insights ──────────────────────────────────────────────────────────────────

export interface ProductivityInsight {
  id: string;
  accountId: string;
  insightType: InsightType;
  title: string;
  description: string;
  severity: InsightSeverity;
  metric: string;
  currentValue: number;
  targetValue: number | null;
  recommendation: string;
  isActioned: boolean;
  isDismissed: boolean;
  validUntil: string;
  createdAt: string;
}

export interface InsightsListResult {
  data: ProductivityInsight[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface UpdateInsightPayload {
  isActioned?: boolean;
  isDismissed?: boolean;
}

// ─── Predictions ───────────────────────────────────────────────────────────────

export interface HourPrediction {
  hour: number;
  score: number;
  sampleCount: number;
}

export interface PredictResult {
  predictions: HourPrediction[];
  bestHour: HourPrediction | null;
  totalPatterns: number;
}

// ─── Report ────────────────────────────────────────────────────────────────────

export interface ReportBreakdownEntry {
  activityType: ActivityType;
  totalSeconds: number;
  count: number;
  avgSeconds: number;
}

export interface ProductivityReport {
  period: ReportPeriod;
  periodStart: string;
  periodEnd: string;
  totalEmails: number;
  totalTimeSeconds: number;
  avgTimePerEmail: number;
  breakdown: ReportBreakdownEntry[];
  insights: {
    total: number;
    actioned: number;
    dismissed: number;
  };
}

// ─── Comparison ────────────────────────────────────────────────────────────────

export interface ComparisonPeriodBreakdownEntry {
  activityType: ActivityType;
  totalSeconds: number;
  count: number;
}

export interface ComparisonPeriodStats {
  from: string;
  to: string;
  totalEmails: number;
  totalSeconds: number;
  avgSeconds: number;
  breakdown: ComparisonPeriodBreakdownEntry[];
}

export interface ProductivityComparison {
  current: ComparisonPeriodStats;
  previous: ComparisonPeriodStats;
  changes: {
    emailCountPercent: number | null;
    totalTimePercent: number | null;
  };
}

// ─── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  accountId: string;
  totalEmails: number;
  totalSeconds: number;
  avgSecondsPerEmail: number;
}

// ─── API ───────────────────────────────────────────────────────────────────────

export const productivityAnalyticsApi = {
  /** GET /v1/productivity/time/summary — time totals grouped by activity type. */
  timeSummary(options?: {
    from?: string;
    to?: string;
  }): Promise<{ data: TimeSummary }> {
    const params = new URLSearchParams();
    if (options?.from) params.set("from", options.from);
    if (options?.to) params.set("to", options.to);
    const qs = params.toString();
    return productivityFetch<{ data: TimeSummary }>(
      `/v1/productivity/time/summary${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/productivity/insights — list AI insights, cursor-paginated. */
  listInsights(options?: {
    type?: InsightType;
    severity?: InsightSeverity;
    active?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<InsightsListResult> {
    const params = new URLSearchParams();
    if (options?.type) params.set("type", options.type);
    if (options?.severity) params.set("severity", options.severity);
    if (options?.active !== undefined) params.set("active", String(options.active));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return productivityFetch<InsightsListResult>(
      `/v1/productivity/insights${qs ? `?${qs}` : ""}`,
    );
  },

  /** PUT /v1/productivity/insights/:id — action or dismiss an insight. */
  updateInsight(
    id: string,
    payload: UpdateInsightPayload,
  ): Promise<{ data: ProductivityInsight }> {
    return productivityFetch<{ data: ProductivityInsight }>(
      `/v1/productivity/insights/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** POST /v1/productivity/insights/generate — regenerate insights from recent activity. */
  generateInsights(): Promise<{
    data: ProductivityInsight[];
    generated: number;
  }> {
    return productivityFetch<{
      data: ProductivityInsight[];
      generated: number;
    }>("/v1/productivity/insights/generate", { method: "POST" });
  },

  /** GET /v1/productivity/patterns/predict — best-hour predictions for an activity. */
  predict(options?: {
    activityType?: ActivityType;
  }): Promise<{ data: PredictResult }> {
    const params = new URLSearchParams();
    if (options?.activityType) params.set("activityType", options.activityType);
    const qs = params.toString();
    return productivityFetch<{ data: PredictResult }>(
      `/v1/productivity/patterns/predict${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/productivity/report — weekly or monthly productivity report. */
  report(period: ReportPeriod): Promise<{ data: ProductivityReport }> {
    return productivityFetch<{ data: ProductivityReport }>(
      `/v1/productivity/report?period=${period}`,
    );
  },

  /**
   * GET /v1/productivity/comparison — compare the current period against a
   * previous one. Both bounds are ISO datetimes; the comparison window length
   * is derived from `current` → now on the server.
   */
  comparison(
    current: string,
    previous: string,
  ): Promise<{ data: ProductivityComparison }> {
    const params = new URLSearchParams({ current, previous });
    return productivityFetch<{ data: ProductivityComparison }>(
      `/v1/productivity/comparison?${params.toString()}`,
    );
  },

  /** GET /v1/productivity/leaderboard — team productivity leaderboard (last 7 days). */
  leaderboard(): Promise<{ data: LeaderboardEntry[] }> {
    return productivityFetch<{ data: LeaderboardEntry[] }>(
      "/v1/productivity/leaderboard",
    );
  },
};
