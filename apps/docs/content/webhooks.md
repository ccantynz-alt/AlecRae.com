# Webhooks

Webhooks let your application react to email events in real time.

## Create a webhook

```bash
POST /v1/webhooks
```

```json
{
  "url": "https://yourdomain.com/hooks/alecrae",
  "events": ["message.delivered", "message.bounced", "message.opened"],
  "secret": "whsec_..."
}
```

## Event types

| Event | When |
|---|---|
| `message.queued` | AlecRae accepted the message |
| `message.sending` | Handed to the MTA |
| `message.delivered` | Recipient mail server accepted it |
| `message.bounced` | Permanent failure |
| `message.deferred` | Temporary failure (retrying) |
| `message.complained` | Marked as spam |
| `message.opened` | Tracking pixel loaded |
| `message.clicked` | Tracked link clicked |

## Payload

Every payload has the same envelope:

```json
{
  "id": "evt_01HX...",
  "type": "message.delivered",
  "created_at": "2026-04-07T12:34:56Z",
  "data": {
    "message_id": "msg_01HX...",
    "to": "customer@example.com",
    "from": "you@yourdomain.com"
  }
}
```

## Signing

AlecRae signs every request with HMAC-SHA256 using your webhook secret. Verify the `AlecRae-Signature` header before trusting any payload.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

## Retries

AlecRae retries failed deliveries with exponential backoff for up to 24 hours. Respond with a 2xx status to acknowledge.
