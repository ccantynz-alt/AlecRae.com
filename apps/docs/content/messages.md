# Messages

The `/v1/messages` endpoint sends email. It accepts plain text, HTML, attachments, templates, and batch sends.

## Send a single message

```bash
POST /v1/messages
```

```json
{
  "from": "you@yourdomain.com",
  "to": ["customer@example.com"],
  "cc": ["team@yourdomain.com"],
  "bcc": [],
  "reply_to": "support@yourdomain.com",
  "subject": "Your receipt",
  "text": "Thanks for your order.",
  "html": "<p>Thanks for your order.</p>",
  "headers": { "X-Order-Id": "1234" },
  "tags": ["receipt", "order"]
}
```

## Attachments

Attachments are base64-encoded inline:

```json
{
  "attachments": [
    {
      "filename": "receipt.pdf",
      "content_type": "application/pdf",
      "content": "JVBERi0xLjQK..."
    }
  ]
}
```

Maximum total payload: **40 MB**.

## Templates

Reference a stored template by ID and pass variables:

```json
{
  "template_id": "tmpl_welcome_v3",
  "template_data": {
    "first_name": "Ada",
    "verify_url": "https://yourdomain.com/verify?t=abc"
  }
}
```

## Batch sends

`POST /v1/messages/batch` accepts up to 500 messages in one request. Each message is queued and processed independently.

## Status

```bash
GET /v1/messages/{message_id}
```

Returns the current state: `queued`, `sending`, `delivered`, `bounced`, `complained`, or `failed`.

---

_Last updated: 2026-06-08 23:35 UTC_
