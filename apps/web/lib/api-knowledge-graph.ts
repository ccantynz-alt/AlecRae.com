/**
 * API client for the Knowledge Graph feature domain
 * (apps/api/src/routes/knowledge-graph.ts, mounted at /v1/knowledge in server.ts).
 *
 * Covers all 12 backend endpoints:
 *   POST   /v1/knowledge/extract                    — extract entities/relationships from one email
 *   POST   /v1/knowledge/batch-extract              — batch extract from up to 50 emails
 *   GET    /v1/knowledge/entities                   — list entities (type/search/sortBy/limit/cursor)
 *   GET    /v1/knowledge/entities/:id               — get entity + its relationships
 *   PUT    /v1/knowledge/entities/:id               — update entity description/attributes
 *   DELETE /v1/knowledge/entities/:id               — delete entity
 *   GET    /v1/knowledge/entities/:id/relationships — relationships for one entity
 *   GET    /v1/knowledge/relationships              — list relationships (type/minStrength/limit/cursor)
 *   GET    /v1/knowledge/search?q=                  — search entities by name
 *   GET    /v1/knowledge/graph                      — graph visualization data (nodes + edges)
 *   GET    /v1/knowledge/stats                      — entity/relationship/extraction counts
 *   GET    /v1/knowledge/suggestions                — AI-suggested missing connections
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

interface KnowledgeApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function knowledgeFetch<T>(
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
      return knowledgeFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as KnowledgeApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Entity types ────────────────────────────────────────────────────────────

export type KnowledgeEntityType =
  | "person"
  | "company"
  | "project"
  | "topic"
  | "product"
  | "event"
  | "location";

export const KNOWLEDGE_ENTITY_TYPES: readonly KnowledgeEntityType[] = [
  "person",
  "company",
  "project",
  "topic",
  "product",
  "event",
  "location",
];

export interface KnowledgeEntity {
  id: string;
  accountId: string;
  entityType: KnowledgeEntityType;
  name: string;
  normalizedName: string;
  description: string | null;
  attributes: Record<string, unknown>;
  mentionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRelationship {
  id: string;
  accountId: string;
  sourceEntityId: string;
  targetEntityId: string;
  /** e.g. "works_at", "mentioned_with", "collaborates_with" */
  relationshipType: string;
  /** 0.0 – 1.0 */
  strength: number;
  /** Email IDs serving as evidence for this relationship. */
  evidence: string[];
  lastObservedAt: string;
  createdAt: string;
}

export interface KnowledgeEntityWithRelationships extends KnowledgeEntity {
  relationships: KnowledgeRelationship[];
}

// ─── Request/response shapes ─────────────────────────────────────────────────

export type EntitySortBy = "mentions" | "recent";

export interface ListEntitiesOptions {
  type?: KnowledgeEntityType;
  search?: string;
  sortBy?: EntitySortBy;
  limit?: number;
  cursor?: string;
}

export interface CursorPagination {
  hasMore: boolean;
  nextCursor?: string;
}

export interface EntityListResult {
  data: KnowledgeEntity[];
  pagination?: CursorPagination;
}

export interface ListRelationshipsOptions {
  type?: string;
  minStrength?: number;
  limit?: number;
  cursor?: string;
}

export interface RelationshipListResult {
  data: KnowledgeRelationship[];
  pagination?: CursorPagination;
}

export interface GraphData {
  nodes: KnowledgeEntity[];
  edges: KnowledgeRelationship[];
}

export interface GraphOptions {
  centerEntityId?: string;
  depth?: number;
  maxNodes?: number;
}

export interface KnowledgeStats {
  entitiesByType: { entityType: string; count: number }[];
  totalRelationships: number;
  totalExtractions: number;
}

export interface KnowledgeSuggestion {
  type: string;
  message: string;
  entities: string[];
}

export interface ExtractPayload {
  emailId: string;
  content: string;
  senderEmail?: string;
}

export interface ExtractResult {
  entitiesExtracted: number;
  relationshipsCreated: number;
  processingTimeMs: number;
  entities: { name: string; type: KnowledgeEntityType; normalized: string }[];
}

export interface BatchExtractResult {
  emailId: string;
  entitiesExtracted: number;
}

export interface UpdateEntityPayload {
  description?: string;
  attributes?: Record<string, unknown>;
}

// ─── Knowledge Graph API (/v1/knowledge) ─────────────────────────────────────

export const knowledgeGraphApi = {
  /** POST /v1/knowledge/extract — extract entities/relationships from one email. */
  extract(payload: ExtractPayload): Promise<{ success: boolean; data: ExtractResult }> {
    return knowledgeFetch<{ success: boolean; data: ExtractResult }>(
      "/v1/knowledge/extract",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** POST /v1/knowledge/batch-extract — batch extract from up to 50 emails. */
  batchExtract(
    emails: ExtractPayload[],
  ): Promise<{ success: boolean; processed: number; data: BatchExtractResult[] }> {
    return knowledgeFetch<{
      success: boolean;
      processed: number;
      data: BatchExtractResult[];
    }>("/v1/knowledge/batch-extract", {
      method: "POST",
      body: JSON.stringify({ emails }),
    });
  },

  /** GET /v1/knowledge/entities — list entities, cursor-paginated. */
  listEntities(options?: ListEntitiesOptions): Promise<EntityListResult> {
    const params = new URLSearchParams();
    if (options?.type) params.set("type", options.type);
    if (options?.search) params.set("search", options.search);
    if (options?.sortBy) params.set("sortBy", options.sortBy);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return knowledgeFetch<EntityListResult>(
      `/v1/knowledge/entities${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/knowledge/entities/:id — entity with its relationships. */
  getEntity(id: string): Promise<{ data: KnowledgeEntityWithRelationships }> {
    return knowledgeFetch<{ data: KnowledgeEntityWithRelationships }>(
      `/v1/knowledge/entities/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/knowledge/entities/:id — update description/attributes. */
  updateEntity(
    id: string,
    payload: UpdateEntityPayload,
  ): Promise<{ data: KnowledgeEntity }> {
    return knowledgeFetch<{ data: KnowledgeEntity }>(
      `/v1/knowledge/entities/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/knowledge/entities/:id — delete an entity (cascades relationships). */
  deleteEntity(id: string): Promise<{ success: boolean }> {
    return knowledgeFetch<{ success: boolean }>(
      `/v1/knowledge/entities/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** GET /v1/knowledge/entities/:id/relationships — relationships for one entity. */
  entityRelationships(id: string): Promise<{ data: KnowledgeRelationship[] }> {
    return knowledgeFetch<{ data: KnowledgeRelationship[] }>(
      `/v1/knowledge/entities/${encodeURIComponent(id)}/relationships`,
    );
  },

  /** GET /v1/knowledge/relationships — list relationships, cursor-paginated. */
  listRelationships(
    options?: ListRelationshipsOptions,
  ): Promise<RelationshipListResult> {
    const params = new URLSearchParams();
    if (options?.type) params.set("type", options.type);
    if (options?.minStrength !== undefined)
      params.set("minStrength", String(options.minStrength));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return knowledgeFetch<RelationshipListResult>(
      `/v1/knowledge/relationships${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/knowledge/search?q= — search entities by name (top 20 by mentions). */
  search(q: string): Promise<{ data: KnowledgeEntity[] }> {
    const params = new URLSearchParams({ q });
    return knowledgeFetch<{ data: KnowledgeEntity[] }>(
      `/v1/knowledge/search?${params.toString()}`,
    );
  },

  /** GET /v1/knowledge/graph — graph visualization data (nodes + edges). */
  graph(options?: GraphOptions): Promise<{ data: GraphData }> {
    const params = new URLSearchParams();
    if (options?.centerEntityId) params.set("centerEntityId", options.centerEntityId);
    if (options?.depth !== undefined) params.set("depth", String(options.depth));
    if (options?.maxNodes !== undefined)
      params.set("maxNodes", String(options.maxNodes));
    const qs = params.toString();
    return knowledgeFetch<{ data: GraphData }>(
      `/v1/knowledge/graph${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/knowledge/stats — entity/relationship/extraction counts. */
  stats(): Promise<{ data: KnowledgeStats }> {
    return knowledgeFetch<{ data: KnowledgeStats }>("/v1/knowledge/stats");
  },

  /** GET /v1/knowledge/suggestions — AI-suggested missing connections. */
  suggestions(): Promise<{ data: KnowledgeSuggestion[] }> {
    return knowledgeFetch<{ data: KnowledgeSuggestion[] }>(
      "/v1/knowledge/suggestions",
    );
  },
};
