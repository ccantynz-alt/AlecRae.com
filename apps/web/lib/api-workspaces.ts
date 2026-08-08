/**
 * Per-workspace unread counts for the WorkspaceSwitcher.
 *
 * One login can own several separate businesses (workspaces). Without this, an
 * operator running six platforms has to blind-switch into each — a full token
 * swap and reload — just to discover which one received mail. This surfaces the
 * count per workspace so the answer is visible from the switcher.
 *
 * Contract (the API adds one of these; this reads whichever is present):
 *   - GET /v1/workspaces/unread → { accountId: string; unreadCount: number }[]
 *     (bare array OR the repo's usual `{ data: [...] }` envelope — both accepted)
 *   - OR an inline `unreadCount` on each item of GET /v1/workspaces
 *
 * Degradation is the whole point: every path here resolves to a map and NEVER
 * throws. When counts are unavailable (endpoint missing, network error, auth
 * gap, malformed body) it returns {} and the switcher shows no badges — the
 * switch behaviour is untouched either way.
 *
 * Deliberately self-contained (reuses only the shared token/base helpers rather
 * than api.ts's private `apiFetch`) so a missing endpoint degrades quietly here
 * instead of tripping api.ts's 401 refresh-and-redirect machinery.
 */

import { getApiBase } from "./api-base";
import { getAccessToken } from "./auth-token";
import type { Workspace } from "./api";

export interface WorkspaceUnread {
  accountId: string;
  unreadCount: number;
}

const API_BASE = getApiBase();

/** A Workspace that MAY carry an inline unread count the base type doesn't declare. */
type WorkspaceMaybeUnread = Workspace & { unreadCount?: unknown };

/** Build the accountId → count map from counts already inline on the list. */
function inlineCounts(workspaces: readonly Workspace[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const w of workspaces) {
    const raw = (w as WorkspaceMaybeUnread).unreadCount;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      map[w.accountId] = raw;
    }
  }
  return map;
}

/** True if the list carries the inline field at all (even a zero) — meaning the
 *  API answers unread inline and the dedicated endpoint need not be queried. */
function hasInlineField(workspaces: readonly Workspace[]): boolean {
  return workspaces.some(
    (w) => typeof (w as WorkspaceMaybeUnread).unreadCount === "number",
  );
}

/** Normalise an unknown response body into an accountId → count map. */
function parseUnreadBody(body: unknown): Record<string, number> {
  const list: unknown = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : null;
  if (!Array.isArray(list)) return {};

  const map: Record<string, number> = {};
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { accountId, unreadCount } = item as {
      accountId?: unknown;
      unreadCount?: unknown;
    };
    if (
      typeof accountId === "string" &&
      typeof unreadCount === "number" &&
      Number.isFinite(unreadCount) &&
      unreadCount > 0
    ) {
      map[accountId] = unreadCount;
    }
  }
  return map;
}

/** Query GET /v1/workspaces/unread. Resolves to {} on any failure. */
async function fetchUnreadEndpoint(): Promise<Record<string, number>> {
  const token = getAccessToken();
  if (!token) return {};

  try {
    const res = await fetch(`${API_BASE}/v1/workspaces/unread`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    return parseUnreadBody((await res.json()) as unknown);
  } catch {
    return {};
  }
}

/**
 * Resolve per-workspace unread counts.
 *
 * Prefers counts already inline on the workspace list (no extra request);
 * otherwise queries the dedicated endpoint. Always resolves — never throws —
 * returning {} when counts are unavailable.
 */
export async function getWorkspaceUnreadCounts(
  workspaces: readonly Workspace[],
): Promise<Record<string, number>> {
  if (hasInlineField(workspaces)) return inlineCounts(workspaces);
  return fetchUnreadEndpoint();
}
