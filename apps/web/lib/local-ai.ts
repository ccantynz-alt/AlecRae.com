/**
 * AlecRae Local AI Router — Three-Tier Compute Model
 *
 * Per CLAUDE.md architecture:
 *
 *   CLIENT GPU (WebGPU) --> EDGE (CF Workers) --> CLOUD (Claude API)
 *      $0/token              sub-50ms                full Sonnet/Opus power
 *      sub-10ms              lightweight             heavy reasoning
 *      grammar/triage        compose/translate       voice profile train
 *
 * This module is the dispatch layer. Callers ask for an AI capability
 * (grammarCheck, shortReply, summarize, translate, ...) and we decide
 * -- invisibly to the user -- whether to run it on the client GPU or punt
 * to Claude over the network.
 *
 * Routing rules:
 *   1. If WebGPU is available AND the task fits in the loaded model's
 *      output budget -> run locally for $0/token.
 *   2. If WebGPU is unavailable, the model isn't loaded yet, or the
 *      task exceeds local capability -> fall back to Claude API.
 *   3. Some tasks ALWAYS go to cloud regardless of WebGPU:
 *        - Outputs > 1500 tokens (local context window pressure)
 *        - Voice profile training (needs Sonnet-grade reasoning)
 *        - Anything flagged forceCloud: true by the caller
 *
 * Cost savings (vs an all-cloud architecture):
 *   - Grammar checks: ~1M/day at scale -> $300+/day on Haiku -> $0 on WebGPU
 *   - Short replies:  ~200K/day at scale -> $250+/day on Haiku -> $0 on WebGPU
 *   - Summarization:  ~50K/day at scale -> $400+/day on Haiku -> $0 on WebGPU
 *   - Translation:    ~30K/day at scale -> $200+/day on Haiku -> $0 on WebGPU
 *
 *   Estimated savings at 100K DAU: ~$35,000/month. This is why AlecRae
 *   can sell at $9/mo while bundling Grammarly + Dragon + Front + more.
 *
 * Privacy bonus: tasks routed locally never leave the user's device.
 */

import { z } from "zod";
import {
  initWebGPU,
  loadModel,
  generate as webgpuGenerate,
  generateStreaming as webgpuGenerateStreaming,
  isModelLoaded,
  isModelCached,
  pickModelForVRAM,
  getLoadedModelId,
  getModelSpec,
  getLastProgress,
  getCacheMetadata,
  getAllCacheMetadata,
  onProgress as onWebGPUProgress,
  MODEL_CATALOG,
  type ModelId,
  type WebGPUCapabilities,
  type ModelDownloadProgress,
  type ProgressCallback,
  type ModelCacheMetadata,
} from "./webgpu-inference";

// ─── Zod Schemas ────────────────────────────────────────────────────────────

export const LocalAITaskSchema = z.enum([
  "grammar",
  "shortReply",
  "summarize",
  "translate",
  "voiceProfileTrain",
  "longCompose",
  "other",
]);

export const LocalAIRequestSchema = z.object({
  task: LocalAITaskSchema,
  prompt: z.string().min(1, "Prompt must not be empty"),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  forceCloud: z.boolean().optional(),
  localOnly: z.boolean().optional(),
});

export const LocalAIResultSchema = z.object({
  text: z.string(),
  source: z.enum(["webgpu", "cloud"]),
  modelId: z.string(),
  latencyMs: z.number().nonnegative(),
  estimatedCostUSD: z.number().nonnegative(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type LocalAITask = z.infer<typeof LocalAITaskSchema>;

export type LocalAIRequest = z.infer<typeof LocalAIRequestSchema>;

export type LocalAIResult = z.infer<typeof LocalAIResultSchema>;

export interface LocalAIStreamChunk {
  delta: string;
  source: "webgpu" | "cloud";
}

/** Full status snapshot of the local AI subsystem, consumed by UI. */
export interface LocalAIStatus {
  /** Whether the subsystem has been probed/initialized. */
  initialized: boolean;
  /** WebGPU hardware capabilities (null if not yet probed). */
  capabilities: WebGPUCapabilities | null;
  /** Which model was selected for this device (null if WebGPU unavailable). */
  selectedModel: ModelId | null;
  /** Human-readable label for the selected model. */
  selectedModelLabel: string | null;
  /** Whether the selected model weights are already cached in the browser. */
  modelCached: boolean;
  /** Whether the model is loaded and ready for inference. */
  modelReady: boolean;
  /** Current model download/init progress (null if not loading). */
  downloadProgress: ModelDownloadProgress | null;
  /** IndexedDB cache metadata (null if no prior loads). */
  cacheMetadata: ModelCacheMetadata | null;
  /** Any init error message. */
  initError: string | null;
}

// Re-export for consumers
export type {
  ModelId,
  WebGPUCapabilities,
  ModelDownloadProgress,
  ProgressCallback,
  ModelCacheMetadata,
};
export { MODEL_CATALOG, onWebGPUProgress, getCacheMetadata, getAllCacheMetadata };

// ─── Routing Policy ──────────────────────────────────────────────────────────

/** Tasks that are eligible to run on the client GPU. */
const LOCAL_ELIGIBLE_TASKS: ReadonlySet<LocalAITask> = new Set<LocalAITask>([
  "grammar",
  "shortReply",
  "summarize",
  "translate",
]);

/** Tasks that ALWAYS go to the cloud regardless of WebGPU support. */
const ALWAYS_CLOUD_TASKS: ReadonlySet<LocalAITask> = new Set<LocalAITask>([
  "voiceProfileTrain",
  "longCompose",
]);

/**
 * Hard ceiling on output tokens for local inference. Anything larger goes
 * to the cloud -- local models can technically produce longer output, but
 * latency degrades and KV cache pressure becomes a problem.
 */
const LOCAL_MAX_OUTPUT_TOKENS = 1500;

interface RoutingDecision {
  useLocal: boolean;
  reason: string;
}

function decideRoute(
  request: LocalAIRequest,
  caps: WebGPUCapabilities,
): RoutingDecision {
  if (request.forceCloud) {
    return { useLocal: false, reason: "caller forced cloud" };
  }
  if (ALWAYS_CLOUD_TASKS.has(request.task)) {
    return { useLocal: false, reason: `task '${request.task}' always routes to cloud` };
  }
  if (!LOCAL_ELIGIBLE_TASKS.has(request.task)) {
    return { useLocal: false, reason: `task '${request.task}' not eligible for local` };
  }
  if (!caps.supported) {
    return {
      useLocal: false,
      reason: `WebGPU unavailable: ${caps.reason ?? "unknown"}`,
    };
  }
  const maxTokens = request.maxTokens ?? 512;
  if (maxTokens > LOCAL_MAX_OUTPUT_TOKENS) {
    return {
      useLocal: false,
      reason: `output ${maxTokens} > local cap ${LOCAL_MAX_OUTPUT_TOKENS}`,
    };
  }
  return { useLocal: true, reason: "eligible for WebGPU" };
}

// ─── Initialization ──────────────────────────────────────────────────────────

interface LocalAIState {
  initialized: boolean;
  capabilities: WebGPUCapabilities | null;
  selectedModel: ModelId | null;
  initError: string | null;
}

const state: LocalAIState = {
  initialized: false,
  capabilities: null,
  selectedModel: null,
  initError: null,
};

let initPromise: Promise<void> | null = null;

export interface LocalAIInitOptions {
  onProgress?: (pct: number, modelId: ModelId) => void;
  /** Skip eager model loading; only probe capabilities. */
  probeOnly?: boolean;
}

/**
 * Initializes the local AI subsystem. Probes WebGPU, picks the best model
 * that fits in the user's VRAM, and (unless probeOnly) starts loading it.
 *
 * Safe to call multiple times -- only the first call does real work.
 */
export async function initLocalAI(options?: LocalAIInitOptions): Promise<LocalAIState> {
  if (state.initialized) return state;
  if (initPromise) {
    await initPromise;
    return state;
  }

  initPromise = (async (): Promise<void> => {
    try {
      const caps = await initWebGPU();
      state.capabilities = caps;

      if (!caps.supported) {
        state.initialized = true;
        return;
      }

      const modelId = pickModelForVRAM(caps.vramMB);
      state.selectedModel = modelId;

      if (modelId && !options?.probeOnly) {
        await loadModel(modelId, (pct) => options?.onProgress?.(pct, modelId));
      }
      state.initialized = true;
    } catch (err) {
      state.initError = (err as Error).message;
      state.initialized = true;
    }
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
  return state;
}

export function getLocalAIState(): Readonly<LocalAIState> {
  return state;
}

/**
 * Returns a full status snapshot of the local AI subsystem, suitable
 * for rendering in the LocalAIStatusIndicator component.
 *
 * This consolidates multiple internal state sources into a single
 * coherent view.
 */
export async function getLocalAIStatus(): Promise<LocalAIStatus> {
  const modelId = state.selectedModel;
  const spec = modelId ? getModelSpec(modelId) : undefined;
  const cached = modelId ? await isModelCached(modelId) : false;
  const cacheMetadata = modelId ? await getCacheMetadata(modelId) : null;

  return {
    initialized: state.initialized,
    capabilities: state.capabilities,
    selectedModel: modelId,
    selectedModelLabel: spec?.label ?? null,
    modelCached: cached,
    modelReady: isModelLoaded(),
    downloadProgress: getLastProgress(),
    cacheMetadata,
    initError: state.initError,
  };
}

// ─── Cloud Fallback ──────────────────────────────────────────────────────────

/**
 * Cloud Claude API client. Uses AlecRae's existing /api/ai/complete endpoint
 * which proxies to Anthropic with auth + rate limits attached server-side.
 *
 * Cost note: pricing varies by model. The router does not pick the model --
 * the server endpoint does, based on the user's plan tier (Free -> Haiku,
 * Personal -> Haiku, Pro -> Sonnet, Enterprise -> Opus).
 */

const CloudCompleteResponseSchema = z.object({
  text: z.string(),
  modelId: z.string().optional(),
  estimatedCostUSD: z.number().optional(),
});

type CloudCompleteResponse = z.infer<typeof CloudCompleteResponseSchema>;

async function cloudComplete(request: LocalAIRequest): Promise<CloudCompleteResponse> {
  const res = await fetch("/api/ai/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: request.task,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      maxTokens: request.maxTokens ?? 512,
      temperature: request.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error(`Cloud AI request failed: ${res.status} ${res.statusText}`);
  }

  const raw: unknown = await res.json();
  const parsed = CloudCompleteResponseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error("Cloud AI returned malformed response: " + parsed.error.message);
  }

  return {
    text: parsed.data.text,
    modelId: parsed.data.modelId ?? "claude-haiku-4.5",
    estimatedCostUSD: parsed.data.estimatedCostUSD ?? 0,
  };
}

async function* cloudStream(request: LocalAIRequest): AsyncIterable<string> {
  const res = await fetch("/api/ai/complete?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: request.task,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      maxTokens: request.maxTokens ?? 512,
      temperature: request.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Cloud AI stream failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Server emits newline-delimited JSON: { "delta": "..." }
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line) as { delta?: string };
          if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
            yield parsed.delta;
          }
        } catch {
          // ignore malformed line
        }
      }
      nl = buffer.indexOf("\n");
    }
  }
}

// ─── Public Dispatch API ─────────────────────────────────────────────────────

/**
 * Run a one-shot AI completion. Picks WebGPU or cloud automatically.
 *
 * @example
 *   const result = await runAI({
 *     task: "grammar",
 *     prompt: "Pls fix this sentance",
 *     maxTokens: 100,
 *   });
 *   console.log(result.text, result.source); // "...", "webgpu"
 */
export async function runAI(request: LocalAIRequest): Promise<LocalAIResult> {
  // Validate input at the API boundary
  const validated = LocalAIRequestSchema.parse(request);

  if (!state.initialized) {
    await initLocalAI({ probeOnly: true });
  }

  const caps = state.capabilities ?? { supported: false, adapter: "none", vramMB: 0 };
  const decision = decideRoute(validated, caps);
  const start = Date.now();

  if (decision.useLocal) {
    try {
      // Lazy-load the model on first local call if init was probe-only
      if (!isModelLoaded() && state.selectedModel) {
        await loadModel(state.selectedModel, () => {
          /* swallow progress; caller can use initLocalAI for UI */
        });
      }
      if (!isModelLoaded()) {
        throw new Error("local model failed to load");
      }

      const text = await webgpuGenerate(validated.prompt, {
        maxTokens: validated.maxTokens,
        temperature: validated.temperature,
        systemPrompt: validated.systemPrompt,
      });

      return {
        text,
        source: "webgpu",
        modelId: getLoadedModelId() ?? "unknown",
        latencyMs: Date.now() - start,
        estimatedCostUSD: 0, // The whole point. Free forever.
      };
    } catch (err) {
      if (validated.localOnly) {
        throw err;
      }
      // Fall through to cloud
    }
  }

  if (validated.localOnly) {
    throw new Error(`Local AI required but unavailable: ${decision.reason}`);
  }

  const cloud = await cloudComplete(validated);
  return {
    text: cloud.text,
    source: "cloud",
    modelId: cloud.modelId ?? "claude-haiku-4.5",
    latencyMs: Date.now() - start,
    estimatedCostUSD: cloud.estimatedCostUSD ?? 0,
  };
}

/**
 * Streaming variant of runAI. Yields chunks tagged with their source so
 * the UI can show a "running locally" indicator.
 */
export async function* runAIStreaming(
  request: LocalAIRequest,
): AsyncIterable<LocalAIStreamChunk> {
  const validated = LocalAIRequestSchema.parse(request);

  if (!state.initialized) {
    await initLocalAI({ probeOnly: true });
  }

  const caps = state.capabilities ?? { supported: false, adapter: "none", vramMB: 0 };
  const decision = decideRoute(validated, caps);

  if (decision.useLocal) {
    try {
      if (!isModelLoaded() && state.selectedModel) {
        await loadModel(state.selectedModel, () => {
          /* swallow */
        });
      }
      if (!isModelLoaded()) {
        throw new Error("local model failed to load");
      }

      for await (const delta of webgpuGenerateStreaming(validated.prompt, {
        maxTokens: validated.maxTokens,
        temperature: validated.temperature,
        systemPrompt: validated.systemPrompt,
      })) {
        yield { delta, source: "webgpu" };
      }
      return;
    } catch (err) {
      if (validated.localOnly) {
        throw err;
      }
      // fall through to cloud stream
    }
  }

  if (validated.localOnly) {
    throw new Error(`Local AI required but unavailable: ${decision.reason}`);
  }

  for await (const delta of cloudStream(validated)) {
    yield { delta, source: "cloud" };
  }
}

// ─── localInfer — The S1 Primary API ────────────────────────────────────────

/**
 * The primary public inference API for feature S1: WebGPU Client-Side AI.
 *
 * Takes a plain text prompt and returns a completion string. Automatically
 * routes through the three-tier compute model:
 *
 *   1. CLIENT GPU (WebGPU) -- $0/token, sub-200ms first token
 *   2. EDGE (Cloudflare Workers) -- sub-50ms (future)
 *   3. CLOUD (Claude API) -- full Sonnet/Opus power
 *
 * The caller never needs to know which tier handled the request.
 * For UI feedback, use `getLocalAIStatus()` to check which tier is active.
 *
 * @param prompt - The user's input text
 * @returns The AI-generated completion text
 *
 * @example
 *   const reply = await localInfer("Summarize this email thread: ...");
 *   console.log(reply); // "The thread discusses..."
 */
export async function localInfer(prompt: string): Promise<string> {
  z.string().min(1, "Prompt must not be empty").parse(prompt);

  const result = await runAI({
    task: "other",
    prompt,
    maxTokens: 512,
    temperature: 0.7,
  });

  return result.text;
}

/**
 * Extended variant of localInfer that returns the full result including
 * routing metadata (source tier, model ID, latency, cost).
 */
export async function localInferWithMetadata(
  prompt: string,
  options?: {
    task?: LocalAITask;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    forceCloud?: boolean;
    localOnly?: boolean;
  },
): Promise<LocalAIResult> {
  z.string().min(1, "Prompt must not be empty").parse(prompt);

  return runAI({
    task: options?.task ?? "other",
    prompt,
    systemPrompt: options?.systemPrompt,
    maxTokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.7,
    forceCloud: options?.forceCloud,
    localOnly: options?.localOnly,
  });
}

// ─── Convenience Wrappers ────────────────────────────────────────────────────

export async function grammarCheck(text: string): Promise<LocalAIResult> {
  return runAI({
    task: "grammar",
    systemPrompt:
      "You are a grammar and spelling assistant. Return the corrected text only, no explanations.",
    prompt: text,
    maxTokens: Math.min(800, Math.ceil(text.length / 2) + 64),
    temperature: 0.2,
  });
}

export async function shortReply(emailContext: string): Promise<LocalAIResult> {
  return runAI({
    task: "shortReply",
    systemPrompt:
      "You are an email reply assistant. Draft a concise, polite reply (2-4 sentences). Return only the reply body.",
    prompt: emailContext,
    maxTokens: 250,
    temperature: 0.6,
  });
}

export async function summarize(thread: string): Promise<LocalAIResult> {
  return runAI({
    task: "summarize",
    systemPrompt:
      "Summarize the email thread in 3 bullet points covering: who, what, and any required action.",
    prompt: thread,
    maxTokens: 300,
    temperature: 0.3,
  });
}

export async function translate(text: string, targetLang: string): Promise<LocalAIResult> {
  z.string().min(1).parse(targetLang);
  return runAI({
    task: "translate",
    systemPrompt: `Translate the following text to ${targetLang}. Return only the translation.`,
    prompt: text,
    maxTokens: Math.min(1000, Math.ceil(text.length * 1.5)),
    temperature: 0.2,
  });
}
