/**
 * Vapron Platform Client — typed, dependency-free tRPC wrapper.
 *
 * Vapron (https://api.vapron.ai) is the managed platform AlecRae consumes for
 * transactional email, AI inference, object storage, deploys and more. We talk
 * to its tRPC API over `fetch` rather than importing a vendor SDK so the client
 * stays edge-compatible (Cloudflare Workers) and zero-dependency.
 *
 * Transport (tRPC + superjson transformer):
 *   Base URL:  https://api.vapron.ai/api/trpc
 *   Auth:      Authorization: Bearer vpk_<key>     (VAPRON_API_KEY)
 *   Mutation:  POST /<procedure>   body { "json": { ...params } }
 *   Query:     GET  /<procedure>?input=<urlenc {"json":{...}}>
 *   Success:   { "result": { "data": { "json": <data> } } }
 *   Error:     { "error":  { "json": { "message", "data": { code, httpStatus } } } }
 *
 * NOTE: response schemas below are tolerant (`.passthrough()`, optional fields)
 * because Vapron's full OpenAPI isn't published. They assert the fields we
 * actually read without rejecting extra/unknown keys; tighten as shapes are
 * confirmed against the live API (see CLAUDE.md known issue #19).
 */

import { z } from "zod";

const DEFAULT_BASE_URL = "https://api.vapron.ai/api/trpc";

function getBaseUrl(): string {
  return (process.env["VAPRON_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getApiKey(): string {
  return process.env["VAPRON_API_KEY"] ?? "";
}

/** True when the Vapron API key is configured. Lets callers degrade gracefully. */
export function isVapronConfigured(): boolean {
  return getApiKey().length > 0;
}

// ─── Typed error ──────────────────────────────────────────────────────────────

export class VapronError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "VapronError";
    this.code = code;
    this.status = status;
  }
}

/** tRPC/superjson error envelope: { error: { json: { message, data: {...} } } }. */
const TrpcErrorSchema = z.object({
  error: z.object({
    json: z
      .object({
        message: z.string().optional(),
        data: z
          .object({
            code: z.string().optional(),
            httpStatus: z.number().optional(),
          })
          .partial()
          .passthrough()
          .optional(),
      })
      .passthrough(),
  }),
});

// ─── Core request helper ────────────────────────────────────────────────────

/**
 * Call a Vapron tRPC procedure and return the unwrapped, schema-validated data.
 * `input` is wrapped in the `{ json }` superjson envelope; the response is
 * unwrapped from `result.data.json` before validation.
 */
async function request<T>(
  method: "GET" | "POST",
  procedure: string,
  schema: z.ZodType<T>,
  input?: unknown,
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new VapronError(
      "Vapron is not configured. Set VAPRON_API_KEY before calling the platform.",
      "not_configured",
      0,
    );
  }

  let url = `${getBaseUrl()}/${procedure}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  let body: string | undefined;

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ json: input ?? null });
  } else if (input !== undefined) {
    // tRPC GET query input: ?input=<urlencoded {"json": ...}>
    url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });
  } catch (err) {
    // Network-level failure — never leak the key or request body.
    throw new VapronError(
      `Vapron request failed: ${err instanceof Error ? err.message : "network error"}`,
      "network_error",
      0,
    );
  }

  const text = await res.text();
  let json: unknown = undefined;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new VapronError(
        `Vapron returned a non-JSON response (status ${res.status})`,
        "invalid_response",
        res.status,
      );
    }
  }

  // tRPC carries application errors in an { error: { json: ... } } envelope even
  // on some non-2xx responses; check it first so we surface the real message/code.
  const errEnvelope = TrpcErrorSchema.safeParse(json);
  if (errEnvelope.success) {
    const e = errEnvelope.data.error.json;
    throw new VapronError(
      e.message ?? `Vapron request failed with status ${res.status}`,
      e.data?.code ?? "vapron_error",
      e.data?.httpStatus ?? res.status,
    );
  }

  if (!res.ok) {
    throw new VapronError(`Vapron request failed with status ${res.status}`, "vapron_error", res.status);
  }

  // Unwrap result.data.json (superjson). Tolerate plainer shapes defensively.
  const data = unwrapResult(json);

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new VapronError(
      `Unexpected Vapron response shape: ${result.error.message}`,
      "invalid_response",
      res.status,
    );
  }
  return result.data;
}

/** Pull the payload out of `{ result: { data: { json } } }`, tolerating plainer shapes. */
function unwrapResult(json: unknown): unknown {
  if (json && typeof json === "object" && "result" in json) {
    const result = (json as { result: unknown }).result;
    if (result && typeof result === "object" && "data" in result) {
      const dataNode = (result as { data: unknown }).data;
      if (dataNode && typeof dataNode === "object" && "json" in dataNode) {
        return (dataNode as { json: unknown }).json;
      }
      return dataNode;
    }
    return result;
  }
  return json;
}

// ─── Email ────────────────────────────────────────────────────────────────────

export interface VapronEmailParams {
  to: string;
  subject: string;
  html: string;
}

const EmailSendResponseSchema = z.object({ id: z.string().optional() }).passthrough();
export type VapronEmailResult = z.infer<typeof EmailSendResponseSchema>;

// ─── AI Gateway ────────────────────────────────────────────────────────────────

export interface VapronChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface VapronChatParams {
  messages: VapronChatMessage[];
  model?: string;
  maxTokens?: number;
}

/** Default model for the Vapron AI gateway (per integration guide). */
const DEFAULT_AI_MODEL = "claude-sonnet-4-6";

/**
 * The AI gateway's exact response shape isn't documented, so we keep the schema
 * tolerant and extract the assistant text from whichever known shape comes back
 * (Anthropic `content[].text`, OpenAI `choices[].message.content`, or a plain
 * `text`/`content`/`completion` field).
 */
const AiCompleteSchema = z.record(z.string(), z.unknown());

export interface VapronAiResult {
  /** Best-effort extracted assistant text. */
  text: string;
  /** The raw, unwrapped gateway payload for callers that need more. */
  raw: Record<string, unknown>;
}

function extractAiText(data: Record<string, unknown>): string {
  // Plain string fields first.
  for (const key of ["text", "content", "completion", "output"] as const) {
    const v = data[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // Anthropic-style: content: [{ type: "text", text }]
  const content = data["content"];
  if (Array.isArray(content)) {
    const joined = content
      .map((b) => (b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string"
        ? (b as { text: string }).text
        : ""))
      .join("");
    if (joined.length > 0) return joined;
  }
  // OpenAI-style: choices: [{ message: { content } }]
  const choices = data["choices"];
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    const msg = first && typeof first === "object" ? (first as { message?: unknown }).message : undefined;
    if (msg && typeof msg === "object" && typeof (msg as { content?: unknown }).content === "string") {
      return (msg as { content: string }).content;
    }
    if (first && typeof first === "object" && typeof (first as { text?: unknown }).text === "string") {
      return (first as { text: string }).text;
    }
  }
  // message: { content }
  const message = data["message"];
  if (message && typeof message === "object" && typeof (message as { content?: unknown }).content === "string") {
    return (message as { content: string }).content;
  }
  return "";
}

// ─── Object storage ────────────────────────────────────────────────────────────

const BucketSchema = z.object({ name: z.string() }).passthrough();
const BucketListSchema = z.union([
  z.array(BucketSchema),
  z.object({ buckets: z.array(BucketSchema) }).passthrough(),
]);
export type VapronBucket = z.infer<typeof BucketSchema>;

export interface VapronCreateBucketParams {
  name: string;
  region?: string;
  isPublic?: boolean;
}

// ─── Hosting / deploy ────────────────────────────────────────────────────────

export interface VapronQuickDeployParams {
  repoUrl: string;
}

const DeploySchema = z.record(z.string(), z.unknown());
export type VapronDeployResult = z.infer<typeof DeploySchema>;

// ─── Public client ────────────────────────────────────────────────────────────

export const vapron = {
  email: {
    /** Send a transactional email via Vapron. */
    send(params: VapronEmailParams): Promise<VapronEmailResult> {
      return request("POST", "customerEmail.send", EmailSendResponseSchema, params);
    },
  },

  ai: {
    /** Call the AI gateway and return normalized assistant text + the raw payload. */
    async complete(params: VapronChatParams): Promise<VapronAiResult> {
      const input: Record<string, unknown> = {
        model: params.model ?? DEFAULT_AI_MODEL,
        messages: params.messages,
      };
      if (params.maxTokens !== undefined) input["max_tokens"] = params.maxTokens;
      const raw = await request("POST", "aiGateway.complete", AiCompleteSchema, input);
      return { text: extractAiText(raw), raw };
    },
  },

  storage: {
    /** List storage buckets. */
    listBuckets(): Promise<z.infer<typeof BucketListSchema>> {
      return request("GET", "objectStorage.listBuckets", BucketListSchema);
    },
    /** Create a storage bucket. */
    createBucket(params: VapronCreateBucketParams): Promise<VapronBucket> {
      return request("POST", "objectStorage.createBucket", BucketSchema, {
        name: params.name,
        region: params.region ?? "us-east-1",
        isPublic: params.isPublic ?? false,
      });
    },
  },

  hosting: {
    /** Quick-deploy a GitHub repo to Vapron hosting. */
    quickDeploy(params: VapronQuickDeployParams): Promise<VapronDeployResult> {
      return request("POST", "aiDeploy.quickDeploy", DeploySchema, params);
    },
  },
} as const;
