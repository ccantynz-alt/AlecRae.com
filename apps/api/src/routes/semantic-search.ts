/**
 * Semantic Search Route — Vector kNN over Email Embeddings
 *
 * Find emails by MEANING, not keywords.
 *
 *   "Find the email where someone said something like
 *    'we should consider the budget'"
 *
 * Pipeline:
 *   1. POST /v1/semantic/index          — embed + upsert single email
 *   2. POST /v1/semantic/index-batch    — embed + upsert N emails
 *   3. POST /v1/semantic/search         — embed query, kNN cosine search
 *   4. POST /v1/semantic/similar/:id    — kNN search using an existing email
 *   5. DELETE /v1/semantic/index/:id    — drop an email's vector
 *   6. POST /v1/semantic/backfill       — index all un-indexed emails for account
 *   7. GET  /v1/semantic/stats          — auto-indexer health + queue stats
 *
 * Storage: pgvector `vector(1024)` column on `email_embeddings`,
 *          HNSW index with cosine ops (see migration 0009).
 * Embeddings: Voyage AI `voyage-3-large` (fallback OpenAI text-embedding-3-small).
 */

import { Hono } from "hono";
import { z } from "zod";
import { sql, eq, and, inArray } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, emails } from "@alecrae/db";
import {
  embedText,
  embedBatch,
  embedQuery,
  EMBEDDING_DIMENSIONS,
  VOYAGE_MODEL,
} from "@alecrae/ai-engine/embeddings/voyage";
import {
  IndexEmailRequestSchema,
  IndexBatchRequestSchema,
  SimilarEmailsRequestSchema,
  type IndexEmailRequest,
  type IndexBatchRequest,
  type SimilarEmailsRequest,
  type SemanticSearchHit,
  type EmbeddableEmail,
  MAX_SEARCH_RESULTS,
  DEFAULT_SEARCH_LIMIT,
} from "@alecrae/ai-engine/embeddings/types";
import {
  indexAllUnindexed,
  getAutoIndexerStats,
} from "@alecrae/ai-engine/embeddings/auto-indexer";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(DEFAULT_SEARCH_LIMIT),
  /** Maximum cosine distance (0 = identical, 2 = opposite). Optional filter. */
  maxDistance: z.number().min(0).max(2).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build the text we feed into the embedding model for a given email row. */
function buildEmailDocument(row: {
  subject: string;
  fromName: string | null;
  fromAddress: string;
  textBody: string | null;
  htmlBody: string | null;
}): string {
  const sender = row.fromName ? `${row.fromName} <${row.fromAddress}>` : row.fromAddress;
  const body =
    row.textBody ??
    (row.htmlBody ? row.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "");
  // Cap to ~8k chars — voyage-3-large has 32k token context but most signal
  // lives in the first few KB of the body.
  return `From: ${sender}\nSubject: ${row.subject}\n\n${body}`.slice(0, 8000);
}

/** Format a number[] as a pgvector literal: "[1,2,3]" */
function toVectorLiteral(vec: readonly number[]): string {
  if (vec.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding has ${vec.length} dims, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  return `[${vec.join(",")}]`;
}

function rowToHit(row: EmbeddableEmail, distance: number): SemanticSearchHit {
  const text = row.textBody ?? (row.htmlBody ?? "").replace(/<[^>]+>/g, " ");
  return {
    emailId: row.id,
    subject: row.subject,
    from: { email: row.fromAddress, name: row.fromName },
    snippet: text.replace(/\s+/g, " ").trim().slice(0, 240),
    date: row.createdAt.toISOString(),
    // Cosine similarity in [-1, 1]; higher = more similar
    score: 1 - distance,
    distance,
    source: "vector",
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const semanticSearch = new Hono();

// POST /v1/semantic/index — Index a single email
semanticSearch.post(
  "/index",
  requireScope("messages:write"),
  validateBody(IndexEmailRequestSchema),
  async (c) => {
    const input = getValidatedBody<IndexEmailRequest>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [row] = await db
      .select({
        id: emails.id,
        accountId: emails.accountId,
        subject: emails.subject,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        textBody: emails.textBody,
        htmlBody: emails.htmlBody,
      })
      .from(emails)
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!row) {
      return c.json(
        { error: { type: "not_found", message: "Email not found", code: "email_not_found" } },
        404,
      );
    }

    const document = buildEmailDocument(row);
    const vector = await embedText(document);
    const literal = toVectorLiteral(vector);
    const id = generateId();

    await db.execute(sql`
      INSERT INTO email_embeddings (id, email_id, embedding_vector, model, created_at)
      VALUES (${id}, ${row.id}, ${literal}::vector, ${VOYAGE_MODEL}, now())
      ON CONFLICT (email_id, model) DO UPDATE
        SET embedding_vector = EXCLUDED.embedding_vector,
            created_at = now()
    `);

    return c.json({
      data: {
        emailId: row.id,
        model: VOYAGE_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        indexedAt: new Date().toISOString(),
      },
    });
  },
);

// POST /v1/semantic/index-batch — Index multiple emails at once
semanticSearch.post(
  "/index-batch",
  requireScope("messages:write"),
  validateBody(IndexBatchRequestSchema),
  async (c) => {
    const input = getValidatedBody<IndexBatchRequest>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select({
        id: emails.id,
        accountId: emails.accountId,
        subject: emails.subject,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        textBody: emails.textBody,
        htmlBody: emails.htmlBody,
      })
      .from(emails)
      .where(and(inArray(emails.id, input.emailIds), eq(emails.accountId, auth.accountId)));

    if (rows.length === 0) {
      return c.json({ data: { indexed: 0, skipped: input.emailIds.length, results: [] } });
    }

    const documents = rows.map(buildEmailDocument);
    const vectors = await embedBatch(documents);

    let indexed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const vec = vectors[i];
      if (!vec) continue;
      const literal = toVectorLiteral(vec);
      const id = generateId();
      await db.execute(sql`
        INSERT INTO email_embeddings (id, email_id, embedding_vector, model, created_at)
        VALUES (${id}, ${row.id}, ${literal}::vector, ${VOYAGE_MODEL}, now())
        ON CONFLICT (email_id, model) DO UPDATE
          SET embedding_vector = EXCLUDED.embedding_vector,
              created_at = now()
      `);
      indexed++;
    }

    return c.json({
      data: {
        indexed,
        skipped: input.emailIds.length - indexed,
        model: VOYAGE_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      },
    });
  },
);

// POST /v1/semantic/search — Semantic kNN search
semanticSearch.post(
  "/search",
  requireScope("messages:read"),
  validateBody(SearchSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SearchSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const start = Date.now();
    const queryVector = await embedQuery(input.query);
    const literal = toVectorLiteral(queryVector);

    // pgvector cosine distance operator: <=>  (lower is closer)
    // Join through emails to enforce account scoping.
    const distanceFilter = input.maxDistance !== undefined
      ? sql`AND (ee.embedding_vector <=> ${literal}::vector) <= ${input.maxDistance}`
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
      WHERE e.account_id = ${auth.accountId}
      ${distanceFilter}
      ORDER BY ee.embedding_vector <=> ${literal}::vector
      LIMIT ${input.limit}
    `);

    const rows = (result as unknown as { rows: {
      id: string; account_id: string; subject: string; from_address: string;
      from_name: string | null; text_body: string | null; html_body: string | null;
      created_at: Date; distance: number;
    }[] }).rows ?? [];

    const hits: SemanticSearchHit[] = rows.map((r) =>
      rowToHit(
        {
          id: r.id,
          accountId: r.account_id,
          subject: r.subject,
          fromAddress: r.from_address,
          fromName: r.from_name,
          textBody: r.text_body,
          htmlBody: r.html_body,
          createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
        },
        Number(r.distance),
      ),
    );

    return c.json({
      data: {
        query: input.query,
        results: hits,
        totalHits: hits.length,
        processingTimeMs: Date.now() - start,
        model: VOYAGE_MODEL,
        usedVectorSearch: true,
      },
    });
  },
);

// POST /v1/semantic/similar/:emailId — Find similar emails to a given one
semanticSearch.post(
  "/similar/:emailId",
  requireScope("messages:read"),
  validateBody(SimilarEmailsRequestSchema),
  async (c) => {
    const emailId = c.req.param("emailId");
    const input = getValidatedBody<SimilarEmailsRequest>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const start = Date.now();

    // Find the source vector (must belong to caller's account)
    const sourceResult = await db.execute<{ embedding_vector: string }>(sql`
      SELECT ee.embedding_vector::text AS embedding_vector
      FROM email_embeddings ee
      JOIN emails e ON e.id = ee.email_id
      WHERE ee.email_id = ${emailId}
        AND e.account_id = ${auth.accountId}
      LIMIT 1
    `);

    const sourceRows = (sourceResult as unknown as { rows: { embedding_vector: string }[] }).rows ?? [];
    const source = sourceRows[0];
    if (!source) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Email not indexed. Call /v1/semantic/index first.",
            code: "embedding_not_found",
          },
        },
        404,
      );
    }

    const literal = source.embedding_vector;

    const result = await db.execute(sql`
      SELECT e.id,
             e.subject,
             e.from_address,
             e.from_name,
             e.text_body,
             e.html_body,
             e.created_at,
             (ee.embedding_vector <=> ${literal}::vector) AS distance
      FROM email_embeddings ee
      JOIN emails e ON e.id = ee.email_id
      WHERE e.account_id = ${auth.accountId}
        AND e.id <> ${emailId}
      ORDER BY ee.embedding_vector <=> ${literal}::vector
      LIMIT ${input.limit}
    `);

    const rows = (result as unknown as { rows: {
      id: string; subject: string; from_address: string; from_name: string | null;
      text_body: string | null; html_body: string | null; created_at: Date; distance: number;
    }[] }).rows ?? [];

    const hits: SemanticSearchHit[] = rows.map((r) =>
      rowToHit(
        {
          id: r.id,
          accountId: auth.accountId,
          subject: r.subject,
          fromAddress: r.from_address,
          fromName: r.from_name,
          textBody: r.text_body,
          htmlBody: r.html_body,
          createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
        },
        Number(r.distance),
      ),
    );

    return c.json({
      data: {
        sourceEmailId: emailId,
        results: hits,
        totalHits: hits.length,
        processingTimeMs: Date.now() - start,
      },
    });
  },
);

// DELETE /v1/semantic/index/:emailId — Remove an email from the index
semanticSearch.delete(
  "/index/:emailId",
  requireScope("messages:write"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const result = await db.execute(sql`
      DELETE FROM email_embeddings
      WHERE email_id = ${emailId}
        AND email_id IN (SELECT id FROM emails WHERE account_id = ${auth.accountId})
    `);

    const deleted =
      (result as unknown as { rowCount?: number }).rowCount ??
      (result as unknown as { rowsAffected?: number }).rowsAffected ??
      0;

    return c.json({
      data: {
        emailId,
        deleted: deleted > 0,
      },
    });
  },
);

// POST /v1/semantic/backfill — Index all un-indexed emails for the account
semanticSearch.post(
  "/backfill",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");

    try {
      const enqueued = await indexAllUnindexed(auth.accountId);

      return c.json({
        data: {
          enqueued,
          message:
            enqueued > 0
              ? `Enqueued ${enqueued} emails for background embedding.`
              : "All emails are already indexed.",
        },
      });
    } catch (err) {
      return c.json(
        {
          error: {
            type: "server_error",
            message: `Backfill failed: ${(err as Error).message}`,
            code: "backfill_failed",
          },
        },
        500,
      );
    }
  },
);

// GET /v1/semantic/stats — Auto-indexer health and queue stats
semanticSearch.get(
  "/stats",
  requireScope("messages:read"),
  async (c) => {
    const stats = getAutoIndexerStats();

    return c.json({
      data: stats,
    });
  },
);

export { semanticSearch };
