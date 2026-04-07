-- 0009_create_email_embeddings.sql
-- Semantic vector search for emails. Requires the pgvector extension,
-- which Neon supports natively.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "email_embeddings" (
  "id"               text PRIMARY KEY NOT NULL,
  "email_id"         text NOT NULL REFERENCES "emails"("id") ON DELETE CASCADE,
  "embedding_vector" vector(1024) NOT NULL,
  "model"            text NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now()
);

-- B-tree index for fast lookups by email_id (joins, deletes, dedupe)
CREATE INDEX IF NOT EXISTS "email_embeddings_email_id_idx"
  ON "email_embeddings" ("email_id");

-- One embedding per email per model
CREATE UNIQUE INDEX IF NOT EXISTS "email_embeddings_email_model_uniq"
  ON "email_embeddings" ("email_id", "model");

-- HNSW index for fast approximate kNN with cosine distance.
-- Tuning: m=16, ef_construction=64 are sane defaults for <1M rows.
CREATE INDEX IF NOT EXISTS "email_embeddings_vector_hnsw_idx"
  ON "email_embeddings"
  USING hnsw ("embedding_vector" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
