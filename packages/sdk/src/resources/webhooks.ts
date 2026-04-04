/**
 * Webhooks resource — create, manage, and test webhook endpoints.
 */
import type { ApiClient } from "../client/api-client.js";
import type {
  ApiResponse,
  Webhook,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDelivery,
} from "../types.js";

/** The API path prefix for webhook endpoints. */
const BASE_PATH = "/v1/webhooks";

/**
 * Resource class for interacting with the Webhooks API.
 *
 * Usage:
 * ```ts
 * const emailed = new Emailed({ apiKey: "em_live_..." });
 * const hook = await emailed.webhooks.create({
 *   url: "https://example.com/webhooks",
 *   events: ["message.delivered", "message.bounced"],
 * });
 * ```
 */
export class Webhooks {
  constructor(private readonly client: ApiClient) {}

  /**
   * Create a new webhook endpoint.
   *
   * @param params  Webhook URL, event types, and optional settings
   * @returns The created webhook endpoint
   */
  async create(params: CreateWebhookParams): Promise<ApiResponse<Webhook>> {
    return this.client.post<Webhook>(BASE_PATH, params);
  }

  /**
   * Retrieve a webhook endpoint by ID.
   *
   * @param webhookId  The webhook identifier
   * @returns The webhook endpoint object
   */
  async get(webhookId: string): Promise<ApiResponse<Webhook>> {
    return this.client.get<Webhook>(
      `${BASE_PATH}/${encodeURIComponent(webhookId)}`,
    );
  }

  /**
   * List all webhook endpoints for the account.
   *
   * @returns Array of webhook endpoints
   */
  async list(): Promise<ApiResponse<Webhook[]>> {
    return this.client.get<Webhook[]>(BASE_PATH);
  }

  /**
   * Update a webhook endpoint.
   *
   * @param webhookId  The webhook identifier
   * @param params     Fields to update
   * @returns The updated webhook endpoint
   */
  async update(
    webhookId: string,
    params: UpdateWebhookParams,
  ): Promise<ApiResponse<Webhook>> {
    return this.client.patch<Webhook>(
      `${BASE_PATH}/${encodeURIComponent(webhookId)}`,
      params,
    );
  }

  /**
   * Delete a webhook endpoint.
   *
   * @param webhookId  The webhook identifier
   */
  async delete(webhookId: string): Promise<ApiResponse<{ deleted: boolean; id: string }>> {
    return this.client.delete<{ deleted: boolean; id: string }>(
      `${BASE_PATH}/${encodeURIComponent(webhookId)}`,
    );
  }

  /**
   * Send a test event to a webhook endpoint.
   *
   * Creates a test event and dispatches it through the real delivery pipeline.
   *
   * @param webhookId  The webhook identifier
   * @returns Test delivery result
   */
  async test(
    webhookId: string,
  ): Promise<ApiResponse<{ success: boolean; eventId: string; eventType: string; message: string }>> {
    return this.client.post<{ success: boolean; eventId: string; eventType: string; message: string }>(
      `${BASE_PATH}/${encodeURIComponent(webhookId)}/test`,
    );
  }

  /**
   * List recent delivery attempts for a webhook endpoint.
   *
   * @param webhookId  The webhook identifier
   * @param options    Pagination options
   * @returns Array of webhook delivery records
   */
  async listDeliveries(
    webhookId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ApiResponse<WebhookDelivery[]>> {
    return this.client.get<WebhookDelivery[]>(
      `${BASE_PATH}/${encodeURIComponent(webhookId)}/deliveries`,
      {
        limit: options.limit,
        offset: options.offset,
      },
    );
  }
}
