/**
 * Typed error hierarchy for the AlecRae platform.
 *
 * All errors extend BaseError which provides a machine-readable `code`,
 * an HTTP-friendly `statusCode`, and optional structured context.
 */
/** Base error class for all platform errors. */
export class BaseError extends Error {
    context;
    timestamp;
    constructor(message, context, cause) {
        super(message, { cause });
        this.name = this.constructor.name;
        if (context !== undefined) {
            this.context = context;
        }
        this.timestamp = new Date();
    }
    /** Serialize to a JSON-safe object for API responses. */
    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                ...(this.context ? { context: this.context } : {}),
            },
        };
    }
}
// ---------------------------------------------------------------------------
// Email errors
// ---------------------------------------------------------------------------
export class EmailError extends BaseError {
    code = "EMAIL_ERROR";
    statusCode = 400;
}
export class EmailValidationError extends BaseError {
    code = "EMAIL_VALIDATION_ERROR";
    statusCode = 422;
}
export class EmailSendError extends BaseError {
    code = "EMAIL_SEND_ERROR";
    statusCode = 502;
}
export class EmailBounceError extends BaseError {
    code = "EMAIL_BOUNCE_ERROR";
    statusCode = 502;
}
export class EmailSizeExceededError extends BaseError {
    code = "EMAIL_SIZE_EXCEEDED";
    statusCode = 413;
}
export class RecipientNotFoundError extends BaseError {
    code = "RECIPIENT_NOT_FOUND";
    statusCode = 422;
}
// ---------------------------------------------------------------------------
// Authentication & authorization errors
// ---------------------------------------------------------------------------
export class AuthError extends BaseError {
    code = "AUTH_ERROR";
    statusCode = 401;
}
export class InvalidApiKeyError extends BaseError {
    code = "INVALID_API_KEY";
    statusCode = 401;
}
export class ExpiredApiKeyError extends BaseError {
    code = "EXPIRED_API_KEY";
    statusCode = 401;
}
export class InsufficientPermissionsError extends BaseError {
    code = "INSUFFICIENT_PERMISSIONS";
    statusCode = 403;
}
// ---------------------------------------------------------------------------
// DNS & domain errors
// ---------------------------------------------------------------------------
export class DnsError extends BaseError {
    code = "DNS_ERROR";
    statusCode = 502;
}
export class DomainNotVerifiedError extends BaseError {
    code = "DOMAIN_NOT_VERIFIED";
    statusCode = 403;
}
export class DomainVerificationFailedError extends BaseError {
    code = "DOMAIN_VERIFICATION_FAILED";
    statusCode = 422;
}
export class DnsRecordNotFoundError extends BaseError {
    code = "DNS_RECORD_NOT_FOUND";
    statusCode = 422;
}
// ---------------------------------------------------------------------------
// Rate limiting errors
// ---------------------------------------------------------------------------
export class RateLimitError extends BaseError {
    code = "RATE_LIMIT_EXCEEDED";
    statusCode = 429;
    /** Seconds until the rate limit resets. */
    retryAfter;
    constructor(message, retryAfter, context) {
        super(message, context);
        this.retryAfter = retryAfter;
    }
    toJSON() {
        return {
            ...super.toJSON(),
            retryAfter: this.retryAfter,
        };
    }
}
export class QuotaExceededError extends BaseError {
    code = "QUOTA_EXCEEDED";
    statusCode = 429;
}
// ---------------------------------------------------------------------------
// Resource errors
// ---------------------------------------------------------------------------
export class NotFoundError extends BaseError {
    code = "NOT_FOUND";
    statusCode = 404;
}
export class ConflictError extends BaseError {
    code = "CONFLICT";
    statusCode = 409;
}
// ---------------------------------------------------------------------------
// Infrastructure errors
// ---------------------------------------------------------------------------
export class DatabaseError extends BaseError {
    code = "DATABASE_ERROR";
    statusCode = 500;
}
export class SmtpConnectionError extends BaseError {
    code = "SMTP_CONNECTION_ERROR";
    statusCode = 502;
}
export class WebhookDeliveryError extends BaseError {
    code = "WEBHOOK_DELIVERY_ERROR";
    statusCode = 502;
}
export class InternalError extends BaseError {
    code = "INTERNAL_ERROR";
    statusCode = 500;
}
// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------
/** Check if an unknown value is a platform error. */
export function isAlecRaeError(value) {
    return value instanceof BaseError;
}
/** Map of error codes to error classes for deserialization. */
export const ERROR_CODE_MAP = {
    EMAIL_ERROR: EmailError,
    EMAIL_VALIDATION_ERROR: EmailValidationError,
    EMAIL_SEND_ERROR: EmailSendError,
    EMAIL_BOUNCE_ERROR: EmailBounceError,
    EMAIL_SIZE_EXCEEDED: EmailSizeExceededError,
    RECIPIENT_NOT_FOUND: RecipientNotFoundError,
    AUTH_ERROR: AuthError,
    INVALID_API_KEY: InvalidApiKeyError,
    EXPIRED_API_KEY: ExpiredApiKeyError,
    INSUFFICIENT_PERMISSIONS: InsufficientPermissionsError,
    DNS_ERROR: DnsError,
    DOMAIN_NOT_VERIFIED: DomainNotVerifiedError,
    DOMAIN_VERIFICATION_FAILED: DomainVerificationFailedError,
    DNS_RECORD_NOT_FOUND: DnsRecordNotFoundError,
    RATE_LIMIT_EXCEEDED: RateLimitError,
    QUOTA_EXCEEDED: QuotaExceededError,
    NOT_FOUND: NotFoundError,
    CONFLICT: ConflictError,
    DATABASE_ERROR: DatabaseError,
    SMTP_CONNECTION_ERROR: SmtpConnectionError,
    WEBHOOK_DELIVERY_ERROR: WebhookDeliveryError,
    INTERNAL_ERROR: InternalError,
};
//# sourceMappingURL=index.js.map