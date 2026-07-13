/**
 * API client for the Email Delegation + Shared Drafts feature domain
 * (apps/api/src/routes/delegation.ts).
 *
 * Covers all 12 backend endpoints:
 *   POST   /v1/delegation                       — create delegation
 *   GET    /v1/delegation?role=&limit=&cursor=  — list delegations
 *   PUT    /v1/delegation/:id                   — update delegation
 *   DELETE /v1/delegation/:id                   — revoke delegation
 *   GET    /v1/delegation/inbox                 — delegated inbox (backend placeholder)
 *   POST   /v1/shared-drafts                    — create shared draft
 *   GET    /v1/shared-drafts?status=&cursor=    — list shared drafts
 *   GET    /v1/shared-drafts/:id                — get draft + comments
 *   PUT    /v1/shared-drafts/:id                — update draft
 *   POST   /v1/shared-drafts/:id/comment        — add comment
 *   POST   /v1/shared-drafts/:id/submit-review  — submit for review
 *   POST   /v1/shared-drafts/:id/approve        — approve draft
 *
 * NB: the router is mounted at /v1/delegation (singular) in server.ts — the
 * plural /v1/delegations paths in the route file's doc comments (and in the
 * older lib/api.ts delegationsApi) do not exist on the server.
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts (not exported from
 * there) so this domain has its own typed entry point with silent 401 →
 * refresh → retry handling.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface DelegationApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function delegationFetch<T>(
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
      return delegationFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as DelegationApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Delegation types ────────────────────────────────────────────────────────

export type DelegationScope = "all" | "label" | "sender" | "thread";

export interface DelegationPermissions {
  canReply: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canForward: boolean;
}

export interface EmailDelegation {
  id: string;
  accountId: string;
  delegatorUserId: string;
  delegateUserId: string;
  scope: DelegationScope;
  scopeValue: string | null;
  permissions: DelegationPermissions;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DelegationListResult {
  data: EmailDelegation[];
  cursor: string | null;
  hasMore: boolean;
}

export interface CreateDelegationPayload {
  delegateUserId: string;
  scope: DelegationScope;
  scopeValue?: string | null;
  permissions: DelegationPermissions;
  expiresAt?: string | null;
}

export interface UpdateDelegationPayload {
  scope?: DelegationScope;
  scopeValue?: string | null;
  permissions?: Partial<DelegationPermissions>;
  isActive?: boolean;
  expiresAt?: string | null;
}

/** Delegation shape returned by the delegated-inbox endpoint (no delegate field — it's always the current user). */
export interface InboxDelegation {
  id: string;
  accountId: string;
  delegatorUserId: string;
  scope: DelegationScope;
  scopeValue: string | null;
  permissions: DelegationPermissions;
  expiresAt: string | null;
}

/** Email shape for the delegated inbox. The backend is a documented placeholder
 * (always returns []), so all fields are optional and rendered defensively. */
export interface DelegatedEmail {
  id?: string;
  subject?: string;
  from?: string;
  snippet?: string;
  receivedAt?: string;
}

export interface DelegationInboxData {
  delegations: InboxDelegation[];
  emails: DelegatedEmail[];
  message?: string;
}

// ─── Shared draft types ──────────────────────────────────────────────────────

export type SharedDraftStatus = "draft" | "review" | "approved" | "sent";

export interface SharedDraftComment {
  userId: string;
  text: string;
  createdAt: string;
}

export interface SharedDraft {
  id: string;
  accountId: string;
  creatorUserId: string;
  subject: string;
  body: string;
  toRecipients: string[];
  ccRecipients: string[];
  status: SharedDraftStatus;
  reviewers: string[];
  comments: SharedDraftComment[];
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedDraftListResult {
  data: SharedDraft[];
  cursor: string | null;
  hasMore: boolean;
}

export interface CreateSharedDraftPayload {
  subject: string;
  body: string;
  toRecipients?: string[];
  ccRecipients?: string[];
  reviewers?: string[];
  threadId?: string | null;
}

export interface UpdateSharedDraftPayload {
  subject?: string;
  body?: string;
  toRecipients?: string[];
  ccRecipients?: string[];
  reviewers?: string[];
}

// ─── Delegation API (/v1/delegation) ─────────────────────────────────────────

export const delegationApi = {
  /** POST /v1/delegation — create a delegation. */
  create(payload: CreateDelegationPayload): Promise<{ data: EmailDelegation }> {
    return delegationFetch<{ data: EmailDelegation }>("/v1/delegation", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/delegation — list delegations for the given role, cursor-paginated. */
  list(
    role: "delegator" | "delegate",
    options?: { limit?: number; cursor?: string },
  ): Promise<DelegationListResult> {
    const params = new URLSearchParams({ role });
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    return delegationFetch<DelegationListResult>(
      `/v1/delegation?${params.toString()}`,
    );
  },

  /** PUT /v1/delegation/:id — update scope, permissions, isActive, expiry. */
  update(
    id: string,
    payload: UpdateDelegationPayload,
  ): Promise<{ data: EmailDelegation }> {
    return delegationFetch<{ data: EmailDelegation }>(
      `/v1/delegation/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/delegation/:id — revoke a delegation. */
  revoke(id: string): Promise<{ deleted: boolean; id: string }> {
    return delegationFetch<{ deleted: boolean; id: string }>(
      `/v1/delegation/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** GET /v1/delegation/inbox — emails delegated to the current user (backend placeholder). */
  inbox(): Promise<{ data: DelegationInboxData }> {
    return delegationFetch<{ data: DelegationInboxData }>(
      "/v1/delegation/inbox",
    );
  },
};

// ─── Shared Drafts API (/v1/shared-drafts) ───────────────────────────────────

export const sharedDraftsApi = {
  /** POST /v1/shared-drafts — create a shared draft. */
  create(payload: CreateSharedDraftPayload): Promise<{ data: SharedDraft }> {
    return delegationFetch<{ data: SharedDraft }>("/v1/shared-drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/shared-drafts — list shared drafts, optionally by status, cursor-paginated. */
  list(options?: {
    status?: SharedDraftStatus;
    limit?: number;
    cursor?: string;
  }): Promise<SharedDraftListResult> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return delegationFetch<SharedDraftListResult>(
      `/v1/shared-drafts${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/shared-drafts/:id — get a shared draft with its comments. */
  get(id: string): Promise<{ data: SharedDraft }> {
    return delegationFetch<{ data: SharedDraft }>(
      `/v1/shared-drafts/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/shared-drafts/:id — update subject, body, recipients, reviewers. */
  update(
    id: string,
    payload: UpdateSharedDraftPayload,
  ): Promise<{ data: SharedDraft }> {
    return delegationFetch<{ data: SharedDraft }>(
      `/v1/shared-drafts/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** POST /v1/shared-drafts/:id/comment — add a comment. */
  addComment(
    id: string,
    text: string,
  ): Promise<{
    data: {
      id: string;
      comment: SharedDraftComment;
      totalComments: number;
      updatedAt: string;
    };
  }> {
    return delegationFetch<{
      data: {
        id: string;
        comment: SharedDraftComment;
        totalComments: number;
        updatedAt: string;
      };
    }>(`/v1/shared-drafts/${encodeURIComponent(id)}/comment`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  /** POST /v1/shared-drafts/:id/submit-review — move draft → review. */
  submitReview(id: string): Promise<{
    data: { id: string; status: SharedDraftStatus; reviewers: string[]; updatedAt: string };
  }> {
    return delegationFetch<{
      data: { id: string; status: SharedDraftStatus; reviewers: string[]; updatedAt: string };
    }>(`/v1/shared-drafts/${encodeURIComponent(id)}/submit-review`, {
      method: "POST",
    });
  },

  /** POST /v1/shared-drafts/:id/approve — move review → approved. */
  approve(id: string): Promise<{
    data: { id: string; status: SharedDraftStatus; updatedAt: string };
  }> {
    return delegationFetch<{
      data: { id: string; status: SharedDraftStatus; updatedAt: string };
    }>(`/v1/shared-drafts/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    });
  },
};
