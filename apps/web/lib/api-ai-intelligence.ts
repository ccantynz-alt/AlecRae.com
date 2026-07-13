/**
 * API client for the AI Intelligence Hub feature domain
 * (apps/api/src/routes/ai-intelligence.ts).
 *
 * Covers all 13 backend endpoints (router mounted at /v1/ai-intelligence in
 * server.ts — verified against the mount, not the route-file header):
 *   POST /v1/ai-intelligence/priority/score                — score an email's priority
 *   GET  /v1/ai-intelligence/priority/:emailId             — get priority score
 *   GET  /v1/ai-intelligence/relationships                 — list relationship insights (cursor pagination)
 *   GET  /v1/ai-intelligence/relationships/:contactEmail   — get insight for a contact
 *   POST /v1/ai-intelligence/smart-replies/generate        — generate smart replies
 *   GET  /v1/ai-intelligence/smart-replies/:emailId        — get smart replies for email
 *   POST /v1/ai-intelligence/smart-replies/:id/select      — mark a reply as selected
 *   POST /v1/ai-intelligence/sentiment/analyze             — analyze email sentiment
 *   GET  /v1/ai-intelligence/sentiment/:emailId            — get sentiment for email
 *   POST /v1/ai-intelligence/writing-coach/analyze         — analyze draft quality (backend placeholder scores)
 *   POST /v1/ai-intelligence/predictive-actions/predict    — predict user action (backend placeholder)
 *   GET  /v1/ai-intelligence/predictive-actions/:emailId   — get prediction for email
 *   POST /v1/ai-intelligence/predictive-actions/:id/feedback — submit actual action taken
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts (module-private
 * there) so this domain has its own typed entry point with silent
 * 401 → refresh → retry-once handling.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface AiIntelligenceApiErrorBody {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

/** Error carrying the HTTP status so callers can treat 404 as "no data yet". */
export class AiIntelligenceRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiIntelligenceRequestError";
    this.status = status;
    this.code = code;
  }
}

async function aiIntelligenceFetch<T>(
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
      return aiIntelligenceFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as AiIntelligenceApiErrorBody | null;
    throw new AiIntelligenceRequestError(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
      res.status,
      errorBody?.error?.code,
    );
  }

  return res.json() as Promise<T>;
}

/** Fetch a resource that legitimately 404s when no analysis exists yet. */
async function fetchOrNull<T>(path: string): Promise<T | null> {
  try {
    return await aiIntelligenceFetch<T>(path);
  } catch (err) {
    if (err instanceof AiIntelligenceRequestError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// ─── Types (mirror packages/db/src/schema/ai-intelligence.ts, JSON-serialized) ─

export type UrgencyLevel = "critical" | "high" | "medium" | "low" | "none";

export type EmailSentimentValue =
  | "positive"
  | "negative"
  | "neutral"
  | "urgent"
  | "angry"
  | "grateful"
  | "confused";

export interface ContentSignals {
  hasDeadline: boolean;
  hasQuestion: boolean;
  hasMoneyConcern: boolean;
  hasActionRequired: boolean;
  mentionsAttachment: boolean;
  isReplyChain: boolean;
  threadLength: number;
}

export interface EmailPriorityScore {
  id: string;
  accountId: string;
  emailId: string;
  score: number;
  urgencyLevel: UrgencyLevel;
  reasoning: string;
  senderImportance: number;
  contentSignals: ContentSignals;
  predictedAction: string | null;
  confidence: number;
  scoredAt: string;
}

export interface RelationshipInsight {
  id: string;
  accountId: string;
  contactEmail: string;
  contactName: string | null;
  relationshipScore: number;
  lastContactedAt: string | null;
  avgResponseTimeHours: number | null;
  emailFrequency: string;
  sentiment: string;
  topTopics: string[];
  fadingAlert: boolean;
  suggestedAction: string | null;
  updatedAt: string;
}

export interface RelationshipListResult {
  data: RelationshipInsight[];
  cursor: string | null;
  hasMore: boolean;
}

export interface SmartReplyOption {
  text: string;
  confidence: number;
  tone: string;
}

export interface SmartReplySet {
  id: string;
  accountId: string;
  emailId: string;
  replies: SmartReplyOption[];
  generatedAt: string;
  selectedReply: string | null;
  wasUsed: boolean;
}

export interface SelectReplyResult {
  id: string;
  selectedReply: string;
  wasUsed: boolean;
}

export interface EmailSentiment {
  id: string;
  emailId: string;
  accountId: string;
  sentiment: EmailSentimentValue;
  confidence: number;
  keywords: string[];
  analyzedAt: string;
}

export interface WritingCoachSuggestion {
  type: string;
  original: string;
  suggested: string;
  reason: string;
}

export interface WritingCoachResult {
  id: string;
  accountId: string;
  emailId: string | null;
  clarityScore: number;
  toneScore: number;
  persuasivenessScore: number;
  suggestions: WritingCoachSuggestion[];
  overallGrade: string;
  analyzedAt: string;
}

export interface PredictiveAction {
  id: string;
  accountId: string;
  emailId: string;
  predictedAction: string;
  confidence: number;
  reasoning: string;
  userAction: string | null;
  wasAccurate: boolean | null;
  predictedAt: string;
}

export interface ActionFeedbackResult {
  id: string;
  predictedAction: string;
  userAction: string;
  wasAccurate: boolean;
}

export interface WritingCoachPayload {
  emailId?: string;
  content?: string;
}

export interface ListRelationshipsOptions {
  limit?: number;
  cursor?: string;
  fadingOnly?: boolean;
}

// ─── AI Intelligence API (/v1/ai-intelligence) ───────────────────────────────

export const aiIntelligenceApi = {
  /** POST /v1/ai-intelligence/priority/score — score an email's priority (idempotent per email). */
  scorePriority(emailId: string): Promise<{ data: EmailPriorityScore }> {
    return aiIntelligenceFetch<{ data: EmailPriorityScore }>(
      "/v1/ai-intelligence/priority/score",
      { method: "POST", body: JSON.stringify({ emailId }) },
    );
  },

  /** GET /v1/ai-intelligence/priority/:emailId — existing score, or null if not scored yet. */
  getPriority(emailId: string): Promise<{ data: EmailPriorityScore } | null> {
    return fetchOrNull<{ data: EmailPriorityScore }>(
      `/v1/ai-intelligence/priority/${encodeURIComponent(emailId)}`,
    );
  },

  /** GET /v1/ai-intelligence/relationships — cursor-paginated relationship insights. */
  listRelationships(
    options?: ListRelationshipsOptions,
  ): Promise<RelationshipListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.fadingOnly !== undefined) {
      params.set("fadingOnly", options.fadingOnly ? "true" : "false");
    }
    const qs = params.toString();
    return aiIntelligenceFetch<RelationshipListResult>(
      `/v1/ai-intelligence/relationships${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/ai-intelligence/relationships/:contactEmail — insight for one contact, or null. */
  getRelationship(
    contactEmail: string,
  ): Promise<{ data: RelationshipInsight } | null> {
    return fetchOrNull<{ data: RelationshipInsight }>(
      `/v1/ai-intelligence/relationships/${encodeURIComponent(contactEmail)}`,
    );
  },

  /** POST /v1/ai-intelligence/smart-replies/generate — generate reply suggestions. */
  generateSmartReplies(emailId: string): Promise<{ data: SmartReplySet }> {
    return aiIntelligenceFetch<{ data: SmartReplySet }>(
      "/v1/ai-intelligence/smart-replies/generate",
      { method: "POST", body: JSON.stringify({ emailId }) },
    );
  },

  /** GET /v1/ai-intelligence/smart-replies/:emailId — latest reply set, or null. */
  getSmartReplies(emailId: string): Promise<{ data: SmartReplySet } | null> {
    return fetchOrNull<{ data: SmartReplySet }>(
      `/v1/ai-intelligence/smart-replies/${encodeURIComponent(emailId)}`,
    );
  },

  /** POST /v1/ai-intelligence/smart-replies/:id/select — mark a reply as the one used. */
  selectSmartReply(
    id: string,
    selectedReply: string,
  ): Promise<{ data: SelectReplyResult }> {
    return aiIntelligenceFetch<{ data: SelectReplyResult }>(
      `/v1/ai-intelligence/smart-replies/${encodeURIComponent(id)}/select`,
      { method: "POST", body: JSON.stringify({ selectedReply }) },
    );
  },

  /** POST /v1/ai-intelligence/sentiment/analyze — analyze email sentiment (idempotent per email). */
  analyzeSentiment(emailId: string): Promise<{ data: EmailSentiment }> {
    return aiIntelligenceFetch<{ data: EmailSentiment }>(
      "/v1/ai-intelligence/sentiment/analyze",
      { method: "POST", body: JSON.stringify({ emailId }) },
    );
  },

  /** GET /v1/ai-intelligence/sentiment/:emailId — existing sentiment, or null. */
  getSentiment(emailId: string): Promise<{ data: EmailSentiment } | null> {
    return fetchOrNull<{ data: EmailSentiment }>(
      `/v1/ai-intelligence/sentiment/${encodeURIComponent(emailId)}`,
    );
  },

  /** POST /v1/ai-intelligence/writing-coach/analyze — score a draft (emailId or raw content). */
  analyzeWriting(
    payload: WritingCoachPayload,
  ): Promise<{ data: WritingCoachResult }> {
    return aiIntelligenceFetch<{ data: WritingCoachResult }>(
      "/v1/ai-intelligence/writing-coach/analyze",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** POST /v1/ai-intelligence/predictive-actions/predict — predict the user's next action. */
  predictAction(emailId: string): Promise<{ data: PredictiveAction }> {
    return aiIntelligenceFetch<{ data: PredictiveAction }>(
      "/v1/ai-intelligence/predictive-actions/predict",
      { method: "POST", body: JSON.stringify({ emailId }) },
    );
  },

  /** GET /v1/ai-intelligence/predictive-actions/:emailId — latest prediction, or null. */
  getPrediction(emailId: string): Promise<{ data: PredictiveAction } | null> {
    return fetchOrNull<{ data: PredictiveAction }>(
      `/v1/ai-intelligence/predictive-actions/${encodeURIComponent(emailId)}`,
    );
  },

  /** POST /v1/ai-intelligence/predictive-actions/:id/feedback — record what the user actually did. */
  submitActionFeedback(
    id: string,
    userAction: string,
  ): Promise<{ data: ActionFeedbackResult }> {
    return aiIntelligenceFetch<{ data: ActionFeedbackResult }>(
      `/v1/ai-intelligence/predictive-actions/${encodeURIComponent(id)}/feedback`,
      { method: "POST", body: JSON.stringify({ userAction }) },
    );
  },
};
