/**
 * API client for the inbox "power" feature domains:
 *   - Labels          (apps/api/src/routes/labels.ts,       mounted /v1/labels)
 *   - Bulk actions    (apps/api/src/routes/bulk-actions.ts, mounted /v1/bulk)
 *   - Thread mutes    (apps/api/src/routes/thread-mutes.ts, mounted /v1/threads)
 *
 * Endpoints wired (METHOD  true-path):
 *   Labels
 *     POST   /v1/labels                 — create a label
 *     GET    /v1/labels                 — list labels (nested tree)
 *     PUT    /v1/labels/:id             — update a label
 *     DELETE /v1/labels/:id             — delete a label
 *     POST   /v1/labels/:id/apply       — apply a label to email(s)
 *     DELETE /v1/labels/:id/apply       — remove a label from email(s)
 *   Bulk actions (all POST, up to 500 email IDs at once)
 *     POST   /v1/bulk/archive | /delete | /read | /unread | /star | /unstar
 *     POST   /v1/bulk/label             — apply a label ID to emails (tag-based)
 *     POST   /v1/bulk/move              — move emails to a folder
 *   Thread mutes
 *     POST   /v1/threads/:threadId/mute — mute a thread
 *     DELETE /v1/threads/:threadId/mute — unmute a thread
 *     GET    /v1/threads/:threadId/mute — check mute state
 *     GET    /v1/threads/muted          — list muted threads
 *
 * Mirrors the silent 401 → refreshSession → retry pattern from
 * lib/api-delegation.ts so these domains have their own typed entry point.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface InboxPowerApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function inboxPowerFetch<T>(
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
      return inboxPowerFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as InboxPowerApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Label types ───────────────────────────────────────────────────────────────

export interface Label {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  sortOrder: number;
  isSystem: boolean;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A label with its nested children (GET /v1/labels returns a tree). */
export interface LabelTreeNode extends Label {
  children: LabelTreeNode[];
}

export interface CreateLabelPayload {
  name: string;
  color?: string;
  parentId?: string | null;
  sortOrder?: number;
  isShared?: boolean;
}

export interface UpdateLabelPayload {
  name?: string;
  color?: string;
  parentId?: string | null;
  sortOrder?: number;
  isShared?: boolean;
}

// ─── Bulk-action types ─────────────────────────────────────────────────────────

export type BulkAction =
  | "archive"
  | "delete"
  | "read"
  | "unread"
  | "star"
  | "unstar";

export interface BulkActionResult {
  data: {
    action: string;
    count: number;
    updatedAt: string;
  };
}

// ─── Thread-mute types ─────────────────────────────────────────────────────────

export interface MutedThread {
  id: string;
  threadId: string;
  expiresAt: string | null;
  createdAt: string;
}

// ─── Labels API (/v1/labels) ────────────────────────────────────────────────────

export const labelsApi = {
  /** GET /v1/labels — list labels as a nested tree. */
  list(): Promise<{ data: LabelTreeNode[]; total: number }> {
    return inboxPowerFetch<{ data: LabelTreeNode[]; total: number }>(
      "/v1/labels",
    );
  },

  /** POST /v1/labels — create a label. */
  create(payload: CreateLabelPayload): Promise<{ data: Label }> {
    return inboxPowerFetch<{ data: Label }>("/v1/labels", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** PUT /v1/labels/:id — update a label. */
  update(id: string, payload: UpdateLabelPayload): Promise<{ data: Label }> {
    return inboxPowerFetch<{ data: Label }>(
      `/v1/labels/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/labels/:id — delete a label. */
  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return inboxPowerFetch<{ deleted: boolean; id: string }>(
      `/v1/labels/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** POST /v1/labels/:id/apply — apply a label to one or more emails. */
  apply(
    id: string,
    emailIds: readonly string[],
  ): Promise<{ data: { labelId: string; emailIds: string[]; applied: boolean } }> {
    return inboxPowerFetch<{
      data: { labelId: string; emailIds: string[]; applied: boolean };
    }>(`/v1/labels/${encodeURIComponent(id)}/apply`, {
      method: "POST",
      body: JSON.stringify({ emailIds: [...emailIds] }),
    });
  },

  /** DELETE /v1/labels/:id/apply — remove a label from one or more emails. */
  removeFrom(
    id: string,
    emailIds: readonly string[],
  ): Promise<{ data: { labelId: string; emailIds: string[]; removed: boolean } }> {
    return inboxPowerFetch<{
      data: { labelId: string; emailIds: string[]; removed: boolean };
    }>(`/v1/labels/${encodeURIComponent(id)}/apply`, {
      method: "DELETE",
      body: JSON.stringify({ emailIds: [...emailIds] }),
    });
  },
};

// ─── Bulk actions API (/v1/bulk) ─────────────────────────────────────────────────

export const bulkActionsApi = {
  /** POST /v1/bulk/:action — run a tag-based bulk action on up to 500 emails. */
  run(action: BulkAction, emailIds: readonly string[]): Promise<BulkActionResult> {
    return inboxPowerFetch<BulkActionResult>(`/v1/bulk/${action}`, {
      method: "POST",
      body: JSON.stringify({ emailIds: [...emailIds] }),
    });
  },

  /** POST /v1/bulk/label — apply a label ID to emails (tag-based). */
  label(labelId: string, emailIds: readonly string[]): Promise<{
    data: { action: string; labelId: string; count: number; updatedAt: string };
  }> {
    return inboxPowerFetch<{
      data: { action: string; labelId: string; count: number; updatedAt: string };
    }>("/v1/bulk/label", {
      method: "POST",
      body: JSON.stringify({ labelId, emailIds: [...emailIds] }),
    });
  },

  /** POST /v1/bulk/move — move emails to a named folder. */
  move(folder: string, emailIds: readonly string[]): Promise<{
    data: { action: string; folder: string; count: number; updatedAt: string };
  }> {
    return inboxPowerFetch<{
      data: { action: string; folder: string; count: number; updatedAt: string };
    }>("/v1/bulk/move", {
      method: "POST",
      body: JSON.stringify({ folder, emailIds: [...emailIds] }),
    });
  },
};

// ─── Thread mutes API (/v1/threads) ──────────────────────────────────────────────

export const threadMutesApi = {
  /** GET /v1/threads/muted — list muted threads for the account. */
  listMuted(): Promise<{ data: MutedThread[] }> {
    return inboxPowerFetch<{ data: MutedThread[] }>("/v1/threads/muted");
  },

  /** POST /v1/threads/:threadId/mute — mute a thread (optionally until expiresAt). */
  mute(
    threadId: string,
    expiresAt?: string,
  ): Promise<{ data: { id: string; threadId: string; expiresAt: string | null } }> {
    return inboxPowerFetch<{
      data: { id: string; threadId: string; expiresAt: string | null };
    }>(`/v1/threads/${encodeURIComponent(threadId)}/mute`, {
      method: "POST",
      body: JSON.stringify(expiresAt ? { expiresAt } : {}),
    });
  },

  /** DELETE /v1/threads/:threadId/mute — unmute a thread. */
  unmute(threadId: string): Promise<{ deleted: boolean; threadId: string }> {
    return inboxPowerFetch<{ deleted: boolean; threadId: string }>(
      `/v1/threads/${encodeURIComponent(threadId)}/mute`,
      { method: "DELETE" },
    );
  },
};
