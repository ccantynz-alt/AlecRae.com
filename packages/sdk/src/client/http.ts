/**
 * HTTP client with authentication, retries, rate limiting, and typed responses.
 *
 * Handles all low-level communication with the Vienna/Emailed API, including
 * automatic retries with exponential backoff, rate limit (429) handling,
 * request/response logging, and TypeScript generics for type-safe responses.
 */

import { type Result, ok, err, fromPromise } from "@emailed/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** HTTP methods supported by the client. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Log levels for request/response logging. */
export type LogLevel = "none" | "error" | "warn" | "info" | "debug";

/** A logger function that receives structured log entries. */
export type LoggerFn = (entry: LogEntry) => void;

/** A structured log entry for request/response activity. */
export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly method?: HttpMethod;
  readonly url?: string;
  readonly statusCode?: number;
  readonly durationMs?: number;
  readonly retryAttempt?: number;
  readonly timestamp: string;
  readonly requestId?: string;
  readonly error?: string;
}

/** Configuration for the HTTP client. */
export interface HttpClientConfig {
  /** Base URL for all API requests (e.g., "https://api.emailed.dev/v1"). */
  readonly baseUrl: string;
  /** API key for authentication. */
  readonly apiKey: string;
  /** Maximum number of retry attempts for failed requests (default 3). */
  readonly maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default 1000). */
  readonly retryBaseDelayMs?: number;
  /** Maximum delay in milliseconds for exponential backoff (default 30000). */
  readonly retryMaxDelayMs?: number;
  /** Request timeout in milliseconds (default 30000). */
  readonly timeoutMs?: number;
  /** Log level for request/response logging (default "error"). */
  readonly logLevel?: LogLevel;
  /** Custom logger function. Defaults to console-based logging. */
  readonly logger?: LoggerFn;
  /** Custom headers to include in every request. */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  /** User-agent string (default "@vienna/sdk/{version}"). */
  readonly userAgent?: string;
}

/** Options for an individual HTTP request. */
export interface RequestOptions {
  /** URL path relative to baseUrl (e.g., "/messages"). */
  readonly path: string;
  /** HTTP method. */
  readonly method: HttpMethod;
  /** Request body (will be JSON-serialized). */
  readonly body?: unknown;
  /** Query parameters. */
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** Additional headers for this request only. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Override the default timeout for this request. */
  readonly timeoutMs?: number;
  /** Whether to skip automatic retries for this request. */
  readonly skipRetries?: boolean;
  /** Idempotency key for safe retries of mutating requests. */
  readonly idempotencyKey?: string;
  /** AbortSignal for cancellation. */
  readonly signal?: AbortSignal;
}

/** A parsed API response. */
export interface ApiResponse<T> {
  readonly data: T;
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestId: string;
  readonly rateLimit: RateLimitInfo;
}

/** Rate limit information from response headers. */
export interface RateLimitInfo {
  /** Maximum requests allowed in the window. */
  readonly limit: number;
  /** Remaining requests in the current window. */
  readonly remaining: number;
  /** Timestamp when the rate limit resets (Unix seconds). */
  readonly resetAt: number;
  /** Seconds until the rate limit resets. */
  readonly retryAfter?: number | undefined;
}

/** Paginated list response from the API. */
export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalCount: number;
    readonly totalPages: number;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
  };
}

/** API error response body. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly context?: Readonly<Record<string, unknown>>;
  };
}

/** An error returned by the API with structured information. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId: string;
  readonly context?: Readonly<Record<string, unknown>> | undefined;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    requestId: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
    this.context = context;
  }
}

// ---------------------------------------------------------------------------
// Log level ordering
// ---------------------------------------------------------------------------

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

function shouldLog(configured: LogLevel, entryLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[configured] >= LOG_LEVEL_ORDER[entryLevel];
}

// ---------------------------------------------------------------------------
// Default logger
// ---------------------------------------------------------------------------

function defaultLogger(entry: LogEntry): void {
  const prefix = `[vienna-sdk] [${entry.level.toUpperCase()}]`;
  const parts = [prefix, entry.message];

  if (entry.method && entry.url) {
    parts.push(`${entry.method} ${entry.url}`);
  }
  if (entry.statusCode !== undefined) {
    parts.push(`status=${entry.statusCode}`);
  }
  if (entry.durationMs !== undefined) {
    parts.push(`duration=${entry.durationMs}ms`);
  }
  if (entry.retryAttempt !== undefined) {
    parts.push(`retry=${entry.retryAttempt}`);
  }
  if (entry.requestId) {
    parts.push(`reqId=${entry.requestId}`);
  }

  const line = parts.join(" ");

  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      console.debug(line);
      break;
    default:
      console.info(line);
  }
}

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

export class HttpClient {
  private readonly config: Required<
    Pick<HttpClientConfig, "baseUrl" | "apiKey" | "maxRetries" | "retryBaseDelayMs" | "retryMaxDelayMs" | "timeoutMs" | "logLevel" | "userAgent">
  > & {
    readonly logger: LoggerFn;
    readonly defaultHeaders: Readonly<Record<string, string>>;
  };

  constructor(config: HttpClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      apiKey: config.apiKey,
      maxRetries: config.maxRetries ?? 3,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 1000,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 30000,
      timeoutMs: config.timeoutMs ?? 30000,
      logLevel: config.logLevel ?? "error",
      logger: config.logger ?? defaultLogger,
      defaultHeaders: config.defaultHeaders ?? {},
      userAgent: config.userAgent ?? "@vienna/sdk/0.1.0",
    };
  }

  /**
   * Execute a typed API request with automatic retries and rate limiting.
   */
  async request<T>(options: RequestOptions): Promise<Result<ApiResponse<T>, ApiError | Error>> {
    const url = this.buildUrl(options.path, options.query);
    const timeout = options.timeoutMs ?? this.config.timeoutMs;
    const maxAttempts = (options.skipRetries === true) ? 1 : this.config.maxRetries + 1;

    let lastError: ApiError | Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.computeBackoffDelay(attempt, lastError);
        this.log("info", `Retrying request (attempt ${attempt + 1}/${maxAttempts}) after ${delay}ms`, {
          method: options.method,
          url,
          retryAttempt: attempt,
        });
        await sleep(delay);
      }

      const startTime = Date.now();
      const headers = this.buildHeaders(options);

      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeout);

      // Compose signals if the caller provided one
      const signal = options.signal
        ? composeAbortSignals(options.signal, abortController.signal)
        : abortController.signal;

      try {
        const fetchOptions: RequestInit = {
          method: options.method,
          headers,
          signal,
        };
        if (options.body !== undefined) {
          fetchOptions.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        const durationMs = Date.now() - startTime;
        const requestId = response.headers.get("x-request-id") ?? generateRequestId();
        const rateLimit = parseRateLimitHeaders(response.headers);

        this.log("debug", "Response received", {
          method: options.method,
          url,
          statusCode: response.status,
          durationMs,
          requestId,
        });

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = rateLimit.retryAfter ?? this.computeBackoffDelay(attempt);
          lastError = new ApiError(
            "Rate limit exceeded",
            429,
            "RATE_LIMIT_EXCEEDED",
            requestId,
            { retryAfter },
          );

          this.log("warn", `Rate limited, retry after ${retryAfter}ms`, {
            method: options.method,
            url,
            statusCode: 429,
            requestId,
          });

          // Override backoff with server-specified retry-after
          if (attempt < maxAttempts - 1) {
            await sleep(retryAfter * 1000);
            continue;
          }

          return err(lastError);
        }

        // Handle server errors (5xx) — eligible for retry
        if (response.status >= 500) {
          const body = await safeParseJson<ApiErrorBody>(response);
          lastError = new ApiError(
            body?.error?.message ?? `Server error: ${response.status}`,
            response.status,
            body?.error?.code ?? "SERVER_ERROR",
            requestId,
            body?.error?.context,
          );

          this.log("error", `Server error ${response.status}`, {
            method: options.method,
            url,
            statusCode: response.status,
            requestId,
            error: lastError.message,
          });

          if (attempt < maxAttempts - 1) {
            continue;
          }

          return err(lastError);
        }

        // Handle client errors (4xx) — NOT retried (except 429 above)
        if (response.status >= 400) {
          const body = await safeParseJson<ApiErrorBody>(response);
          const apiErr = new ApiError(
            body?.error?.message ?? `Client error: ${response.status}`,
            response.status,
            body?.error?.code ?? "CLIENT_ERROR",
            requestId,
            body?.error?.context,
          );

          this.log("error", `Client error ${response.status}`, {
            method: options.method,
            url,
            statusCode: response.status,
            requestId,
            error: apiErr.message,
          });

          return err(apiErr);
        }

        // Success (2xx)
        const data = await response.json() as T;
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return ok({
          data,
          statusCode: response.status,
          headers: responseHeaders,
          requestId,
          rateLimit,
        });
      } catch (e) {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        if (e instanceof Error && e.name === "AbortError") {
          lastError = new Error(`Request timed out after ${timeout}ms`);
        } else {
          lastError = e instanceof Error ? e : new Error(String(e));
        }

        this.log("error", `Request failed: ${lastError.message}`, {
          method: options.method,
          url,
          durationMs,
          retryAttempt: attempt,
          error: lastError.message,
        });

        // Network errors are retryable
        if (attempt >= maxAttempts - 1) {
          return err(lastError);
        }
      }
    }

    return err(lastError ?? new Error("Request failed after all retries"));
  }

  /** Convenience: GET request. */
  async get<T>(
    path: string,
    query?: Readonly<Record<string, string | number | boolean | undefined>>,
  ): Promise<Result<ApiResponse<T>, ApiError | Error>> {
    const opts: RequestOptions = { path, method: "GET" };
    if (query !== undefined) {
      return this.request<T>({ ...opts, query });
    }
    return this.request<T>(opts);
  }

  /** Convenience: POST request. */
  async post<T>(
    path: string,
    body?: unknown,
  ): Promise<Result<ApiResponse<T>, ApiError | Error>> {
    return this.request<T>({ path, method: "POST", body });
  }

  /** Convenience: PUT request. */
  async put<T>(
    path: string,
    body?: unknown,
  ): Promise<Result<ApiResponse<T>, ApiError | Error>> {
    return this.request<T>({ path, method: "PUT", body });
  }

  /** Convenience: PATCH request. */
  async patch<T>(
    path: string,
    body?: unknown,
  ): Promise<Result<ApiResponse<T>, ApiError | Error>> {
    return this.request<T>({ path, method: "PATCH", body });
  }

  /** Convenience: DELETE request. */
  async delete<T>(
    path: string,
  ): Promise<Result<ApiResponse<T>, ApiError | Error>> {
    return this.request<T>({ path, method: "DELETE" });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildUrl(
    path: string,
    query?: Readonly<Record<string, string | number | boolean | undefined>>,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.config.baseUrl}${normalizedPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private buildHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": this.config.userAgent,
      ...this.config.defaultHeaders,
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    return headers;
  }

  private computeBackoffDelay(attempt: number, lastError?: Error): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.config.retryBaseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.config.retryBaseDelayMs * 0.5;
    const delay = Math.min(
      exponentialDelay + jitter,
      this.config.retryMaxDelayMs,
    );
    return Math.round(delay);
  }

  private log(
    level: LogLevel,
    message: string,
    extra?: Partial<Omit<LogEntry, "level" | "message" | "timestamp">>,
  ): void {
    if (!shouldLog(this.config.logLevel, level)) return;

    this.config.logger({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const limit = parseInt(headers.get("x-ratelimit-limit") ?? "0", 10);
  const remaining = parseInt(headers.get("x-ratelimit-remaining") ?? "0", 10);
  const resetAt = parseInt(headers.get("x-ratelimit-reset") ?? "0", 10);
  const retryAfterStr = headers.get("retry-after");
  const retryAfter = retryAfterStr ? parseInt(retryAfterStr, 10) : undefined;

  return { limit, remaining, resetAt, retryAfter };
}

async function safeParseJson<T>(response: Response): Promise<T | undefined> {
  try {
    return await response.json() as T;
  } catch {
    return undefined;
  }
}

function composeAbortSignals(
  userSignal: AbortSignal,
  timeoutSignal: AbortSignal,
): AbortSignal {
  const controller = new AbortController();

  const onAbort = () => controller.abort();

  if (userSignal.aborted || timeoutSignal.aborted) {
    controller.abort();
    return controller.signal;
  }

  userSignal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", onAbort, { once: true });

  return controller.signal;
}
