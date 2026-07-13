/**
 * API client for the Sentiment Timeline feature domain
 * (apps/api/src/routes/sentiment-timeline.ts).
 *
 * Router is mounted at /v1/sentiment in apps/api/src/server.ts (verified —
 * NOT /v1/sentiment-timeline). Covers the read endpoints this page uses:
 *   GET /v1/sentiment/dashboard                → aggregate stats
 *   GET /v1/sentiment/contacts?riskLevel=&sortBy=&limit=&cursor=
 *                                              → relationship-health list
 *   GET /v1/sentiment/contacts/:contactEmail   → one contact's health (404 if none)
 *   GET /v1/sentiment/timeline?contactEmail=&days=&limit=&cursor=
 *                                              → per-email sentiment entries
 *   GET /v1/sentiment/timeline/:contactEmail   → one contact's timeline (max 100)
 *   GET /v1/sentiment/alerts                   → declining relationships (risk)
 *   GET /v1/sentiment/trends?period=&days=     → aggregate sentiment over time
 *   GET /v1/sentiment/topics                   → most-discussed topics + sentiment
 *
 * Mirrors the module-private featureFetch wrapper in lib/api-features.ts (which
 * is not exported) so this domain has its own typed entry point with silent
 * 401 → refresh → retry-once → redirect handling.
 *
 * Pagination note: unlike the delegation domain ({ data, cursor, hasMore }),
 * the sentiment endpoints return { data, pagination: { hasMore, nextCursor } }.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface SentimentApiError {
  error?: {
    type?: string;
    message?: string;
    code?: string;
    details?: unknown;
  };
}

async function sentimentFetch<T>(
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
      return sentimentFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as SentimentApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Domain types ──────────────────────────────────────────────────────────────

export type SentimentLevel =
  | "very_positive"
  | "positive"
  | "neutral"
  | "negative"
  | "very_negative";

export type RiskLevel = "none" | "low" | "medium" | "high";

export type TrendDirection = "improving" | "stable" | "declining";

/** One analyzed email's sentiment (row of sentiment_timeline). */
export interface SentimentEntry {
  id: string;
  accountId: string;
  contactEmail: string;
  emailId: string;
  sentiment: SentimentLevel;
  /** 0.0–1.0. */
  score: number;
  topics: string[] | null;
  emotionalTone: string | null;
  createdAt: string;
}

/** Aggregate relationship health per contact (row of relationship_health). */
export interface RelationshipHealth {
  id: string;
  accountId: string;
  contactEmail: string;
  contactName: string | null;
  /** 0–100. */
  healthScore: number;
  trendDirection: TrendDirection | string;
  /** Average sentiment 0.0–1.0. */
  avgSentiment: number;
  totalInteractions: number;
  lastPositiveAt: string | null;
  lastNegativeAt: string | null;
  riskLevel: RiskLevel | string;
  createdAt: string;
  updatedAt: string;
}

export interface SentimentDashboard {
  totalAnalyzed: number;
  averageSentiment: number;
  topPositiveContacts: RelationshipHealth[];
  topNegativeContacts: RelationshipHealth[];
  atRiskCount: number;
}

export interface TrendPoint {
  period: string;
  avgScore: number;
  count: number;
}

export interface TopicSentiment {
  topic: string;
  avgScore: number;
  count: number;
}

export type ContactSortBy = "healthScore" | "totalInteractions" | "updatedAt";

interface Pagination {
  hasMore: boolean;
  nextCursor?: string;
}

interface PaginatedResult<T> {
  data: T[];
  pagination?: Pagination;
}

// ─── Sentiment Timeline API (/v1/sentiment) ──────────────────────────────────

export const sentimentTimelineApi = {
  /** GET /v1/sentiment/dashboard — aggregate stats + top/bottom contacts. */
  dashboard(): Promise<{ data: SentimentDashboard }> {
    return sentimentFetch<{ data: SentimentDashboard }>(
      "/v1/sentiment/dashboard",
    );
  },

  /** GET /v1/sentiment/contacts — relationship-health list, cursor-paginated. */
  contacts(options?: {
    riskLevel?: RiskLevel;
    sortBy?: ContactSortBy;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResult<RelationshipHealth>> {
    const params = new URLSearchParams();
    if (options?.riskLevel) params.set("riskLevel", options.riskLevel);
    if (options?.sortBy) params.set("sortBy", options.sortBy);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return sentimentFetch<PaginatedResult<RelationshipHealth>>(
      `/v1/sentiment/contacts${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/sentiment/contacts/:contactEmail — one contact's health record. */
  contact(contactEmail: string): Promise<{ data: RelationshipHealth }> {
    return sentimentFetch<{ data: RelationshipHealth }>(
      `/v1/sentiment/contacts/${encodeURIComponent(contactEmail)}`,
    );
  },

  /** GET /v1/sentiment/timeline — per-email sentiment entries, cursor-paginated. */
  timeline(options?: {
    contactEmail?: string;
    days?: number;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResult<SentimentEntry>> {
    const params = new URLSearchParams();
    if (options?.contactEmail) params.set("contactEmail", options.contactEmail);
    if (options?.days !== undefined) params.set("days", String(options.days));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return sentimentFetch<PaginatedResult<SentimentEntry>>(
      `/v1/sentiment/timeline${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/sentiment/timeline/:contactEmail — one contact's timeline (max 100). */
  contactTimeline(contactEmail: string): Promise<{ data: SentimentEntry[] }> {
    return sentimentFetch<{ data: SentimentEntry[] }>(
      `/v1/sentiment/timeline/${encodeURIComponent(contactEmail)}`,
    );
  },

  /** GET /v1/sentiment/alerts — contacts whose relationship is declining. */
  alerts(): Promise<{ data: RelationshipHealth[] }> {
    return sentimentFetch<{ data: RelationshipHealth[] }>(
      "/v1/sentiment/alerts",
    );
  },

  /** GET /v1/sentiment/trends — aggregate sentiment over time. */
  trends(options?: {
    period?: "daily" | "weekly" | "monthly";
    days?: number;
  }): Promise<{ data: TrendPoint[] }> {
    const params = new URLSearchParams();
    if (options?.period) params.set("period", options.period);
    if (options?.days !== undefined) params.set("days", String(options.days));
    const qs = params.toString();
    return sentimentFetch<{ data: TrendPoint[] }>(
      `/v1/sentiment/trends${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/sentiment/topics — most-discussed topics with average sentiment. */
  topics(): Promise<{ data: TopicSentiment[] }> {
    return sentimentFetch<{ data: TopicSentiment[] }>("/v1/sentiment/topics");
  },
};
