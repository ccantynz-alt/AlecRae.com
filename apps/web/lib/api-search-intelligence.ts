/**
 * API client for the Search Intelligence feature domain
 * (apps/api/src/routes/search-intelligence.ts, mounted at /v1/search-intelligence
 * in server.ts).
 *
 * Covers the backend endpoints:
 *   GET    /v1/search-intelligence/history               — list search history
 *   DELETE /v1/search-intelligence/history               — clear search history
 *   POST   /v1/search-intelligence/bookmarks             — create bookmark
 *   GET    /v1/search-intelligence/bookmarks             — list bookmarks
 *   PUT    /v1/search-intelligence/bookmarks/:id         — update bookmark
 *   DELETE /v1/search-intelligence/bookmarks/:id         — delete bookmark
 *   POST   /v1/search-intelligence/bookmarks/:id/check   — check for new results
 *   GET    /v1/search-intelligence/suggestions           — smart suggestions
 *   POST   /v1/search-intelligence/suggestions/generate  — generate AI suggestions
 *   GET    /v1/search-intelligence/trending              — trending search terms
 *   GET    /v1/search-intelligence/related/:emailId      — related emails
 *   POST   /v1/search-intelligence/natural-language      — parse NL query
 *
 * NB (issue #29): suggestions/generate, trending, related and natural-language
 * are backend placeholders — callers should render whatever comes back and
 * degrade gracefully.
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts (module-private
 * there) so this domain has its own typed entry point with silent
 * 401 → refresh → retry handling.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface SearchIntelligenceApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function siFetch<T>(
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
      return siFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as SearchIntelligenceApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type SearchType = "keyword" | "natural_language" | "semantic";

export type SuggestionCategory =
  | "recent"
  | "frequent"
  | "trending"
  | "ai_recommended";

export interface SearchHistoryEntry {
  id: string;
  query: string;
  resultCount: number;
  clickedResults: unknown;
  searchType: SearchType;
  createdAt: string;
}

export interface SearchHistoryListResult {
  data: SearchHistoryEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export interface SearchBookmarkFilters {
  from?: string;
  to?: string;
  dateAfter?: string;
  dateBefore?: string;
  hasAttachment?: boolean;
  labels?: string[];
  folder?: string;
}

export interface SearchBookmark {
  id: string;
  name: string;
  query: string;
  searchType: SearchType;
  filters: SearchBookmarkFilters;
  notifyOnNew: boolean;
  lastCheckedAt: string | null;
  newResultsSinceLastCheck: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchBookmarkListResult {
  data: SearchBookmark[];
  cursor: string | null;
  hasMore: boolean;
}

export interface CreateBookmarkPayload {
  name: string;
  query: string;
  searchType?: SearchType;
  filters?: SearchBookmarkFilters;
  notifyOnNew?: boolean;
}

export interface UpdateBookmarkPayload {
  name?: string;
  query?: string;
  searchType?: SearchType;
  filters?: SearchBookmarkFilters;
  notifyOnNew?: boolean;
}

export interface BookmarkCheckResult {
  id: string;
  newResults: number;
  lastCheckedAt: string;
}

export interface SearchSuggestion {
  id: string;
  suggestion: string;
  reason: string | null;
  category: SuggestionCategory;
  relevanceScore: number;
  createdAt: string;
}

export interface TrendingTerm {
  term: string;
  count: number;
  trend: "up" | "down" | "stable";
}

export interface RelatedEmail {
  emailId: string;
  similarity: number;
  reason: string;
}

export interface ParsedNaturalLanguageQuery {
  originalQuery: string;
  structured: {
    keywords: string[];
    from: string | null;
    to: string | null;
    dateAfter: string | null;
    dateBefore: string | null;
    hasAttachment: boolean | null;
    labels: string[];
    folder: string | null;
  };
  confidence: number;
  suggestion: string;
}

// ─── API surface ─────────────────────────────────────────────────────────────

export const searchIntelligenceApi = {
  /** GET /v1/search-intelligence/history — recent searches, cursor-paginated. */
  listHistory(options?: {
    limit?: number;
    cursor?: string;
    searchType?: SearchType;
  }): Promise<SearchHistoryListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.searchType) params.set("searchType", options.searchType);
    const qs = params.toString();
    return siFetch<SearchHistoryListResult>(
      `/v1/search-intelligence/history${qs ? `?${qs}` : ""}`,
    );
  },

  /** DELETE /v1/search-intelligence/history — clear all search history. */
  clearHistory(): Promise<{ deleted: boolean }> {
    return siFetch<{ deleted: boolean }>("/v1/search-intelligence/history", {
      method: "DELETE",
    });
  },

  /** POST /v1/search-intelligence/bookmarks — save a search. */
  createBookmark(
    payload: CreateBookmarkPayload,
  ): Promise<{ data: SearchBookmark }> {
    return siFetch<{ data: SearchBookmark }>(
      "/v1/search-intelligence/bookmarks",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** GET /v1/search-intelligence/bookmarks — list saved searches. */
  listBookmarks(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<SearchBookmarkListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return siFetch<SearchBookmarkListResult>(
      `/v1/search-intelligence/bookmarks${qs ? `?${qs}` : ""}`,
    );
  },

  /** PUT /v1/search-intelligence/bookmarks/:id — update a saved search. */
  updateBookmark(
    id: string,
    payload: UpdateBookmarkPayload,
  ): Promise<{ data: { id: string; updatedAt: string } }> {
    return siFetch<{ data: { id: string; updatedAt: string } }>(
      `/v1/search-intelligence/bookmarks/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/search-intelligence/bookmarks/:id — delete a saved search. */
  deleteBookmark(id: string): Promise<{ deleted: boolean; id: string }> {
    return siFetch<{ deleted: boolean; id: string }>(
      `/v1/search-intelligence/bookmarks/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** POST /v1/search-intelligence/bookmarks/:id/check — check for new results. */
  checkBookmark(id: string): Promise<{ data: BookmarkCheckResult }> {
    return siFetch<{ data: BookmarkCheckResult }>(
      `/v1/search-intelligence/bookmarks/${encodeURIComponent(id)}/check`,
      { method: "POST" },
    );
  },

  /** GET /v1/search-intelligence/suggestions — smart suggestions. */
  listSuggestions(options?: {
    limit?: number;
    category?: SuggestionCategory;
  }): Promise<{ data: SearchSuggestion[] }> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.category) params.set("category", options.category);
    const qs = params.toString();
    return siFetch<{ data: SearchSuggestion[] }>(
      `/v1/search-intelligence/suggestions${qs ? `?${qs}` : ""}`,
    );
  },

  /** POST /v1/search-intelligence/suggestions/generate — AI suggestions (backend placeholder). */
  generateSuggestions(): Promise<{
    data: SearchSuggestion[];
    generated: boolean;
  }> {
    return siFetch<{ data: SearchSuggestion[]; generated: boolean }>(
      "/v1/search-intelligence/suggestions/generate",
      { method: "POST" },
    );
  },

  /** GET /v1/search-intelligence/trending — trending terms (backend placeholder). */
  trending(): Promise<{ data: TrendingTerm[]; period: string }> {
    return siFetch<{ data: TrendingTerm[]; period: string }>(
      "/v1/search-intelligence/trending",
    );
  },

  /** GET /v1/search-intelligence/related/:emailId — related emails (backend placeholder). */
  relatedEmails(
    emailId: string,
  ): Promise<{ data: RelatedEmail[]; sourceEmailId: string }> {
    return siFetch<{ data: RelatedEmail[]; sourceEmailId: string }>(
      `/v1/search-intelligence/related/${encodeURIComponent(emailId)}`,
    );
  },

  /** POST /v1/search-intelligence/natural-language — parse NL query (backend placeholder). */
  parseNaturalLanguage(
    query: string,
  ): Promise<{ data: ParsedNaturalLanguageQuery }> {
    return siFetch<{ data: ParsedNaturalLanguageQuery }>(
      "/v1/search-intelligence/natural-language",
      { method: "POST", body: JSON.stringify({ query }) },
    );
  },
};
