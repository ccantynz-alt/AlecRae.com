import { z } from "zod";

// --- Email Address ---
export const EmailAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export type EmailAddress = z.infer<typeof EmailAddressSchema>;

// --- Attachment ---
export const AttachmentSchema = z.object({
  filename: z.string(),
  content: z.string().describe("Base64-encoded content"),
  contentType: z.string().default("application/octet-stream"),
  contentId: z.string().optional().describe("For inline attachments"),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

// --- Send Message ---
export const SendMessageSchema = z.object({
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema).min(1).max(50),
  cc: z.array(EmailAddressSchema).max(50).optional(),
  bcc: z.array(EmailAddressSchema).max(50).optional(),
  replyTo: EmailAddressSchema.optional(),
  subject: z.string().max(998).optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  template_id: z.string().max(255).optional(),
  variables: z.record(z.unknown()).optional(),
  message_id: z.string().max(255).optional(),
  tenant: z.string().max(128).optional(),
  attachments: z.array(AttachmentSchema).max(25).optional(),
  headers: z.record(z.string()).optional(),
  tags: z.array(z.string().max(64)).max(10).optional(),
  scheduledAt: z.string().datetime().optional(),
}).refine(
  (data) => data.template_id !== undefined || data.text !== undefined || data.html !== undefined,
  { message: "Provide template_id, text, or html body" },
).refine(
  (data) => data.template_id !== undefined || data.subject !== undefined,
  { message: "Subject is required when not using a template" },
);

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// --- Message Status ---
export const MessageStatus = z.enum([
  "queued",
  "sending",
  "delivered",
  "bounced",
  "deferred",
  "complained",
  "failed",
]);

export type MessageStatus = z.infer<typeof MessageStatus>;

export interface MessageRecord {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  status: MessageStatus;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  bouncedAt?: string;
  openedAt?: string;
  clickedAt?: string;
  lastEvent?: string;
}

// --- Pagination ---
export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

// --- Domain ---
export const AddDomainSchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      "Invalid domain format",
    ),
});

export type AddDomainInput = z.infer<typeof AddDomainSchema>;

export type DomainStatus = "pending" | "verified" | "failed";

export interface DnsRecord {
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  priority?: number;
}

export interface DomainRecord {
  id: string;
  domain: string;
  status: DomainStatus;
  dnsRecords: DnsRecord[];
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  mxVerified: boolean;
  createdAt: string;
  verifiedAt?: string;
}

// --- Webhook ---
export const WebhookEventType = z.enum([
  "delivered",
  "bounced",
  "opened",
  "clicked",
  "complained",
]);

export type WebhookEventType = z.infer<typeof WebhookEventType>;

export const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(WebhookEventType).min(1),
  secret: z.string().min(16).max(256).optional(),
  description: z.string().max(256).optional(),
  active: z.boolean().default(true),
});

export const UpdateWebhookSchema = CreateWebhookSchema.partial();

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;

export interface WebhookRecord {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Analytics ---
export const AnalyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
  tags: z.string().optional().describe("Comma-separated tag filter"),
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

export interface OverviewStats {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  clickRate: number;
}

export interface DeliverabilityPoint {
  timestamp: string;
  sent: number;
  delivered: number;
  bounced: number;
  deferred: number;
  deliveryRate: number;
}

export interface EngagementPoint {
  timestamp: string;
  delivered: number;
  opened: number;
  uniqueOpens: number;
  clicked: number;
  uniqueClicks: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

// --- API Key / Auth ---
export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export interface ApiKeyRecord {
  id: string;
  accountId: string;
  keyHash: string;
  prefix: string;
  tier: PlanTier;
  scopes: string[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

// --- Error ---
export interface ApiError {
  error: {
    type: string;
    message: string;
    code: string;
    details?: unknown;
  };
}

export const RATE_LIMITS: Record<PlanTier, { requestsPerSecond: number; burstSize: number }> = {
  free: { requestsPerSecond: 2, burstSize: 5 },
  starter: { requestsPerSecond: 10, burstSize: 30 },
  pro: { requestsPerSecond: 50, burstSize: 150 },
  enterprise: { requestsPerSecond: 200, burstSize: 500 },
};
