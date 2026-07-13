/**
 * API client for the Notification Intelligence feature domain
 * (apps/api/src/routes/notification-intelligence.ts).
 *
 * Covers the notification-intelligence endpoints (the focus-session half of
 * that route file already has UI at /focus and is not duplicated here):
 *   GET    /v1/notifications/rules?limit=&cursor=   — list AI notification rules
 *   POST   /v1/notifications/rules                  — create rule
 *   PUT    /v1/notifications/rules/:id              — update rule (toggle, rename, reprioritise)
 *   DELETE /v1/notifications/rules/:id              — delete rule
 *   POST   /v1/notifications/evaluate               — evaluate how an email would be notified
 *   GET    /v1/notifications/batches?limit=&cursor= — pending (undelivered) notification batches
 *   POST   /v1/notifications/batches/:id/deliver    — deliver a batch now
 *   GET    /v1/notifications/digest                 — AI notification digest summary
 *
 * Mount verified in apps/api/src/server.ts: `app.route("/v1/notifications", notificationsRouter)`.
 *
 * Mirrors the 401 → refreshSession → retry wrapper pattern from
 * lib/api-delegation.ts (featureFetch in lib/api-features.ts is module-private).
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface NotificationIntelligenceApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function niFetch<T>(
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
      return niFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as NotificationIntelligenceApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Rule types ──────────────────────────────────────────────────────────────

export type NotificationRuleAction =
  | "notify_immediately"
  | "batch_hourly"
  | "batch_daily"
  | "suppress"
  | "summary_only";

export interface RuleTimeRange {
  start: string;
  end: string;
}

export interface RuleConditions {
  senderVip?: boolean;
  urgencyMin?: number;
  keywords?: string[];
  labels?: string[];
  timeRange?: RuleTimeRange;
}

export interface NotificationRule {
  id: string;
  name: string;
  conditions: RuleConditions;
  action: NotificationRuleAction;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleListResult {
  data: NotificationRule[];
  cursor: string | null;
  hasMore: boolean;
}

export interface CreateRulePayload {
  name: string;
  conditions: RuleConditions;
  action: NotificationRuleAction;
  isActive?: boolean;
  priority?: number;
}

export interface UpdateRulePayload {
  name?: string;
  conditions?: RuleConditions;
  action?: NotificationRuleAction;
  isActive?: boolean;
  priority?: number;
}

export interface CreatedRule {
  id: string;
  name: string;
  conditions: RuleConditions;
  action: NotificationRuleAction;
  isActive: boolean;
  priority: number;
  createdAt: string;
}

// ─── Evaluate types ──────────────────────────────────────────────────────────

export interface EvaluatePayload {
  emailId: string;
  from: string;
  subject: string;
  urgencyScore?: number;
}

/** Union of the three evaluate outcomes: focus-deferred, rule-matched, default. */
export interface EvaluateResult {
  emailId: string;
  action: NotificationRuleAction | "deferred";
  matchedRule?: { id: string; name: string; priority: number } | null;
  reason?: string;
  focusMode?: string;
  endsAt?: string;
}

// ─── Batch + digest types ────────────────────────────────────────────────────

export interface NotificationBatch {
  id: string;
  emailIds: string[];
  scheduledFor: string;
  summary: string | null;
  createdAt: string;
}

export interface BatchListResult {
  data: NotificationBatch[];
  cursor: string | null;
  hasMore: boolean;
}

export interface DeliverBatchResult {
  id: string;
  delivered?: boolean;
  alreadyDelivered?: boolean;
  deliveredAt: string;
  emailCount?: number;
}

export interface DigestBatchSummary {
  id: string;
  emailCount: number;
  scheduledFor: string;
  summary: string | null;
}

export interface NotificationDigest {
  pendingBatchCount: number;
  totalPendingEmails: number;
  batches: DigestBatchSummary[];
  activeRuleCount: number;
  focusSession: {
    id: string;
    mode: string;
    endsAt: string;
    emailsDeferred: number;
  } | null;
  generatedAt: string;
}

// ─── Notification Intelligence API (/v1/notifications) ──────────────────────

export const notificationIntelligenceApi = {
  /** GET /v1/notifications/rules — list rules, cursor-paginated. */
  listRules(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<RuleListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return niFetch<RuleListResult>(
      `/v1/notifications/rules${qs ? `?${qs}` : ""}`,
    );
  },

  /** POST /v1/notifications/rules — create a rule. */
  createRule(payload: CreateRulePayload): Promise<{ data: CreatedRule }> {
    return niFetch<{ data: CreatedRule }>("/v1/notifications/rules", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** PUT /v1/notifications/rules/:id — update a rule (toggle active, etc.). */
  updateRule(
    id: string,
    payload: UpdateRulePayload,
  ): Promise<{ data: { id: string; updatedAt: string } }> {
    return niFetch<{ data: { id: string; updatedAt: string } }>(
      `/v1/notifications/rules/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/notifications/rules/:id — delete a rule. */
  deleteRule(id: string): Promise<{ deleted: boolean; id: string }> {
    return niFetch<{ deleted: boolean; id: string }>(
      `/v1/notifications/rules/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** POST /v1/notifications/evaluate — dry-run how an email would be handled. */
  evaluate(payload: EvaluatePayload): Promise<{ data: EvaluateResult }> {
    return niFetch<{ data: EvaluateResult }>("/v1/notifications/evaluate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/notifications/batches — pending (undelivered) batches. */
  listBatches(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<BatchListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return niFetch<BatchListResult>(
      `/v1/notifications/batches${qs ? `?${qs}` : ""}`,
    );
  },

  /** POST /v1/notifications/batches/:id/deliver — deliver a batch immediately. */
  deliverBatch(id: string): Promise<{ data: DeliverBatchResult }> {
    return niFetch<{ data: DeliverBatchResult }>(
      `/v1/notifications/batches/${encodeURIComponent(id)}/deliver`,
      { method: "POST" },
    );
  },

  /** GET /v1/notifications/digest — AI notification digest summary. */
  getDigest(): Promise<{ data: NotificationDigest }> {
    return niFetch<{ data: NotificationDigest }>("/v1/notifications/digest");
  },
};
