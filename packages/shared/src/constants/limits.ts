import type { PlanTier, Plan } from "../types/user.js";

/** Size constants in bytes. */
const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** Complete plan definitions with all limits. */
export const PLAN_LIMITS: Readonly<Record<PlanTier, Plan>> = {
  free: {
    tier: "free",
    name: "Free",
    monthlyEmailLimit: 3_000,
    rateLimit: 1,
    maxAttachmentSize: 5 * MB,
    maxEmailSize: 10 * MB,
    maxDomains: 1,
    maxApiKeys: 2,
    maxWebhooks: 1,
    retentionDays: 1,
    dedicatedIp: false,
    prioritySupport: false,
  },
  personal: {
    tier: "personal",
    name: "Personal",
    monthlyEmailLimit: 50_000,
    rateLimit: 10,
    maxAttachmentSize: 10 * MB,
    maxEmailSize: 25 * MB,
    maxDomains: 5,
    maxApiKeys: 5,
    maxWebhooks: 5,
    retentionDays: 7,
    dedicatedIp: false,
    prioritySupport: false,
  },
  pro: {
    tier: "pro",
    name: "Pro",
    monthlyEmailLimit: 500_000,
    rateLimit: 50,
    maxAttachmentSize: 25 * MB,
    maxEmailSize: 50 * MB,
    maxDomains: 25,
    maxApiKeys: 25,
    maxWebhooks: 20,
    retentionDays: 30,
    dedicatedIp: true,
    prioritySupport: true,
  },
  team: {
    tier: "team",
    name: "Team",
    monthlyEmailLimit: 1_000_000,
    rateLimit: 100,
    maxAttachmentSize: 50 * MB,
    maxEmailSize: 75 * MB,
    maxDomains: 50,
    maxApiKeys: 50,
    maxWebhooks: 30,
    retentionDays: 60,
    dedicatedIp: true,
    prioritySupport: true,
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    monthlyEmailLimit: 5_000_000,
    rateLimit: 500,
    maxAttachmentSize: 50 * MB,
    maxEmailSize: 100 * MB,
    maxDomains: 100,
    maxApiKeys: 100,
    maxWebhooks: 50,
    retentionDays: 90,
    dedicatedIp: true,
    prioritySupport: true,
  },
} as const;

/** Storage limits per plan tier in bytes. */
export const STORAGE_LIMITS: Readonly<Record<PlanTier, number>> = {
  free: 1 * GB,
  personal: 10 * GB,
  pro: 100 * GB,
  team: 500 * GB,
  enterprise: 1024 * GB, // 1 TB
} as const;

/** Burst rate limits (short window) as a multiplier of the base rate limit. */
export const BURST_MULTIPLIER = 3;

/** Rate limit window in seconds. */
export const RATE_LIMIT_WINDOW_SECONDS = 1;

/** Burst window in seconds. */
export const BURST_WINDOW_SECONDS = 10;

/** Maximum number of recipients per single API call. */
export const MAX_RECIPIENTS_PER_REQUEST = 50;

/** Maximum number of tags per email. */
export const MAX_TAGS_PER_EMAIL = 10;

/** Maximum tag length in characters. */
export const MAX_TAG_LENGTH = 128;

/** Maximum metadata entries per email. */
export const MAX_METADATA_ENTRIES = 20;

/** Maximum metadata key length. */
export const MAX_METADATA_KEY_LENGTH = 64;

/** Maximum metadata value length. */
export const MAX_METADATA_VALUE_LENGTH = 512;

/** Maximum subject line length. */
export const MAX_SUBJECT_LENGTH = 998;

/** Maximum webhook payload size in bytes. */
export const MAX_WEBHOOK_PAYLOAD_SIZE = 64 * KB;

/** Webhook delivery timeout in milliseconds. */
export const WEBHOOK_TIMEOUT_MS = 10_000;

/** Maximum webhook retry attempts. */
export const WEBHOOK_MAX_RETRIES = 5;

/** Returns the plan configuration for a given tier. */
export function getPlanLimits(tier: PlanTier): Plan {
  return PLAN_LIMITS[tier];
}

/** Checks whether an account has remaining sends this period. */
export function hasRemainingQuota(
  tier: PlanTier,
  sentThisPeriod: number,
): boolean {
  return sentThisPeriod < PLAN_LIMITS[tier].monthlyEmailLimit;
}
