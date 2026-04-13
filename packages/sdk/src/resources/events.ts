/**
 * Events resource — list and retrieve platform events.
 */
import type { ApiClient } from "../client/api-client.js";
import type {
  ApiResponse,
  PlatformEvent,
  EventListParams,
  PaginatedList,
} from "../types.js";

/** The API path prefix for event endpoints. */
const BASE_PATH = "/v1/events";

/**
 * Resource class for interacting with the Events API.
 *
 * Events are immutable records of things that happened on the platform
 * (message delivered, domain verified, etc.).
 *
 * Usage:
 * ```ts
 * const alecrae = new AlecRae({ apiKey: "em_live_..." });
 * const events = await alecrae.events.list({ type: "message.delivered" });
 * ```
 */
export class Events {
  constructor(private readonly client: ApiClient) {}

  /**
   * List events with optional filters and pagination.
   *
   * @param params  Filter and pagination parameters
   * @returns A paginated list of events
   */
  async list(
    params: EventListParams = {},
  ): Promise<ApiResponse<PaginatedList<PlatformEvent>>> {
    const query: Record<string, string | number | boolean | undefined> = {
      page: params.page,
      page_size: params.pageSize,
      cursor: params.cursor,
      type: params.type,
      message_id: params.messageId,
      start_date: params.startDate,
      end_date: params.endDate,
    };

    return this.client.get<PaginatedList<PlatformEvent>>(BASE_PATH, query);
  }

  /**
   * Retrieve a single event by ID.
   *
   * @param eventId  The event identifier
   * @returns The event object
   */
  async get(eventId: string): Promise<ApiResponse<PlatformEvent>> {
    return this.client.get<PlatformEvent>(
      `${BASE_PATH}/${encodeURIComponent(eventId)}`,
    );
  }
}
