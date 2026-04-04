/**
 * Core HTTP API client for the Emailed SDK.
 *
 * Handles authentication, automatic retries with exponential backoff,
 * rate limit awareness, and structured error handling.
 */
import type {
  ClientConfig,
  ResolvedConfig,
  RequestOptions,
  ApiResponse,
  RateLimitInfo,
  ApiErrorBody,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.emailed.dev";
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;

/** HTTP status codes that are safe to retry. */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);

/** Base delay for exponential backoff in milliseconds. */
const BACKOFF_BASE_MS = 500;

/**
 * Error thrown when the Emailed API returns a non-success response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
  }
}

/**
 * Error thrown when the client exceeds the rate limit and all retries
 * are exhausted.
 */
export class RateLimitError extends ApiError {
  readonly rateLimitInfo: RateLimitInfo;

  constructor(status: number, body: ApiErrorBody, rateLimitInfo: RateLimitInfo) {
    super(status, body);
    this.name = "RateLimitError";
    this.rateLimitInfo = rateLimitInfo;
  }
}

/**
 * Resolve a partial `ClientConfig` into a `ResolvedConfig` with defaults.
 */
function resolveConfig(config: ClientConfig): ResolvedConfig {
  return {
    auth: config.auth,
    baseUrl: (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    headers: config.headers ?? {},
    debug: config.debug ?? false,
  };
}

/**
 * Build the `Authorization` header value from an auth method.
 */
function authHeader(config: ResolvedConfig): string {
  if (config.auth.type === "apiKey") {
    return `Bearer ${config.auth.key}`;
  }
  return `Bearer ${config.auth.token}`;
}

/**
 * Parse rate limit headers from a `Response`.
 */
function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");

  if (limit === null || remaining === null || reset === null) {
    return undefined;
  }

  return {
    limit: Number(limit),
    remaining: Number(remaining),
    resetAt: new Date(Number(reset) * 1000),
  };
}

/**
 * Build a query string from a parameter record, omitting undefined values.
 */
function buildQuery(
  params: Readonly<Record<string, string | number | boolean | undefined>> | undefined,
): string {
  if (!params) return "";

  const entries: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return entries.length > 0 ? `?${entries.join("&")}` : "";
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The core HTTP client for the Emailed API.
 *
 * Usage:
 * ```ts
 * const client = new ApiClient({
 *   auth: { type: "apiKey", key: "em_live_..." },
 * });
 *
 * const response = await client.request<{ id: string }>({
 *   method: "POST",
 *   path: "/v1/messages",
 *   body: { ... },
 * });
 * ```
 */
export class ApiClient {
  private readonly config: ResolvedConfig;

  constructor(config: ClientConfig) {
    this.config = resolveConfig(config);
  }

  /**
   * Execute an HTTP request against the Emailed API.
   *
   * Automatically retries on transient failures with exponential backoff.
   * Respects `Retry-After` headers on 429 responses.
   *
   * @param options  Request parameters
   * @returns Parsed API response
   * @throws {ApiError}       On non-retryable API errors
   * @throws {RateLimitError} When rate limited and retries are exhausted
   */
  async request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${options.path}${buildQuery(options.query)}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader(this.config),
      "User-Agent": "@emailed/sdk/0.1.0",
      ...this.config.headers,
      ...options.headers,
    };

    const timeout = options.timeout ?? this.config.timeout;

    let lastError: ApiError | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Merge external signal if provided
      if (options.signal) {
        options.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }

      try {
        if (this.config.debug) {
          console.log(`[emailed-sdk] ${options.method} ${url}${attempt > 0 ? ` (retry ${attempt})` : ""}`);
          if (options.body !== undefined) {
            console.log(`[emailed-sdk] Request body:`, JSON.stringify(options.body, null, 2));
          }
        }

        const response = await fetch(url, {
          method: options.method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const rateLimitInfo = parseRateLimitHeaders(response.headers);

        if (response.ok) {
          const data = (await response.json()) as T;
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          if (this.config.debug) {
            console.log(`[emailed-sdk] Response ${response.status}:`, JSON.stringify(data, null, 2));
          }

          return {
            data,
            status: response.status,
            headers: responseHeaders,
            requestId: response.headers.get("x-request-id") ?? undefined,
          };
        }

        // Parse error body
        let errorBody: ApiErrorBody;
        try {
          errorBody = (await response.json()) as ApiErrorBody;
        } catch {
          errorBody = {
            code: "unknown_error",
            message: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        // Rate limited
        if (response.status === 429 && rateLimitInfo) {
          lastError = new RateLimitError(response.status, errorBody, rateLimitInfo);

          if (attempt < this.config.maxRetries) {
            const retryAfter = response.headers.get("retry-after");
            const delayMs = retryAfter
              ? Number(retryAfter) * 1000
              : BACKOFF_BASE_MS * Math.pow(2, attempt);
            await sleep(delayMs);
            continue;
          }

          throw lastError;
        }

        // Retryable server error
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.config.maxRetries) {
          lastError = new ApiError(response.status, errorBody);
          await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
          continue;
        }

        // Non-retryable error
        throw new ApiError(response.status, errorBody);
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof ApiError) {
          throw error;
        }

        // Network or timeout error — retry if possible
        if (attempt < this.config.maxRetries) {
          await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
          continue;
        }

        throw error instanceof Error
          ? error
          : new Error(`Request failed: ${String(error)}`);
      }
    }

    // Should not reach here, but satisfy the type checker
    throw lastError ?? new Error("Request failed after retries");
  }

  /**
   * Convenience method for GET requests.
   */
  async get<T>(
    path: string,
    query?: Readonly<Record<string, string | number | boolean | undefined>>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "GET", path, query });
  }

  /**
   * Convenience method for POST requests.
   */
  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "POST", path, body });
  }

  /**
   * Convenience method for PUT requests.
   */
  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "PUT", path, body });
  }

  /**
   * Convenience method for PATCH requests.
   */
  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "PATCH", path, body });
  }

  /**
   * Convenience method for DELETE requests.
   */
  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>({ method: "DELETE", path });
  }
}
