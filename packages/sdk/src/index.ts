// Client
export { ApiClient, ApiError, RateLimitError } from "./client/api-client.js";

// Resources
export { Messages } from "./resources/messages.js";
export { Domains } from "./resources/domains.js";
export { Contacts } from "./resources/contacts.js";
export { Analytics } from "./resources/analytics.js";

// Webhooks
export {
  verifyWebhook,
  verifySignature,
  isWebhookEventType,
  WebhookVerificationError,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "./webhooks/verification.js";

// Types
export type {
  AuthMethod,
  ClientConfig,
  ResolvedConfig,
  HttpMethod,
  RequestOptions,
  ApiResponse,
  RateLimitInfo,
  PaginationParams,
  PaginatedList,
  SdkEmailAddress,
  SendMessageParams,
  SdkAttachment,
  Message,
  MessageSearchParams,
  SdkDomain,
  AddDomainParams,
  DomainDnsRecords,
  DnsRecordInstruction,
  Contact,
  UpsertContactParams,
  ContactListParams,
  AnalyticsTimeRange,
  AnalyticsGranularity,
  DeliveryAnalytics,
  TimeSeriesPoint,
  AnalyticsQueryParams,
  EngagementAnalytics,
  WebhookEventType,
  WebhookEvent,
  WebhookVerifyOptions,
  ApiErrorBody,
} from "./types.js";

// ─── Convenience Client ──────────────────────────────────────────────────────

import type { ClientConfig } from "./types.js";
import { ApiClient } from "./client/api-client.js";
import { Messages } from "./resources/messages.js";
import { Domains } from "./resources/domains.js";
import { Contacts } from "./resources/contacts.js";
import { Analytics } from "./resources/analytics.js";

/**
 * The main Emailed SDK client.
 *
 * Provides access to all API resources through a single entry point.
 *
 * Usage:
 * ```ts
 * import { Emailed } from "@emailed/sdk";
 *
 * const emailed = new Emailed({
 *   auth: { type: "apiKey", key: "em_live_..." },
 * });
 *
 * // Send an email
 * const result = await emailed.messages.send({
 *   from: { address: "hello@example.com" },
 *   to: [{ address: "alice@example.com" }],
 *   subject: "Hello from Emailed",
 *   textBody: "Welcome to the platform!",
 * });
 *
 * // Check delivery analytics
 * const stats = await emailed.analytics.delivery({
 *   startDate: "2026-03-01",
 *   endDate: "2026-03-31",
 * });
 * ```
 */
export class Emailed {
  private readonly client: ApiClient;

  /** Email message operations (send, retrieve, list, search). */
  readonly messages: Messages;

  /** Domain management (add, verify, DNS configuration). */
  readonly domains: Domains;

  /** Contact and recipient management. */
  readonly contacts: Contacts;

  /** Analytics and reporting. */
  readonly analytics: Analytics;

  constructor(config: ClientConfig) {
    this.client = new ApiClient(config);
    this.messages = new Messages(this.client);
    this.domains = new Domains(this.client);
    this.contacts = new Contacts(this.client);
    this.analytics = new Analytics(this.client);
  }
}
