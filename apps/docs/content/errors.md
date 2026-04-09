# Errors

The Vienna API uses conventional HTTP status codes and a consistent JSON error shape.

## Error shape

```json
{
  "error": {
    "type": "validation_error",
    "code": "missing_field",
    "message": "Field 'subject' is required.",
    "param": "subject",
    "request_id": "req_01HX..."
  }
}
```

Always include the `request_id` when contacting support.

## Status codes

| Code | Meaning |
|---|---|
| `200 OK` | Request succeeded |
| `201 Created` | Resource created |
| `400 Bad Request` | Validation failed (see `error.code`) |
| `401 Unauthorized` | Missing or invalid API key |
| `403 Forbidden` | Key lacks the required scope |
| `404 Not Found` | Resource doesn't exist |
| `409 Conflict` | Idempotency key reused with a different payload |
| `422 Unprocessable Entity` | Semantically invalid (e.g. unverified domain) |
| `429 Too Many Requests` | Rate limit exceeded — see `Retry-After` |
| `500 Internal Server Error` | Vienna's fault — retry with backoff |
| `503 Service Unavailable` | Vienna is degraded — see status.48co.ai |

## Common error codes

- `invalid_api_key` — key revoked or malformed
- `domain_not_verified` — sending domain is pending
- `recipient_blocked` — recipient on the suppression list
- `payload_too_large` — body exceeds 40 MB
- `rate_limited` — see [rate limits](/quickstart)

## Retry guidance

Retry on `429`, `500`, `502`, `503`, `504`. Use exponential backoff starting at 1 s, doubling each attempt, with full jitter, capped at 60 s. Include an `Idempotency-Key` header so retries don't double-send.
