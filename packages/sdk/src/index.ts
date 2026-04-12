// Client
export { ApiClient, ApiError, RateLimitError } from "./client/api-client.js";

// Resources
export { Messages } from "./resources/messages.js";
export { Domains } from "./resources/domains.js";
export { Contacts } from "./resources/contacts.js";
export { Analytics } from "./resources/analytics.js";
export { Webhooks } from "./resources/webhooks.js";
export { Events } from "./resources/events.js";
export { Billing } from "./resources/billing.js";

// Webhooks verification
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
  SimpleClientConfig,
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
  DomainDnsResponse,
  DomainDnsRecord,
  DomainHealth,
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
  Webhook,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDelivery,
  PlatformEvent,
  EventListParams,
  BillingUsage,
  BillingPlan,
  ApiErrorBody,
} from "./types.js";

// ─── Convenience Client ──────────────────────────────────────────────────────

import type { ClientConfig, SimpleClientConfig } from "./types.js";
import { ApiClient } from "./client/api-client.js";
import { Messages } from "./resources/messages.js";
import { Domains } from "./resources/domains.js";
import { Contacts } from "./resources/contacts.js";
import { Analytics } from "./resources/analytics.js";
import { Webhooks } from "./resources/webhooks.js";
import { Events } from "./resources/events.js";
import { Billing } from "./resources/billing.js";

/**
 * Configuration accepted by the `AlecRae` convenience client.
 *
 * Supports both the full `ClientConfig` format and the simpler
 * `{ apiKey: string }` shorthand.
 */
export type AlecRaeConfig = ClientConfig | SimpleClientConfig;

/**
 * Normalise a user-supplied config into a full `ClientConfig`.
 */
function normaliseConfig(config: AlecRaeConfig): ClientConfig {
  if ("apiKey" in config) {
    const result: ClientConfig = {
      auth: { type: "apiKey", key: config.apiKey },
    };
    // Only include optional fields when they are explicitly provided,
    // satisfying exactOptionalPropertyTypes.
    const out = result as unknown as Record<string, unknown>;
    if (config.baseUrl !== undefined) out.baseUrl = config.baseUrl;
    if (config.timeout !== undefined) out.timeout = config.timeout;
    if (config.maxRetries !== undefined) out.maxRetries = config.maxRetries;
    if (config.headers !== undefined) out.headers = config.headers;
    if (config.debug !== undefined) out.debug = config.debug;
    return result;
  }
  return config;
}

/**
 * The main AlecRae SDK client.
 *
 * Provides access to all API resources through a single entry point.
 *
 * Usage:
 * ```ts
 * import { AlecRae } from "@alecrae/sdk";
 *
 * // Simple — just pass an API key
 * const alecrae = new AlecRae({ apiKey: "em_live_..." });
 *
 * // Full config
 * const alecrae2 = new AlecRae({
 *   auth: { type: "apiKey", key: "em_live_..." },
 *   baseUrl: "https://api.alecrae.com",
 *   debug: true,
 * });
 *
 * // Send an email
 * const result = await alecrae.messages.send({
 *   from: { address: "hello@example.com" },
 *   to: [{ address: "alice@example.com" }],
 *   subject: "Hello from AlecRae",
 *   textBody: "Welcome to the platform!",
 * });
 *
 * // Check delivery analytics
 * const stats = await alecrae.analytics.delivery({
 *   startDate: "2026-03-01",
 *   endDate: "2026-03-31",
 * });
 * ```
 */
export class AlecRae {
  private readonly client: ApiClient;

  /** Email message operations (send, retrieve, list, search). */
  readonly messages: Messages;

  /** Domain management (add, verify, DNS configuration, health). */
  readonly domains: Domains;

  /** Contact and recipient management. */
  readonly contacts: Contacts;

  /** Analytics and reporting. */
  readonly analytics: Analytics;

  /** Webhook endpoint management (create, update, test). */
  readonly webhooks: Webhooks;

  /** Platform event history. */
  readonly events: Events;

  /** Billing usage and plan information. */
  readonly billing: Billing;

  constructor(config: AlecRaeConfig) {
    this.client = new ApiClient(normaliseConfig(config));
    this.messages = new Messages(this.client);
    this.domains = new Domains(this.client);
    this.contacts = new Contacts(this.client);
    this.analytics = new Analytics(this.client);
    this.webhooks = new Webhooks(this.client);
    this.events = new Events(this.client);
    this.billing = new Billing(this.client);
  }
}
