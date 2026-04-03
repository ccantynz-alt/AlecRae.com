/**
 * Contacts resource — manage recipients and contact lists.
 */
import type { ApiClient } from "../client/api-client.js";
import type {
  ApiResponse,
  Contact,
  UpsertContactParams,
  ContactListParams,
  PaginatedList,
} from "../types.js";

/** The API path prefix for contact endpoints. */
const BASE_PATH = "/v1/contacts";

/**
 * Resource class for interacting with the Contacts API.
 *
 * Usage:
 * ```ts
 * const emailed = new Emailed({ auth: { type: "apiKey", key: "em_live_..." } });
 * await emailed.contacts.upsert({ email: "alice@example.com", name: "Alice" });
 * ```
 */
export class Contacts {
  constructor(private readonly client: ApiClient) {}

  /**
   * Create or update a contact.
   *
   * If a contact with the same email address already exists it is updated;
   * otherwise a new contact is created.
   *
   * @param params  Contact data
   * @returns The created or updated contact
   */
  async upsert(params: UpsertContactParams): Promise<ApiResponse<Contact>> {
    return this.client.post<Contact>(BASE_PATH, params);
  }

  /**
   * Retrieve a single contact by ID.
   *
   * @param contactId  The contact identifier
   * @returns The contact object
   */
  async get(contactId: string): Promise<ApiResponse<Contact>> {
    return this.client.get<Contact>(`${BASE_PATH}/${encodeURIComponent(contactId)}`);
  }

  /**
   * List contacts with optional filters and pagination.
   *
   * @param params  Filter and pagination parameters
   * @returns A paginated list of contacts
   */
  async list(
    params: ContactListParams = {},
  ): Promise<ApiResponse<PaginatedList<Contact>>> {
    const query: Record<string, string | number | boolean | undefined> = {
      page: params.page,
      page_size: params.pageSize,
      cursor: params.cursor,
      tag: params.tag,
      subscribed: params.subscribed,
      q: params.query,
    };

    return this.client.get<PaginatedList<Contact>>(BASE_PATH, query);
  }

  /**
   * Update an existing contact.
   *
   * @param contactId  The contact identifier
   * @param params     Fields to update
   * @returns The updated contact
   */
  async update(
    contactId: string,
    params: Partial<UpsertContactParams>,
  ): Promise<ApiResponse<Contact>> {
    return this.client.patch<Contact>(
      `${BASE_PATH}/${encodeURIComponent(contactId)}`,
      params,
    );
  }

  /**
   * Delete a contact.
   *
   * @param contactId  The contact identifier
   */
  async remove(contactId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.client.delete<{ deleted: boolean }>(
      `${BASE_PATH}/${encodeURIComponent(contactId)}`,
    );
  }

  /**
   * Unsubscribe a contact from all future emails.
   *
   * @param contactId  The contact identifier
   * @returns The updated contact with `subscribed: false`
   */
  async unsubscribe(contactId: string): Promise<ApiResponse<Contact>> {
    return this.client.post<Contact>(
      `${BASE_PATH}/${encodeURIComponent(contactId)}/unsubscribe`,
    );
  }
}
