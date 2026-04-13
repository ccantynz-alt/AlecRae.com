/**
 * Domains resource — add, verify, and configure sending domains.
 */
import type { ApiClient } from "../client/api-client.js";
import type {
  ApiResponse,
  SdkDomain,
  AddDomainParams,
  DomainDnsRecords,
  DomainDnsResponse,
  DomainHealth,
  PaginatedList,
  PaginationParams,
} from "../types.js";

/** The API path prefix for domain endpoints. */
const BASE_PATH = "/v1/domains";

/**
 * Resource class for interacting with the Domains API.
 *
 * Usage:
 * ```ts
 * const alecrae = new AlecRae({ auth: { type: "apiKey", key: "em_live_..." } });
 * const domain = await alecrae.domains.add({ name: "example.com" });
 * const records = await alecrae.domains.getDnsRecords(domain.data.id);
 * await alecrae.domains.verify(domain.data.id);
 * ```
 */
export class Domains {
  constructor(private readonly client: ApiClient) {}

  /**
   * Register a new sending domain.
   *
   * @param params  Domain name to register
   * @returns The created domain (status will be "pending")
   */
  async add(params: AddDomainParams): Promise<ApiResponse<SdkDomain>> {
    return this.client.post<SdkDomain>(BASE_PATH, params);
  }

  /**
   * Retrieve a single domain by ID.
   *
   * @param domainId  The domain identifier
   * @returns The domain object
   */
  async get(domainId: string): Promise<ApiResponse<SdkDomain>> {
    return this.client.get<SdkDomain>(`${BASE_PATH}/${encodeURIComponent(domainId)}`);
  }

  /**
   * List all domains with optional pagination.
   *
   * @param params  Pagination parameters
   * @returns A paginated list of domains
   */
  async list(
    params: PaginationParams = {},
  ): Promise<ApiResponse<PaginatedList<SdkDomain>>> {
    const query: Record<string, string | number | boolean | undefined> = {
      page: params.page,
      page_size: params.pageSize,
      cursor: params.cursor,
    };

    return this.client.get<PaginatedList<SdkDomain>>(BASE_PATH, query);
  }

  /**
   * Trigger domain verification.
   *
   * The platform checks that the required DNS records are properly
   * configured. On success the domain status moves to "verified".
   *
   * @param domainId  The domain identifier
   * @returns The updated domain object
   */
  async verify(domainId: string): Promise<ApiResponse<SdkDomain>> {
    return this.client.post<SdkDomain>(
      `${BASE_PATH}/${encodeURIComponent(domainId)}/verify`,
    );
  }

  /**
   * Get the DNS records that must be configured for a domain.
   *
   * Returns DKIM, SPF, DMARC, and MX record instructions.
   *
   * @param domainId  The domain identifier
   * @returns DNS record setup instructions
   */
  async getDnsRecords(domainId: string): Promise<ApiResponse<DomainDnsRecords>> {
    return this.client.get<DomainDnsRecords>(
      `${BASE_PATH}/${encodeURIComponent(domainId)}/dns-records`,
    );
  }

  /**
   * Remove a domain from the account.
   *
   * @param domainId  The domain identifier
   */
  async remove(domainId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.client.delete<{ deleted: boolean }>(
      `${BASE_PATH}/${encodeURIComponent(domainId)}`,
    );
  }

  /**
   * Get the DNS records with verification status for a domain.
   *
   * @param domainId  The domain identifier
   * @returns DNS records with per-record verification status
   */
  async getDns(domainId: string): Promise<ApiResponse<DomainDnsResponse>> {
    return this.client.get<DomainDnsResponse>(
      `${BASE_PATH}/${encodeURIComponent(domainId)}/dns`,
    );
  }

  /**
   * Get a health report for a domain.
   *
   * Returns a score, DKIM key age, SPF lookup count, and actionable
   * recommendations for improving deliverability.
   *
   * @param domainId  The domain identifier
   * @returns Domain health report
   */
  async getHealth(domainId: string): Promise<ApiResponse<DomainHealth>> {
    return this.client.get<DomainHealth>(
      `${BASE_PATH}/${encodeURIComponent(domainId)}/health`,
    );
  }
}
