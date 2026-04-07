import type { PlanTier, Plan } from "../types/user.js";
/** Complete plan definitions with all limits. */
export declare const PLAN_LIMITS: Readonly<Record<PlanTier, Plan>>;
/** Storage limits per plan tier in bytes. */
export declare const STORAGE_LIMITS: Readonly<Record<PlanTier, number>>;
/** Burst rate limits (short window) as a multiplier of the base rate limit. */
export declare const BURST_MULTIPLIER = 3;
/** Rate limit window in seconds. */
export declare const RATE_LIMIT_WINDOW_SECONDS = 1;
/** Burst window in seconds. */
export declare const BURST_WINDOW_SECONDS = 10;
/** Maximum number of recipients per single API call. */
export declare const MAX_RECIPIENTS_PER_REQUEST = 50;
/** Maximum number of tags per email. */
export declare const MAX_TAGS_PER_EMAIL = 10;
/** Maximum tag length in characters. */
export declare const MAX_TAG_LENGTH = 128;
/** Maximum metadata entries per email. */
export declare const MAX_METADATA_ENTRIES = 20;
/** Maximum metadata key length. */
export declare const MAX_METADATA_KEY_LENGTH = 64;
/** Maximum metadata value length. */
export declare const MAX_METADATA_VALUE_LENGTH = 512;
/** Maximum subject line length. */
export declare const MAX_SUBJECT_LENGTH = 998;
/** Maximum webhook payload size in bytes. */
export declare const MAX_WEBHOOK_PAYLOAD_SIZE: number;
/** Webhook delivery timeout in milliseconds. */
export declare const WEBHOOK_TIMEOUT_MS = 10000;
/** Maximum webhook retry attempts. */
export declare const WEBHOOK_MAX_RETRIES = 5;
/** Returns the plan configuration for a given tier. */
export declare function getPlanLimits(tier: PlanTier): Plan;
/** Checks whether an account has remaining sends this period. */
export declare function hasRemainingQuota(tier: PlanTier, sentThisPeriod: number): boolean;
//# sourceMappingURL=limits.d.ts.map