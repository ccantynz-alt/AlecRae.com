/** DNS record types relevant to email authentication. */
export type DnsRecordType = "TXT" | "CNAME" | "MX" | "A" | "AAAA";

/** A DNS record that must be configured for domain verification or email auth. */
export interface DnsRecord {
  readonly type: DnsRecordType;
  /** DNS record name/host, e.g. "em._domainkey" */
  readonly name: string;
  /** Expected record value */
  readonly value: string;
  /** TTL in seconds */
  readonly ttl: number;
  /** Priority (for MX records) */
  readonly priority?: number;
  /** Whether this record has been detected in DNS */
  readonly verified: boolean;
  readonly lastCheckedAt?: Date;
}

/** Status of email authentication mechanisms for a domain. */
export interface AuthenticationStatus {
  readonly spf: {
    readonly verified: boolean;
    readonly record?: string;
  };
  readonly dkim: {
    readonly verified: boolean;
    readonly selector?: string;
    readonly publicKey?: string;
  };
  readonly dmarc: {
    readonly verified: boolean;
    readonly policy?: "none" | "quarantine" | "reject";
    readonly record?: string;
  };
  readonly returnPath: {
    readonly verified: boolean;
    readonly domain?: string;
  };
}

/** Stages of domain verification. */
export type DomainVerificationStatus =
  | "pending"
  | "verifying"
  | "verified"
  | "failed"
  | "expired";

/** Domain verification state and progress. */
export interface DomainVerification {
  readonly status: DomainVerificationStatus;
  /** DNS records that need to be configured */
  readonly requiredRecords: readonly DnsRecord[];
  readonly authentication: AuthenticationStatus;
  readonly verifiedAt?: Date;
  readonly lastVerificationAttempt?: Date;
  /** Number of verification attempts made */
  readonly attempts: number;
}

/** A sending domain registered with the platform. */
export interface Domain {
  readonly id: string;
  readonly accountId: string;
  /** The domain name, e.g. "notifications.example.com" */
  readonly domain: string;
  /** Optional subdomain used for sending, e.g. "mail" */
  readonly subdomain?: string;
  readonly verification: DomainVerification;
  /** Whether this domain is currently active for sending */
  readonly isActive: boolean;
  /** Whether this is the default sending domain for the account */
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
