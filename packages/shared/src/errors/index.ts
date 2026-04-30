/**
 * Typed error hierarchy for the AlecRae platform.
 *
 * All errors extend BaseError which provides a machine-readable `code`,
 * an HTTP-friendly `statusCode`, and optional structured context.
 */

export type ErrorContext = Readonly<Record<string, unknown>>;

/** Base error class for all platform errors. */
export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly context?: ErrorContext;
  readonly timestamp: Date;

  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(message, { cause });
    this.name = this.constructor.name;
    if (context !== undefined) {
      this.context = context;
    }
    this.timestamp = new Date();
  }

  /** Serialize to a JSON-safe object for API responses. */
  toJSON(): Record<string, unknown> {
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
  readonly code = "EMAIL_ERROR";
  readonly statusCode = 400;
}

export class EmailValidationError extends BaseError {
  readonly code = "EMAIL_VALIDATION_ERROR";
  readonly statusCode = 422;
}

export class EmailSendError extends BaseError {
  readonly code = "EMAIL_SEND_ERROR";
  readonly statusCode = 502;
}

export class EmailBounceError extends BaseError {
  readonly code = "EMAIL_BOUNCE_ERROR";
  readonly statusCode = 502;
}

export class EmailSizeExceededError extends BaseError {
  readonly code = "EMAIL_SIZE_EXCEEDED";
  readonly statusCode = 413;
}

export class RecipientNotFoundError extends BaseError {
  readonly code = "RECIPIENT_NOT_FOUND";
  readonly statusCode = 422;
}

// ---------------------------------------------------------------------------
// Authentication & authorization errors
// ---------------------------------------------------------------------------

export class AuthError extends BaseError {
  readonly code = "AUTH_ERROR";
  readonly statusCode = 401;
}

export class InvalidApiKeyError extends BaseError {
  readonly code = "INVALID_API_KEY";
  readonly statusCode = 401;
}

export class ExpiredApiKeyError extends BaseError {
  readonly code = "EXPIRED_API_KEY";
  readonly statusCode = 401;
}

export class InsufficientPermissionsError extends BaseError {
  readonly code = "INSUFFICIENT_PERMISSIONS";
  readonly statusCode = 403;
}

// ---------------------------------------------------------------------------
// DNS & domain errors
// ---------------------------------------------------------------------------

export class DnsError extends BaseError {
  readonly code = "DNS_ERROR";
  readonly statusCode = 502;
}

export class DomainNotVerifiedError extends BaseError {
  readonly code = "DOMAIN_NOT_VERIFIED";
  readonly statusCode = 403;
}

export class DomainVerificationFailedError extends BaseError {
  readonly code = "DOMAIN_VERIFICATION_FAILED";
  readonly statusCode = 422;
}

export class DnsRecordNotFoundError extends BaseError {
  readonly code = "DNS_RECORD_NOT_FOUND";
  readonly statusCode = 422;
}

// ---------------------------------------------------------------------------
// Rate limiting errors
// ---------------------------------------------------------------------------

export class RateLimitError extends BaseError {
  readonly code = "RATE_LIMIT_EXCEEDED";
  readonly statusCode = 429;

  /** Seconds until the rate limit resets. */
  readonly retryAfter: number;

  constructor(message: string, retryAfter: number, context?: ErrorContext) {
    super(message, context);
    this.retryAfter = retryAfter;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

export class QuotaExceededError extends BaseError {
  readonly code = "QUOTA_EXCEEDED";
  readonly statusCode = 429;
}

// ---------------------------------------------------------------------------
// Resource errors
// ---------------------------------------------------------------------------

export class NotFoundError extends BaseError {
  readonly code = "NOT_FOUND";
  readonly statusCode = 404;
}

export class ConflictError extends BaseError {
  readonly code = "CONFLICT";
  readonly statusCode = 409;
}

// ---------------------------------------------------------------------------
// Infrastructure errors
// ---------------------------------------------------------------------------

export class DatabaseError extends BaseError {
  readonly code = "DATABASE_ERROR";
  readonly statusCode = 500;
}

export class SmtpConnectionError extends BaseError {
  readonly code = "SMTP_CONNECTION_ERROR";
  readonly statusCode = 502;
}

export class WebhookDeliveryError extends BaseError {
  readonly code = "WEBHOOK_DELIVERY_ERROR";
  readonly statusCode = 502;
}

export class InternalError extends BaseError {
  readonly code = "INTERNAL_ERROR";
  readonly statusCode = 500;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** Check if an unknown value is a platform error. */
export function isAlecRaeError(value: unknown): value is BaseError {
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
} as const;
