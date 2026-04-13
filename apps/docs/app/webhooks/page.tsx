import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";
import { Table } from "../components/table";
import { CodeBlock } from "../components/code-block";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Webhooks — AlecRae API Docs",
  description: "Webhook registration, event reference, payload signing, and retry behavior for the AlecRae API.",
};

export default function WebhooksPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Webhooks"
        description="Receive real-time notifications when events happen in AlecRae. Register endpoints, verify signatures, and process events."
        badge="Platform"
      />

      <section className="space-y-10">
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Event types</h2>
          <Table
            headers={["Event", "Description"]}
            rows={[
              ["`message.queued`", "AlecRae accepted the message for delivery"],
              ["`message.sending`", "Message handed to the MTA"],
              ["`message.sent`", "Message sent to recipient mail server"],
              ["`message.delivered`", "Recipient mail server accepted the message"],
              ["`message.bounced`", "Permanent delivery failure"],
              ["`message.deferred`", "Temporary failure — retrying automatically"],
              ["`message.dropped`", "Message dropped (suppression list or policy)"],
              ["`message.complained`", "Recipient marked as spam"],
              ["`message.opened`", "Tracking pixel loaded by recipient"],
              ["`message.clicked`", "Tracked link clicked by recipient"],
              ["`domain.verified`", "Domain DNS verification succeeded"],
              ["`domain.failed`", "Domain DNS verification failed"],
              ["`contact.subscribed`", "Contact opted in to receive emails"],
              ["`contact.unsubscribed`", "Contact opted out / unsubscribed"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Payload format</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Every webhook payload uses the same envelope structure. The <code className="text-cyan-300 font-mono text-xs">data</code> field
            contains event-specific details.
          </p>
          <CodeBlock
            code={`{
  "id": "evt_01HX...",
  "type": "message.delivered",
  "created_at": "2026-04-09T12:00:02.000Z",
  "data": {
    "message_id": "msg_a1b2c3d4...",
    "from": "you@yourdomain.com",
    "to": "customer@example.com",
    "subject": "Your receipt",
    "status": "delivered",
    "delivered_at": "2026-04-09T12:00:02.000Z",
    "smtp_response": "250 2.0.0 OK"
  }
}`}
            language="json"
            title="message.delivered payload"
          />

          <CodeBlock
            code={`{
  "id": "evt_02HY...",
  "type": "message.bounced",
  "created_at": "2026-04-09T12:00:05.000Z",
  "data": {
    "message_id": "msg_e5f6g7h8...",
    "from": "you@yourdomain.com",
    "to": "invalid@example.com",
    "bounce_type": "hard",
    "bounce_code": "550",
    "bounce_message": "User unknown"
  }
}`}
            language="json"
            title="message.bounced payload"
          />

          <CodeBlock
            code={`{
  "id": "evt_03HZ...",
  "type": "message.opened",
  "created_at": "2026-04-09T14:30:00.000Z",
  "data": {
    "message_id": "msg_a1b2c3d4...",
    "to": "customer@example.com",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "ip": "203.0.113.42",
    "first_open": true
  }
}`}
            language="json"
            title="message.opened payload"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Signature verification</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            AlecRae signs every webhook request with HMAC-SHA256 using your webhook secret.
            Always verify the <code className="text-cyan-300 font-mono text-xs">AlecRae-Signature</code> header before trusting any payload.
          </p>
          <Table
            headers={["Header", "Description"]}
            rows={[
              ["`AlecRae-Signature`", "HMAC-SHA256 hex digest of the payload"],
              ["`AlecRae-Timestamp`", "ISO 8601 timestamp of the event"],
              ["`AlecRae-Event-Id`", "Unique event ID for deduplication"],
            ]}
          />
          <CodeBlock
            code={`import { createHmac, timingSafeEqual } from "node:crypto";

function verifyWebhook(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  // Reject events older than 5 minutes (replay protection)
  const eventTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - eventTime) > 5 * 60 * 1000) {
    return false;
  }

  const signedContent = timestamp + "." + rawBody;
  const expected = createHmac("sha256", secret)
    .update(signedContent)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}`}
            language="javascript"
            title="Signature verification (Node.js)"
          />
          <CodeBlock
            code={`import hmac
import hashlib
from datetime import datetime, timezone, timedelta

def verify_webhook(raw_body: str, signature: str, timestamp: str, secret: str) -> bool:
    # Reject events older than 5 minutes
    event_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    if abs((now - event_time).total_seconds()) > 300:
        return False

    signed_content = f"{timestamp}.{raw_body}"
    expected = hmac.new(
        secret.encode(), signed_content.encode(), hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature)`}
            language="python"
            title="Signature verification (Python)"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Retry behavior</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            AlecRae retries failed webhook deliveries with exponential backoff for up to 24 hours. Respond with
            a <code className="text-cyan-300 font-mono text-xs">2xx</code> status code to acknowledge receipt.
          </p>
          <Table
            headers={["Attempt", "Delay", "Cumulative"]}
            rows={[
              ["1", "Immediate", "0s"],
              ["2", "30 seconds", "30s"],
              ["3", "2 minutes", "~2.5 min"],
              ["4", "10 minutes", "~12.5 min"],
              ["5", "30 minutes", "~42.5 min"],
              ["6", "1 hour", "~1.7 hours"],
              ["7", "2 hours", "~3.7 hours"],
              ["8", "4 hours", "~7.7 hours"],
              ["9", "8 hours", "~15.7 hours"],
              ["10", "8 hours", "~23.7 hours"],
            ]}
          />
          <Callout type="warning" title="Idempotent handlers">
            Webhook events may be delivered more than once. Use the <code className="text-cyan-300 font-mono text-xs">AlecRae-Event-Id</code> header
            to deduplicate events in your handler.
          </Callout>
        </div>

        <h2 className="text-2xl font-bold text-white mb-4">Endpoint management</h2>

        <EndpointCard
          method="POST"
          path="/v1/webhooks"
          description="Register a new webhook endpoint. Specify which events to subscribe to. The URL must use HTTPS."
          scopes={["webhooks:write"]}
          parameters={[
            { name: "url", type: "string", required: true, description: "HTTPS URL to receive events" },
            { name: "events", type: "string[]", required: true, description: "Event types to subscribe to" },
            { name: "secret", type: "string", required: false, description: "HMAC signing secret (auto-generated if omitted)" },
            { name: "description", type: "string", required: false, description: "Description for this endpoint (max 256 chars)" },
            { name: "active", type: "boolean", required: false, description: "Whether the webhook is active (default: true)" },
          ]}
          requestBody={`{
  "url": "https://yourdomain.com/hooks/alecrae",
  "events": ["message.delivered", "message.bounced", "message.opened"],
  "description": "Production delivery notifications"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/webhooks \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://yourdomain.com/hooks/alecrae",
    "events": ["message.delivered", "message.bounced", "message.opened"]
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/webhooks", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://yourdomain.com/hooks/alecrae",
    events: ["message.delivered", "message.bounced", "message.opened"],
  }),
});

const { data } = await response.json();
console.log("Webhook ID:", data.id);
console.log("Secret:", data.secret); // Save this — shown only once`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/webhooks",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "url": "https://yourdomain.com/hooks/alecrae",
        "events": ["message.delivered", "message.bounced", "message.opened"],
    },
)

webhook = response.json()["data"]
print(f"Secret: {webhook['secret']}")  # Save this`}
          responseExample={`{
  "data": {
    "id": "wh_01HXab...",
    "url": "https://yourdomain.com/hooks/alecrae",
    "events": ["message.delivered", "message.bounced", "message.opened"],
    "secret": "whsec_a1B2c3D4e5F6g7H8i9J0...",
    "active": true,
    "createdAt": "2026-04-09T12:00:00.000Z",
    "updatedAt": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/webhooks"
          description="List all webhook endpoints for your account."
          scopes={["webhooks:write"]}
          curlExample={`curl "https://api.alecrae.com/v1/webhooks" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/webhooks", {
  headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
});

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/webhooks",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

webhooks = response.json()["data"]`}
          responseExample={`{
  "data": [
    {
      "id": "wh_01HXab...",
      "url": "https://yourdomain.com/hooks/alecrae",
      "events": ["message.delivered", "message.bounced"],
      "active": true,
      "createdAt": "2026-04-09T12:00:00.000Z"
    }
  ]
}`}
        />

        <EndpointCard
          method="DELETE"
          path="/v1/webhooks/{id}"
          description="Delete a webhook endpoint. Pending deliveries for this endpoint are cancelled."
          scopes={["webhooks:write"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Webhook ID (path parameter)" },
          ]}
          curlExample={`curl -X DELETE "https://api.alecrae.com/v1/webhooks/wh_01HXab" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`await fetch("https://api.alecrae.com/v1/webhooks/wh_01HXab", {
  method: "DELETE",
  headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
});`}
          pythonExample={`requests.delete(
    "https://api.alecrae.com/v1/webhooks/wh_01HXab",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)`}
          responseExample={`{
  "success": true,
  "message": "Webhook deleted"
}`}
        />
      </section>
    </div>
  );
}
