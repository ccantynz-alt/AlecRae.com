/**
 * API client for the Semantic (vector) Search feature domain
 * (apps/api/src/routes/semantic-search.ts, mounted at /v1/semantic).
 *
 * This is a SEPARATE route group from ai-search.ts's /v1/search/semantic
 * (hybrid keyword+vector search already wired on the search page). This file
 * wires the genuinely-new pure-vector + index-management capabilities:
 *
 *   POST   /v1/semantic/search           — pure kNN cosine vector search
 *   POST   /v1/semantic/similar/:emailId — kNN from an already-indexed email
 *   POST   /v1/semantic/backfill         — enqueue all un-indexed emails
 *   GET    /v1/semantic/stats            — auto-indexer health + queue stats
 *
 * The remaining backend endpoints (POST /index, POST /index-batch,
 * DELETE /index/:id) are index-management primitives already covered by the
 * background auto-indexer + backfill, so they are intentionally NOT wired here.
 *
 * Mirrors the featureFetch wrapper pattern (401 → refreshSession → retry once)
 * from lib/api-delegation.ts.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface SemanticApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function semanticFetch<T>(
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
      return semanticFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as SemanticApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single vector-search hit. Mirrors the backend SemanticSearchHit shape. */
export interface SemanticSearchHit {
  emailId: string;
  subject: string;
  from: {
    email: string;
    name: string | null;
  };
  snippet: string;
  /** ISO date string. */
  date: string;
  /** Cosine similarity in [-1, 1]; higher = more similar. */
  score: number;
  /** Cosine distance (0 = identical, 2 = opposite). */
  distance: number;
  source: "vector" | "keyword" | "hybrid";
}

export interface SemanticSearchResult {
  query: string;
  results: SemanticSearchHit[];
  totalHits: number;
  processingTimeMs: number;
  model: string;
  usedVectorSearch: boolean;
}

export interface SimilarEmailsResult {
  sourceEmailId: string;
  results: SemanticSearchHit[];
  totalHits: number;
  processingTimeMs: number;
}

export interface BackfillResult {
  enqueued: number;
  message: string;
}

/** Auto-indexer health, mirrors the backend AutoIndexStats shape. */
export interface AutoIndexerStats {
  totalQueued: number;
  totalIndexed: number;
  totalFailed: number;
  isRunning: boolean;
  /** ISO date string of last background run, or null if it hasn't run yet. */
  lastRunAt: string | null;
}

export interface SemanticSearchOptions {
  limit?: number;
  /** Maximum cosine distance (0 = identical, 2 = opposite). */
  maxDistance?: number;
}

// ─── API (/v1/semantic) ────────────────────────────────────────────────────

export const semanticSearchApi = {
  /**
   * POST /v1/semantic/search — pure kNN cosine vector search over indexed
   * emails. Distinct from the hybrid /v1/search/semantic path — this is
   * meaning-only, no keyword fallback.
   */
  search(
    query: string,
    options?: SemanticSearchOptions,
  ): Promise<{ data: SemanticSearchResult }> {
    const body: { query: string; limit?: number; maxDistance?: number } = {
      query,
    };
    if (options?.limit !== undefined) body.limit = options.limit;
    if (options?.maxDistance !== undefined) body.maxDistance = options.maxDistance;
    return semanticFetch<{ data: SemanticSearchResult }>("/v1/semantic/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * POST /v1/semantic/similar/:emailId — find emails semantically similar to
   * an already-indexed email. Returns 404 (embedding_not_found) if the source
   * email has no embedding yet.
   */
  similar(
    emailId: string,
    options?: { limit?: number },
  ): Promise<{ data: SimilarEmailsResult }> {
    const body: { limit?: number } = {};
    if (options?.limit !== undefined) body.limit = options.limit;
    return semanticFetch<{ data: SimilarEmailsResult }>(
      `/v1/semantic/similar/${encodeURIComponent(emailId)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  /**
   * POST /v1/semantic/backfill — enqueue all un-indexed emails for background
   * embedding. Returns how many were enqueued.
   */
  backfill(): Promise<{ data: BackfillResult }> {
    return semanticFetch<{ data: BackfillResult }>("/v1/semantic/backfill", {
      method: "POST",
    });
  },

  /**
   * GET /v1/semantic/stats — auto-indexer health + queue stats. Used to show
   * index coverage and to degrade gracefully when nothing is indexed yet.
   */
  stats(): Promise<{ data: AutoIndexerStats }> {
    return semanticFetch<{ data: AutoIndexerStats }>("/v1/semantic/stats");
  },
};
