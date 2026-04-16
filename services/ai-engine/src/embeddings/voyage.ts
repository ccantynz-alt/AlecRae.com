/**
 * Voyage AI Embeddings Service
 *
 * Best-in-class embeddings as of 2025. We use `voyage-3-large` (1024 dim)
 * because it tops MTEB while sharing the same dimensionality as `voyage-3`,
 * which keeps our pgvector column shape stable if we ever swap models.
 *
 * If `VOYAGE_API_KEY` is missing OR the Voyage API errors, we transparently
 * fall back to OpenAI's `text-embedding-3-small`. The fallback requests 1024
 * dimensions explicitly via the `dimensions` parameter so it slots into the
 * same `vector(1024)` column with no schema drift.
 *
 * Docs: https://docs.voyageai.com/docs/embeddings
 */

const VOYAGE_API_KEY = process.env["VOYAGE_API_KEY"];
const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const OPENAI_URL = "https://api.openai.com/v1/embeddings";

export const VOYAGE_MODEL = "voyage-3-large";
export const OPENAI_FALLBACK_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1024;

// Voyage hard-caps batch size at 128 for `voyage-3-large`.
const VOYAGE_MAX_BATCH = 128;
// OpenAI accepts up to 2048 inputs per batch.
const OPENAI_MAX_BATCH = 1024;

export interface EmbedResult {
  vectors: number[][];
  model: string;
}

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
}

interface OpenAIResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function callVoyage(
  inputs: readonly string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY not set");
  }

  const vectors: number[][] = new Array<number[]>(inputs.length);

  for (const batch of chunk(inputs, VOYAGE_MAX_BATCH)) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: batch,
        input_type: inputType,
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Voyage API error ${res.status}: ${body}`);
    }

    const json = (await res.json()) as VoyageResponse;
    // Re-key by `index` so order is guaranteed regardless of API ordering.
    const offset = vectors.findIndex((v) => v === undefined);
    for (const item of json.data) {
      vectors[offset + item.index] = item.embedding;
    }
  }

  return vectors;
}

async function callOpenAI(inputs: readonly string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const vectors: number[][] = new Array<number[]>(inputs.length);

  for (const batch of chunk(inputs, OPENAI_MAX_BATCH)) {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_FALLBACK_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings error ${res.status}: ${body}`);
    }

    const json = (await res.json()) as OpenAIResponse;
    const offset = vectors.findIndex((v) => v === undefined);
    for (const item of json.data) {
      vectors[offset + item.index] = item.embedding;
    }
  }

  return vectors;
}

async function embedInternal(
  inputs: readonly string[],
  inputType: "document" | "query",
): Promise<EmbedResult> {
  if (inputs.length === 0) {
    return { vectors: [], model: VOYAGE_MODEL };
  }

  // Voyage path
  if (VOYAGE_API_KEY) {
    try {
      const vectors = await callVoyage(inputs, inputType);
      return { vectors, model: VOYAGE_MODEL };
    } catch (err) {
      console.warn(
        "[embeddings] Voyage failed, falling back to OpenAI:",
        (err as Error).message,
      );
    }
  }

  // OpenAI fallback path
  const vectors = await callOpenAI(inputs);
  return { vectors, model: OPENAI_FALLBACK_MODEL };
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Embed a single document (or query). Returns the raw float vector. */
export async function embedText(text: string): Promise<number[]> {
  const result = await embedInternal([text], "document");
  const first = result.vectors[0];
  if (!first) throw new Error("embedText returned no vector");
  return first;
}

/** Embed many documents in one call (auto-batched under provider limits). */
export async function embedBatch(texts: readonly string[]): Promise<number[][]> {
  const result = await embedInternal(texts, "document");
  return result.vectors;
}

/**
 * Embed a search query. Voyage gives slightly different vectors for
 * `input_type=query` vs `document`, which improves retrieval quality.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const result = await embedInternal([text], "query");
  const first = result.vectors[0];
  if (!first) throw new Error("embedQuery returned no vector");
  return first;
}

/** Same as `embedBatch`, but tags the result with the model used. */
export async function embedDocumentsWithModel(
  texts: readonly string[],
): Promise<EmbedResult> {
  return embedInternal(texts, "document");
}
