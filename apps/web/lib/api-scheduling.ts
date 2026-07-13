/**
 * API client for the Scheduling feature domain — two backend route files:
 *
 *   apps/api/src/routes/scheduling-intelligence.ts  → mounted at /v1/scheduling
 *     (NB: the route file's header comment claims /v1/scheduling-intelligence,
 *      but server.ts mounts it at /v1/scheduling — the comment lies.)
 *   apps/api/src/routes/scheduling-analytics.ts     → mounted at /v1/analytics/scheduling
 *
 * Meeting Intelligence (/v1/scheduling):
 *   POST /v1/scheduling/detect            — detect scheduling intent in email text
 *   POST /v1/scheduling/propose           — generate a meeting proposal
 *   GET  /v1/scheduling/proposals         — list proposals (cursor pagination)
 *   GET  /v1/scheduling/proposals/:id     — get a specific proposal
 *   PUT  /v1/scheduling/proposals/:id     — accept/decline a proposal
 *   GET  /v1/scheduling/patterns          — availability patterns
 *   PUT  /v1/scheduling/patterns          — update a day's preferences
 *   POST /v1/scheduling/patterns/learn    — learn patterns from calendar events
 *   GET  /v1/scheduling/suggest-times     — suggest available times
 *   GET  /v1/scheduling/conflicts         — detect scheduling conflicts
 *   GET  /v1/scheduling/stats             — scheduling stats
 *   POST /v1/scheduling/auto-respond      — generate a scheduling reply
 *
 * Send-Time Analytics (/v1/analytics/scheduling):
 *   GET  /v1/analytics/scheduling             — opens/clicks by hour and day
 *   GET  /v1/analytics/scheduling/best-times  — recommended best send times
 *   GET  /v1/analytics/scheduling/recipient/:email — recipient engagement pattern
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts (module-private there)
 * so this domain has its own typed entry point with silent 401 → refresh →
 * retry handling, replicating lib/api-delegation.ts.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface SchedulingApiError {
  error?: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
  message?: string;
}

async function schedulingFetch<T>(
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

  // Silent access-token renewal on expiry — mirrors lib/api-delegation.ts.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return schedulingFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as SchedulingApiError | null;
    throw new Error(
      errorBody?.error?.message ??
        errorBody?.message ??
        `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Meeting Intelligence types (/v1/scheduling) ─────────────────────────────

export type MeetingProposalStatus =
  | "proposed"
  | "accepted"
  | "declined"
  | "expired";

export type MeetingType =
  | "one_on_one"
  | "group"
  | "standup"
  | "interview"
  | "demo"
  | "social";

export interface ProposedTimeSlot {
  start: string;
  end: string;
  confidence: number;
}

export interface MeetingProposal {
  id: string;
  accountId: string;
  emailId: string;
  threadId: string;
  proposedTimes: ProposedTimeSlot[];
  participants: string[];
  subject: string;
  duration: number;
  location: string | null;
  meetingType: MeetingType;
  status: MeetingProposalStatus;
  selectedTime: string | null;
  aiReasoning: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingPreferences {
  maxMeetingsPerDay?: number;
  minBreakMinutes?: number;
  preferMorning?: boolean;
  noMeetingDays?: number[];
}

export interface BusyBlock {
  start: string;
  end: string;
  recurring: boolean;
}

export interface AvailabilityPattern {
  id: string;
  accountId: string;
  dayOfWeek: number;
  preferredStartHour: number;
  preferredEndHour: number;
  busyBlocks: BusyBlock[];
  meetingPreferences: MeetingPreferences;
  timezone: string;
  confidence: number;
  lastUpdatedFromCalendar: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulingConflict {
  proposalA: string;
  proposalB: string;
  overlapStart: string;
  overlapEnd: string;
}

export interface ConflictsData {
  range: { start: string; end: string };
  totalAccepted: number;
  conflicts: SchedulingConflict[];
  hasConflicts: boolean;
}

export interface SchedulingStats {
  proposals: {
    total: number;
    proposed: number;
    accepted: number;
    declined: number;
    expired: number;
  };
  avgDuration: number;
  acceptRate: number;
  patterns: {
    total: number;
    avgConfidence: number;
  };
}

export interface SuggestedTimesData {
  duration: number;
  participants: string[];
  dateRange: string;
  suggestedTimes: ProposedTimeSlot[];
  patternsUsed: number;
}

export interface ProposalListResult {
  data: MeetingProposal[];
  cursor: string | null;
  hasMore: boolean;
}

export interface UpdatePatternPayload {
  dayOfWeek: number;
  preferredStartHour: number;
  preferredEndHour: number;
  meetingPreferences?: MeetingPreferences;
}

export type AutoRespondAction = "accept" | "decline" | "suggest_alternative";

export interface AutoRespondResult {
  proposalId: string;
  action: AutoRespondAction;
  status: MeetingProposalStatus;
  responseText: string;
}

// ─── Send-Time Analytics types (/v1/analytics/scheduling) ────────────────────

export interface HourlyBucket {
  hour: number;
  opens: number;
  clicks: number;
  total: number;
}

export interface DailyBucket {
  dayOfWeek: number;
  dayName: string;
  opens: number;
  clicks: number;
  total: number;
}

export interface SchedulingAnalyticsData {
  period: { days: number; since: string };
  hourly: HourlyBucket[];
  daily: DailyBucket[];
}

export interface BestTimeSlot {
  hour: number;
  dayOfWeek: number;
  dayName: string;
  opens: number;
  sent: number;
  openRate: number;
}

export interface BestTimesData {
  period: { days: number; since: string };
  bestTimes: BestTimeSlot[];
  allSlots: BestTimeSlot[];
}

export interface RecipientEngagementData {
  recipientEmail: string;
  found: boolean;
  message?: string;
  totalSent?: number;
  totalOpened?: number;
  totalClicked?: number;
  totalReplied?: number;
  avgOpenDelayHours?: number | null;
  hourlyDistribution?: number[] | null;
  dailyDistribution?: number[] | null;
  bestHour?: number | null;
  bestDay?: number | null;
  lastEngagedAt?: string | null;
  updatedAt?: string;
}

// ─── Meeting Intelligence API (/v1/scheduling) ───────────────────────────────

export const schedulingIntelligenceApi = {
  /** GET /v1/scheduling/proposals — list proposals, optionally filtered by status. */
  listProposals(options?: {
    status?: MeetingProposalStatus;
    threadId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ProposalListResult> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.threadId) params.set("threadId", options.threadId);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return schedulingFetch<ProposalListResult>(
      `/v1/scheduling/proposals${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/scheduling/proposals/:id — a single proposal. */
  getProposal(id: string): Promise<{ success: boolean; data: MeetingProposal }> {
    return schedulingFetch<{ success: boolean; data: MeetingProposal }>(
      `/v1/scheduling/proposals/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/scheduling/proposals/:id — accept or decline a proposal. */
  updateProposal(
    id: string,
    payload: { status: "accepted" | "declined"; selectedTime?: string },
  ): Promise<{ success: boolean; data: MeetingProposal }> {
    return schedulingFetch<{ success: boolean; data: MeetingProposal }>(
      `/v1/scheduling/proposals/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** POST /v1/scheduling/auto-respond — generate a scheduling reply for a proposal. */
  autoRespond(
    proposalId: string,
    action: AutoRespondAction,
  ): Promise<{ success: boolean; data: AutoRespondResult }> {
    return schedulingFetch<{ success: boolean; data: AutoRespondResult }>(
      "/v1/scheduling/auto-respond",
      {
        method: "POST",
        body: JSON.stringify({ proposalId, action }),
      },
    );
  },

  /** GET /v1/scheduling/patterns — availability patterns for every learned day. */
  getPatterns(): Promise<{ success: boolean; data: AvailabilityPattern[] }> {
    return schedulingFetch<{ success: boolean; data: AvailabilityPattern[] }>(
      "/v1/scheduling/patterns",
    );
  },

  /** PUT /v1/scheduling/patterns — set preferred hours for one day of the week. */
  updatePattern(
    payload: UpdatePatternPayload,
  ): Promise<{ success: boolean; data: AvailabilityPattern }> {
    return schedulingFetch<{ success: boolean; data: AvailabilityPattern }>(
      "/v1/scheduling/patterns",
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** GET /v1/scheduling/conflicts — overlapping accepted meetings in the range. */
  getConflicts(options?: {
    date?: string;
    range?: number;
  }): Promise<{ success: boolean; data: ConflictsData }> {
    const params = new URLSearchParams();
    if (options?.date) params.set("date", options.date);
    if (options?.range !== undefined) params.set("range", String(options.range));
    const qs = params.toString();
    return schedulingFetch<{ success: boolean; data: ConflictsData }>(
      `/v1/scheduling/conflicts${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/scheduling/stats — proposal + pattern aggregate stats. */
  getStats(): Promise<{ success: boolean; data: SchedulingStats }> {
    return schedulingFetch<{ success: boolean; data: SchedulingStats }>(
      "/v1/scheduling/stats",
    );
  },

  /** GET /v1/scheduling/suggest-times — AI-ranked open slots for a meeting. */
  suggestTimes(payload: {
    duration: number;
    participants: string;
    dateRange: string;
  }): Promise<{ success: boolean; data: SuggestedTimesData }> {
    const params = new URLSearchParams({
      duration: String(payload.duration),
      participants: payload.participants,
      dateRange: payload.dateRange,
    });
    return schedulingFetch<{ success: boolean; data: SuggestedTimesData }>(
      `/v1/scheduling/suggest-times?${params.toString()}`,
    );
  },
};

// ─── Send-Time Analytics API (/v1/analytics/scheduling) ──────────────────────

export const schedulingAnalyticsApi = {
  /** GET /v1/analytics/scheduling — opens/clicks by hour and day of week. */
  overview(days: number): Promise<{ data: SchedulingAnalyticsData }> {
    return schedulingFetch<{ data: SchedulingAnalyticsData }>(
      `/v1/analytics/scheduling?days=${encodeURIComponent(String(days))}`,
    );
  },

  /** GET /v1/analytics/scheduling/best-times — top open-rate hour×day slots. */
  bestTimes(days: number): Promise<{ data: BestTimesData }> {
    return schedulingFetch<{ data: BestTimesData }>(
      `/v1/analytics/scheduling/best-times?days=${encodeURIComponent(String(days))}`,
    );
  },

  /** GET /v1/analytics/scheduling/recipient/:email — one recipient's pattern. */
  recipient(email: string): Promise<{ data: RecipientEngagementData }> {
    return schedulingFetch<{ data: RecipientEngagementData }>(
      `/v1/analytics/scheduling/recipient/${encodeURIComponent(email)}`,
    );
  },
};
