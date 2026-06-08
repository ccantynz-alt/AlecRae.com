/**
 * Vapron Platform Client — typed, dependency-free REST wrapper.
 *
 * Vapron (https://api.vapron.ai) is the managed platform AlecRae consumes for
 * transactional email, AI inference, object storage and secrets. We deliberately
 * talk to its REST API over `fetch` rather than importing a vendor SDK so the
 * client stays edge-compatible (Cloudflare Workers) and zero-dependency. When
 * `@vapron/sdk` is published we can swap the internals behind this same surface.
 *
 * Auth:   Authorization: Bearer vpk_<key>   (VAPRON_API_KEY)
 * Errors: the API returns { error, code } on failure — surfaced as VapronError.
 *
 * NOTE: response schemas below are tolerant (`.passthrough()`, optional fields)
 * because Vapron's full OpenAPI isn't published yet. They assert the fields we
 * actually read without rejecting extra/unknown keys; tighten when docs land.
 */

import { z } from "zod";

const DEFAULT_BASE_URL = "https://api.vapron.ai";

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

const ErrorBodySchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

// ─── Core request helper ────────────────────────────────────────────────────

async function request<T>(
  method: "GET" | "POST",
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new VapronError(
      "Vapron is not configured. Set VAPRON_API_KEY before calling the platform.",
      "not_configured",
      0,
    );
  }

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    // Network-level failure — never leak the key or request body.
    throw new VapronError(
      `Vapron request failed: ${err instanceof Error ? err.message : "network error"}`,
      "network_error",
      0,
    );
  }

  // 204 / empty bodies are valid for some endpoints.
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

  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(json);
    if (parsed.success) {
      throw new VapronError(parsed.data.error, parsed.data.code ?? "vapron_error", res.status);
    }
    throw new VapronError(`Vapron request failed with status ${res.status}`, "vapron_error", res.status);
  }

  // Some success responses still carry an { error, code } envelope.
  const maybeError = ErrorBodySchema.safeParse(json);
  if (maybeError.success) {
    throw new VapronError(maybeError.data.error, maybeError.data.code ?? "vapron_error", res.status);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new VapronError(
      `Unexpected Vapron response shape: ${result.error.message}`,
      "invalid_response",
      res.status,
    );
  }
  return result.data;
}

// ─── Email ────────────────────────────────────────────────────────────────────

export interface VapronEmailParams {
  to: string;
  subject: string;
  html: string;
}

const EmailSendResponseSchema = z.object({ id: z.string().optional() }).passthrough();
export type VapronEmailResult = z.infer<typeof EmailSendResponseSchema>;

// ─── AI chat (OpenAI-compatible) ───────────────────────────────────────────────

export interface VapronChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface VapronChatParams {
  messages: VapronChatMessage[];
  model?: string;
  maxTokens?: number;
}

const ChatCompletionSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            index: z.number().optional(),
            message: z.object({ role: z.string(), content: z.string() }).passthrough(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .min(1),
    usage: z.unknown().optional(),
  })
  .passthrough();
export type VapronChatCompletion = z.infer<typeof ChatCompletionSchema>;

// ─── Storage ────────────────────────────────────────────────────────────────

const BucketSchema = z.object({ name: z.string() }).passthrough();
const BucketListSchema = z.union([
  z.array(BucketSchema),
  z.object({ buckets: z.array(BucketSchema) }).passthrough(),
]);
export type VapronBucket = z.infer<typeof BucketSchema>;

const UploadUrlSchema = z
  .object({
    url: z.string().url().optional(),
    uploadUrl: z.string().url().optional(),
    key: z.string().optional(),
    expiresAt: z.string().optional(),
  })
  .passthrough();
export type VapronUploadUrl = z.infer<typeof UploadUrlSchema>;

export interface VapronUploadUrlParams {
  key: string;
  contentType?: string;
}

// ─── Secrets ────────────────────────────────────────────────────────────────

const SecretSchema = z.object({ value: z.string().optional() }).passthrough();
export type VapronSecret = z.infer<typeof SecretSchema>;

// ─── Public client ────────────────────────────────────────────────────────────

export const vapron = {
  email: {
    /** Send a transactional email via Vapron. */
    send(params: VapronEmailParams): Promise<VapronEmailResult> {
      return request("POST", "/api/platform/email/send", EmailSendResponseSchema, params);
    },
  },

  ai: {
    /** OpenAI-compatible chat completion. */
    chat(params: VapronChatParams): Promise<VapronChatCompletion> {
      const body: Record<string, unknown> = { messages: params.messages };
      if (params.model !== undefined) body["model"] = params.model;
      if (params.maxTokens !== undefined) body["max_tokens"] = params.maxTokens;
      return request("POST", "/api/platform/ai/chat", ChatCompletionSchema, body);
    },
  },

  storage: {
    /** List storage buckets. */
    listBuckets(): Promise<z.infer<typeof BucketListSchema>> {
      return request("GET", "/api/platform/storage/buckets", BucketListSchema);
    },
    /** Create a storage bucket. */
    createBucket(name: string): Promise<VapronBucket> {
      return request("POST", "/api/platform/storage/buckets", BucketSchema, { name });
    },
    /** Get a presigned URL to upload an object into a bucket. */
    createUploadUrl(bucket: string, params: VapronUploadUrlParams): Promise<VapronUploadUrl> {
      return request(
        "POST",
        `/api/platform/storage/buckets/${encodeURIComponent(bucket)}/upload-url`,
        UploadUrlSchema,
        params,
      );
    },
  },

  secrets: {
    /** Fetch a platform-managed secret by name (e.g. "DATABASE_URL"). */
    get(name: string): Promise<VapronSecret> {
      return request("GET", `/api/platform/secrets/${encodeURIComponent(name)}`, SecretSchema);
    },
  },
} as const;
