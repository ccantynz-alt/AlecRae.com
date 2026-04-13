import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Emails — AlecRae API Docs",
  description: "Send, list, retrieve, and search email messages through the AlecRae API.",
};

export default function EmailsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Emails"
        description="Send transactional and bulk email. Retrieve message status. Search your outbox."
        badge="Core"
      />

      <section className="space-y-4">
        <EndpointCard
          method="POST"
          path="/v1/messages"
          description="Enqueues an email for delivery. Returns immediately with a message ID and a 202 Accepted status. Use the message ID to poll for delivery status or configure webhooks for async notifications."
          scopes={["messages:send"]}
          parameters={[
            { name: "from", type: "string", required: true, description: "Sender email address (must be on a verified domain)" },
            { name: "to", type: "string[]", required: true, description: "Recipient email addresses (max 50)" },
            { name: "subject", type: "string", required: true, description: "Email subject line (max 998 chars)" },
            { name: "text", type: "string", required: false, description: "Plain text body" },
            { name: "html", type: "string", required: false, description: "HTML body" },
            { name: "cc", type: "string[]", required: false, description: "CC recipients" },
            { name: "bcc", type: "string[]", required: false, description: "BCC recipients" },
            { name: "reply_to", type: "string", required: false, description: "Reply-to address" },
            { name: "headers", type: "object", required: false, description: "Custom email headers" },
            { name: "tags", type: "string[]", required: false, description: "Tags for categorization and filtering" },
            { name: "metadata", type: "object", required: false, description: "Custom key-value metadata (max 20 entries)" },
            { name: "scheduled_at", type: "datetime", required: false, description: "Schedule delivery for a future time (ISO 8601)" },
            { name: "attachments", type: "object[]", required: false, description: "Base64-encoded file attachments (max 40 MB total)" },
          ]}
          requestBody={`{
  "from": "you@yourdomain.com",
  "to": ["customer@example.com"],
  "cc": ["team@yourdomain.com"],
  "subject": "Your receipt",
  "text": "Thanks for your order.",
  "html": "<p>Thanks for your order.</p>",
  "headers": { "X-Order-Id": "1234" },
  "tags": ["receipt", "order"]
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/messages \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "you@yourdomain.com",
    "to": ["customer@example.com"],
    "subject": "Your receipt",
    "text": "Thanks for your order.",
    "html": "<p>Thanks for your order.</p>",
    "tags": ["receipt"]
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/messages", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "you@yourdomain.com",
    to: ["customer@example.com"],
    subject: "Your receipt",
    text: "Thanks for your order.",
    html: "<p>Thanks for your order.</p>",
    tags: ["receipt"],
  }),
});

const data = await response.json();
console.log(data.id, data.status);`}
          pythonExample={`import requests

response = requests.post(
    "https://api.alecrae.com/v1/messages",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "from": "you@yourdomain.com",
        "to": ["customer@example.com"],
        "subject": "Your receipt",
        "text": "Thanks for your order.",
        "html": "<p>Thanks for your order.</p>",
        "tags": ["receipt"],
    },
)

data = response.json()
print(data["id"], data["status"])`}
          responseExample={`{
  "id": "msg_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "status": "queued",
  "createdAt": "2026-04-09T12:00:00.000Z"
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/messages"
          description="Returns a paginated list of messages. Supports cursor-based pagination and filtering by status or tag."
          scopes={["messages:read"]}
          parameters={[
            { name: "cursor", type: "string", required: false, description: "Pagination cursor from a previous response" },
            { name: "limit", type: "integer", required: false, description: "Max items to return (1-100, default 20)" },
            { name: "status", type: "string", required: false, description: "Filter by status: queued, sending, delivered, bounced, deferred, complained, failed" },
            { name: "tag", type: "string", required: false, description: "Filter by tag" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/messages?status=delivered&limit=10" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/messages?status=delivered&limit=10",
  {
    headers: {
      "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    },
  }
);

const { data, cursor, hasMore } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/messages",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={"status": "delivered", "limit": 10},
)

result = response.json()
messages = result["data"]
next_cursor = result.get("cursor")`}
          responseExample={`{
  "data": [
    {
      "id": "msg_a1b2c3d4...",
      "from": "you@yourdomain.com",
      "to": ["customer@example.com"],
      "subject": "Your receipt",
      "status": "delivered",
      "tags": ["receipt"],
      "createdAt": "2026-04-09T12:00:00.000Z",
      "updatedAt": "2026-04-09T12:00:02.000Z",
      "deliveredAt": "2026-04-09T12:00:02.000Z"
    }
  ],
  "cursor": "eyJpZCI6Im1zZ18...",
  "hasMore": true
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/messages/{id}"
          description="Retrieve the full details and current delivery status of a single message."
          scopes={["messages:read"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Message ID (path parameter)" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/messages/msg_a1b2c3d4e5f6" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/messages/msg_a1b2c3d4e5f6",
  {
    headers: {
      "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    },
  }
);

const { data } = await response.json();
console.log(data.status, data.deliveredAt);`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/messages/msg_a1b2c3d4e5f6",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

message = response.json()["data"]
print(message["status"], message.get("deliveredAt"))`}
          responseExample={`{
  "data": {
    "id": "msg_a1b2c3d4e5f6",
    "from": "you@yourdomain.com",
    "to": ["customer@example.com"],
    "subject": "Your receipt",
    "status": "delivered",
    "tags": ["receipt"],
    "createdAt": "2026-04-09T12:00:00.000Z",
    "updatedAt": "2026-04-09T12:00:02.000Z",
    "deliveredAt": "2026-04-09T12:00:02.000Z"
  }
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/messages/batch"
          description="Send up to 500 messages in one request. Each message is queued and processed independently. Returns an array of message IDs."
          scopes={["messages:send"]}
          parameters={[
            { name: "messages", type: "object[]", required: true, description: "Array of message objects (same schema as POST /v1/messages)" },
          ]}
          requestBody={`{
  "messages": [
    {
      "from": "you@yourdomain.com",
      "to": ["alice@example.com"],
      "subject": "Batch email 1",
      "text": "Hello Alice"
    },
    {
      "from": "you@yourdomain.com",
      "to": ["bob@example.com"],
      "subject": "Batch email 2",
      "text": "Hello Bob"
    }
  ]
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/messages/batch \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "from": "you@yourdomain.com", "to": ["alice@example.com"], "subject": "Hello", "text": "Hi Alice" },
      { "from": "you@yourdomain.com", "to": ["bob@example.com"], "subject": "Hello", "text": "Hi Bob" }
    ]
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/messages/batch", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [
      { from: "you@yourdomain.com", to: ["alice@example.com"], subject: "Hello", text: "Hi Alice" },
      { from: "you@yourdomain.com", to: ["bob@example.com"], subject: "Hello", text: "Hi Bob" },
    ],
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/messages/batch",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "messages": [
            {"from": "you@yourdomain.com", "to": ["alice@example.com"], "subject": "Hello", "text": "Hi Alice"},
            {"from": "you@yourdomain.com", "to": ["bob@example.com"], "subject": "Hello", "text": "Hi Bob"},
        ]
    },
)

data = response.json()["data"]`}
          responseExample={`{
  "data": [
    { "id": "msg_a1b2c3d4...", "status": "queued" },
    { "id": "msg_e5f6g7h8...", "status": "queued" }
  ]
}`}
        />

        <Callout type="info" title="Attachments">
          Attachments are base64-encoded inline. Maximum total payload is 40 MB.
          Each attachment needs <code className="text-cyan-300 font-mono text-xs">filename</code>,{" "}
          <code className="text-cyan-300 font-mono text-xs">content_type</code>, and{" "}
          <code className="text-cyan-300 font-mono text-xs">content</code> (base64).
        </Callout>
      </section>
    </div>
  );
}
