// Client
export {
  getDatabase,
  createMigrationClient,
  closeConnection,
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
