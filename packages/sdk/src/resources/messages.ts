/**
 * Messages resource — send, retrieve, list, and search emails.
 */
import type { ApiClient } from "../client/api-client.js";
import type {
  ApiResponse,
  SendMessageParams,
  Message,
  MessageSearchParams,
  PaginatedList,
} from "../types.js";

/** The API path prefix for message endpoints. */
const BASE_PATH = "/v1/messages";

/**
 * Resource class for interacting with the Messages API.
 *
 * Usage:
 * ```ts
 * const alecrae = new AlecRae({ auth: { type: "apiKey", key: "em_live_..." } });
 * const result = await alecrae.messages.send({ ... });
 * ```
 */
export class Messages {
  constructor(private readonly client: ApiClient) {}

  /**
   * Send an email message.
   *
   * @param params  Message parameters (from, to, subject, body, etc.)
   * @returns The created message with its initial status
   */
  async send(params: SendMessageParams): Promise<ApiResponse<Message>> {
    return this.client.post<Message>(BASE_PATH, params);
  }

  /**
   * Retrieve a single message by ID.
   *
   * @param messageId  The message identifier
   * @returns The full message object
   */
  async get(messageId: string): Promise<ApiResponse<Message>> {
    return this.client.get<Message>(`${BASE_PATH}/${encodeURIComponent(messageId)}`);
  }

  /**
   * List messages with optional filters and pagination.
   *
   * @param params  Filter and pagination parameters
   * @returns A paginated list of messages
   */
  async list(
    params: MessageSearchParams = {},
  ): Promise<ApiResponse<PaginatedList<Message>>> {
    const query: Record<string, string | number | boolean | undefined> = {
      page: params.page,
      page_size: params.pageSize,
      cursor: params.cursor,
      status: params.status,
      tag: params.tag,
      from: params.from,
      to: params.to,
      start_date: params.startDate,
      end_date: params.endDate,
    };

    return this.client.get<PaginatedList<Message>>(BASE_PATH, query);
  }

  /**
   * Search messages using a full-text query.
   *
   * @param query   Search query string
   * @param params  Additional filters and pagination
   * @returns A paginated list of matching messages
   */
  async search(
    query: string,
    params: Omit<MessageSearchParams, "query"> = {},
  ): Promise<ApiResponse<PaginatedList<Message>>> {
    const searchQuery: Record<string, string | number | boolean | undefined> = {
      q: query,
      page: params.page,
      page_size: params.pageSize,
      cursor: params.cursor,
      status: params.status,
      tag: params.tag,
      from: params.from,
      to: params.to,
      start_date: params.startDate,
      end_date: params.endDate,
    };

    return this.client.get<PaginatedList<Message>>(`${BASE_PATH}/search`, searchQuery);
  }

  /**
   * Cancel a scheduled message that has not yet been sent.
   *
   * @param messageId  The message identifier
   * @returns The updated message with status "dropped"
   */
  async cancel(messageId: string): Promise<ApiResponse<Message>> {
    return this.client.post<Message>(
      `${BASE_PATH}/${encodeURIComponent(messageId)}/cancel`,
    );
  }
}
