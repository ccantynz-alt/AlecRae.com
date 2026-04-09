/**
 * Vienna WebGPU Client-Side AI Inference (Tier S1 — Industry First)
 *
 * Runs Llama 3.1/3.2 directly in the user's browser via WebGPU.
 * No competitor has this. This is the moat.
 *
 * Cost economics:
 *   - Claude Haiku API:  ~$0.25 / 1M input tokens, ~$1.25 / 1M output tokens
 *   - Claude Sonnet API: ~$3.00 / 1M input tokens, ~$15.00 / 1M output tokens
 *   - Vienna WebGPU:     $0.00 / token  (runs on user's GPU, our cost = 0)
 *
 * At 10K daily active users × 50 AI calls/day × 200 tokens average,
 * shifting just grammar + short replies to WebGPU saves Vienna ~$2,400/month
 * on Haiku pricing, ~$28,000/month if we'd been on Sonnet. Per 10K users.
 * The savings compound with growth — this is why Vienna can sell at $9/mo.
 *
 * Privacy bonus: prompts never leave the device. GDPR/HIPAA-friendly by design.
 *
 * Performance targets (per CLAUDE.md):
 *   - First token latency: < 200ms
 *   - Throughput: ~30-60 tok/s on M2/M3, ~20-40 tok/s on RTX 3060+
 *
 * Architecture:
 *   1. Detect WebGPU + adapter limits to estimate VRAM budget
 *   2. Pick the largest Llama variant that fits (1B -> 3B -> 8B)
 *   3. Stream model weights into the browser cache (~500MB-4GB, one-time)
 *   4. Spin up the WebLLM engine; expose generate / generateStreaming
 *   5. Fall back gracefully on unsupported devices — callers use cloud API
 *   6. Cache model metadata in IndexedDB for instant subsequent loads
 *   7. Expose progress events for UI status indicators
 */

import type {
  MLCEngineInterface,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";
import { z } from "zod";

// ─── Zod Schemas ────────────────────────────────────────────────────────────

export const WebGPUCapabilitiesSchema = z.object({
  supported: z.boolean(),
  adapter: z.string(),
  vramMB: z.number().nonnegative(),
  reason: z.string().optional(),
});

export const GenerateOptionsSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  stream: z.boolean().optional(),
  systemPrompt: z.string().optional(),
});

export const ModelIdSchema = z.enum([
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  "Llama-3.1-8B-Instruct-q4f32_1-MLC",
]);

export const ModelDownloadProgressSchema = z.object({
  modelId: ModelIdSchema,
  /** 0-100 percentage */
  percent: z.number().min(0).max(100),
  /** Human-readable progress text from WebLLM */
  text: z.string(),
  /** Phase of the download/init process */
  phase: z.enum(["downloading", "loading", "compiling", "ready", "error"]),
  /** Estimated bytes downloaded so far (when available) */
  downloadedBytes: z.number().nonnegative().optional(),
  /** Total bytes to download (when available) */
  totalBytes: z.number().nonnegative().optional(),
  /** Timestamp of this progress update */
  timestamp: z.number(),
});

export const InferenceStatsSchema = z.object({
  modelId: ModelIdSchema,
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  tokensPerSecond: z.number().nonnegative(),
  timestamp: z.number(),
});

export const ModelCacheMetadataSchema = z.object({
  modelId: ModelIdSchema,
  cachedAt: z.number(),
  lastUsedAt: z.number(),
  loadCount: z.number().int().nonnegative(),
  totalInferences: z.number().int().nonnegative(),
  averageLatencyMs: z.number().nonnegative(),
  cacheSizeMB: z.number().nonnegative(),
});

// ─── Public Types ────────────────────────────────────────────────────────────

export type WebGPUCapabilities = z.infer<typeof WebGPUCapabilitiesSchema>;
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type ModelId = z.infer<typeof ModelIdSchema>;
export type ModelDownloadProgress = z.infer<typeof ModelDownloadProgressSchema>;
export type InferenceStats = z.infer<typeof InferenceStatsSchema>;
export type ModelCacheMetadata = z.infer<typeof ModelCacheMetadataSchema>;

export type ProgressCallback = (progress: ModelDownloadProgress) => void;

interface ModelSpec {
  id: ModelId;
  /** Approximate VRAM required to load + run, in MB. */
  vramRequiredMB: number;
  /** Approximate disk/cache footprint, in MB. */
  cacheSizeMB: number;
  /** Maximum sustained context window in tokens. */
  contextWindow: number;
  /** Human-friendly label for the model. */
  label: string;
}

/**
 * Suggested model order: smallest first. We pick the LARGEST model that
 * fits comfortably (with headroom) inside the user's reported VRAM budget.
 */
export const MODEL_CATALOG: readonly ModelSpec[] = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    vramRequiredMB: 1100,
    cacheSizeMB: 700,
    contextWindow: 4096,
    label: "Llama 3.2 1B",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    vramRequiredMB: 2400,
    cacheSizeMB: 1900,
    contextWindow: 4096,
    label: "Llama 3.2 3B",
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    vramRequiredMB: 5800,
    cacheSizeMB: 4300,
    contextWindow: 4096,
    label: "Llama 3.1 8B",
  },
] as const;

// ─── WebGPU type augmentation (lib.dom.d.ts is uneven across TS versions) ──

interface NavigatorGPULike {
  gpu?: {
    requestAdapter(): Promise<GPUAdapterLike | null>;
  };
}

interface GPUAdapterLike {
  readonly features: ReadonlySet<string>;
  readonly limits: Record<string, number>;
  readonly info?: { vendor?: string; architecture?: string; device?: string };
  requestAdapterInfo?: () => Promise<{
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  }>;
}

// ─── IndexedDB Model Cache Metadata ─────────────────────────────────────────

const CACHE_DB_NAME = "vienna-ai-models";
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = "model-metadata";

/**
 * Opens the IndexedDB database for model cache metadata. This stores
 * metadata about downloaded models (not the weights themselves — WebLLM
 * uses Cache Storage API for that). We track usage stats, load counts,
 * and timing data to inform the UI about model availability.
 */
function openCacheDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = (): void => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: "modelId" });
      }
    };

    request.onsuccess = (): void => {
      resolve(request.result);
    };

    request.onerror = (): void => {
      reject(new Error(`Failed to open cache DB: ${request.error?.message ?? "unknown"}`));
    };
  });
}

/**
 * Retrieves cached metadata for a model. Returns null if not found
 * or if IndexedDB is unavailable (SSR, etc.).
 */
export async function getCacheMetadata(modelId: ModelId): Promise<ModelCacheMetadata | null> {
  try {
    const db = await openCacheDB();
    return new Promise<ModelCacheMetadata | null>((resolve) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readonly");
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.get(modelId);

      request.onsuccess = (): void => {
        const result: unknown = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        const parsed = ModelCacheMetadataSchema.safeParse(result);
        resolve(parsed.success ? parsed.data : null);
      };

      request.onerror = (): void => {
        resolve(null);
      };

      tx.oncomplete = (): void => {
        db.close();
      };
    });
  } catch {
    return null;
  }
}

/**
 * Persists or updates model cache metadata in IndexedDB.
 */
async function saveCacheMetadata(metadata: ModelCacheMetadata): Promise<void> {
  try {
    const db = await openCacheDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
      const store = tx.objectStore(CACHE_STORE_NAME);
      store.put(metadata);

      tx.oncomplete = (): void => {
        db.close();
        resolve();
      };

      tx.onerror = (): void => {
        db.close();
        reject(new Error(`Failed to save cache metadata: ${tx.error?.message ?? "unknown"}`));
      };
    });
  } catch {
    // Non-critical — cache metadata is best-effort
  }
}

/**
 * Records that a model was loaded and used. Increments counters and
 * updates timestamps for the UI to consume.
 */
async function recordModelLoad(modelId: ModelId): Promise<void> {
  const existing = await getCacheMetadata(modelId);
  const spec = MODEL_CATALOG.find((m) => m.id === modelId);
  const now = Date.now();

  const metadata: ModelCacheMetadata = {
    modelId,
    cachedAt: existing?.cachedAt ?? now,
    lastUsedAt: now,
    loadCount: (existing?.loadCount ?? 0) + 1,
    totalInferences: existing?.totalInferences ?? 0,
    averageLatencyMs: existing?.averageLatencyMs ?? 0,
    cacheSizeMB: spec?.cacheSizeMB ?? 0,
  };

  await saveCacheMetadata(metadata);
}

/**
 * Records inference statistics. Updates running averages in the
 * IndexedDB cache metadata.
 */
async function recordInferenceStats(stats: InferenceStats): Promise<void> {
  const existing = await getCacheMetadata(stats.modelId);
  if (!existing) return;

  const newTotal = existing.totalInferences + 1;
  const newAvgLatency =
    (existing.averageLatencyMs * existing.totalInferences + stats.latencyMs) / newTotal;

  await saveCacheMetadata({
    ...existing,
    lastUsedAt: Date.now(),
    totalInferences: newTotal,
    averageLatencyMs: Math.round(newAvgLatency * 100) / 100,
  });
}

/**
 * Returns cache metadata for all models that have been downloaded.
 */
export async function getAllCacheMetadata(): Promise<readonly ModelCacheMetadata[]> {
  try {
    const db = await openCacheDB();
    return new Promise<readonly ModelCacheMetadata[]>((resolve) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readonly");
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (): void => {
        const results = request.result as unknown[];
        const validated: ModelCacheMetadata[] = [];
        for (const item of results) {
          const parsed = ModelCacheMetadataSchema.safeParse(item);
          if (parsed.success) {
            validated.push(parsed.data);
          }
        }
        resolve(validated);
      };

      request.onerror = (): void => {
        resolve([]);
      };

      tx.oncomplete = (): void => {
        db.close();
      };
    });
  } catch {
    return [];
  }
}

// ─── Module State ────────────────────────────────────────────────────────────

interface EngineState {
  engine: MLCEngineInterface;
  modelId: ModelId;
  loadedAt: number;
}

let engineState: EngineState | null = null;
let cachedCapabilities: WebGPUCapabilities | null = null;
let loadInFlight: Promise<void> | null = null;

/** Subscribers to progress events during model download/init. */
const progressSubscribers = new Set<ProgressCallback>();

/** Most recent progress snapshot for late subscribers. */
let lastProgress: ModelDownloadProgress | null = null;

/**
 * Subscribe to model download/initialization progress events.
 * Returns an unsubscribe function.
 */
export function onProgress(callback: ProgressCallback): () => void {
  progressSubscribers.add(callback);
  // Replay last known progress for late joiners
  if (lastProgress) {
    callback(lastProgress);
  }
  return (): void => {
    progressSubscribers.delete(callback);
  };
}

function emitProgress(progress: ModelDownloadProgress): void {
  lastProgress = progress;
  for (const cb of progressSubscribers) {
    try {
      cb(progress);
    } catch {
      // Subscriber errors must not break the pipeline
    }
  }
}

// ─── Capability Detection ────────────────────────────────────────────────────

/**
 * Detects WebGPU support and probes the adapter to estimate VRAM headroom.
 *
 * The WebGPU spec does not expose actual VRAM directly, but
 * `maxBufferSize` and `maxStorageBufferBindingSize` are strong proxies.
 * We translate these into a conservative usable-VRAM estimate.
 */
export async function initWebGPU(): Promise<WebGPUCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  if (typeof navigator === "undefined") {
    cachedCapabilities = {
      supported: false,
      adapter: "none",
      vramMB: 0,
      reason: "navigator unavailable (SSR)",
    };
    return cachedCapabilities;
  }

  const nav = navigator as unknown as NavigatorGPULike;
  if (!nav.gpu) {
    cachedCapabilities = {
      supported: false,
      adapter: "none",
      vramMB: 0,
      reason: "navigator.gpu not present (browser lacks WebGPU)",
    };
    return cachedCapabilities;
  }

  let adapter: GPUAdapterLike | null;
  try {
    adapter = await nav.gpu.requestAdapter();
  } catch (err) {
    cachedCapabilities = {
      supported: false,
      adapter: "none",
      vramMB: 0,
      reason: `requestAdapter threw: ${(err as Error).message}`,
    };
    return cachedCapabilities;
  }

  if (!adapter) {
    cachedCapabilities = {
      supported: false,
      adapter: "none",
      vramMB: 0,
      reason: "no GPU adapter available",
    };
    return cachedCapabilities;
  }

  // Resolve adapter description
  let adapterName = "unknown";
  try {
    if (adapter.info) {
      adapterName = [adapter.info.vendor, adapter.info.architecture, adapter.info.device]
        .filter((s): s is string => Boolean(s))
        .join(" ") || "unknown";
    } else if (adapter.requestAdapterInfo) {
      const info = await adapter.requestAdapterInfo();
      adapterName =
        [info.vendor, info.architecture, info.device, info.description]
          .filter((s): s is string => Boolean(s))
          .join(" ") || "unknown";
    }
  } catch {
    // Some browsers gate adapter info; not fatal.
  }

  // Estimate VRAM budget. WebGPU's maxBufferSize is the largest single
  // buffer the device promises to honor — it's a strong lower bound on
  // available VRAM. We multiply modestly to estimate total usable VRAM,
  // then cap to known sane ranges.
  const maxBufferSize = Number(adapter.limits["maxBufferSize"] ?? 0);
  const maxStorageBuffer = Number(adapter.limits["maxStorageBufferBindingSize"] ?? 0);
  const largestBuffer = Math.max(maxBufferSize, maxStorageBuffer);

  // largestBuffer is in bytes. A device that exposes a 2GB max buffer
  // virtually always has 4GB+ of VRAM available; conversely, integrated
  // GPUs typically expose 256MB-1GB max buffers and have 1-4GB shared.
  // We use a 1.8x multiplier as a conservative estimate.
  const estimatedBytes = Math.floor(largestBuffer * 1.8);
  const vramMB = Math.max(512, Math.floor(estimatedBytes / (1024 * 1024)));

  cachedCapabilities = {
    supported: true,
    adapter: adapterName,
    vramMB,
  };
  return cachedCapabilities;
}

/**
 * Picks the largest model from the catalog that fits the given VRAM budget,
 * leaving ~25% headroom for KV cache + activations + browser overhead.
 * Returns `null` if not even the smallest model fits.
 */
export function pickModelForVRAM(vramMB: number): ModelId | null {
  const usable = vramMB * 0.75;
  let chosen: ModelId | null = null;
  for (const spec of MODEL_CATALOG) {
    if (spec.vramRequiredMB <= usable) {
      chosen = spec.id;
    }
  }
  return chosen;
}

/**
 * Returns the ModelSpec for a given model ID, or undefined if not in catalog.
 */
export function getModelSpec(modelId: ModelId): ModelSpec | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

// ─── Model Loading ───────────────────────────────────────────────────────────

/**
 * Parses the WebLLM progress text to extract byte-level download info
 * when available. WebLLM emits messages like "Fetching param cache[0/3]: 45.2MB fetched".
 */
function parseProgressText(text: string): { downloadedBytes?: number; totalBytes?: number } {
  // Pattern: "45.2MB fetched" or "123.4/500.0MB"
  const slashMatch = text.match(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s*MB/i);
  if (slashMatch?.[1] !== undefined && slashMatch[2] !== undefined) {
    return {
      downloadedBytes: Math.round(parseFloat(slashMatch[1]) * 1024 * 1024),
      totalBytes: Math.round(parseFloat(slashMatch[2]) * 1024 * 1024),
    };
  }

  const fetchedMatch = text.match(/(\d+(?:\.\d+)?)\s*MB\s*fetched/i);
  if (fetchedMatch?.[1] !== undefined) {
    return {
      downloadedBytes: Math.round(parseFloat(fetchedMatch[1]) * 1024 * 1024),
    };
  }

  return {};
}

/**
 * Determines the phase of model initialization from the WebLLM progress text.
 */
function parsePhase(text: string, progress: number): ModelDownloadProgress["phase"] {
  const lower = text.toLowerCase();
  if (lower.includes("error") || lower.includes("fail")) return "error";
  if (progress >= 1) return "ready";
  if (lower.includes("compil") || lower.includes("shader")) return "compiling";
  if (lower.includes("load") || lower.includes("init")) return "loading";
  return "downloading";
}

/**
 * Loads a model into the WebLLM engine. Idempotent: calling twice with
 * the same modelId is a no-op; calling with a different modelId unloads
 * the previous one first.
 *
 * Model weights are streamed once and cached by WebLLM in the browser's
 * Cache Storage API (typically a few hundred MB to a few GB). Subsequent
 * page loads are instant.
 *
 * Progress is emitted to both the provided callback and the global
 * progress subscriber system (for the status indicator component).
 */
export async function loadModel(
  modelId: ModelId,
  onProgressCb: (pct: number) => void,
): Promise<void> {
  if (engineState && engineState.modelId === modelId) {
    onProgressCb(100);
    emitProgress({
      modelId,
      percent: 100,
      text: "Model ready",
      phase: "ready",
      timestamp: Date.now(),
    });
    return;
  }

  if (loadInFlight) {
    await loadInFlight;
    if (engineState && (engineState as EngineState).modelId === modelId) {
      onProgressCb(100);
      return;
    }
  }

  loadInFlight = (async (): Promise<void> => {
    // Unload any prior model first to free VRAM
    if (engineState) {
      try {
        await engineState.engine.unload();
      } catch {
        // best-effort
      }
      engineState = null;
    }

    emitProgress({
      modelId,
      percent: 0,
      text: "Initializing WebGPU engine...",
      phase: "downloading",
      timestamp: Date.now(),
    });

    // Dynamic import keeps the ~MB WebLLM bundle out of the main chunk.
    // Cloud-only users never pay the download cost.
    const webllm = await import("@mlc-ai/web-llm");

    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report: InitProgressReport): void => {
        // report.progress is 0..1
        const pct = Math.max(0, Math.min(100, Math.round(report.progress * 100)));
        const text = typeof report.text === "string" ? report.text : "";
        const byteInfo = parseProgressText(text);

        onProgressCb(pct);
        emitProgress({
          modelId,
          percent: pct,
          text: text || `Loading model... ${pct}%`,
          phase: parsePhase(text, report.progress),
          downloadedBytes: byteInfo.downloadedBytes,
          totalBytes: byteInfo.totalBytes,
          timestamp: Date.now(),
        });
      },
    });

    engineState = {
      engine,
      modelId,
      loadedAt: Date.now(),
    };

    // Record load in IndexedDB for cache tracking
    await recordModelLoad(modelId);

    onProgressCb(100);
    emitProgress({
      modelId,
      percent: 100,
      text: "Model ready",
      phase: "ready",
      timestamp: Date.now(),
    });
  })();

  try {
    await loadInFlight;
  } finally {
    loadInFlight = null;
  }
}

/**
 * Returns the loaded engine or throws a clear error. Used as a runtime
 * gate before any inference call.
 */
function requireEngine(): EngineState {
  if (!engineState) {
    throw new Error(
      "[webgpu-inference] No model loaded. Call loadModel() before generate().",
    );
  }
  return engineState;
}

export function isModelLoaded(): boolean {
  return engineState !== null;
}

export function getLoadedModelId(): ModelId | null {
  return engineState?.modelId ?? null;
}

/**
 * Returns the last known progress snapshot. Useful for components that
 * mount after loading has already started/completed.
 */
export function getLastProgress(): ModelDownloadProgress | null {
  return lastProgress;
}

// ─── Generation ──────────────────────────────────────────────────────────────

function buildMessages(
  prompt: string,
  systemPrompt: string | undefined,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

/**
 * Generate a completion. Returns a string by default, or an AsyncIterable<string>
 * of token chunks when `options.stream === true`.
 *
 * Cost: $0. Always. This is the whole point.
 */
export function generate(prompt: string, options?: GenerateOptions): Promise<string>;
export function generate(
  prompt: string,
  options: GenerateOptions & { stream: true },
): AsyncIterable<string>;
export function generate(
  prompt: string,
  options?: GenerateOptions,
): Promise<string> | AsyncIterable<string> {
  if (options?.stream === true) {
    return generateStreaming(prompt, options);
  }
  return generateOnce(prompt, options);
}

async function generateOnce(
  prompt: string,
  options?: GenerateOptions,
): Promise<string> {
  const { engine, modelId } = requireEngine();
  const messages = buildMessages(prompt, options?.systemPrompt);
  const start = performance.now();

  const response = await engine.chat.completions.create({
    messages,
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.7,
    top_p: options?.topP ?? 0.95,
    stream: false,
  });

  const choice = response.choices[0];
  const text = choice?.message.content ?? "";
  const latencyMs = performance.now() - start;
  const usage = response.usage;

  // Record inference stats in IndexedDB
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const stats: InferenceStats = {
    modelId,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    latencyMs: Math.round(latencyMs * 100) / 100,
    tokensPerSecond: latencyMs > 0
      ? Math.round((completionTokens / (latencyMs / 1000)) * 100) / 100
      : 0,
    timestamp: Date.now(),
  };

  // Fire-and-forget — don't block on IndexedDB write
  void recordInferenceStats(stats);

  return text;
}

/**
 * Streaming variant. Yields incremental text deltas as tokens arrive.
 *
 * Usage:
 *   for await (const chunk of generateStreaming("Summarize: ...")) {
 *     process.stdout.write(chunk);
 *   }
 */
export async function* generateStreaming(
  prompt: string,
  options?: GenerateOptions,
): AsyncIterable<string> {
  const { engine, modelId } = requireEngine();
  const messages = buildMessages(prompt, options?.systemPrompt);
  const start = performance.now();
  let tokenCount = 0;

  const stream = await engine.chat.completions.create({
    messages,
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.7,
    top_p: options?.topP ?? 0.95,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta.content;
    if (typeof delta === "string" && delta.length > 0) {
      tokenCount++;
      yield delta;
    }
  }

  // Record inference stats after streaming completes
  const latencyMs = performance.now() - start;
  const stats: InferenceStats = {
    modelId,
    promptTokens: 0, // Not available during streaming
    completionTokens: tokenCount,
    totalTokens: tokenCount,
    latencyMs: Math.round(latencyMs * 100) / 100,
    tokensPerSecond: latencyMs > 0
      ? Math.round((tokenCount / (latencyMs / 1000)) * 100) / 100
      : 0,
    timestamp: Date.now(),
  };

  void recordInferenceStats(stats);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Unloads the model and frees GPU memory. Call this when the user navigates
 * away from AI-heavy surfaces or explicitly disables local inference.
 */
export async function unload(): Promise<void> {
  if (!engineState) return;
  try {
    await engineState.engine.unload();
  } catch {
    // best-effort
  }
  engineState = null;
  lastProgress = null;
}

/**
 * Resets cached capability detection — useful in tests or after the user
 * grants new permissions and we want to re-probe the adapter.
 */
export function resetCapabilityCache(): void {
  cachedCapabilities = null;
}

/**
 * Checks whether the model weights are likely already cached in the
 * browser's Cache Storage API. This is a heuristic — WebLLM uses
 * the standard Cache API under the hood, so we check for its cache name.
 *
 * Returns true if cached (subsequent loads will be near-instant),
 * false if the model will need to be downloaded.
 */
export async function isModelCached(modelId: ModelId): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;

    // WebLLM stores weights in Cache Storage. The naming convention
    // includes the model ID. We check for any cache entry that
    // includes the model name.
    const keys = await caches.keys();
    return keys.some((key) => key.includes(modelId) || key.includes("webllm"));
  } catch {
    return false;
  }
}
