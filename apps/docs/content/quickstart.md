# Quickstart

Send your first email through the Vienna API in under five minutes.

## 1. Get an API key

Sign in to the [Vienna dashboard](https://mail.48co.ai/settings/api), create a new API key, and copy it. Treat it like a password — anyone with the key can send mail on your behalf.

```bash
export VIENNA_API_KEY=vn_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

## 2. Verify a sending domain

Before you can send from `you@yourdomain.com`, you need to verify the domain. Vienna will give you SPF, DKIM, and DMARC records to add to your DNS.

See [Domains](/domains) for the full walkthrough.

## 3. Send a message

```bash
curl https://api.48co.ai/v1/messages \
  -H "Authorization: Bearer $VIENNA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "you@yourdomain.com",
    "to": ["customer@example.com"],
    "subject": "Hello from Vienna",
    "text": "It worked.",
    "html": "<p>It worked.</p>"
  }'
```

You'll get back a `messageId` you can use to look up delivery status.

## 4. Listen for events

Configure a [webhook](/webhooks) to receive delivery, open, click, bounce, and complaint events in real time.

## Next steps

- [Authentication](/authentication) — API keys, scopes, and bearer tokens
- [Messages](/messages) — All the ways to send mail
- [Errors](/errors) — Status codes and retry guidance
