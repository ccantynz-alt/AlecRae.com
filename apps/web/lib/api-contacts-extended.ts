/**
 * Typed API clients for Contact Enrichment + Contacts Extended (CRM-lite).
 *
 * Covers:
 *   - /v1/contacts/:contactId/enrich | /enrichment  (contact-enrichment.ts)
 *   - /v1/contacts-extended/*                        (contacts-extended.ts)
 *
 * `featureFetch` in api-features.ts is module-private, so this file replicates
 * the same 401 → refreshSession() → single retry pattern (Known Issue #50 fix)
 * from auth-token.ts.
 */

import { getApiBase } from "./api-base";
import { getAccessToken, refreshSession, redirectToLogin } from "./auth-token";

const API_BASE = getApiBase();

/** Error carrying the HTTP status so callers can treat 404 as "no data yet". */
export class ContactsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ContactsApiError";
    this.status = status;
  }
}

async function apiFetch<T>(
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
  if (res.status === 401 && !retried) {
    const fresh = await refreshSession();
    if (fresh) return apiFetch<T>(path, options, true);
    redirectToLogin();
  }
  if (!res.ok) {
    const err: unknown = await res.json().catch(() => null);
    const message =
      (err as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed: ${res.status}`;
    throw new ContactsApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

// ─── Contact Enrichment types ────────────────────────────────────────────────

/** Mirrors `EnrichmentData` from @alecrae/db (packages/db contact-enrichment). */
export interface ContactEnrichmentData {
  fullName?: string;
  title?: string;
  company?: string;
  companyDomain?: string;
  companySize?: string;
  industry?: string;
  location?: string;
  timezone?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
  githubHandle?: string;
  avatarUrl?: string;
  bio?: string;
  seniorityLevel?: string;
  department?: string;
}

export interface ContactEnrichment {
  id: string;
  contactId: string;
  email: string;
  data: ContactEnrichmentData;
  confidence: number;
  source: string;
  enrichedAt: string;
  expiresAt: string | null;
}

// ─── Contacts Extended types ─────────────────────────────────────────────────

export type InteractionType =
  | "email_sent"
  | "email_received"
  | "meeting"
  | "call"
  | "note";

export interface ContactInteraction {
  id: string;
  contactId: string;
  type: InteractionType;
  subject: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface ContactReminder {
  id: string;
  contactId: string;
  title: string;
  reminderAt: string;
  isCompleted: boolean;
  createdAt: string;
}

export interface ContactInsights {
  contactId: string;
  contactName: string;
  contactEmail: string;
  summary: {
    totalInteractions: number;
    interactionsByType: Record<string, number>;
    lastInteractionAt: string | null;
    daysSinceLastInteraction: number | null;
    interactionsLast30Days: number;
    pendingReminders: number;
  };
  relationshipStrength: number;
  suggestedFollowUps: string[];
  generatedAt: string;
}

export interface CursorPage<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

// ─── Contact Enrichment API ──────────────────────────────────────────────────

export const contactEnrichmentApi = {
  /** GET /v1/contacts/:contactId/enrichment — null when never enriched (404). */
  async get(contactId: string): Promise<ContactEnrichment | null> {
    try {
      const res = await apiFetch<{ data: ContactEnrichment }>(
        `/v1/contacts/${contactId}/enrichment`,
      );
      return res.data;
    } catch (err) {
      if (err instanceof ContactsApiError && err.status === 404) return null;
      throw err;
    }
  },

  /** POST /v1/contacts/:contactId/enrich — trigger (re-)enrichment. */
  async enrich(contactId: string): Promise<ContactEnrichment> {
    const res = await apiFetch<{ data: ContactEnrichment }>(
      `/v1/contacts/${contactId}/enrich`,
      { method: "POST" },
    );
    return res.data;
  },

  /** DELETE /v1/contacts/:contactId/enrichment — clear enrichment data. */
  async clear(contactId: string): Promise<{ deleted: boolean; contactId: string }> {
    return apiFetch<{ deleted: boolean; contactId: string }>(
      `/v1/contacts/${contactId}/enrichment`,
      { method: "DELETE" },
    );
  },
};

// ─── Contacts Extended API ───────────────────────────────────────────────────

export const contactsExtendedApi = {
  /** GET /v1/contacts-extended/interactions/:contactId */
  async listInteractions(
    contactId: string,
    options: { limit?: number; cursor?: string; type?: InteractionType } = {},
  ): Promise<CursorPage<ContactInteraction>> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 20));
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.type) params.set("type", options.type);
    return apiFetch<CursorPage<ContactInteraction>>(
      `/v1/contacts-extended/interactions/${contactId}?${params.toString()}`,
    );
  },

  /** POST /v1/contacts-extended/interactions — log an interaction. */
  async logInteraction(input: {
    contactId: string;
    type: InteractionType;
    subject?: string;
    occurredAt: string;
  }): Promise<ContactInteraction> {
    const res = await apiFetch<{ data: ContactInteraction }>(
      "/v1/contacts-extended/interactions",
      { method: "POST", body: JSON.stringify(input) },
    );
    return res.data;
  },

  /** GET /v1/contacts-extended/reminders — pending reminders (account-wide). */
  async listReminders(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<CursorPage<ContactReminder>> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 100));
    if (options.cursor) params.set("cursor", options.cursor);
    return apiFetch<CursorPage<ContactReminder>>(
      `/v1/contacts-extended/reminders?${params.toString()}`,
    );
  },

  /** POST /v1/contacts-extended/reminders — create a follow-up reminder. */
  async createReminder(input: {
    contactId: string;
    title: string;
    reminderAt: string;
  }): Promise<ContactReminder> {
    const res = await apiFetch<{ data: ContactReminder }>(
      "/v1/contacts-extended/reminders",
      { method: "POST", body: JSON.stringify(input) },
    );
    return res.data;
  },

  /** POST /v1/contacts-extended/reminders/:id/complete */
  async completeReminder(id: string): Promise<ContactReminder> {
    const res = await apiFetch<{ data: ContactReminder }>(
      `/v1/contacts-extended/reminders/${id}/complete`,
      { method: "POST" },
    );
    return res.data;
  },

  /** DELETE /v1/contacts-extended/reminders/:id */
  async deleteReminder(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch<{ deleted: boolean; id: string }>(
      `/v1/contacts-extended/reminders/${id}`,
      { method: "DELETE" },
    );
  },

  /** GET /v1/contacts-extended/insights/:contactId — AI contact insights. */
  async getInsights(contactId: string): Promise<ContactInsights> {
    const res = await apiFetch<{ data: ContactInsights }>(
      `/v1/contacts-extended/insights/${contactId}`,
    );
    return res.data;
  },
};
