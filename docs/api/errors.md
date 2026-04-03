# Error Reference

All API errors follow a consistent JSON structure. The HTTP status code indicates the error category, and the response body contains machine-readable details.

## Error Response Format

```json
{
  "error": {
    "type": "error_category",
    "message": "Human-readable description of what went wrong",
    "code": "MACHINE_READABLE_CODE",
    "context": {}
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Error category (e.g., `validation_error`, `authentication_error`) |
| `message` | string | Human-readable description suitable for logs |
| `code` | string | Machine-readable error code for programmatic handling |
| `context` | object | Optional additional details (field names, limits, etc.) |

## HTTP Status Codes

| Status | Meaning | When it occurs |
|--------|---------|----------------|
| 400 | Bad Request | Malformed JSON, missing required fields, invalid parameter types |
| 401 | Unauthorized | Missing or invalid API key / Bearer token |
| 403 | Forbidden | Valid credentials but insufficient permissions for the operation |
| 404 | Not Found | The requested resource (message, domain, webhook) does not exist |
| 409 | Conflict | Attempting to create a resource that already exists (e.g., duplicate domain) |
| 413 | Payload Too Large | Email or attachment exceeds the maximum allowed size |
| 422 | Unprocessable Entity | Request is well-formed but contains invalid data (e.g., invalid email address) |
| 429 | Too Many Requests | Rate limit or quota exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | Upstream service failure (SMTP, DNS, webhook delivery) |

## Error Codes

### Email Errors

| Code | Status | Description | Retry |
|------|--------|-------------|-------|
| `EMAIL_ERROR` | 400 | General email processing error | No |
| `EMAIL_VALIDATION_ERROR` | 422 | Email address or content failed validation | No |
| `EMAIL_SEND_ERROR` | 502 | Failed to deliver the email via SMTP | Yes |
| `EMAIL_BOUNCE_ERROR` | 502 | The email bounced during delivery | No |
| `EMAIL_SIZE_EXCEEDED` | 413 | Email size exceeds the 25 MB limit | No |
| `RECIPIENT_NOT_FOUND` | 422 | The recipient address does not exist | No |

### Authentication Errors

| Code | Status | Description | Retry |
|------|--------|-------------|-------|
| `AUTH_ERROR` | 401 | General authentication failure | No |
| `INVALID_API_KEY` | 401 | The API key is malformed or does not exist | No |
| `EXPIRED_API_KEY` | 401 | The API key has been revoked or expired | No |
| `INSUFFICIENT_PERMISSIONS` | 403 | The key lacks the required scope for this endpoint | No |

### Domain Errors

| Code | Status | Description | Retry |
|------|--------|-------------|-------|
| `DNS_ERROR` | 502 | DNS lookup failed | Yes |
| `DOMAIN_NOT_VERIFIED` | 403 | The domain has not been verified yet | No |
| `DOMAIN_VERIFICATION_FAILED` | 422 | DNS records do not match expected values | No |
| `DNS_RECORD_NOT_FOUND` | 422 | Required DNS record is missing | No |

### Rate Limit Errors

| Code | Status | Description | Retry |
|------|--------|-------------|-------|
| `RATE_LIMIT_EXCEEDED` | 429 | Request rate limit exceeded | Yes (after `Retry-After`) |
| `QUOTA_EXCEEDED` | 429 | Monthly send quota exceeded | No (upgrade plan) |

### Resource Errors

| Code | Status | Description | Retry |
|------|--------|-------------|-------|
| `NOT_FOUND` | 404 | The requested resource does not exist | No |
| `CONFLICT` | 409 | Resource already exists (duplicate) | No |

### Infrastructure Errors

| Code | Status | Description | Retry |
|------|--------|-------------|-------|
| `DATABASE_ERROR` | 500 | Internal database failure | Yes |
| `SMTP_CONNECTION_ERROR` | 502 | Could not establish SMTP connection | Yes |
| `WEBHOOK_DELIVERY_ERROR` | 502 | Failed to deliver a webhook event | Yes (automatic) |
| `INTERNAL_ERROR` | 500 | Unclassified server error | Yes |

## Retry Guidance

Follow these rules when deciding whether to retry a failed request:

1. **Retryable errors** (marked "Yes" above): Use exponential backoff starting at 500ms. Cap at 3 retries for idempotent requests.
2. **Rate limit errors (429)**: Always respect the `Retry-After` header. Do not retry immediately.
3. **Client errors (4xx except 429)**: Do not retry. Fix the request and resubmit.
4. **Server errors (5xx)**: Retry with backoff. If the error persists after 3 attempts, contact support.

### Exponential Backoff Formula

```
delay = min(base * 2^attempt + jitter, maxDelay)
```

Where:
- `base` = 500ms
- `attempt` = 0, 1, 2, ...
- `jitter` = random value between 0 and 500ms
- `maxDelay` = 30 seconds

## Validation Errors

Validation errors (422) include field-level details in the `context` object:

```json
{
  "error": {
    "type": "validation_error",
    "message": "Request validation failed",
    "code": "EMAIL_VALIDATION_ERROR",
    "context": {
      "fields": [
        {
          "field": "to[0]",
          "message": "Invalid email address",
          "code": "invalid_email"
        },
        {
          "field": "subject",
          "message": "Subject is required",
          "code": "required"
        }
      ]
    }
  }
}
```

## Error Handling Example

```typescript
import { Emailed, ApiError, RateLimitError } from "@emailed/sdk";

const client = new Emailed({ auth: { type: "apiKey", key: "em_live_..." } });

try {
  const response = await client.messages.send({
    from: "noreply@example.com",
    to: ["user@example.com"],
    subject: "Hello",
    textBody: "World",
  });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.rateLimitInfo.resetAt}`);
  } else if (error instanceof ApiError) {
    console.error(`API error ${error.code}: ${error.message}`);
    if (error.status >= 500) {
      // Schedule retry
    }
  } else {
    // Network error or timeout
    console.error("Network error:", error);
  }
}
```
