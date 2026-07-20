/**
 * Vapron Platform Client — typed, dependency-free wrapper over TWO distinct
 * transports on the same platform:
 *
 *  1. The tRPC admin surface (DNS zone/record management only, below). Kept
 *     as originally built — no confirmed documentation exists for this one
 *     (see CLAUDE.md known issue #19), so it stays as-is until it's verified
 *     independently of the fix in (2).
 *
 *  2. The plain REST "platform" surface (email, AI, object storage), fixed
 *     2026-07-21 per issue #83: the client previously guessed a tRPC shape
 *     for these too (`api.vapron.ai/api/trpc/customerEmail.send` etc.) which
 *     never matched the real API — every send/AI-call/upload silently 401'd
 *     or errored in prod. Corrected against Craig-supplied working API docs:
 *
 *       Base URL:  https://vapron.ai/api/platform
 *       Auth:      Authorization: Bearer <VAPRON_API_KEY>
 *       Request:   POST <path>   body: plain JSON (no envelope)
 *       Response:  plain JSON (no unwrap needed)
 *
 * Both transports share one fetch-based implementation (no vendor SDK) so
 * the client stays edge-compatible (Cloudflare Workers) and zero-dependency.
 */

import { z } from "zod";

const DEFAULT_TRPC_BASE_URL = "https://api.vapron.ai/api/trpc";
const DEFAULT_PLATFORM_BASE_URL = "https://vapron.ai/api/platform";

function getBaseUrl(): string {
  return (process.env["VAPRON_BASE_URL"] ?? DEFAULT_TRPC_BASE_URL).replace(/\/+$/, "");
}

function getPlatformBaseUrl(): string {
  return (process.env["VAPRON_PLATFORM_BASE_URL"] ?? DEFAULT_PLATFORM_BASE_URL).replace(/\/+$/, "");
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

/** Tolerant error-body shape for the plain-REST platform surface. */
const RestErrorSchema = z.object({
  error: z.union([z.string(), z.object({ message: z.string().optional() }).passthrough()]).optional(),
  message: z.string().optional(),
});

/**
 * Call a Vapron REST platform endpoint (email/AI/storage — see module header)
 * and return the schema-validated JSON body. Unlike `request()` above, there
 * is no envelope to unwrap: the body IS the payload.
 */
async function restRequest<T>(
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

  const url = `${getPlatformBaseUrl()}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (method === "POST") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch (err) {
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

  if (!res.ok) {
    const errBody = RestErrorSchema.safeParse(json);
    const message =
      errBody.success
        ? (typeof errBody.data.error === "string"
            ? errBody.data.error
            : errBody.data.error?.message ?? errBody.data.message)
        : undefined;
    throw new VapronError(
      message ?? `Vapron request failed with status ${res.status}`,
      "vapron_error",
      res.status,
    );
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
  from?: string;
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

export interface VapronUploadUrlParams {
  bucket: string;
  path: string;
  contentType: string;
}

const UploadUrlResponseSchema = z.object({ uploadUrl: z.string() }).passthrough();

// ─── DNS (authoritative zones on Vapron DNS) ─────────────────────────────────
// Customer-facing procedures — tenant-scoped to the API key's user on the
// Vapron side (`dns_zones.user_id`), so this key can only ever touch zones
// owned by the platform account it belongs to.

const VapronDnsZoneSchema = z.object({ id: z.string(), name: z.string() }).passthrough();
const VapronDnsZoneListSchema = z.array(VapronDnsZoneSchema);
export type VapronDnsZone = z.infer<typeof VapronDnsZoneSchema>;

const VapronDnsRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    content: z.string(),
    ttl: z.number().nullish(),
    priority: z.number().nullish(),
  })
  .passthrough();
const VapronZoneWithRecordsSchema = z
  .object({ zone: VapronDnsZoneSchema, records: z.array(VapronDnsRecordSchema) })
  .passthrough();
export type VapronDnsRecord = z.infer<typeof VapronDnsRecordSchema>;

/** Mutation responses are tolerated loosely — we only act on thrown errors. */
const VapronDnsMutationSchema = z.record(z.string(), z.unknown());

export interface VapronCreateDnsRecordParams {
  zoneId: string;
  name: string;
  type: string;
  content: string;
  ttl?: number;
  priority?: number;
}

export interface VapronUpdateDnsRecordParams {
  recordId: string;
  content?: string;
  ttl?: number;
  priority?: number | null;
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
    /** Send a transactional email via Vapron (REST platform surface — see module header). */
    send(params: VapronEmailParams): Promise<VapronEmailResult> {
      return restRequest("POST", "/email/send", EmailSendResponseSchema, params);
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
      const raw = await restRequest("POST", "/ai/chat", AiCompleteSchema, input);
      return { text: extractAiText(raw), raw };
    },
  },

  storage: {
    /**
     * Get a presigned upload URL: PUT the file content directly to it from
     * the caller (server-side or browser), no bytes proxied through our API.
     * Fixes issue #29's file/voice-message storage stubs.
     */
    getUploadUrl(params: VapronUploadUrlParams): Promise<{ uploadUrl: string }> {
      return restRequest("POST", "/storage/upload-url", UploadUrlResponseSchema, params);
    },
    /**
     * List storage buckets. Not documented on the REST platform surface
     * (see module header) — kept on the original, unverified tRPC transport
     * until confirmed. No caller uses this today.
     */
    listBuckets(): Promise<z.infer<typeof BucketListSchema>> {
      return request("GET", "objectStorage.listBuckets", BucketListSchema);
    },
    /** Create a storage bucket. Same unverified-tRPC caveat as listBuckets above. */
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

  dns: {
    /** List the zones owned by this platform account. */
    listZones(): Promise<VapronDnsZone[]> {
      return request("GET", "dns.myZones.list", VapronDnsZoneListSchema);
    },
    /** Fetch a zone with all of its records. */
    getZone(zoneId: string): Promise<z.infer<typeof VapronZoneWithRecordsSchema>> {
      return request("GET", "dns.myZones.get", VapronZoneWithRecordsSchema, { zoneId });
    },
    /** Create a record in an owned zone. */
    createRecord(params: VapronCreateDnsRecordParams): Promise<Record<string, unknown>> {
      return request("POST", "dns.records.create", VapronDnsMutationSchema, params);
    },
    /** Update an existing record in an owned zone. */
    updateRecord(params: VapronUpdateDnsRecordParams): Promise<Record<string, unknown>> {
      return request("POST", "dns.records.update", VapronDnsMutationSchema, params);
    },
  },
} as const;
