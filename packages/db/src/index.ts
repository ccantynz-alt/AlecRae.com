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

// Schema - Email Embeddings (semantic vector search)
export {
  emailEmbeddings,
  emailEmbeddingsRelations,
  vector,
} from "./schema/email-embeddings.js";

// Schema - Draft Snapshots (CRDT collaborative drafting)
export {
  draftSnapshots,
  draftSnapshotsRelations,
  type DraftSnapshot,
  type NewDraftSnapshot,
} from "./schema/draft-snapshots.js";

// Schema - Passkeys (WebAuthn credentials)
export {
  passkeys,
  passkeyChallenges,
  passkeysRelations,
  passkeyChallengesRelations,
} from "./schema/passkeys.js";

// Schema - Contacts
export {
  contacts,
  contactsRelations,
} from "./schema/contacts.js";

// Schema - Recall Records
export {
  recallRecords,
  recallRecordsRelations,
} from "./schema/recall.js";

// Schema - Recipient Engagement (send-time optimization)
export {
  recipientEngagement,
  engagementEvents,
  recipientEngagementRelations,
  engagementEventsRelations,
  type HourlyDistribution,
  type DailyDistribution,
} from "./schema/recipient-engagement.js";

// Schema - Custom Dictionaries (spell check)
export {
  customDictionaries,
  customDictionariesRelations,
} from "./schema/custom-dictionaries.js";

// Schema - Screener, Commitments, Inbox Categories
export {
  screenerDecisions,
  screenerQueue,
  commitments,
  inboxCategories,
  screenerDecisionEnum,
  commitmentActorEnum,
  commitmentStatusEnum,
  inboxCategorySourceEnum,
  screenerDecisionsRelations,
  screenerQueueRelations,
  commitmentsRelations,
  inboxCategoriesRelations,
} from "./schema/screener.js";

// Schema - Unsubscribe History
export {
  unsubscribeHistory,
  unsubscribeMethodEnum,
  unsubscribeStatusEnum,
  unsubscribeHistoryRelations,
} from "./schema/unsubscribe-history.js";

// Schema - Email Translations
export {
  emailTranslations,
  emailTranslationsRelations,
} from "./schema/translations.js";
export type { TranslationContent } from "./schema/translations.js";

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
import type { emailEmbeddings } from "./schema/email-embeddings.js";
import type { passkeys, passkeyChallenges } from "./schema/passkeys.js";
import type { contacts } from "./schema/contacts.js";
import type { recallRecords } from "./schema/recall.js";
import type {
  screenerDecisions,
  screenerQueue,
  commitments,
  inboxCategories,
} from "./schema/screener.js";
import type { unsubscribeHistory } from "./schema/unsubscribe-history.js";
import type { customDictionaries } from "./schema/custom-dictionaries.js";
import type { emailTranslations } from "./schema/translations.js";
import type {
  recipientEngagement,
  engagementEvents,
} from "./schema/recipient-engagement.js";

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
export type EmailEmbedding = InferSelectModel<typeof emailEmbeddings>;
export type NewEmailEmbedding = InferInsertModel<typeof emailEmbeddings>;
export type Passkey = InferSelectModel<typeof passkeys>;
export type NewPasskey = InferInsertModel<typeof passkeys>;
export type PasskeyChallenge = InferSelectModel<typeof passkeyChallenges>;
export type NewPasskeyChallenge = InferInsertModel<typeof passkeyChallenges>;
export type Contact = InferSelectModel<typeof contacts>;
export type NewContact = InferInsertModel<typeof contacts>;
export type RecallRecord = InferSelectModel<typeof recallRecords>;
export type NewRecallRecord = InferInsertModel<typeof recallRecords>;
export type ScreenerDecision = InferSelectModel<typeof screenerDecisions>;
export type NewScreenerDecision = InferInsertModel<typeof screenerDecisions>;
export type ScreenerQueueEntry = InferSelectModel<typeof screenerQueue>;
export type NewScreenerQueueEntry = InferInsertModel<typeof screenerQueue>;
export type CommitmentRecord = InferSelectModel<typeof commitments>;
export type NewCommitmentRecord = InferInsertModel<typeof commitments>;
export type InboxCategoryRecord = InferSelectModel<typeof inboxCategories>;
export type NewInboxCategoryRecord = InferInsertModel<typeof inboxCategories>;
export type RecipientEngagement = InferSelectModel<typeof recipientEngagement>;
export type NewRecipientEngagement = InferInsertModel<typeof recipientEngagement>;
export type EngagementEvent = InferSelectModel<typeof engagementEvents>;
export type NewEngagementEvent = InferInsertModel<typeof engagementEvents>;
export type UnsubscribeHistoryRecord = InferSelectModel<typeof unsubscribeHistory>;
export type NewUnsubscribeHistoryRecord = InferInsertModel<typeof unsubscribeHistory>;
export type EmailTranslation = InferSelectModel<typeof emailTranslations>;
export type NewEmailTranslation = InferInsertModel<typeof emailTranslations>;
export type CustomDictionary = InferSelectModel<typeof customDictionaries>;
export type NewCustomDictionary = InferInsertModel<typeof customDictionaries>;
