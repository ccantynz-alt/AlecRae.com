// Constants
export { SMTP_RESPONSE_CODES, SMTP_COMMANDS, SMTP_PORTS, SMTP_TIMEOUTS, SMTP_MAX_RETRIES, SMTP_MAX_LINE_LENGTH, SMTP_MAX_RECIPIENTS, CRLF, } from "./constants/smtp.js";
export { PLAN_LIMITS, STORAGE_LIMITS, BURST_MULTIPLIER, RATE_LIMIT_WINDOW_SECONDS, MAX_RECIPIENTS_PER_REQUEST, MAX_TAGS_PER_EMAIL, MAX_TAG_LENGTH, MAX_METADATA_ENTRIES, WEBHOOK_TIMEOUT_MS, WEBHOOK_MAX_RETRIES, getPlanLimits, hasRemainingQuota, } from "./constants/limits.js";
// Utils
export { ok, err, map, mapErr, andThen, unwrapOr, unwrapOrElse, unwrap, collect, fromPromise, fromThrowable, } from "./utils/result.js";
export { isValidEmail, isValidDomain, isValidHostname, emailSchema, emailAddressSchema, domainSchema, nonEmptyString, uuidSchema, tagSchema, metadataSchema, apiKeyFormatSchema, paginationSchema, } from "./utils/validation.js";
// Errors
export { BaseError, EmailError, EmailValidationError, EmailSendError, EmailBounceError, EmailSizeExceededError, RecipientNotFoundError, AuthError, InvalidApiKeyError, ExpiredApiKeyError, InsufficientPermissionsError, DnsError, DomainNotVerifiedError, DomainVerificationFailedError, DnsRecordNotFoundError, RateLimitError, QuotaExceededError, NotFoundError, ConflictError, DatabaseError, SmtpConnectionError, WebhookDeliveryError, InternalError, isAlecRaeError, ERROR_CODE_MAP, } from "./errors/index.js";
// Search
export { initSearchIndex, indexEmail, searchEmails, removeEmail, } from "./search/meilisearch.js";
// Telemetry
export { initTelemetry, shutdownTelemetry, getTracer, getMeter, recordEmailSent, recordEmailSendDuration, recordEmailReceived, recordEmailFilterDuration, recordApiRequest, recordActiveConnection, recordQueueDepth, recordWebhookDelivery, SpanStatusCode, SpanKind, } from "./telemetry/index.js";
export { telemetryMiddleware } from "./telemetry/middleware.js";
//# sourceMappingURL=index.js.map