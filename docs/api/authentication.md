# Authentication

The AlecRae API supports two authentication methods: API keys and Bearer tokens. All authenticated requests must use HTTPS.

## API Keys

API keys are the primary authentication method for server-to-server integrations.

### Key Format

API keys follow the format `em_{environment}_{random}` where:

- **environment** is either `live` (production) or `test` (sandbox)
- **random** is a 32+ character alphanumeric string

Example: `em_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345`

### Usage

Pass the API key in the `Authorization` header as a Bearer token:

```
Authorization: Bearer em_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345
```

Alternatively, use the `X-API-Key` header:

```
X-API-Key: em_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345
```

### Key Management

- Generate keys from the dashboard under **Settings > API Keys**.
- Each key can be scoped to specific permissions (e.g., `messages:send`, `domains:manage`, `analytics:read`).
- Rotate keys regularly. Old keys can be revoked immediately from the dashboard.
- Never expose API keys in client-side code, public repositories, or logs.

### Test vs. Live Keys

| Feature | Test (`em_test_`) | Live (`em_live_`) |
|---------|-------------------|-------------------|
| Sends real email | No | Yes |
| Charges to account | No | Yes |
| Rate limits | Reduced | Full plan limits |
| Webhook events | Simulated | Real |

## Bearer Tokens (OAuth 2.0)

For user-facing applications, the AlecRae API supports OAuth 2.0 Bearer tokens obtained through the standard authorization code flow.

### Token Exchange

1. Redirect the user to `https://auth.alecrae.dev/authorize` with your `client_id`, `redirect_uri`, `scope`, and `state`.
2. After the user grants access, exchange the authorization code at `https://auth.alecrae.dev/token` for an access token and refresh token.
3. Include the access token in requests:

```
Authorization: Bearer eyJhbGciOi...
```

### Token Refresh

Access tokens expire after 1 hour. Use the refresh token to obtain a new access token without re-prompting the user:

```http
POST https://auth.alecrae.dev/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=rt_...&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET
```

### Scopes

| Scope | Description |
|-------|-------------|
| `messages:send` | Send emails |
| `messages:read` | Read message status and history |
| `domains:manage` | Add, verify, and remove domains |
| `webhooks:manage` | Create and manage webhook endpoints |
| `analytics:read` | Read delivery and engagement analytics |
| `account:read` | Read account details |
| `account:write` | Modify account settings |

## Webhook Signature Verification

AlecRae signs all webhook payloads with HMAC-SHA256 so you can verify their authenticity.

### Headers

Each webhook delivery includes:

- `X-AlecRae-Signature` -- the HMAC-SHA256 hex digest
- `X-AlecRae-Timestamp` -- the ISO 8601 timestamp of the event

### Verification Steps

1. Read the raw request body (do not parse JSON first).
2. Construct the signed content: `{timestamp}.{raw_body}`.
3. Compute `HMAC-SHA256(signed_content, webhook_secret)`.
4. Compare the computed digest with the `X-AlecRae-Signature` header using constant-time comparison.
5. Reject events older than 5 minutes to prevent replay attacks.

### Example (Node.js)

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyWebhook(body: string, signature: string, timestamp: string, secret: string): boolean {
  const signedContent = `${timestamp}.${body}`;
  const expected = createHmac("sha256", secret).update(signedContent).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

### SDK Helper

The `@alecrae/sdk` package provides a `verifyWebhook` function that handles signature verification, timestamp checking, and JSON parsing in a single call:

```typescript
import { verifyWebhook } from "@alecrae/sdk/webhooks";

const event = verifyWebhook({
  payload: req.body,
  signature: req.headers["x-alecrae-signature"],
  secret: process.env.WEBHOOK_SECRET,
});
```

## Error Responses

Authentication failures return a `401 Unauthorized` response:

```json
{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key",
    "code": "INVALID_API_KEY"
  }
}
```

Permission failures return a `403 Forbidden` response:

```json
{
  "error": {
    "type": "authorization_error",
    "message": "API key does not have the 'messages:send' scope",
    "code": "INSUFFICIENT_PERMISSIONS"
  }
}
```
