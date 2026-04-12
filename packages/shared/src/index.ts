// Types
export type {
  EmailMessage,
  EmailAddress,
  EmailHeaders,
  Attachment,
  EmailStatus,
  DeliveryResult,
} from "./types/email.js";

export type {
  Domain,
  DnsRecord,
  DnsRecordType,
  DomainVerification,
  DomainVerificationStatus,
  AuthenticationStatus,
} from "./types/domain.js";

export type {
  User,
  Account,
  ApiKey,
  Plan,
  PlanTier,
  Permissions,
  UserRole,
} from "./types/user.js";

export type {
  EmailEvent,
  EmailEventType,
  WebhookEvent,
  DeliveryEvent,
  BounceEvent,
  BounceType,
  BounceCategory,
  ComplaintEvent,
  ClickEvent,
  OpenEvent,
  BaseEvent,
} from "./types/events.js";

// Constants
export {
  SMTP_RESPONSE_CODES,
  SMTP_COMMANDS,
  SMTP_PORTS,
  SMTP_TIMEOUTS,
  SMTP_MAX_RETRIES,
  SMTP_MAX_LINE_LENGTH,
  SMTP_MAX_RECIPIENTS,
  CRLF,
} from "./constants/smtp.js";
export type { SmtpResponseCode, SmtpCommand } from "./constants/smtp.js";

export {
  PLAN_LIMITS,
  STORAGE_LIMITS,
  BURST_MULTIPLIER,
  RATE_LIMIT_WINDOW_SECONDS,
  MAX_RECIPIENTS_PER_REQUEST,
  MAX_TAGS_PER_EMAIL,
  MAX_TAG_LENGTH,
  MAX_METADATA_ENTRIES,
  WEBHOOK_TIMEOUT_MS,
  WEBHOOK_MAX_RETRIES,
  getPlanLimits,
  hasRemainingQuota,
} from "./constants/limits.js";

// Utils
export {
  ok,
  err,
  map,
  mapErr,
  andThen,
  unwrapOr,
  unwrapOrElse,
  unwrap,
  collect,
  fromPromise,
  fromThrowable,
} from "./utils/result.js";
export type { Ok, Err, Result } from "./utils/result.js";

export {
  isValidEmail,
  isValidDomain,
  isValidHostname,
  emailSchema,
  emailAddressSchema,
  domainSchema,
  nonEmptyString,
  uuidSchema,
  tagSchema,
  metadataSchema,
  apiKeyFormatSchema,
  paginationSchema,
} from "./utils/validation.js";

// Errors
export {
  BaseError,
  EmailError,
  EmailValidationError,
  EmailSendError,
  EmailBounceError,
  EmailSizeExceededError,
  RecipientNotFoundError,
  AuthError,
  InvalidApiKeyError,
  ExpiredApiKeyError,
  InsufficientPermissionsError,
  DnsError,
  DomainNotVerifiedError,
  DomainVerificationFailedError,
  DnsRecordNotFoundError,
  RateLimitError,
  QuotaExceededError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  SmtpConnectionError,
  WebhookDeliveryError,
  InternalError,
  isAlecRaeError,
  ERROR_CODE_MAP,
} from "./errors/index.js";
export type { ErrorContext } from "./errors/index.js";

// Search
export {
  initSearchIndex,
  indexEmail,
  searchEmails,
  removeEmail,
} from "./search/meilisearch.js";
export type {
  EmailSearchDocument,
  EmailSearchHit,
  EmailSearchResult,
} from "./search/meilisearch.js";

// Telemetry
export {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  getMeter,
  recordEmailSent,
  recordEmailSendDuration,
  recordEmailReceived,
  recordEmailFilterDuration,
  recordApiRequest,
  recordActiveConnection,
  recordQueueDepth,
  recordWebhookDelivery,
  SpanStatusCode,
  SpanKind,
} from "./telemetry/index.js";
export type {
  Span,
  Tracer,
  Meter,
  Counter,
  Histogram,
} from "./telemetry/index.js";

export { telemetryMiddleware } from "./telemetry/middleware.js";
