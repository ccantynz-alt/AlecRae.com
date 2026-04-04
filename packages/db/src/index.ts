// Client
export {
  getDatabase,
  getDb,
  db,
  createMigrationClient,
  closeConnection,
  checkConnectionHealth,
  poolConfig,
} from "./client/connection.js";
export type {
  Database,
  DatabaseSchema,
  ConnectionConfig,
} from "./client/connection.js";

// Schema - Users & Accounts
export {
  accounts,
  users,
  planTierEnum,
  userRoleEnum,
  accountsRelations,
  usersRelations,
} from "./schema/users.js";

// Schema - Emails
export {
  emails,
  attachments,
  deliveryResults,
  emailStatusEnum,
  attachmentDispositionEnum,
  emailsRelations,
  attachmentsRelations,
  deliveryResultsRelations,
} from "./schema/emails.js";

// Schema - Domains
export {
  domains,
  dnsRecords,
  domainVerificationStatusEnum,
  dnsRecordTypeEnum,
  domainsRelations,
  dnsRecordsRelations,
} from "./schema/domains.js";

// Schema - Events & Webhooks
export {
  events,
  webhooks,
  webhookDeliveries,
  emailEventTypeEnum,
  bounceTypeEnum,
  bounceCategoryEnum,
  feedbackTypeEnum,
  eventsRelations,
  webhooksRelations,
  webhookDeliveriesRelations,
} from "./schema/events.js";

// Schema - API Keys
export {
  apiKeys,
  apiKeyUsage,
  apiKeysRelations,
  apiKeyUsageRelations,
} from "./schema/api-keys.js";

// Schema - Suppressions
export {
  suppressionLists,
  suppressionReasonEnum,
  suppressionListsRelations,
} from "./schema/suppressions.js";

// Schema - Warmup
export {
  warmupSessions,
  warmupStatusEnum,
  warmupScheduleTypeEnum,
  warmupSessionsRelations,
} from "./schema/warmup.js";

// Schema - Templates
export {
  templates,
  templatesRelations,
} from "./schema/templates.js";
export type { TemplateVariable } from "./schema/templates.js";

// ---------------------------------------------------------------------------
// Inferred types from schemas
// ---------------------------------------------------------------------------

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { accounts, users } from "./schema/users.js";
import type { emails, attachments, deliveryResults } from "./schema/emails.js";
import type { domains, dnsRecords } from "./schema/domains.js";
import type { apiKeys, apiKeyUsage } from "./schema/api-keys.js";
import type {
  events,
  webhooks,
  webhookDeliveries,
} from "./schema/events.js";
import type { suppressionLists } from "./schema/suppressions.js";
import type { warmupSessions } from "./schema/warmup.js";
import type { templates } from "./schema/templates.js";

// Select types (what you get back from queries)
export type Account = InferSelectModel<typeof accounts>;
export type User = InferSelectModel<typeof users>;
export type Email = InferSelectModel<typeof emails>;
export type Attachment = InferSelectModel<typeof attachments>;
export type DeliveryResult = InferSelectModel<typeof deliveryResults>;
export type Domain = InferSelectModel<typeof domains>;
export type DnsRecord = InferSelectModel<typeof dnsRecords>;
export type ApiKey = InferSelectModel<typeof apiKeys>;
export type ApiKeyUsage = InferSelectModel<typeof apiKeyUsage>;
export type Event = InferSelectModel<typeof events>;
export type Webhook = InferSelectModel<typeof webhooks>;
export type WebhookDelivery = InferSelectModel<typeof webhookDeliveries>;

// Insert types (what you pass when creating rows)
export type NewAccount = InferInsertModel<typeof accounts>;
export type NewUser = InferInsertModel<typeof users>;
export type NewEmail = InferInsertModel<typeof emails>;
export type NewAttachment = InferInsertModel<typeof attachments>;
export type NewDeliveryResult = InferInsertModel<typeof deliveryResults>;
export type NewDomain = InferInsertModel<typeof domains>;
export type NewDnsRecord = InferInsertModel<typeof dnsRecords>;
export type NewApiKey = InferInsertModel<typeof apiKeys>;
export type NewApiKeyUsage = InferInsertModel<typeof apiKeyUsage>;
export type NewEvent = InferInsertModel<typeof events>;
export type NewWebhook = InferInsertModel<typeof webhooks>;
export type NewWebhookDelivery = InferInsertModel<typeof webhookDeliveries>;
export type SuppressionList = InferSelectModel<typeof suppressionLists>;
export type NewSuppressionList = InferInsertModel<typeof suppressionLists>;
export type WarmupSession = InferSelectModel<typeof warmupSessions>;
export type NewWarmupSession = InferInsertModel<typeof warmupSessions>;
export type Template = InferSelectModel<typeof templates>;
export type NewTemplate = InferInsertModel<typeof templates>;
