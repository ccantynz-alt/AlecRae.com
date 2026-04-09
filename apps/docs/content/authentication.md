# Authentication

The Vienna API uses bearer tokens (API keys) for authentication. Every request must include a valid key in the `Authorization` header.

## API keys

API keys are created from the [dashboard](https://mail.48co.ai/settings/api). Keys come in two flavors:

- **`vn_live_*`** — production keys that send real email
- **`vn_test_*`** — sandbox keys that simulate sends without delivery

## Sending a key

```bash
curl https://api.48co.ai/v1/messages \
  -H "Authorization: Bearer $VIENNA_API_KEY"
```

## Scopes

Each key can be scoped to a subset of capabilities:

| Scope | Description |
|---|---|
| `messages:send` | Send messages |
| `messages:read` | Read message status and metadata |
| `domains:read` | List and inspect domains |
| `domains:write` | Add and verify domains |
| `webhooks:write` | Manage webhook endpoints |
| `analytics:read` | Read aggregated analytics |

A key with no scopes can only call `/v1/health`.

## Rotation

Rotate keys at least every 90 days. The dashboard shows the last-used timestamp for every key. Revoking a key takes effect within five seconds globally.

## Never commit keys

Use environment variables or a secrets manager. Vienna scans public GitHub for leaked keys and revokes them automatically.
