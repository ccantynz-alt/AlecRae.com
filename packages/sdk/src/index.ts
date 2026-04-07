/**
 * @vieanna/sdk — The official Vieanna/Emailed developer SDK.
 *
 * Provides a typed, ergonomic interface for the Emailed platform API.
 * Includes automatic retries, rate limit handling, and AI-powered support.
 *
 * @example
 * ```ts
 * import { VieannaClient } from "@vieanna/sdk";
 *
 * const client = new VieannaClient({
 *   apiKey: "em_live_abc123...",
 * });
 *
 * // Send an email
 * const result = await client.messages.send({
 *   from: { address: "hello@example.com", name: "Example" },
 *   to: [{ address: "user@recipient.com" }],
 *   subject: "Hello from Vieanna",
 *   text: "This is a test email.",
 * });
 *
 * if (result.ok) {
 *   console.log("Sent:", result.value.data.id);
 * }
 * ```
 */

import { HttpClient, type HttpClientConfig } from "./client/http.js";
import { MessagesResource } from "./resources/messages.js";
import { DomainsResource } from "./resources/domains.js";
import { AnalyticsResource } from "./resources/analytics.js";
import { WebhooksResource } from "./resources/webhooks.js";
import { SupportResource } from "./resources/support.js";

// ---------------------------------------------------------------------------
// Client Configuration
// ---------------------------------------------------------------------------

/** Configuration for the VieannaClient. */
export interface VieannaClientConfig {
  /** API key for authentication (required). Starts with "em_live_" or "em_test_". */
  readonly apiKey: string;
  /** Base URL override (default "https://api.emailed.dev/v1"). */
  readonly baseUrl?: string;
  /** Maximum retry attempts for failed requests (default 3). */
  readonly maxRetries?: number;
  /** Request timeout in milliseconds (default 30000). */
  readonly timeoutMs?: number;
  /** Log level for SDK activity (default "error"). */
  readonly logLevel?: "none" | "error" | "warn" | "info" | "debug";
  /** Custom logger function. */
  readonly logger?: (entry: import("./client/http.js").LogEntry) => void;
  /** Custom default headers for all requests. */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Main Client
// ---------------------------------------------------------------------------

/**
 * The main Vieanna/Emailed SDK client.
 *
 * Provides access to all platform resources through typed resource objects.
 * All methods return `Result<T, Error>` for type-safe error handling.
 */
export class VieannaClient {
  /** Send, retrieve, search, and manage email messages. */
  readonly messages: MessagesResource;

  /** Manage sending domains, DNS records, and email authentication. */
  readonly domains: DomainsResource;

  /** Query delivery stats, bounce analysis, and engagement metrics. */
  readonly analytics: AnalyticsResource;

  /** Manage webhook endpoints and verify webhook signatures. */
  readonly webhooks: WebhooksResource;

  /** Create and manage AI-powered support tickets. */
  readonly support: SupportResource;

  /** The underlying HTTP client (exposed for advanced use cases). */
  readonly http: HttpClient;

  constructor(config: VieannaClientConfig) {
    const httpConfig: HttpClientConfig = {
      baseUrl: config.baseUrl ?? "https://api.emailed.dev/v1",
      apiKey: config.apiKey,
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.logLevel !== undefined ? { logLevel: config.logLevel } : {}),
      ...(config.logger !== undefined ? { logger: config.logger } : {}),
      ...(config.defaultHeaders !== undefined ? { defaultHeaders: config.defaultHeaders } : {}),
    };

    this.http = new HttpClient(httpConfig);
    this.messages = new MessagesResource(this.http);
    this.domains = new DomainsResource(this.http);
    this.analytics = new AnalyticsResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.support = new SupportResource(this.http);
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

// Client
export { HttpClient, ApiError } from "./client/http.js";
export type {
  HttpClientConfig,
  HttpMethod,
  LogLevel,
  LoggerFn,
  LogEntry,
  RequestOptions,
  ApiResponse,
  RateLimitInfo,
  PaginatedResponse,
  ApiErrorBody,
} from "./client/http.js";

// Messages
export { MessagesResource } from "./resources/messages.js";
export type {
  SendMessageParams,
  AttachmentInput,
  BatchSendParams,
  SendMessageResult,
  BatchSendResult,
  BatchSendItemResult,
  Message,
  ListMessagesQuery,
  SearchMessagesQuery,
  RenderTemplateParams,
  RenderTemplateResult,
} from "./resources/messages.js";

// Domains
export { DomainsResource } from "./resources/domains.js";
export type {
  CreateDomainParams,
  CreateDomainResult,
  DnsConfigInstruction,
  ListDomainsQuery,
  VerifyDomainResult,
  DnsRecordVerificationStatus,
  DomainDnsRecords,
  AuthenticationCheckResult,
  AuthenticationIssue,
} from "./resources/domains.js";

// Analytics
export { AnalyticsResource } from "./resources/analytics.js";
export type {
  TimeGranularity,
  DateRangeFilter,
  AnalyticsFilter,
  AggregationOptions,
  DeliveryStats,
  DeliveryTotals,
  DeliveryRates,
  DeliveryTimePoint,
  BounceAnalysis,
  BounceCategoryBreakdown,
  BounceByDomain,
  BounceTimePoint,
  BouncingAddress,
  EngagementMetrics,
  EngagementTotals,
  EngagementRates,
  EngagementTimePoint,
  LinkEngagement,
  DeviceBreakdown,
} from "./resources/analytics.js";

// Webhooks
export { WebhooksResource, verifyWebhookSignature, generateWebhookSignature } from "./resources/webhooks.js";
export type {
  CreateWebhookParams,
  UpdateWebhookParams,
  Webhook,
  WebhookStats,
  ListWebhooksQuery,
  TestWebhookParams,
  TestWebhookResult,
  WebhookDeliveryAttempt,
  ListDeliveryAttemptsQuery,
  WebhookSignatureComponents,
} from "./resources/webhooks.js";

// Support
export { SupportResource } from "./resources/support.js";
export type {
  TicketPriority,
  TicketStatus,
  TicketCategory,
  CreateTicketParams,
  TicketAttachment,
  Ticket,
  AiDiagnosis,
  AiDiagnosticCheck,
  AiRecommendation,
  TicketMessage,
  TicketMessageAuthor,
  ReplyToTicketParams,
  ListTicketsQuery,
  AiAutoReplyConfig,
  UpdateAiAutoReplyParams,
  SupportEmailRoutingConfig,
  RateTicketParams,
} from "./resources/support.js";
