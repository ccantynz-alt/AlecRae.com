/**
 * Typed error hierarchy for the AlecRae platform.
 *
 * All errors extend BaseError which provides a machine-readable `code`,
 * an HTTP-friendly `statusCode`, and optional structured context.
 */
export interface ErrorContext {
    readonly [key: string]: unknown;
}
/** Base error class for all platform errors. */
export declare abstract class BaseError extends Error {
    abstract readonly code: string;
    abstract readonly statusCode: number;
    readonly context?: ErrorContext;
    readonly timestamp: Date;
    constructor(message: string, context?: ErrorContext, cause?: Error);
    /** Serialize to a JSON-safe object for API responses. */
    toJSON(): Record<string, unknown>;
}
export declare class EmailError extends BaseError {
    readonly code = "EMAIL_ERROR";
    readonly statusCode = 400;
}
export declare class EmailValidationError extends BaseError {
    readonly code = "EMAIL_VALIDATION_ERROR";
    readonly statusCode = 422;
}
export declare class EmailSendError extends BaseError {
    readonly code = "EMAIL_SEND_ERROR";
    readonly statusCode = 502;
}
export declare class EmailBounceError extends BaseError {
    readonly code = "EMAIL_BOUNCE_ERROR";
    readonly statusCode = 502;
}
export declare class EmailSizeExceededError extends BaseError {
    readonly code = "EMAIL_SIZE_EXCEEDED";
    readonly statusCode = 413;
}
export declare class RecipientNotFoundError extends BaseError {
    readonly code = "RECIPIENT_NOT_FOUND";
    readonly statusCode = 422;
}
export declare class AuthError extends BaseError {
    readonly code = "AUTH_ERROR";
    readonly statusCode = 401;
}
export declare class InvalidApiKeyError extends BaseError {
    readonly code = "INVALID_API_KEY";
    readonly statusCode = 401;
}
export declare class ExpiredApiKeyError extends BaseError {
    readonly code = "EXPIRED_API_KEY";
    readonly statusCode = 401;
}
export declare class InsufficientPermissionsError extends BaseError {
    readonly code = "INSUFFICIENT_PERMISSIONS";
    readonly statusCode = 403;
}
export declare class DnsError extends BaseError {
    readonly code = "DNS_ERROR";
    readonly statusCode = 502;
}
export declare class DomainNotVerifiedError extends BaseError {
    readonly code = "DOMAIN_NOT_VERIFIED";
    readonly statusCode = 403;
}
export declare class DomainVerificationFailedError extends BaseError {
    readonly code = "DOMAIN_VERIFICATION_FAILED";
    readonly statusCode = 422;
}
export declare class DnsRecordNotFoundError extends BaseError {
    readonly code = "DNS_RECORD_NOT_FOUND";
    readonly statusCode = 422;
}
export declare class RateLimitError extends BaseError {
    readonly code = "RATE_LIMIT_EXCEEDED";
    readonly statusCode = 429;
    /** Seconds until the rate limit resets. */
    readonly retryAfter: number;
    constructor(message: string, retryAfter: number, context?: ErrorContext);
    toJSON(): Record<string, unknown>;
}
export declare class QuotaExceededError extends BaseError {
    readonly code = "QUOTA_EXCEEDED";
    readonly statusCode = 429;
}
export declare class NotFoundError extends BaseError {
    readonly code = "NOT_FOUND";
    readonly statusCode = 404;
}
export declare class ConflictError extends BaseError {
    readonly code = "CONFLICT";
    readonly statusCode = 409;
}
export declare class DatabaseError extends BaseError {
    readonly code = "DATABASE_ERROR";
    readonly statusCode = 500;
}
export declare class SmtpConnectionError extends BaseError {
    readonly code = "SMTP_CONNECTION_ERROR";
    readonly statusCode = 502;
}
export declare class WebhookDeliveryError extends BaseError {
    readonly code = "WEBHOOK_DELIVERY_ERROR";
    readonly statusCode = 502;
}
export declare class InternalError extends BaseError {
    readonly code = "INTERNAL_ERROR";
    readonly statusCode = 500;
}
/** Check if an unknown value is a platform error. */
export declare function isAlecRaeError(value: unknown): value is BaseError;
/** Map of error codes to error classes for deserialization. */
export declare const ERROR_CODE_MAP: {
    readonly EMAIL_ERROR: typeof EmailError;
    readonly EMAIL_VALIDATION_ERROR: typeof EmailValidationError;
    readonly EMAIL_SEND_ERROR: typeof EmailSendError;
    readonly EMAIL_BOUNCE_ERROR: typeof EmailBounceError;
    readonly EMAIL_SIZE_EXCEEDED: typeof EmailSizeExceededError;
    readonly RECIPIENT_NOT_FOUND: typeof RecipientNotFoundError;
    readonly AUTH_ERROR: typeof AuthError;
    readonly INVALID_API_KEY: typeof InvalidApiKeyError;
    readonly EXPIRED_API_KEY: typeof ExpiredApiKeyError;
    readonly INSUFFICIENT_PERMISSIONS: typeof InsufficientPermissionsError;
    readonly DNS_ERROR: typeof DnsError;
    readonly DOMAIN_NOT_VERIFIED: typeof DomainNotVerifiedError;
    readonly DOMAIN_VERIFICATION_FAILED: typeof DomainVerificationFailedError;
    readonly DNS_RECORD_NOT_FOUND: typeof DnsRecordNotFoundError;
    readonly RATE_LIMIT_EXCEEDED: typeof RateLimitError;
    readonly QUOTA_EXCEEDED: typeof QuotaExceededError;
    readonly NOT_FOUND: typeof NotFoundError;
    readonly CONFLICT: typeof ConflictError;
    readonly DATABASE_ERROR: typeof DatabaseError;
    readonly SMTP_CONNECTION_ERROR: typeof SmtpConnectionError;
    readonly WEBHOOK_DELIVERY_ERROR: typeof WebhookDeliveryError;
    readonly INTERNAL_ERROR: typeof InternalError;
};
//# sourceMappingURL=index.d.ts.map