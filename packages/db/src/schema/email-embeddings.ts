/**
 * Email Embeddings Schema — Semantic Vector Search
 *
 * Stores per-email embedding vectors used for kNN semantic search.
 * Backed by the pgvector extension (Neon-native).
 *
 * The embedding column is declared as `vector(1024)` because we use Voyage AI's
 * `voyage-3-large` model (1024 dimensions). When falling back to OpenAI's
 * `text-embedding-3-small` (1536 dim) we project / re-embed via Voyage so the
 * column dimension stays fixed. The migration sets this up at the SQL level.
 *
 * NOTE: Drizzle's pg-core does not yet have a first-class `vector` type, so we
 * declare the column with `customType` so the rest of the schema/typegen still
 * works. Reads/writes are performed via raw SQL in the route layer.
 */

import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { emails } from "./emails.js";

// ---------------------------------------------------------------------------
// Custom pgvector type
// ---------------------------------------------------------------------------

/**
 * pgvector column type. Stored as `vector(N)` in Postgres, surfaced as
 * `number[]` in TypeScript. The dimension is fixed by the migration; we set
 * it here so Drizzle prints `vector(1024)` if it ever generates DDL.
 */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config): string {
    const dims = config?.dimensions ?? 1024;
    return `vector(${dims})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns "[1,2,3]" on the wire
    const trimmed = value.replace(/^\[|\]$/g, "");
    if (trimmed.length === 0) return [];
    return trimmed.split(",").map((n) => Number.parseFloat(n));
  },
});

// ---------------------------------------------------------------------------
// email_embeddings
// ---------------------------------------------------------------------------

export const emailEmbeddings = pgTable(
  "email_embeddings",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    embeddingVector: vector("embedding_vector", { dimensions: 1024 }).notNull(),
    /** Model identifier, e.g. "voyage-3-large" or "text-embedding-3-small" */
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // B-tree for fast lookups/joins/deletes by email_id.
    index("email_embeddings_email_id_idx").on(table.emailId),
    // One embedding per email per model — required: the indexer upserts with
    // ON CONFLICT (email_id, model).
    uniqueIndex("email_embeddings_email_model_uniq").on(
      table.emailId,
      table.model,
    ),
    // HNSW index for fast approximate kNN with cosine distance (pgvector).
    index("email_embeddings_vector_hnsw_idx")
      .using("hnsw", table.embeddingVector.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const emailEmbeddingsRelations = relations(emailEmbeddings, ({ one }) => ({
  email: one(emails, {
    fields: [emailEmbeddings.emailId],
    references: [emails.id],
  }),
}));
