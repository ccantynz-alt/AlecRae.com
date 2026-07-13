/**
 * API client for the Context Intelligence feature domain
 * (apps/api/src/routes/context-intelligence.ts) — action items, deadlines,
 * and promises/commitments extracted from email by AI.
 *
 * NB: the router is mounted at /v1/context in server.ts
 * (`app.route("/v1/context", contextIntelligenceRouter)`).
 *
 * Covers all 12 backend endpoints:
 *   POST /v1/context/extract               — extract action items, deadlines, promises from one email
 *   GET  /v1/context/action-items          — list action items (status/priority/assignedTo filters, cursor)
 *   GET  /v1/context/action-items/:id      — get one action item
 *   PUT  /v1/context/action-items/:id      — update action item status
 *   GET  /v1/context/deadlines             — list deadlines (days/overdue filters, cursor)
 *   GET  /v1/context/deadlines/upcoming    — next-7-days + overdue summary
 *   POST /v1/context/deadlines/:id/remind  — set a reminder for a deadline
 *   GET  /v1/context/promises              — list promises (status/direction filters, cursor)
 *   PUT  /v1/context/promises/:id          — update promise status
 *   GET  /v1/context/promises/follow-up    — active promises needing follow-up
 *   GET  /v1/context/dashboard             — aggregate counts dashboard
 *   POST /v1/context/batch-extract         — batch extract from up to 25 emails
 *
 * Mirrors the module-private featureFetch wrapper in lib/api-features.ts so
 * this domain has its own typed entry point with silent 401 → refresh → retry
 * handling (same pattern as lib/api-delegation.ts).
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface ContextApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function contextFetch<T>(
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
      return contextFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as ContextApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Action item types ───────────────────────────────────────────────────────

export type ActionItemStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "dismissed";

export type ActionItemPriority = "urgent" | "high" | "medium" | "low";

export interface ActionItem {
  id: string;
  accountId: string;
  emailId: string;
  threadId: string;
  actionText: string;
  assignedTo: string | null;
  dueDate: string | null;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  confidence: number;
  source: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionItemListResult {
  data: ActionItem[];
  cursor: string | null;
  hasMore: boolean;
}

export interface ListActionItemsOptions {
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
  assignedTo?: string;
  limit?: number;
  cursor?: string;
}

// ─── Deadline types ──────────────────────────────────────────────────────────

export interface EmailDeadline {
  id: string;
  accountId?: string;
  emailId: string;
  threadId: string;
  deadlineDate: string;
  description: string;
  isExplicit: boolean;
  confidence: number;
  reminderSent?: boolean;
  reminderAt?: string | null;
  createdAt: string;
}

export interface DeadlineListResult {
  data: EmailDeadline[];
  cursor: string | null;
  hasMore: boolean;
}

export interface UpcomingDeadlinesData {
  upcoming: EmailDeadline[];
  overdue: EmailDeadline[];
  totalUpcoming: number;
  totalOverdue: number;
}

export interface ListDeadlinesOptions {
  days?: number;
  overdue?: boolean;
  limit?: number;
  cursor?: string;
}

// ─── Promise types ───────────────────────────────────────────────────────────

export type PromiseStatus = "active" | "fulfilled" | "broken" | "expired";
export type PromiseDirection = "made" | "received";

export interface EmailPromise {
  id: string;
  accountId?: string;
  emailId: string;
  threadId: string;
  promiseText: string;
  promisor: string;
  promisee: string;
  dueDate: string | null;
  status: PromiseStatus;
  confidence: number;
  followUpSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromiseListResult {
  data: EmailPromise[];
  cursor: string | null;
  hasMore: boolean;
}

export interface FollowUpData {
  overdue: EmailPromise[];
  upcoming: EmailPromise[];
  totalNeedingFollowUp: number;
}

export interface ListPromisesOptions {
  status?: PromiseStatus;
  direction?: PromiseDirection;
  limit?: number;
  cursor?: string;
}

// ─── Extraction + dashboard types ────────────────────────────────────────────

export interface ExtractPayload {
  emailId: string;
  content: string;
  threadId?: string;
  participants?: string[];
}

export interface ExtractedActionItemSummary {
  id: string;
  actionText: string;
  assignedTo: string | null;
  dueDate: string | null;
  priority: ActionItemPriority;
  confidence: number;
}

export interface ExtractedDeadlineSummary {
  id: string;
  deadlineDate: string;
  description: string;
  isExplicit: boolean;
  confidence: number;
}

export interface ExtractedPromiseSummary {
  id: string;
  promiseText: string;
  promisor: string;
  promisee: string;
  dueDate: string | null;
  confidence: number;
}

export interface ExtractResult {
  emailId: string;
  threadId: string;
  actionItems: ExtractedActionItemSummary[];
  deadlines: ExtractedDeadlineSummary[];
  promises: ExtractedPromiseSummary[];
}

export interface BatchExtractResultEntry {
  emailId: string;
  threadId: string;
  actionItems: number;
  deadlines: number;
  promises: number;
}

export interface ContextDashboard {
  actionItems: {
    pending: number;
    completed: number;
    total: number;
    completionRate: number;
  };
  deadlines: {
    upcoming: number;
    overdue: number;
  };
  promises: {
    active: number;
    needingFollowUp: number;
  };
}

// ─── Context Intelligence API (/v1/context) ──────────────────────────────────

export const contextIntelligenceApi = {
  /** POST /v1/context/extract — extract action items, deadlines, promises from an email. */
  extract(payload: ExtractPayload): Promise<{ data: ExtractResult }> {
    return contextFetch<{ data: ExtractResult }>("/v1/context/extract", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/context/action-items — list action items, cursor-paginated. */
  listActionItems(
    options?: ListActionItemsOptions,
  ): Promise<ActionItemListResult> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.priority) params.set("priority", options.priority);
    if (options?.assignedTo) params.set("assignedTo", options.assignedTo);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return contextFetch<ActionItemListResult>(
      `/v1/context/action-items${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/context/action-items/:id — get a single action item. */
  getActionItem(id: string): Promise<{ data: ActionItem }> {
    return contextFetch<{ data: ActionItem }>(
      `/v1/context/action-items/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/context/action-items/:id — update an action item's status. */
  updateActionItem(
    id: string,
    status: ActionItemStatus,
    completedAt?: string | null,
  ): Promise<{
    data: {
      id: string;
      status: ActionItemStatus;
      completedAt: string | null;
      updatedAt: string;
    };
  }> {
    return contextFetch<{
      data: {
        id: string;
        status: ActionItemStatus;
        completedAt: string | null;
        updatedAt: string;
      };
    }>(`/v1/context/action-items/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(
        completedAt !== undefined ? { status, completedAt } : { status },
      ),
    });
  },

  /** GET /v1/context/deadlines — list deadlines, cursor-paginated. */
  listDeadlines(options?: ListDeadlinesOptions): Promise<DeadlineListResult> {
    const params = new URLSearchParams();
    if (options?.days !== undefined) params.set("days", String(options.days));
    if (options?.overdue !== undefined)
      params.set("overdue", String(options.overdue));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return contextFetch<DeadlineListResult>(
      `/v1/context/deadlines${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/context/deadlines/upcoming — next-7-days + overdue deadline summary. */
  upcomingDeadlines(): Promise<{ data: UpcomingDeadlinesData }> {
    return contextFetch<{ data: UpcomingDeadlinesData }>(
      "/v1/context/deadlines/upcoming",
    );
  },

  /** POST /v1/context/deadlines/:id/remind — set a reminder for a deadline. */
  setDeadlineReminder(
    id: string,
    reminderAt: string,
  ): Promise<{ data: { id: string; reminderAt: string; reminderSent: boolean } }> {
    return contextFetch<{
      data: { id: string; reminderAt: string; reminderSent: boolean };
    }>(`/v1/context/deadlines/${encodeURIComponent(id)}/remind`, {
      method: "POST",
      body: JSON.stringify({ reminderAt }),
    });
  },

  /** GET /v1/context/promises — list promises, cursor-paginated. */
  listPromises(options?: ListPromisesOptions): Promise<PromiseListResult> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.direction) params.set("direction", options.direction);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return contextFetch<PromiseListResult>(
      `/v1/context/promises${qs ? `?${qs}` : ""}`,
    );
  },

  /** PUT /v1/context/promises/:id — update a promise's status. */
  updatePromise(
    id: string,
    status: PromiseStatus,
  ): Promise<{ data: { id: string; status: PromiseStatus; updatedAt: string } }> {
    return contextFetch<{
      data: { id: string; status: PromiseStatus; updatedAt: string };
    }>(`/v1/context/promises/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  },

  /** GET /v1/context/promises/follow-up — active promises needing follow-up. */
  promisesNeedingFollowUp(): Promise<{ data: FollowUpData }> {
    return contextFetch<{ data: FollowUpData }>(
      "/v1/context/promises/follow-up",
    );
  },

  /** GET /v1/context/dashboard — aggregate action-item/deadline/promise counts. */
  dashboard(): Promise<{ data: ContextDashboard }> {
    return contextFetch<{ data: ContextDashboard }>("/v1/context/dashboard");
  },

  /** POST /v1/context/batch-extract — extract from up to 25 emails at once. */
  batchExtract(emails: ExtractPayload[]): Promise<{
    data: { processed: number; results: BatchExtractResultEntry[] };
  }> {
    return contextFetch<{
      data: { processed: number; results: BatchExtractResultEntry[] };
    }>("/v1/context/batch-extract", {
      method: "POST",
      body: JSON.stringify({ emails }),
    });
  },
};
