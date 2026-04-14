/**
 * Semantic Vector Search — Shared Types & Zod Schemas
 *
 * Canonical type definitions for the embeddings subsystem.
 * Used by the Voyage/OpenAI server-side service, the Transformers.js
 * client-side service, the hybrid search orchestrator, and the API route.
 *
 * Every API boundary validates with Zod. Every internal boundary uses
 * the inferred TypeScript types.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dimension count shared across all embedding providers. */
export const EMBEDDING_DIMENSIONS = 1024;

/** Maximum text length (chars) fed to any embedding model. */
export const MAX_INPUT_LENGTH = 8000;

/** Ceiling for vector search results. */
export const MAX_SEARCH_RESULTS = 100;

/** Default number of results when none specified. */
export const DEFAULT_SEARCH_LIMIT = 20;

/** Score threshold below which results are considered noise. */
export const MIN_SIMILARITY_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------
// Embedding Provider
// ---------------------------------------------------------------------------

export const EmbeddingProviderSchema = z.enum([
  "voyage-3-large",
  "text-embedding-3-small",
  "transformers-js",
]);
export type EmbeddingProvider = z.infer<typeof EmbeddingProviderSchema>;

// ---------------------------------------------------------------------------
// Search Hit
// ---------------------------------------------------------------------------

export const SemanticSearchHitSchema = z.object({
  emailId: z.string().min(1),
  subject: z.string(),
  from: z.object({
    email: z.string(),
    name: z.string().nullable(),
  }),
  snippet: z.string(),
  date: z.string().datetime(),
  /** Cosine similarity in [−1, 1]; higher = more similar. */
  score: z.number(),
  /** Cosine distance (0 = identical, 2 = opposite). */
  distance: z.number(),
  /** Which search method produced this hit. */
  source: z.enum(["vector", "keyword", "hybrid"]),
});
export type SemanticSearchHit = z.infer<typeof SemanticSearchHitSchema>;

// ---------------------------------------------------------------------------
// Hybrid Search — Request / Response schemas (API boundary)
// ---------------------------------------------------------------------------

export const HybridSearchRequestSchema = z.object({
  /** Natural-language query — "the email about the budget meeting". */
  query: z.string().min(1).max(2000),
  /** Max results to return. */
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(DEFAULT_SEARCH_LIMIT),
  /** Maximum cosine distance for vector results (optional tightening). */
  maxDistance: z.number().min(0).max(2).optional(),
  /**
   * Weight given to vector results in the final ranking.
   * 1.0 = pure vector, 0.0 = pure keyword. Defaults to 0.7.
   */
  vectorWeight: z.number().min(0).max(1).default(0.7),
  /**
   * When true, ONLY use keyword search (skip embedding). Useful when
   * the caller knows the query is a literal string, not natural language.
   */
  keywordOnly: z.boolean().default(false),
  /** Optional date range filters. */
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  /** Optional sender filter. */
  from: z.string().optional(),
});
export type HybridSearchRequest = z.infer<typeof HybridSearchRequestSchema>;

export const HybridSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(SemanticSearchHitSchema),
  totalHits: z.number().int().min(0),
  processingTimeMs: z.number().int().min(0),
  /** Which embedding model was used (null if keyword-only). */
  model: z.string().nullable(),
  /** Whether the vector path was used. */
  usedVectorSearch: z.boolean(),
  /** If vector search failed, this contains the reason. */
  vectorFallbackReason: z.string().nullable(),
});
export type HybridSearchResponse = z.infer<typeof HybridSearchResponseSchema>;

// ---------------------------------------------------------------------------
// Index Request / Response schemas (API boundary)
// ---------------------------------------------------------------------------

export const IndexEmailRequestSchema = z.object({
  emailId: z.string().min(1),
});
export type IndexEmailRequest = z.infer<typeof IndexEmailRequestSchema>;

export const IndexBatchRequestSchema = z.object({
  emailIds: z.array(z.string().min(1)).min(1).max(256),
});
export type IndexBatchRequest = z.infer<typeof IndexBatchRequestSchema>;

export const IndexEmailResponseSchema = z.object({
  emailId: z.string(),
  model: z.string(),
  dimensions: z.number().int(),
  indexedAt: z.string().datetime(),
});
export type IndexEmailResponse = z.infer<typeof IndexEmailResponseSchema>;

export const IndexBatchResponseSchema = z.object({
  indexed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  model: z.string(),
  dimensions: z.number().int(),
});
export type IndexBatchResponse = z.infer<typeof IndexBatchResponseSchema>;

// ---------------------------------------------------------------------------
// Similar Emails — Request / Response schemas
// ---------------------------------------------------------------------------

export const SimilarEmailsRequestSchema = z.object({
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(DEFAULT_SEARCH_LIMIT),
});
export type SimilarEmailsRequest = z.infer<typeof SimilarEmailsRequestSchema>;

// ---------------------------------------------------------------------------
// Delete — Response schema
// ---------------------------------------------------------------------------

export const DeleteIndexResponseSchema = z.object({
  emailId: z.string(),
  deleted: z.boolean(),
});
export type DeleteIndexResponse = z.infer<typeof DeleteIndexResponseSchema>;

// ---------------------------------------------------------------------------
// Auto-Indexer Types
// ---------------------------------------------------------------------------

export interface AutoIndexJob {
  readonly emailId: string;
  readonly accountId: string;
  readonly retryCount: number;
}

export interface AutoIndexStats {
  readonly totalQueued: number;
  readonly totalIndexed: number;
  readonly totalFailed: number;
  readonly isRunning: boolean;
  readonly lastRunAt: string | null;
}

// ---------------------------------------------------------------------------
// Internal: Email row shape used by the embedding pipeline
// ---------------------------------------------------------------------------

export interface EmbeddableEmail {
  readonly id: string;
  readonly accountId: string;
  readonly subject: string;
  readonly fromAddress: string;
  readonly fromName: string | null;
  readonly textBody: string | null;
  readonly htmlBody: string | null;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Client-Side Embedding Config
// ---------------------------------------------------------------------------

export const ClientEmbeddingConfigSchema = z.object({
  /** HuggingFace model ID for Transformers.js. */
  modelId: z.string().default("Xenova/all-MiniLM-L6-v2"),
  /** Quantized model for smaller download. */
  quantized: z.boolean().default(true),
  /** Target dimensions (must match server-side). */
  dimensions: z.number().int().default(EMBEDDING_DIMENSIONS),
  /** Max sequence length for the model. */
  maxSeqLength: z.number().int().default(512),
});
export type ClientEmbeddingConfig = z.infer<typeof ClientEmbeddingConfigSchema>;
