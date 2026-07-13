/**
 * API client for the Email Hygiene & Productivity Insights feature domain
 * (apps/api/src/routes/email-hygiene.ts).
 *
 * NB: the router is mounted at /v1/hygiene in server.ts (NOT /v1/email-hygiene —
 * the older hygiene page called a fictional /v1/email-hygiene/* surface that does
 * not exist on the server). All 12 backend endpoints:
 *
 *   GET    /v1/hygiene/habits?period=            — email habits over time
 *   GET    /v1/hygiene/habits/today             — today's habits
 *   GET    /v1/hygiene/productivity-score       — current score + breakdown
 *   GET    /v1/hygiene/subscriptions?...        — list newsletter subscriptions
 *   POST   /v1/hygiene/subscriptions/:id/wanted — mark subscription wanted/unwanted
 *   POST   /v1/hygiene/subscriptions/audit      — AI audit of all subscriptions
 *   GET    /v1/hygiene/response-time?period=     — response-time analytics
 *   POST   /v1/hygiene/inbox-cleanup            — AI inbox cleanup suggestions
 *   GET    /v1/hygiene/email-volume?period=      — email volume trends
 *   GET    /v1/hygiene/top-senders?limit=        — top senders by volume
 *   POST   /v1/hygiene/goals                    — set productivity goals
 *   GET    /v1/hygiene/goals                     — get goals + progress
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts (module-private there)
 * so this domain has its own typed entry point with silent 401 → refresh → retry
 * handling. Pattern copied from lib/api-delegation.ts.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface HygieneApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function hygieneFetch<T>(
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
      return hygieneFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as HygieneApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Shared types ──────────────────────────────────────────────────────────────

export type HygienePeriod = "week" | "month" | "quarter";

export interface HygieneDateRange {
  start: string;
  end: string;
}

// ─── Habits ────────────────────────────────────────────────────────────────────

export interface EmailHabitDay {
  id: string;
  date: string;
  emailsSent: number;
  emailsReceived: number;
  emailsArchived: number;
  avgResponseTimeMinutes: number | null;
  peakHour: number | null;
  productivityScore: number | null;
  inboxZeroAchieved: boolean;
}

export interface HabitsResult {
  data: EmailHabitDay[];
  period: HygienePeriod;
  dateRange: HygieneDateRange;
}

/** Today's habits — id is absent when no row exists yet for today. */
export interface TodayHabits {
  id?: string;
  date: string;
  emailsSent: number;
  emailsReceived: number;
  emailsArchived: number;
  avgResponseTimeMinutes: number | null;
  peakHour: number | null;
  productivityScore: number | null;
  inboxZeroAchieved: boolean;
}

// ─── Productivity score ──────────────────────────────────────────────────────

export interface ResponseTimeBreakdown {
  score: number;
  avgMinutes: number;
}

export interface InboxZeroBreakdown {
  score: number;
  days: number;
  total: number;
}

export interface ArchiveRateBreakdown {
  score: number;
  archived: number;
  received: number;
}

export interface ConsistencyBreakdown {
  score: number;
  activeDays: number;
}

export interface ProductivityScore {
  overallScore: number | null;
  breakdown: {
    responseTime: ResponseTimeBreakdown | null;
    inboxZeroRate: InboxZeroBreakdown | null;
    archiveRate: ArchiveRateBreakdown | null;
    consistency: ConsistencyBreakdown | null;
  };
  daysAnalyzed: number;
  message?: string;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export interface HygieneSubscription {
  id: string;
  senderEmail: string;
  senderName: string | null;
  frequency: string | null;
  lastReceived: string | null;
  totalReceived: number;
  totalOpened: number;
  openRate: number | null;
  isWanted: boolean;
  category: string | null;
  unsubscribeUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionListResult {
  data: HygieneSubscription[];
  cursor: string | null;
  hasMore: boolean;
}

export interface SubscriptionListOptions {
  limit?: number;
  cursor?: string;
  category?: string;
  wanted?: boolean;
}

// ─── Subscription audit ──────────────────────────────────────────────────────

export interface AuditNeverOpened {
  id: string;
  senderEmail: string;
  senderName: string | null;
  totalReceived: number;
  suggestion: string;
}

export interface AuditLowEngagement {
  id: string;
  senderEmail: string;
  senderName: string | null;
  openRate: number | null;
  totalReceived: number;
  suggestion: string;
}

export interface AuditHighVolume {
  id: string;
  senderEmail: string;
  senderName: string | null;
  totalReceived: number;
  frequency: string | null;
  suggestion: string;
}

export interface SubscriptionAudit {
  totalSubscriptions: number;
  wantedCount: number;
  unwantedCount: number;
  suggestions: {
    neverOpened: AuditNeverOpened[];
    lowEngagement: AuditLowEngagement[];
    highVolume: AuditHighVolume[];
  };
  estimatedTimeSavedMinutesPerWeek: number;
  auditedAt: string;
}

// ─── Response time ────────────────────────────────────────────────────────────

export interface ResponseTimeDaily {
  date: string;
  avgResponseTimeMinutes: number;
}

export interface ResponseTimeAnalytics {
  period: HygienePeriod;
  dateRange: HygieneDateRange;
  overall: {
    avgResponseTimeMinutes: number | null;
    fastestDayMinutes: number | null;
    slowestDayMinutes: number | null;
    daysWithData: number;
  };
  daily: ResponseTimeDaily[];
}

// ─── Inbox cleanup ────────────────────────────────────────────────────────────

export interface CleanupUnsubscribeCandidate {
  id: string;
  senderEmail: string;
  senderName: string | null;
  totalReceived: number;
  openRate: number | null;
  unsubscribeUrl: string | null;
}

export interface InboxCleanupResult {
  suggestions: {
    unsubscribe: {
      count: number;
      candidates: CleanupUnsubscribeCandidate[];
    };
    archiveOld: {
      suggestion: string;
      archiveRatio: number;
    };
    labelOrganize: {
      suggestion: string;
    };
  };
  generatedAt: string;
}

// ─── Email volume ────────────────────────────────────────────────────────────

export interface EmailVolumeDaily {
  date: string;
  emailsSent: number;
  emailsReceived: number;
  emailsArchived: number;
}

export interface EmailVolume {
  period: HygienePeriod;
  dateRange: HygieneDateRange;
  totals: {
    sent: number;
    received: number;
    archived: number;
  };
  daily: EmailVolumeDaily[];
}

// ─── Top senders ─────────────────────────────────────────────────────────────

export interface TopSender {
  id: string;
  senderEmail: string;
  senderName: string | null;
  frequency: string | null;
  totalReceived: number;
  totalOpened: number;
  openRate: number | null;
  isWanted: boolean;
  category: string | null;
  lastReceived: string | null;
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface ProductivityGoals {
  maxDailyChecks?: number;
  targetResponseTimeMinutes?: number;
  inboxZeroGoal?: boolean;
}

export interface GoalsProgress {
  responseTime?: {
    target: number;
    actual: number | null;
    onTrack: boolean | null;
  };
  inboxZero?: {
    goal: boolean;
    achievedToday: boolean;
  };
}

/** GET /goals returns { goals: null, progress: null, message } when unset. */
export interface GoalsResult {
  goals: ProductivityGoals | null;
  progress: GoalsProgress | null;
  message?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SetGoalsPayload {
  maxDailyChecks?: number;
  targetResponseTimeMinutes?: number;
  inboxZeroGoal?: boolean;
}

// ─── Hygiene API (/v1/hygiene) ─────────────────────────────────────────────────

export const hygieneApi = {
  /** GET /v1/hygiene/habits — email habits over the given period. */
  habits(period: HygienePeriod = "week"): Promise<HabitsResult> {
    return hygieneFetch<HabitsResult>(
      `/v1/hygiene/habits?period=${encodeURIComponent(period)}`,
    );
  },

  /** GET /v1/hygiene/habits/today — today's habits. */
  habitsToday(): Promise<{ data: TodayHabits }> {
    return hygieneFetch<{ data: TodayHabits }>("/v1/hygiene/habits/today");
  },

  /** GET /v1/hygiene/productivity-score — current score + breakdown. */
  productivityScore(): Promise<{ data: ProductivityScore }> {
    return hygieneFetch<{ data: ProductivityScore }>(
      "/v1/hygiene/productivity-score",
    );
  },

  /** GET /v1/hygiene/subscriptions — list subscriptions, cursor-paginated. */
  subscriptions(
    options?: SubscriptionListOptions,
  ): Promise<SubscriptionListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.category) params.set("category", options.category);
    if (options?.wanted !== undefined) {
      params.set("wanted", String(options.wanted));
    }
    const qs = params.toString();
    return hygieneFetch<SubscriptionListResult>(
      `/v1/hygiene/subscriptions${qs ? `?${qs}` : ""}`,
    );
  },

  /** POST /v1/hygiene/subscriptions/:id/wanted — mark wanted/unwanted. */
  markWanted(
    id: string,
    isWanted: boolean,
  ): Promise<{ data: { id: string; isWanted: boolean; updatedAt: string } }> {
    return hygieneFetch<{
      data: { id: string; isWanted: boolean; updatedAt: string };
    }>(`/v1/hygiene/subscriptions/${encodeURIComponent(id)}/wanted`, {
      method: "POST",
      body: JSON.stringify({ isWanted }),
    });
  },

  /** POST /v1/hygiene/subscriptions/audit — AI audit of all subscriptions. */
  auditSubscriptions(): Promise<{ data: SubscriptionAudit }> {
    return hygieneFetch<{ data: SubscriptionAudit }>(
      "/v1/hygiene/subscriptions/audit",
      { method: "POST" },
    );
  },

  /** GET /v1/hygiene/response-time — response-time analytics for the period. */
  responseTime(
    period: HygienePeriod = "week",
  ): Promise<{ data: ResponseTimeAnalytics }> {
    return hygieneFetch<{ data: ResponseTimeAnalytics }>(
      `/v1/hygiene/response-time?period=${encodeURIComponent(period)}`,
    );
  },

  /** POST /v1/hygiene/inbox-cleanup — AI inbox cleanup suggestions. */
  inboxCleanup(): Promise<{ data: InboxCleanupResult }> {
    return hygieneFetch<{ data: InboxCleanupResult }>(
      "/v1/hygiene/inbox-cleanup",
      { method: "POST" },
    );
  },

  /** GET /v1/hygiene/email-volume — email volume trends for the period. */
  emailVolume(period: HygienePeriod = "week"): Promise<{ data: EmailVolume }> {
    return hygieneFetch<{ data: EmailVolume }>(
      `/v1/hygiene/email-volume?period=${encodeURIComponent(period)}`,
    );
  },

  /** GET /v1/hygiene/top-senders — top senders by volume. */
  topSenders(limit = 10): Promise<{ data: TopSender[] }> {
    return hygieneFetch<{ data: TopSender[] }>(
      `/v1/hygiene/top-senders?limit=${encodeURIComponent(String(limit))}`,
    );
  },

  /** POST /v1/hygiene/goals — set (or merge) productivity goals. */
  setGoals(
    payload: SetGoalsPayload,
  ): Promise<{ data: { id: string; goals: ProductivityGoals } }> {
    return hygieneFetch<{ data: { id: string; goals: ProductivityGoals } }>(
      "/v1/hygiene/goals",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** GET /v1/hygiene/goals — current goals + progress. */
  goals(): Promise<{ data: GoalsResult }> {
    return hygieneFetch<{ data: GoalsResult }>("/v1/hygiene/goals");
  },
};
