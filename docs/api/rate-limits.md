# Rate Limits

The AlecRae API enforces rate limits to ensure fair usage and platform stability. Limits are applied per API key or OAuth token.

## Limits by Plan

| Plan | Requests / minute | Messages / hour | Burst (requests/second) |
|------|-------------------|-----------------|-------------------------|
| Free | 60 | 100 | 5 |
| Starter | 600 | 5,000 | 20 |
| Business | 3,000 | 50,000 | 100 |
| Enterprise | Custom | Custom | Custom |

Limits apply independently per endpoint category:

| Category | Endpoints |
|----------|-----------|
| Send | `POST /v1/messages` |
| Read | `GET /v1/messages`, `GET /v1/messages/{id}` |
| Domains | `POST /v1/domains`, `GET /v1/domains/*`, `POST /v1/domains/*/verify` |
| Webhooks | All `/v1/webhooks/*` endpoints |
| Analytics | All `/v1/analytics/*` endpoints |
| Health | `GET /health` (no limit) |

## Rate Limit Headers

Every API response includes rate limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |

Example response headers:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 594
X-RateLimit-Reset: 1712150400
```

## Rate Limit Exceeded (429)

When you exceed the rate limit, the API returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1712150412
Content-Type: application/json

{
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded. Retry after 12 seconds.",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

## Retry Strategy

When rate limited, follow this strategy:

1. **Read the `Retry-After` header** and wait the specified number of seconds before retrying.
2. **If `Retry-After` is absent**, use exponential backoff starting at 500ms with a multiplier of 2 (500ms, 1s, 2s, 4s, ...).
3. **Cap retries** at 3 attempts for idempotent requests (GET, PUT, DELETE) and 1 attempt for non-idempotent requests (POST) unless the request includes an idempotency key.
4. **Add jitter** to backoff delays (random 0-500ms) to avoid thundering herd effects.

### SDK Automatic Retries

The `@alecrae/sdk` client handles rate limiting automatically:

```typescript
import { AlecRae } from "@alecrae/sdk";

const client = new AlecRae({
  auth: { type: "apiKey", key: "em_live_..." },
  maxRetries: 3, // Default: 3 retries with exponential backoff
});
```

The SDK respects `Retry-After` headers and will not exceed `maxRetries`.

## Idempotency

For `POST` endpoints, include an `Idempotency-Key` header to safely retry requests without duplicate side effects:

```
Idempotency-Key: unique-request-id-12345
```

The API stores the response for each idempotency key for 24 hours. Repeated requests with the same key return the original response without re-executing the operation.

## Quota Limits

In addition to rate limits, each plan has monthly quotas:

| Plan | Monthly send quota |
|------|-------------------|
| Free | 1,000 |
| Starter | 50,000 |
| Business | 500,000 |
| Enterprise | Custom |

When the monthly quota is exceeded, the API returns `429` with the error code `QUOTA_EXCEEDED`. Contact support or upgrade your plan to increase the quota.

## Monitoring Usage

Check current usage at any time via the dashboard or the analytics API:

```
GET /v1/analytics/overview
```

The response includes cumulative send counts for the current billing period.
