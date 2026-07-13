/**
 * API client for the Analytics Dashboard backend
 * (apps/api/src/routes/analytics-dashboard.ts, mounted at /v1/analytics/dashboard).
 *
 * Endpoints covered:
 *   GET    /v1/analytics/dashboard/overview
 *   GET    /v1/analytics/dashboard/trends
 *   GET    /v1/analytics/dashboard/top-senders
 *   GET    /v1/analytics/dashboard/top-recipients
 *   GET    /v1/analytics/dashboard/engagement
 *   POST   /v1/analytics/dashboard/snapshot
 *   GET    /v1/analytics/dashboard/goals
 *   POST   /v1/analytics/dashboard/goals
 *   PUT    /v1/analytics/dashboard/goals/:id
 *   DELETE /v1/analytics/dashboard/goals/:id
 *   GET    /v1/analytics/dashboard/comparison
 *   GET    /v1/analytics/dashboard/export
 *
 * Replicates the 401 → silent-refresh → retry pattern from lib/api-features.ts
 * (which keeps its fetch wrapper module-private).
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface DashboardApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function dashboardFetch<T>(
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

  // Silent access-token renewal on expiry — mirrors lib/api-features.ts.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return dashboardFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as DashboardApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export type SnapshotPeriod = "daily" | "weekly" | "monthly";

export type GoalMetric =
  | "response_time"
  | "open_rate"
  | "inbox_zero_days"
  | "emails_sent";

export interface DashboardDateRange {
  start: string;
  end: string;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export interface OverviewPeriodMetrics {
  totalSent: number;
  totalReceived: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalReplied: number;
  avgResponseTimeMinutes: number | null;
  snapshotCount: number;
}

export interface OverviewChanges {
  sent: number | null;
  received: number | null;
  opened: number | null;
  clicked: number | null;
  bounced: number | null;
  replied: number | null;
}

export interface DashboardOverview {
  current: OverviewPeriodMetrics;
  previous: OverviewPeriodMetrics;
  changes: OverviewChanges;
  period: SnapshotPeriod;
  dateRange: DashboardDateRange;
  previousDateRange: DashboardDateRange;
}

// ─── Trends ───────────────────────────────────────────────────────────────────

export interface TrendPoint {
  id: string;
  date: string;
  period: string;
  emailsSent: number;
  emailsReceived: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsBounced: number;
  emailsReplied: number;
  avgResponseTimeMinutes: number | null;
}

export interface TrendsResponse {
  data: TrendPoint[];
  dateRange: DashboardDateRange;
  period: SnapshotPeriod;
  count: number;
}

// ─── Top contacts ─────────────────────────────────────────────────────────────

export interface TopContact {
  email: string;
  appearances: number;
}

export interface TopContactsResponse {
  data: TopContact[];
  dateRange: DashboardDateRange;
  period: SnapshotPeriod;
}

// ─── Engagement ───────────────────────────────────────────────────────────────

export interface EngagementDailyRates {
  date: string;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  bounceRate: number | null;
}

export interface EngagementMetrics {
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  bounceRate: number | null;
  totals: {
    sent: number;
    received: number;
    opened: number;
    clicked: number;
    bounced: number;
    replied: number;
  };
  avgResponseTimeMinutes: number | null;
  daily: EngagementDailyRates[];
  dateRange: DashboardDateRange;
  period: SnapshotPeriod;
}

// ─── Snapshot upsert ──────────────────────────────────────────────────────────

export interface SnapshotUpsertInput {
  period?: SnapshotPeriod;
  date?: string;
  emailsSent?: number;
  emailsReceived?: number;
  emailsOpened?: number;
  emailsClicked?: number;
  emailsBounced?: number;
  emailsReplied?: number;
  avgResponseTimeMinutes?: number | null;
  topSenders?: string[];
  topRecipients?: string[];
  topSubjects?: string[];
}

export interface SnapshotUpsertResult {
  id: string;
  date: string;
  period: SnapshotPeriod;
  upserted: "created" | "updated";
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface AnalyticsGoal {
  id: string;
  metric: GoalMetric;
  targetValue: number;
  currentValue: number;
  startDate: string;
  endDate: string;
  isAchieved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  metric: GoalMetric;
  targetValue: number;
  currentValue?: number;
  startDate: string;
  endDate: string;
}

export interface UpdateGoalInput {
  targetValue?: number;
  currentValue?: number;
  isAchieved?: boolean;
}

// ─── Comparison ───────────────────────────────────────────────────────────────

export interface ComparisonRangeMetrics {
  dateRange: DashboardDateRange;
  totalSent: number;
  totalReceived: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalReplied: number;
  avgResponseTimeMinutes: number | null;
  snapshotCount: number;
}

export interface ComparisonDifference {
  sent: number;
  received: number;
  opened: number;
  clicked: number;
  bounced: number;
  replied: number;
}

export interface ComparisonResult {
  range1: ComparisonRangeMetrics;
  range2: ComparisonRangeMetrics;
  difference: ComparisonDifference;
  period: SnapshotPeriod;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export interface ExportSnapshot extends TrendPoint {
  topSenders: string[] | null;
  topRecipients: string[] | null;
  topSubjects: string[] | null;
  createdAt: string;
}

export interface AnalyticsExport {
  meta: {
    accountId: string;
    exportedAt: string;
    dateRange: DashboardDateRange;
    period: SnapshotPeriod;
    snapshotCount: number;
  };
  summary: {
    totalSent: number;
    totalReceived: number;
    totalOpened: number;
    totalClicked: number;
    totalBounced: number;
    totalReplied: number;
    avgResponseTimeMinutes: number | null;
  };
  snapshots: ExportSnapshot[];
}

// ─── Client ───────────────────────────────────────────────────────────────────

const BASE = "/v1/analytics/dashboard";

export const analyticsDashboardApi = {
  overview(
    period: SnapshotPeriod = "daily",
  ): Promise<{ data: DashboardOverview }> {
    return dashboardFetch<{ data: DashboardOverview }>(
      `${BASE}/overview?${new URLSearchParams({ period }).toString()}`,
    );
  },

  trends(params: {
    startDate: string;
    endDate: string;
    period?: SnapshotPeriod;
  }): Promise<TrendsResponse> {
    const q = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      period: params.period ?? "daily",
    });
    return dashboardFetch<TrendsResponse>(`${BASE}/trends?${q.toString()}`);
  },

  topSenders(params?: {
    limit?: number;
    period?: SnapshotPeriod;
    startDate?: string;
    endDate?: string;
  }): Promise<TopContactsResponse> {
    const q = new URLSearchParams({
      limit: String(params?.limit ?? 10),
      period: params?.period ?? "daily",
    });
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    return dashboardFetch<TopContactsResponse>(
      `${BASE}/top-senders?${q.toString()}`,
    );
  },

  topRecipients(params?: {
    limit?: number;
    period?: SnapshotPeriod;
    startDate?: string;
    endDate?: string;
  }): Promise<TopContactsResponse> {
    const q = new URLSearchParams({
      limit: String(params?.limit ?? 10),
      period: params?.period ?? "daily",
    });
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    return dashboardFetch<TopContactsResponse>(
      `${BASE}/top-recipients?${q.toString()}`,
    );
  },

  engagement(params: {
    startDate: string;
    endDate: string;
    period?: SnapshotPeriod;
  }): Promise<{ data: EngagementMetrics }> {
    const q = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      period: params.period ?? "daily",
    });
    return dashboardFetch<{ data: EngagementMetrics }>(
      `${BASE}/engagement?${q.toString()}`,
    );
  },

  upsertSnapshot(
    input: SnapshotUpsertInput,
  ): Promise<{ data: SnapshotUpsertResult }> {
    return dashboardFetch<{ data: SnapshotUpsertResult }>(`${BASE}/snapshot`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listGoals(): Promise<{ data: AnalyticsGoal[]; count: number }> {
    return dashboardFetch<{ data: AnalyticsGoal[]; count: number }>(
      `${BASE}/goals`,
    );
  },

  createGoal(
    input: CreateGoalInput,
  ): Promise<{ data: Omit<AnalyticsGoal, "updatedAt"> }> {
    return dashboardFetch<{ data: Omit<AnalyticsGoal, "updatedAt"> }>(
      `${BASE}/goals`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  updateGoal(
    id: string,
    input: UpdateGoalInput,
  ): Promise<{ data: UpdateGoalInput & { id: string; updatedAt: string } }> {
    return dashboardFetch<
      { data: UpdateGoalInput & { id: string; updatedAt: string } }
    >(`${BASE}/goals/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteGoal(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
    return dashboardFetch<{ data: { id: string; deleted: boolean } }>(
      `${BASE}/goals/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  comparison(params: {
    startDate1: string;
    endDate1: string;
    startDate2: string;
    endDate2: string;
    period?: SnapshotPeriod;
  }): Promise<{ data: ComparisonResult }> {
    const q = new URLSearchParams({
      startDate1: params.startDate1,
      endDate1: params.endDate1,
      startDate2: params.startDate2,
      endDate2: params.endDate2,
      period: params.period ?? "daily",
    });
    return dashboardFetch<{ data: ComparisonResult }>(
      `${BASE}/comparison?${q.toString()}`,
    );
  },

  exportJson(params: {
    startDate: string;
    endDate: string;
    period?: SnapshotPeriod;
  }): Promise<{ data: AnalyticsExport }> {
    const q = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      period: params.period ?? "daily",
    });
    return dashboardFetch<{ data: AnalyticsExport }>(
      `${BASE}/export?${q.toString()}`,
    );
  },
};
