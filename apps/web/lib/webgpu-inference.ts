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
 *   2. Pick the largest Llama variant that fits (1B → 3B → 8B)
 *   3. Stream model weights into the browser cache (~500MB-4GB, one-time)
 *   4. Spin up the WebLLM engine; expose generate / generateStreaming
 *   5. Fall back gracefully on unsupported devices — callers use cloud API
 */

import type {
  MLCEngineInterface,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";

// ─── Public Types ────────────────────────────────────────────────────────────

export interface WebGPUCapabilities {
  supported: boolean;
  adapter: string;
  vramMB: number;
  /** Optional human-readable reason WebGPU was rejected. */
  reason?: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export type ModelId =
  | "Llama-3.2-1B-Instruct-q4f16_1-MLC"
  | "Llama-3.2-3B-Instruct-q4f16_1-MLC"
  | "Llama-3.1-8B-Instruct-q4f32_1-MLC";

interface ModelSpec {
  id: ModelId;
  /** Approximate VRAM required to load + run, in MB. */
  vramRequiredMB: number;
  /** Approximate disk/cache footprint, in MB. */
  cacheSizeMB: number;
  /** Maximum sustained context window in tokens. */
  contextWindow: number;
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
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    vramRequiredMB: 2400,
    cacheSizeMB: 1900,
    contextWindow: 4096,
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    vramRequiredMB: 5800,
    cacheSizeMB: 4300,
    contextWindow: 4096,
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

// ─── Module State ────────────────────────────────────────────────────────────

interface EngineState {
  engine: MLCEngineInterface;
  modelId: ModelId;
  loadedAt: number;
}

let engineState: EngineState | null = null;
let cachedCapabilities: WebGPUCapabilities | null = null;
let loadInFlight: Promise<void> | null = null;

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

// ─── Model Loading ───────────────────────────────────────────────────────────

/**
 * Loads a model into the WebLLM engine. Idempotent: calling twice with
 * the same modelId is a no-op; calling with a different modelId unloads
 * the previous one first.
 *
 * Model weights are streamed once and cached by WebLLM in the browser's
 * Cache Storage API (typically a few hundred MB to a few GB). Subsequent
 * page loads are instant.
 */
export async function loadModel(
  modelId: ModelId,
  onProgress: (pct: number) => void,
): Promise<void> {
  if (engineState && engineState.modelId === modelId) {
    onProgress(100);
    return;
  }

  if (loadInFlight) {
    await loadInFlight;
    if (engineState && (engineState as EngineState).modelId === modelId) {
      onProgress(100);
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

    // Dynamic import keeps the ~MB WebLLM bundle out of the main chunk.
    // Cloud-only users never pay the download cost.
    const webllm = await import("@mlc-ai/web-llm");

    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report: InitProgressReport): void => {
        // report.progress is 0..1
        const pct = Math.max(0, Math.min(100, Math.round(report.progress * 100)));
        onProgress(pct);
      },
    });

    engineState = {
      engine,
      modelId,
      loadedAt: Date.now(),
    };
    onProgress(100);
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
  const { engine } = requireEngine();
  const messages = buildMessages(prompt, options?.systemPrompt);

  const response = await engine.chat.completions.create({
    messages,
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.7,
    top_p: options?.topP ?? 0.95,
    stream: false,
  });

  const choice = response.choices[0];
  return choice?.message.content ?? "";
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
  const { engine } = requireEngine();
  const messages = buildMessages(prompt, options?.systemPrompt);

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
      yield delta;
    }
  }
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
}

/**
 * Resets cached capability detection — useful in tests or after the user
 * grants new permissions and we want to re-probe the adapter.
 */
export function resetCapabilityCache(): void {
  cachedCapabilities = null;
}
