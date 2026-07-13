/**
 * API client for the Contact Groups / Distribution Lists feature domain
 * (apps/api/src/routes/contact-groups.ts).
 *
 * Covers all 7 backend endpoints (mounted at /v1/contact-groups in server.ts):
 *   POST   /v1/contact-groups                        — create a group
 *   GET    /v1/contact-groups?limit=&cursor=         — list groups (cursor-paginated)
 *   GET    /v1/contact-groups/:id                    — get a group with its members
 *   PUT    /v1/contact-groups/:id                    — update a group
 *   DELETE /v1/contact-groups/:id                    — delete a group
 *   POST   /v1/contact-groups/:id/members            — add members (array of contactIds)
 *   DELETE /v1/contact-groups/:id/members/:contactId — remove a member
 *
 * Mirrors the delegationFetch wrapper in lib/api-delegation.ts so this domain
 * has its own typed entry point with silent 401 → refresh → retry handling.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface ContactGroupApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function contactGroupsFetch<T>(
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
      return contactGroupsFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as ContactGroupApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ContactGroup {
  id: string;
  name: string;
  description: string;
  color: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactGroupMember {
  id: string;
  contactId: string;
  name: string | null;
  email: string | null;
  addedAt: string;
}

export interface ContactGroupDetail {
  id: string;
  name: string;
  description: string;
  color: string | null;
  memberCount: number;
  members: ContactGroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface ContactGroupListResult {
  data: ContactGroup[];
  cursor: string | null;
  hasMore: boolean;
}

export interface CreateContactGroupPayload {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateContactGroupPayload {
  name?: string;
  description?: string;
  color?: string | null;
}

export interface AddMembersResult {
  groupId: string;
  added: { id: string; contactId: string; addedAt: string }[];
  alreadyMembers: string[];
}

// ─── API (/v1/contact-groups) ────────────────────────────────────────────────

export const contactGroupsApi = {
  /** POST /v1/contact-groups — create a group. */
  create(
    payload: CreateContactGroupPayload,
  ): Promise<{ data: ContactGroup }> {
    return contactGroupsFetch<{ data: ContactGroup }>("/v1/contact-groups", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/contact-groups — list groups, cursor-paginated. */
  list(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<ContactGroupListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return contactGroupsFetch<ContactGroupListResult>(
      `/v1/contact-groups${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/contact-groups/:id — get a group with its members. */
  get(id: string): Promise<{ data: ContactGroupDetail }> {
    return contactGroupsFetch<{ data: ContactGroupDetail }>(
      `/v1/contact-groups/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/contact-groups/:id — rename / update a group. */
  update(
    id: string,
    payload: UpdateContactGroupPayload,
  ): Promise<{ data: ContactGroup }> {
    return contactGroupsFetch<{ data: ContactGroup }>(
      `/v1/contact-groups/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/contact-groups/:id — delete a group. */
  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return contactGroupsFetch<{ deleted: boolean; id: string }>(
      `/v1/contact-groups/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** POST /v1/contact-groups/:id/members — add contacts to a group. */
  addMembers(
    id: string,
    contactIds: string[],
  ): Promise<{ data: AddMembersResult }> {
    return contactGroupsFetch<{ data: AddMembersResult }>(
      `/v1/contact-groups/${encodeURIComponent(id)}/members`,
      { method: "POST", body: JSON.stringify({ contactIds }) },
    );
  },

  /** DELETE /v1/contact-groups/:id/members/:contactId — remove a contact. */
  removeMember(
    id: string,
    contactId: string,
  ): Promise<{ deleted: boolean; groupId: string; contactId: string }> {
    return contactGroupsFetch<{
      deleted: boolean;
      groupId: string;
      contactId: string;
    }>(
      `/v1/contact-groups/${encodeURIComponent(id)}/members/${encodeURIComponent(contactId)}`,
      { method: "DELETE" },
    );
  },
};
