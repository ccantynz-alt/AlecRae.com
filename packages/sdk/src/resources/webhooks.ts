/**
 * Webhooks resource — manage webhook endpoints, event subscriptions, and verification.
 *
 * Provides typed methods for creating, managing, and testing webhook endpoints
 * that receive real-time event notifications for email delivery, bounces,
 * opens, clicks, and other platform events.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { type Result, ok, err } from "@emailed/shared";
import type { EmailEventType } from "@emailed/shared";
import type { HttpClient, ApiResponse, PaginatedResponse, ApiError } from "../client/http.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for creating a new webhook endpoint. */
export interface CreateWebhookParams {
  /** The URL to deliver webhook events to (must be HTTPS). */
  readonly url: string;
  /** Human-readable description. */
  readonly description?: string;
  /** Event types to subscribe to. Empty array means all events. */
  readonly events: readonly EmailEventType[];
  /** Whether the webhook is active (default true). */
  readonly active?: boolean;
  /** Custom headers to include in webhook deliveries. */
  readonly customHeaders?: Readonly<Record<string, string>>;
  /** Secret used for HMAC signature verification (auto-generated if omitted). */
  readonly secret?: string;
}

/** Parameters for updating a webhook. */
export interface UpdateWebhookParams {
  /** Updated URL (must be HTTPS). */
  readonly url?: string;
  /** Updated description. */
  readonly description?: string;
  /** Updated event subscriptions. */
  readonly events?: readonly EmailEventType[];
  /** Enable or disable the webhook. */
  readonly active?: boolean;
  /** Updated custom headers. */
  readonly customHeaders?: Readonly<Record<string, string>>;
}

/** A webhook endpoint as returned by the API. */
export interface Webhook {
  readonly id: string;
  readonly accountId: string;
  readonly url: string;
  readonly description?: string;
  readonly events: readonly EmailEventType[];
  readonly active: boolean;
  readonly customHeaders: Readonly<Record<string, string>>;
  /** Signing secret (shown only at creation time). */
  readonly secret?: string;
  /** Prefix of the signing secret for display. */
  readonly secretPrefix: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stats: WebhookStats;
}

/** Delivery statistics for a webhook. */
export interface WebhookStats {
  readonly totalDeliveries: number;
  readonly successfulDeliveries: number;
  readonly failedDeliveries: number;
  readonly averageLatencyMs: number;
  readonly lastDeliveredAt?: string;
  readonly lastFailedAt?: string;
  readonly lastFailureReason?: string;
}

/** Query parameters for listing webhooks. */
export interface ListWebhooksQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly active?: boolean;
  readonly event?: EmailEventType;
}

/** Parameters for testing a webhook endpoint. */
export interface TestWebhookParams {
  /** Event type to simulate (default "email.delivered"). */
  readonly eventType?: EmailEventType;
}

/** Result of a webhook test delivery. */
export interface TestWebhookResult {
  readonly webhookId: string;
  readonly url: string;
  readonly eventType: EmailEventType;
  readonly delivered: boolean;
  readonly statusCode?: number;
  readonly responseBody?: string;
  readonly latencyMs: number;
  readonly error?: string;
  readonly requestId: string;
}

/** A webhook delivery attempt log entry. */
export interface WebhookDeliveryAttempt {
  readonly id: string;
  readonly webhookId: string;
  readonly eventId: string;
  readonly eventType: EmailEventType;
  readonly url: string;
  readonly statusCode?: number;
  readonly responseBody?: string;
  readonly latencyMs: number;
  readonly success: boolean;
  readonly error?: string;
  readonly attemptNumber: number;
  readonly nextRetryAt?: string;
  readonly deliveredAt: string;
}

/** Parameters for listing delivery attempts. */
export interface ListDeliveryAttemptsQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly success?: boolean;
  readonly eventType?: EmailEventType;
  readonly startDate?: string;
  readonly endDate?: string;
}

/** Webhook signature verification components. */
export interface WebhookSignatureComponents {
  readonly timestamp: string;
  readonly signatures: readonly string[];
  readonly tolerance: number;
}

// ---------------------------------------------------------------------------
// Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verify an incoming webhook signature.
 *
 * The signature header format is: "t={timestamp},v1={signature}".
 * The signed payload is "{timestamp}.{body}".
 *
 * @param payload - The raw request body string
 * @param signatureHeader - The value of the "X-Vieanna-Signature" header
 * @param secret - The webhook signing secret
 * @param toleranceSeconds - Maximum age of the timestamp in seconds (default 300 = 5 min)
 * @returns Whether the signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = 300,
): Result<boolean, Error> {
  // Parse the signature header
  const parseResult = parseSignatureHeader(signatureHeader);
  if (!parseResult.ok) {
    return parseResult;
  }

  const { timestamp, signatures } = parseResult.value;

  // Check timestamp tolerance to prevent replay attacks
  const timestampSeconds = parseInt(timestamp, 10);
  if (isNaN(timestampSeconds)) {
    return err(new Error("Invalid timestamp in signature header"));
  }

  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - timestampSeconds);

  if (age > toleranceSeconds) {
    return err(
      new Error(
        `Webhook timestamp too old: ${age}s exceeds tolerance of ${toleranceSeconds}s`,
      ),
    );
  }

  // Compute the expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // Check if any of the provided signatures match (supports key rotation)
  for (const signature of signatures) {
    const sigBuffer = Buffer.from(signature, "utf-8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

    if (sigBuffer.length === expectedBuffer.length) {
      if (timingSafeEqual(sigBuffer, expectedBuffer)) {
        return ok(true);
      }
    }
  }

  return ok(false);
}

/**
 * Generate a webhook signature for testing or internal use.
 *
 * @param payload - The request body string
 * @param secret - The signing secret
 * @param timestamp - Optional timestamp (defaults to now)
 * @returns The formatted signature header value
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp?: number,
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  return `t=${ts},v1=${signature}`;
}

/**
 * Parse a webhook signature header into its components.
 */
function parseSignatureHeader(
  header: string,
): Result<WebhookSignatureComponents, Error> {
  const parts = header.split(",");
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("t=")) {
      timestamp = trimmed.slice(2);
    } else if (trimmed.startsWith("v1=")) {
      signatures.push(trimmed.slice(3));
    }
  }

  if (!timestamp) {
    return err(new Error("Missing timestamp (t=) in signature header"));
  }

  if (signatures.length === 0) {
    return err(new Error("Missing signature (v1=) in signature header"));
  }

  return ok({
    timestamp,
    signatures,
    tolerance: 300,
  });
}

// ---------------------------------------------------------------------------
// Webhooks Resource
// ---------------------------------------------------------------------------

export class WebhooksResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Create a new webhook endpoint.
   *
   * The URL must use HTTPS. A signing secret is auto-generated if not
   * provided and returned in the response (only visible at creation time).
   *
   * @param params - Webhook creation parameters
   * @returns The created webhook with its signing secret
   */
  async create(
    params: CreateWebhookParams,
  ): Promise<Result<ApiResponse<Webhook>, ApiError | Error>> {
    if (!params.url.startsWith("https://")) {
      return err(new Error("Webhook URL must use HTTPS"));
    }

    return this.client.post<Webhook>("/webhooks", params);
  }

  /**
   * List webhook endpoints with filtering.
   *
   * @param query - Filter and pagination parameters
   * @returns Paginated list of webhooks
   */
  async list(
    query?: ListWebhooksQuery,
  ): Promise<Result<ApiResponse<PaginatedResponse<Webhook>>, ApiError | Error>> {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (query) {
      if (query.page !== undefined) params["page"] = query.page;
      if (query.pageSize !== undefined) params["page_size"] = query.pageSize;
      if (query.active !== undefined) params["active"] = query.active;
      if (query.event !== undefined) params["event"] = query.event;
    }

    return this.client.get<PaginatedResponse<Webhook>>("/webhooks", params);
  }

  /**
   * Retrieve a webhook by ID.
   *
   * @param webhookId - The webhook's unique identifier
   * @returns The webhook (without the full signing secret)
   */
  async get(
    webhookId: string,
  ): Promise<Result<ApiResponse<Webhook>, ApiError | Error>> {
    return this.client.get<Webhook>(`/webhooks/${encodeURIComponent(webhookId)}`);
  }

  /**
   * Update a webhook's configuration.
   *
   * @param webhookId - The webhook's unique identifier
   * @param params - Fields to update
   * @returns The updated webhook
   */
  async update(
    webhookId: string,
    params: UpdateWebhookParams,
  ): Promise<Result<ApiResponse<Webhook>, ApiError | Error>> {
    if (params.url !== undefined && !params.url.startsWith("https://")) {
      return err(new Error("Webhook URL must use HTTPS"));
    }

    return this.client.patch<Webhook>(
      `/webhooks/${encodeURIComponent(webhookId)}`,
      params,
    );
  }

  /**
   * Delete a webhook endpoint.
   *
   * In-flight deliveries may still arrive after deletion.
   *
   * @param webhookId - The webhook's unique identifier
   */
  async delete(
    webhookId: string,
  ): Promise<Result<ApiResponse<{ deleted: true }>, ApiError | Error>> {
    return this.client.delete<{ deleted: true }>(
      `/webhooks/${encodeURIComponent(webhookId)}`,
    );
  }

  /**
   * Send a test event to a webhook endpoint.
   *
   * Delivers a synthetic event to verify that the endpoint is correctly
   * configured and accessible.
   *
   * @param webhookId - The webhook's unique identifier
   * @param params - Test parameters (event type to simulate)
   * @returns Test delivery result with response details
   */
  async test(
    webhookId: string,
    params?: TestWebhookParams,
  ): Promise<Result<ApiResponse<TestWebhookResult>, ApiError | Error>> {
    return this.client.post<TestWebhookResult>(
      `/webhooks/${encodeURIComponent(webhookId)}/test`,
      params ?? {},
    );
  }

  /**
   * List delivery attempts for a webhook.
   *
   * Useful for debugging delivery issues and monitoring webhook health.
   *
   * @param webhookId - The webhook's unique identifier
   * @param query - Filter and pagination parameters
   * @returns Paginated list of delivery attempts
   */
  async listDeliveryAttempts(
    webhookId: string,
    query?: ListDeliveryAttemptsQuery,
  ): Promise<Result<ApiResponse<PaginatedResponse<WebhookDeliveryAttempt>>, ApiError | Error>> {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (query) {
      if (query.page !== undefined) params["page"] = query.page;
      if (query.pageSize !== undefined) params["page_size"] = query.pageSize;
      if (query.success !== undefined) params["success"] = query.success;
      if (query.eventType !== undefined) params["event_type"] = query.eventType;
      if (query.startDate !== undefined) params["start_date"] = query.startDate;
      if (query.endDate !== undefined) params["end_date"] = query.endDate;
    }

    return this.client.get<PaginatedResponse<WebhookDeliveryAttempt>>(
      `/webhooks/${encodeURIComponent(webhookId)}/deliveries`,
      params,
    );
  }

  /**
   * Rotate the signing secret for a webhook.
   *
   * Returns the new secret. The old secret remains valid for 24 hours
   * to allow graceful migration.
   *
   * @param webhookId - The webhook's unique identifier
   * @returns Updated webhook with the new signing secret
   */
  async rotateSecret(
    webhookId: string,
  ): Promise<Result<ApiResponse<Webhook>, ApiError | Error>> {
    return this.client.post<Webhook>(
      `/webhooks/${encodeURIComponent(webhookId)}/rotate-secret`,
    );
  }
}
