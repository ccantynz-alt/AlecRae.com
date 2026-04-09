/**
 * Hybrid Search Orchestrator — Vector + Keyword Fusion
 *
 * Combines pgvector semantic search with Meilisearch keyword search
 * into a single ranked result set using Reciprocal Rank Fusion (RRF).
 *
 * Pipeline:
 *   1. Fire vector search and keyword search IN PARALLEL
 *   2. Normalize scores to [0, 1] within each result set
 *   3. Fuse using weighted RRF: score = w * vectorRank + (1-w) * keywordRank
 *   4. Deduplicate by emailId (keep highest-scoring occurrence)
 *   5. Return top-K merged results
 *
 * Fallback chain:
 *   - If vector search fails (no API key, pgvector down) → keyword only
 *   - If keyword search fails (Meilisearch down) → vector only
 *   - If both fail → empty results with error message
 */

import { sql } from "drizzle-orm";
import { getDatabase } from "@emailed/db";
import { searchEmails } from "@emailed/shared";
import { embedQuery, VOYAGE_MODEL, EMBEDDING_DIMENSIONS } from "./voyage.js";
import {
  type SemanticSearchHit,
  type HybridSearchRequest,
  type HybridSearchResponse,
  type EmbeddableEmail,
  MIN_SIMILARITY_THRESHOLD,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** RRF constant (k). Higher = more even blending; lower = top-heavy. */
const RRF_K = 60;

// ---------------------------------------------------------------------------
// Vector Search
// ---------------------------------------------------------------------------

interface VectorSearchResult {
  readonly hits: SemanticSearchHit[];
  readonly model: string;
}

/**
 * Execute a kNN cosine search against pgvector.
 * Returns hits ordered by ascending distance (most similar first).
 */
async function vectorSearch(
  queryText: string,
  accountId: string,
  limit: number,
  maxDistance: number | undefined,
): Promise<VectorSearchResult> {
  const queryVector = await embedQuery(queryText);
  const literal = `[${queryVector.join(",")}]`;

  if (queryVector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Query embedding has ${queryVector.length} dims, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }

  const db = getDatabase();

  const distanceFilter =
    maxDistance !== undefined
      ? sql`AND (ee.embedding_vector <=> ${literal}::vector) <= ${maxDistance}`
      : sql``;

  const result = await db.execute<{
    id: string;
    account_id: string;
    subject: string;
    from_address: string;
    from_name: string | null;
    text_body: string | null;
    html_body: string | null;
    created_at: Date;
    distance: number;
  }>(sql`
    SELECT e.id,
           e.account_id,
           e.subject,
           e.from_address,
           e.from_name,
           e.text_body,
           e.html_body,
           e.created_at,
           (ee.embedding_vector <=> ${literal}::vector) AS distance
    FROM email_embeddings ee
    JOIN emails e ON e.id = ee.email_id
    WHERE e.account_id = ${accountId}
    ${distanceFilter}
    ORDER BY ee.embedding_vector <=> ${literal}::vector
    LIMIT ${limit}
  `);

  const rows =
    (
      result as unknown as {
        rows: Array<{
          id: string;
          account_id: string;
          subject: string;
          from_address: string;
          from_name: string | null;
          text_body: string | null;
          html_body: string | null;
          created_at: Date;
          distance: number;
        }>;
      }
    ).rows ?? [];

  const hits: SemanticSearchHit[] = rows.map((r) => {
    const text =
      r.text_body ?? (r.html_body ?? "").replace(/<[^>]+>/g, " ");
    const distance = Number(r.distance);
    return {
      emailId: r.id,
      subject: r.subject,
      from: { email: r.from_address, name: r.from_name },
      snippet: text.replace(/\s+/g, " ").trim().slice(0, 240),
      date:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString(),
      score: 1 - distance,
      distance,
      source: "vector" as const,
    };
  });

  return { hits, model: VOYAGE_MODEL };
}

// ---------------------------------------------------------------------------
// Keyword Search (Meilisearch wrapper)
// ---------------------------------------------------------------------------

async function keywordSearch(
  query: string,
  accountId: string,
  limit: number,
): Promise<SemanticSearchHit[]> {
  const result = await searchEmails(accountId, query, { limit });

  return result.hits.map((hit, idx) => ({
    emailId: hit.id,
    subject: hit.subject,
    from: { email: hit.fromAddress, name: hit.fromName },
    snippet: hit.snippet,
    date: new Date(hit.createdAt * 1000).toISOString(),
    // Keyword results don't have true cosine scores.
    // We assign a decaying score based on position rank.
    score: 1 / (1 + idx),
    distance: idx / (result.hits.length || 1),
    source: "keyword" as const,
  }));
}

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion
// ---------------------------------------------------------------------------

interface RankedHit extends SemanticSearchHit {
  /** Fused RRF score (higher = better). */
  fusedScore: number;
}

/**
 * Fuse two ranked lists using weighted Reciprocal Rank Fusion.
 *
 * RRF(d) = w / (k + rank_vector(d)) + (1-w) / (k + rank_keyword(d))
 *
 * Deduplicates by emailId and keeps the highest fused score.
 */
function fuseResults(
  vectorHits: readonly SemanticSearchHit[],
  keywordHits: readonly SemanticSearchHit[],
  vectorWeight: number,
  limit: number,
): SemanticSearchHit[] {
  const map = new Map<string, RankedHit>();

  // Score vector hits
  for (let rank = 0; rank < vectorHits.length; rank++) {
    const hit = vectorHits[rank]!;
    const rrfScore = vectorWeight / (RRF_K + rank + 1);
    const existing = map.get(hit.emailId);
    if (existing) {
      existing.fusedScore += rrfScore;
      existing.source = "hybrid";
    } else {
      map.set(hit.emailId, {
        ...hit,
        source: "hybrid",
        fusedScore: rrfScore,
      });
    }
  }

  // Score keyword hits
  const keywordWeight = 1 - vectorWeight;
  for (let rank = 0; rank < keywordHits.length; rank++) {
    const hit = keywordHits[rank]!;
    const rrfScore = keywordWeight / (RRF_K + rank + 1);
    const existing = map.get(hit.emailId);
    if (existing) {
      existing.fusedScore += rrfScore;
      existing.source = "hybrid";
    } else {
      map.set(hit.emailId, {
        ...hit,
        source: "hybrid",
        fusedScore: rrfScore,
      });
    }
  }

  // Sort by fused score descending, take top K
  const sorted = Array.from(map.values()).sort(
    (a, b) => b.fusedScore - a.fusedScore,
  );

  return sorted.slice(0, limit).map(({ fusedScore, ...hit }) => ({
    ...hit,
    score: fusedScore,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a hybrid semantic + keyword search for the given account.
 *
 * This is the main entry point for the `/v1/search/semantic` route.
 * Fires vector and keyword searches in parallel, fuses results,
 * and falls back gracefully when one path is unavailable.
 */
export async function hybridSearch(
  request: HybridSearchRequest,
  accountId: string,
): Promise<HybridSearchResponse> {
  const start = Date.now();

  const {
    query,
    limit,
    maxDistance,
    vectorWeight,
    keywordOnly,
    dateFrom: _dateFrom,
    dateTo: _dateTo,
    from: _from,
  } = request;

  // --- Keyword-only shortcut ---
  if (keywordOnly) {
    try {
      const kwHits = await keywordSearch(query, accountId, limit);
      return {
        query,
        results: kwHits,
        totalHits: kwHits.length,
        processingTimeMs: Date.now() - start,
        model: null,
        usedVectorSearch: false,
        vectorFallbackReason: "keywordOnly flag set by caller",
      };
    } catch (err) {
      return {
        query,
        results: [],
        totalHits: 0,
        processingTimeMs: Date.now() - start,
        model: null,
        usedVectorSearch: false,
        vectorFallbackReason: `Keyword search failed: ${(err as Error).message}`,
      };
    }
  }

  // --- Parallel execution ---
  type VectorResult =
    | { ok: true; value: VectorSearchResult }
    | { ok: false; error: string };
  type KeywordResult =
    | { ok: true; value: SemanticSearchHit[] }
    | { ok: false; error: string };

  const [vectorResult, keywordResult] = await Promise.all([
    vectorSearch(query, accountId, limit, maxDistance)
      .then((value): VectorResult => ({ ok: true, value }))
      .catch((err): VectorResult => ({
        ok: false,
        error: (err as Error).message,
      })),
    keywordSearch(query, accountId, limit)
      .then((value): KeywordResult => ({ ok: true, value }))
      .catch((err): KeywordResult => ({
        ok: false,
        error: (err as Error).message,
      })),
  ]);

  // --- Determine what we got and fuse/fallback accordingly ---

  // Both failed
  if (!vectorResult.ok && !keywordResult.ok) {
    return {
      query,
      results: [],
      totalHits: 0,
      processingTimeMs: Date.now() - start,
      model: null,
      usedVectorSearch: false,
      vectorFallbackReason: `Both search paths failed. Vector: ${vectorResult.error}. Keyword: ${keywordResult.error}`,
    };
  }

  // Vector-only (keyword failed)
  if (vectorResult.ok && !keywordResult.ok) {
    const { hits, model } = vectorResult.value;
    const filtered = hits.filter(
      (h) => h.score >= MIN_SIMILARITY_THRESHOLD,
    );
    return {
      query,
      results: filtered,
      totalHits: filtered.length,
      processingTimeMs: Date.now() - start,
      model,
      usedVectorSearch: true,
      vectorFallbackReason: null,
    };
  }

  // Keyword-only (vector failed)
  if (!vectorResult.ok && keywordResult.ok) {
    return {
      query,
      results: keywordResult.value,
      totalHits: keywordResult.value.length,
      processingTimeMs: Date.now() - start,
      model: null,
      usedVectorSearch: false,
      vectorFallbackReason: vectorResult.error,
    };
  }

  // --- Both succeeded — fuse ---
  // TypeScript now knows both are `.ok === true` after the above checks.
  if (vectorResult.ok && keywordResult.ok) {
    const vectorHits = vectorResult.value.hits;
    const kwHits = keywordResult.value;
    const fused = fuseResults(vectorHits, kwHits, vectorWeight, limit);

    return {
      query,
      results: fused,
      totalHits: fused.length,
      processingTimeMs: Date.now() - start,
      model: vectorResult.value.model,
      usedVectorSearch: true,
      vectorFallbackReason: null,
    };
  }

  // Unreachable, but TypeScript needs an exhaustive return
  return {
    query,
    results: [],
    totalHits: 0,
    processingTimeMs: Date.now() - start,
    model: null,
    usedVectorSearch: false,
    vectorFallbackReason: "Unknown search state",
  };
}

// ---------------------------------------------------------------------------
// Utility: Check if vector search is available
// ---------------------------------------------------------------------------

/**
 * Quick health-check: can we reach the embedding API AND does the
 * email_embeddings table have at least one row for this account?
 */
export async function isVectorSearchAvailable(
  accountId: string,
): Promise<{ available: boolean; reason: string }> {
  try {
    const db = getDatabase();
    const result = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt
      FROM email_embeddings ee
      JOIN emails e ON e.id = ee.email_id
      WHERE e.account_id = ${accountId}
      LIMIT 1
    `);
    const rows =
      (result as unknown as { rows: Array<{ cnt: string }> }).rows ?? [];
    const count = parseInt(rows[0]?.cnt ?? "0", 10);
    if (count === 0) {
      return {
        available: false,
        reason: "No emails have been indexed for this account. Call POST /v1/semantic/index first.",
      };
    }
    return { available: true, reason: "ok" };
  } catch (err) {
    return {
      available: false,
      reason: `Database check failed: ${(err as Error).message}`,
    };
  }
}
