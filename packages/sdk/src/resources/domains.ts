/**
 * Domains resource — manage sending domains, DNS records, and authentication.
 *
 * Provides typed methods for domain lifecycle management, DNS record generation,
 * and email authentication status checking (SPF, DKIM, DMARC).
 */

import { type Result } from "@emailed/shared";
import type {
  Domain,
  DnsRecord,
  AuthenticationStatus,
  DomainVerificationStatus,
} from "@emailed/shared";
import type { HttpClient, ApiResponse, PaginatedResponse, ApiError } from "../client/http.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for creating (registering) a new sending domain. */
export interface CreateDomainParams {
  /** The domain name (e.g., "notifications.example.com"). */
  readonly domain: string;
  /** Optional subdomain for sending (e.g., "mail"). */
  readonly subdomain?: string;
  /** Whether to make this the default sending domain. */
  readonly isDefault?: boolean;
  /** Auto-generate and configure DNS records. */
  readonly autoConfigureDns?: boolean;
  /** DKIM selector to use (default "em"). */
  readonly dkimSelector?: string;
}

/** Result of creating a new domain. */
export interface CreateDomainResult {
  readonly domain: Domain;
  /** DNS records that need to be configured. */
  readonly requiredDnsRecords: readonly DnsRecord[];
  /** Instructions for manual DNS configuration. */
  readonly instructions: readonly DnsConfigInstruction[];
}

/** A human-readable DNS configuration instruction. */
export interface DnsConfigInstruction {
  readonly recordType: string;
  readonly host: string;
  readonly value: string;
  readonly purpose: string;
  readonly priority?: number;
}

/** Query parameters for listing domains. */
export interface ListDomainsQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: DomainVerificationStatus;
  readonly isActive?: boolean;
}

/** Result of a domain verification attempt. */
export interface VerifyDomainResult {
  readonly domain: Domain;
  readonly verificationStatus: DomainVerificationStatus;
  /** Per-record verification status. */
  readonly recordStatus: readonly DnsRecordVerificationStatus[];
  /** Whether all required records are verified. */
  readonly allRecordsVerified: boolean;
}

/** Status of a single DNS record verification check. */
export interface DnsRecordVerificationStatus {
  readonly recordType: string;
  readonly host: string;
  readonly expectedValue: string;
  readonly actualValue?: string;
  readonly verified: boolean;
  readonly error?: string;
}

/** DNS records generated for a domain. */
export interface DomainDnsRecords {
  readonly domain: string;
  readonly records: readonly DnsRecord[];
  readonly spfRecord: DnsRecord;
  readonly dkimRecord: DnsRecord;
  readonly dmarcRecord: DnsRecord;
  readonly mxRecords: readonly DnsRecord[];
  readonly returnPathRecord: DnsRecord;
}

/** Domain authentication check result. */
export interface AuthenticationCheckResult {
  readonly domain: string;
  readonly authentication: AuthenticationStatus;
  readonly score: number;
  readonly issues: readonly AuthenticationIssue[];
  readonly checkedAt: string;
}

/** An issue found during authentication checking. */
export interface AuthenticationIssue {
  readonly severity: "error" | "warning" | "info";
  readonly mechanism: "spf" | "dkim" | "dmarc" | "return-path" | "mta-sts";
  readonly message: string;
  readonly recommendation: string;
}

// ---------------------------------------------------------------------------
// Domains Resource
// ---------------------------------------------------------------------------

export class DomainsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Register a new sending domain.
   *
   * Returns the domain with required DNS records that must be configured
   * for verification to succeed.
   *
   * @param params - Domain creation parameters
   * @returns The created domain with DNS setup instructions
   */
  async create(
    params: CreateDomainParams,
  ): Promise<Result<ApiResponse<CreateDomainResult>, ApiError | Error>> {
    return this.client.post<CreateDomainResult>("/domains", params);
  }

  /**
   * Trigger verification of a domain's DNS records.
   *
   * Checks that all required DNS records (SPF, DKIM, DMARC, MX) are
   * properly configured. Verification may take a few seconds as the
   * system queries authoritative nameservers.
   *
   * @param domainId - The domain's unique identifier
   * @returns Verification result with per-record status
   */
  async verify(
    domainId: string,
  ): Promise<Result<ApiResponse<VerifyDomainResult>, ApiError | Error>> {
    return this.client.post<VerifyDomainResult>(
      `/domains/${encodeURIComponent(domainId)}/verify`,
    );
  }

  /**
   * Retrieve a domain by ID.
   *
   * @param domainId - The domain's unique identifier
   * @returns The full domain object
   */
  async get(
    domainId: string,
  ): Promise<Result<ApiResponse<Domain>, ApiError | Error>> {
    return this.client.get<Domain>(`/domains/${encodeURIComponent(domainId)}`);
  }

  /**
   * List domains with filtering and pagination.
   *
   * @param query - Filter and pagination parameters
   * @returns Paginated list of domains
   */
  async list(
    query?: ListDomainsQuery,
  ): Promise<Result<ApiResponse<PaginatedResponse<Domain>>, ApiError | Error>> {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (query) {
      if (query.page !== undefined) params["page"] = query.page;
      if (query.pageSize !== undefined) params["page_size"] = query.pageSize;
      if (query.status !== undefined) params["status"] = query.status;
      if (query.isActive !== undefined) params["is_active"] = query.isActive;
    }

    return this.client.get<PaginatedResponse<Domain>>("/domains", params);
  }

  /**
   * Delete a sending domain.
   *
   * The domain must not be actively sending. Any queued messages for this
   * domain will be dropped.
   *
   * @param domainId - The domain's unique identifier
   */
  async delete(
    domainId: string,
  ): Promise<Result<ApiResponse<{ deleted: true }>, ApiError | Error>> {
    return this.client.delete<{ deleted: true }>(
      `/domains/${encodeURIComponent(domainId)}`,
    );
  }

  /**
   * Get the required DNS records for a domain.
   *
   * Returns all DNS records that should be configured, including SPF, DKIM,
   * DMARC, MX, and return-path records.
   *
   * @param domainId - The domain's unique identifier
   * @returns Complete DNS record set for the domain
   */
  async getDnsRecords(
    domainId: string,
  ): Promise<Result<ApiResponse<DomainDnsRecords>, ApiError | Error>> {
    return this.client.get<DomainDnsRecords>(
      `/domains/${encodeURIComponent(domainId)}/dns-records`,
    );
  }

  /**
   * Check the authentication status of a domain.
   *
   * Performs a comprehensive check of SPF, DKIM, DMARC, return-path,
   * and MTA-STS configuration, returning a score and actionable issues.
   *
   * @param domainId - The domain's unique identifier
   * @returns Authentication check result with score and issues
   */
  async checkAuthentication(
    domainId: string,
  ): Promise<Result<ApiResponse<AuthenticationCheckResult>, ApiError | Error>> {
    return this.client.get<AuthenticationCheckResult>(
      `/domains/${encodeURIComponent(domainId)}/authentication`,
    );
  }
}
