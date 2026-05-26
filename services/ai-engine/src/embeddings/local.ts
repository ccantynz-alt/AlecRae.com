/**
 * Client-Side Embedding Service — Transformers.js
 *
 * Provides $0/token embedding inference directly in the browser or
 * Node/Bun runtime via @huggingface/transformers. Uses a lightweight
 * sentence-transformer model (all-MiniLM-L6-v2, ~23 MB quantized)
 * that produces 384-dim vectors, which we project up to 1024 dims
 * via zero-padding so they slot into the same pgvector column.
 *
 * This is the FREE path — used when:
 *   - User is on the Free plan (no Voyage/OpenAI API budget)
 *   - Client has WebGPU / WASM and wants sub-10ms local inference
 *   - Server is rate-limited on external APIs
 *
 * Pipeline:
 *   1. Load model on first call (cached after that)
 *   2. Tokenize + run inference (ONNX via Transformers.js)
 *   3. Mean-pool hidden states → 384-dim vector
 *   4. Zero-pad to 1024-dim (pgvector column compatibility)
 *   5. L2-normalize so cosine distance is meaningful
 *
 * NOTE: Quality is lower than Voyage (MTEB ~63 vs ~72 for voyage-3-large),
 * but it's FREE and runs in <50ms on any modern device.
 */

import {
  EMBEDDING_DIMENSIONS,
  MAX_INPUT_LENGTH,
  type ClientEmbeddingConfig,
  type EmbeddingProvider,
} from "./types.js";

// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_MAX_SEQ_LENGTH = 512;
const LOCAL_EMBEDDING_DIM = 384;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _pipeline: TransformersPipeline | null = null;
let _loadPromise: Promise<TransformersPipeline> | null = null;

/**
 * Minimal type for the Transformers.js feature-extraction pipeline.
 * We avoid a hard dependency on @huggingface/transformers so this module
 * compiles even if the package isn't installed. The actual import is
 * dynamic (see `loadPipeline`).
 */
type TransformersPipeline = (input: string | string[], options?: Record<string, unknown>) => Promise<TransformersOutput>;

interface TransformersOutput {
  tolist(): number[][][];
  data: Float32Array;
  dims: number[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * L2-normalize a vector in-place and return it.
 * Cosine similarity requires unit vectors for dot-product equivalence.
 */
function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) {
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) {
    const current = vec[i] ?? 0;
    vec[i] = current / norm;
  }
  return vec;
}

/**
 * Pad (or truncate) a vector to the target dimension count.
 * Zero-padding preserves the direction in the original subspace and
 * makes cosine distance valid across mixed-dimension vectors IF the
 * padded dimensions are always zero for all docs AND queries.
 */
function padToTarget(vec: number[], targetDim: number): number[] {
  if (vec.length === targetDim) return vec;
  if (vec.length > targetDim) return vec.slice(0, targetDim);

  const padded = new Array<number>(targetDim).fill(0);
  for (let i = 0; i < vec.length; i++) {
    padded[i] = vec[i] ?? 0;
  }
  return padded;
}

/**
 * Mean-pool token embeddings from Transformers.js output.
 * The pipeline returns shape [batch, tokens, hidden_dim].
 * We average across the token axis (axis=1).
 */
function meanPool(data: Float32Array, dims: readonly number[]): number[][] {
  const [batchSize, seqLen, hiddenDim] = dims as [number, number, number];
  const results: number[][] = [];

  for (let b = 0; b < batchSize; b++) {
    const vec = new Array<number>(hiddenDim).fill(0);
    const batchOffset = b * seqLen * hiddenDim;

    for (let t = 0; t < seqLen; t++) {
      const tokenOffset = batchOffset + t * hiddenDim;
      for (let d = 0; d < hiddenDim; d++) {
        vec[d] = (vec[d] ?? 0) + (data[tokenOffset + d] ?? 0);
      }
    }

    for (let d = 0; d < hiddenDim; d++) {
      vec[d] = (vec[d] ?? 0) / seqLen;
    }

    results.push(vec);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Pipeline Loader
// ---------------------------------------------------------------------------

async function loadPipeline(
  modelId: string = DEFAULT_MODEL_ID,
  _quantized = true,
): Promise<TransformersPipeline> {
  if (_pipeline) return _pipeline;

  if (_loadPromise) return _loadPromise;

  _loadPromise = (async (): Promise<TransformersPipeline> => {
    try {
      // Dynamic import so the module compiles without @huggingface/transformers
      const transformers = await import("@huggingface/transformers") as {
        pipeline: (
          task: string,
          model: string,
          options?: Record<string, unknown>,
        ) => Promise<TransformersPipeline>;
      };

      const pipe = await transformers.pipeline(
        "feature-extraction",
        modelId,
        { quantized: _quantized },
      );

      _pipeline = pipe;
      return pipe;
    } catch (err) {
      _loadPromise = null;
      throw new Error(
        `Failed to load Transformers.js model "${modelId}": ${(err as Error).message}`,
        { cause: err },
      );
    }
  })();

  return _loadPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const LOCAL_MODEL_ID: EmbeddingProvider = "transformers-js";

/**
 * Check whether Transformers.js is available in this runtime.
 * Returns false if the package is not installed or the dynamic import fails.
 */
export async function isLocalEmbeddingAvailable(): Promise<boolean> {
  try {
    await import("@huggingface/transformers");
    return true;
  } catch {
    return false;
  }
}

/**
 * Embed a single text string using the local Transformers.js pipeline.
 * Returns a 1024-dim L2-normalized vector (zero-padded from 384-dim).
 */
export async function embedLocalText(
  text: string,
  config?: Partial<ClientEmbeddingConfig>,
): Promise<number[]> {
  const truncated = text.slice(0, MAX_INPUT_LENGTH);
  const modelId = config?.modelId ?? DEFAULT_MODEL_ID;
  const quantized = config?.quantized ?? true;
  const targetDim = config?.dimensions ?? EMBEDDING_DIMENSIONS;

  const pipe = await loadPipeline(modelId, quantized);
  const output = await pipe(truncated, { pooling: "mean", normalize: true });

  // Transformers.js returns raw tensor data
  if (output.data && output.dims) {
    const pooled = meanPool(output.data, output.dims);
    const first = pooled[0];
    if (!first) throw new Error("embedLocalText: empty output from model");
    return padToTarget(l2Normalize(first), targetDim);
  }

  // Fallback: tolist() gives nested arrays [batch][seq][dim]
  const list = output.tolist();
  const batch = list[0];
  if (!batch || batch.length === 0) {
    throw new Error("embedLocalText: empty output from model");
  }

  // Mean-pool manually if we got token-level output
  const hiddenDim = batch[0]?.length ?? LOCAL_EMBEDDING_DIM;
  const vec = new Array<number>(hiddenDim).fill(0);
  for (const token of batch) {
    for (let d = 0; d < hiddenDim; d++) {
      vec[d] = (vec[d] ?? 0) + (token[d] ?? 0);
    }
  }
  for (let d = 0; d < hiddenDim; d++) {
    vec[d] = (vec[d] ?? 0) / batch.length;
  }

  return padToTarget(l2Normalize(vec), targetDim);
}

/**
 * Embed multiple texts in a single batch. Returns an array of 1024-dim
 * L2-normalized vectors in the same order as the input texts.
 */
export async function embedLocalBatch(
  texts: readonly string[],
  config?: Partial<ClientEmbeddingConfig>,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const targetDim = config?.dimensions ?? EMBEDDING_DIMENSIONS;
  const maxSeq = config?.maxSeqLength ?? DEFAULT_MAX_SEQ_LENGTH;

  // Transformers.js can be slow with large batches — process in chunks of 32
  const BATCH_SIZE = 32;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE).map(
      (t) => t.slice(0, maxSeq * 4), // rough char-to-token ratio
    );

    // Process sequentially within the chunk — Transformers.js handles batching internally
    for (const text of chunk) {
      const vec = await embedLocalText(text, { ...config, dimensions: targetDim });
      results.push(vec);
    }
  }

  return results;
}

/**
 * Release the loaded model from memory. Call this when the client
 * navigates away or the server is shutting down.
 */
export function disposeLocalModel(): void {
  _pipeline = null;
  _loadPromise = null;
}
