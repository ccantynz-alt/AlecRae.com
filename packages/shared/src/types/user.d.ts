/** Plan tiers available on the platform. */
export type PlanTier = "free" | "personal" | "pro" | "team" | "enterprise";
/** Subscription plan with limits and features. */
export interface Plan {
    readonly tier: PlanTier;
    readonly name: string;
    /** Monthly email sending limit */
    readonly monthlyEmailLimit: number;
    /** Emails per second rate limit */
    readonly rateLimit: number;
    /** Maximum attachment size in bytes */
    readonly maxAttachmentSize: number;
    /** Maximum email size (including attachments) in bytes */
    readonly maxEmailSize: number;
    /** Number of custom domains allowed */
    readonly maxDomains: number;
    /** Number of API keys allowed */
    readonly maxApiKeys: number;
    /** Number of webhooks allowed */
    readonly maxWebhooks: number;
    /** Log/event retention in days */
    readonly retentionDays: number;
    /** Whether dedicated IP is included */
    readonly dedicatedIp: boolean;
    /** Whether priority support is included */
    readonly prioritySupport: boolean;
}
/** Granular permission flags for API keys and users. */
export interface Permissions {
    readonly sendEmail: boolean;
    readonly readEmail: boolean;
    readonly manageDomains: boolean;
    readonly manageApiKeys: boolean;
    readonly manageWebhooks: boolean;
    readonly viewAnalytics: boolean;
    readonly manageAccount: boolean;
    readonly manageTeamMembers: boolean;
}
/** An API key for programmatic access. */
export interface ApiKey {
    readonly id: string;
    readonly accountId: string;
    /** Human-readable label */
    readonly name: string;
    /**
     * Key prefix shown in the UI, e.g. "em_live_abc...".
     * The full key is only available at creation time.
     */
    readonly keyPrefix: string;
    /** SHA-256 hash of the full key, used for lookup */
    readonly keyHash: string;
    readonly permissions: Permissions;
    /** Allowed sending domains; empty means all account domains */
    readonly allowedDomains: readonly string[];
    /** Per-key rate limit override (emails/sec); null uses plan default */
    readonly rateLimitOverride?: number;
    readonly isActive: boolean;
    readonly lastUsedAt?: Date;
    readonly expiresAt?: Date;
    readonly createdAt: Date;
}
/** User role within an account. */
export type UserRole = "owner" | "admin" | "member" | "viewer";
/** An account (organization/team) on the platform. */
export interface Account {
    readonly id: string;
    readonly name: string;
    readonly plan: Plan;
    /** Total emails sent in the current billing period */
    readonly emailsSentThisPeriod: number;
    readonly billingEmail: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
/** A user who can access the platform. */
export interface User {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly accountId: string;
    readonly role: UserRole;
    readonly permissions: Permissions;
    readonly emailVerified: boolean;
    readonly avatarUrl?: string;
    readonly lastLoginAt?: Date;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
//# sourceMappingURL=user.d.ts.map