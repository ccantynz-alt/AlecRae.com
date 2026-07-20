/**
 * AI completion with provider fallback — Claude primary, Vapron fallback.
 *
 * The Bible mandates: "Never block on a single AI provider. Always have a
 * fallback path." This helper calls Claude (Anthropic) first and, only if Claude
 * is unavailable or errors, falls back to Vapron's AI gateway. The fallback
 * never affects the happy path — it triggers solely on primary failure.
 *
 * Both providers are called over `fetch` (no SDK dependency, edge-compatible).
 * Callers get a normalized { text, provider } regardless of which answered.
 */

import { vapron, isVapronConfigured } from "./vapron.js";
import { globalAiCircuitBreaker } from "./ai-circuit-breaker.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1024;

function getAnthropicKey(): string {
  return process.env["ANTHROPIC_API_KEY"] ?? "";
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiCompleteParams {
  /** Optional system prompt. */
  system?: string;
  messages: AiMessage[];
  /** Claude model id (ignored by the Vapron fallback unless it accepts it). */
  model?: string;
  maxTokens?: number;
}

export interface AiCompleteResult {
  text: string;
  provider: "claude" | "vapron";
}

export class AiError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

/** Call Claude directly. Throws on any failure so the caller can fall back. */
async function callClaude(params: AiCompleteParams): Promise<string> {
  const key = getAnthropicKey();
  if (!key) throw new AiError("ANTHROPIC_API_KEY not set", "not_configured");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model ?? DEFAULT_MODEL,
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(params.system !== undefined ? { system: params.system } : {}),
      messages: params.messages,
    }),
  });

  if (!res.ok) {
    throw new AiError(`Claude request failed with status ${res.status}`, "claude_error");
  }

  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (body.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");

  if (!text) throw new AiError("Claude returned no text content", "claude_empty");
  return text;
}

/** Call Vapron's AI gateway. The system prompt becomes a leading message. */
async function callVapron(params: AiCompleteParams): Promise<string> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    params.system !== undefined
      ? [{ role: "system", content: params.system }, ...params.messages]
      : [...params.messages];

  const completion = await vapron.ai.complete({
    messages,
    ...(params.model !== undefined ? { model: params.model } : {}),
    ...(params.maxTokens !== undefined ? { maxTokens: params.maxTokens } : {}),
  });

  if (!completion.text) throw new AiError("Vapron returned no text content", "vapron_empty");
  return completion.text;
}

/**
 * Complete a prompt, preferring Claude and falling back to Vapron on failure.
 * Throws AiError("no_provider") only when neither provider is available/usable.
 */
export async function aiComplete(params: AiCompleteParams): Promise<AiCompleteResult> {
  // Process-wide safety net, independent of the per-account Redis quota
  // (ai-quota.ts), which deliberately fails open on a Redis outage — see
  // ai-circuit-breaker.ts. Should only ever trip on a genuine anomaly.
  const breaker = globalAiCircuitBreaker.checkAndRecord();
  if (!breaker.allowed) {
    throw new AiError(
      "AI call volume circuit breaker is tripped — too many AI calls process-wide in a short window. Retry shortly.",
      "circuit_breaker_tripped",
    );
  }

  // Primary: Claude.
  if (getAnthropicKey()) {
    try {
      return { text: await callClaude(params), provider: "claude" };
    } catch (err) {
      // Fall through to Vapron only if it's configured; otherwise rethrow.
      if (!isVapronConfigured()) throw err;
    }
  }

  // Fallback: Vapron.
  if (isVapronConfigured()) {
    return { text: await callVapron(params), provider: "vapron" };
  }

  throw new AiError("No AI provider configured (set ANTHROPIC_API_KEY or VAPRON_API_KEY)", "no_provider");
}
