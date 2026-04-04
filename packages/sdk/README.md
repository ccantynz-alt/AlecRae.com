# @emailed/sdk

The official Node.js SDK for the [Emailed](https://emailed.dev) email infrastructure platform. Fully typed, with automatic retries, rate limit handling, and webhook verification built in.

## Installation

```bash
npm install @emailed/sdk
# or
yarn add @emailed/sdk
# or
pnpm add @emailed/sdk
# or
bun add @emailed/sdk
```

**Requirements:** Node.js 18+ or Bun 1.0+

## Quick Start

```ts
import { Emailed } from "@emailed/sdk";

const emailed = new Emailed({ apiKey: "em_live_..." });

const { data } = await emailed.messages.send({
  from: { address: "hello@yourdomain.com" },
  to: [{ address: "recipient@example.com" }],
  subject: "Hello from Emailed",
  textBody: "Your first email sent with the Emailed SDK.",
});

console.log("Sent:", data.id);
```

## Configuration

```ts
import { Emailed } from "@emailed/sdk";

// Simple: just an API key
const emailed = new Emailed({ apiKey: "em_live_..." });

// Full configuration
const emailed = new Emailed({
  auth: { type: "apiKey", key: "em_live_..." },
  baseUrl: "https://api.emailed.dev",   // default
  timeout: 30_000,                       // request timeout in ms (default: 30s)
  maxRetries: 3,                         // retries on transient failures (default: 3)
  headers: { "X-Custom": "value" },      // extra headers on every request
  debug: false,                          // log requests and responses (default: false)
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | -- | API key (shorthand config) |
| `auth` | `AuthMethod` | -- | `{ type: "apiKey", key: "..." }` or `{ type: "bearer", token: "..." }` |
| `baseUrl` | `string` | `https://api.emailed.dev` | API base URL |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `maxRetries` | `number` | `3` | Max retries on 408, 429, 5xx errors |
| `headers` | `Record<string, string>` | `{}` | Custom headers sent with every request |
| `debug` | `boolean` | `false` | Enable debug logging |

## API Reference

All methods return a `Promise<ApiResponse<T>>` with the shape:

```ts
interface ApiResponse<T> {
  data: T;            // The response payload
  status: number;     // HTTP status code
  headers: Record<string, string>;
  requestId?: string; // For support debugging
}
```

Paginated endpoints return `PaginatedList<T>`:

```ts
interface PaginatedList<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string;
}
```

---

### Messages

Send, retrieve, list, and search email messages.

#### `messages.send(params)`

Send an email message.

```ts
const { data } = await emailed.messages.send({
  from: { address: "hello@yourdomain.com", name: "Your App" },
  to: [{ address: "alice@example.com", name: "Alice" }],
  cc: [{ address: "bob@example.com" }],
  bcc: [{ address: "admin@example.com" }],
  replyTo: { address: "support@yourdomain.com" },
  subject: "Welcome!",
  htmlBody: "<h1>Welcome to our platform</h1>",
  textBody: "Welcome to our platform",
  tags: ["welcome", "onboarding"],
  metadata: { userId: "usr_123", campaign: "launch" },
  scheduledAt: "2026-04-05T10:00:00Z",   // optional: schedule for later
  attachments: [{
    filename: "invoice.pdf",
    contentType: "application/pdf",
    content: "<base64-encoded content>",
    disposition: "attachment",
  }],
});
```

**Parameters (`SendMessageParams`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | `SdkEmailAddress` | Yes | Sender address and optional display name |
| `to` | `SdkEmailAddress[]` | Yes | Recipient addresses |
| `cc` | `SdkEmailAddress[]` | No | CC recipients |
| `bcc` | `SdkEmailAddress[]` | No | BCC recipients |
| `replyTo` | `SdkEmailAddress` | No | Reply-to address |
| `subject` | `string` | Yes | Email subject line |
| `htmlBody` | `string` | No | HTML body content |
| `textBody` | `string` | No | Plain text body content |
| `tags` | `string[]` | No | Tags for filtering and analytics |
| `metadata` | `Record<string, string>` | No | Custom key-value metadata |
| `scheduledAt` | `string` | No | ISO 8601 datetime for scheduled send |
| `attachments` | `SdkAttachment[]` | No | File attachments (base64 encoded) |

#### `messages.get(messageId)`

Retrieve a single message by ID.

```ts
const { data: message } = await emailed.messages.get("msg_abc123");
console.log(message.status); // "delivered"
```

#### `messages.list(params?)`

List messages with optional filters and pagination.

```ts
const { data: page } = await emailed.messages.list({
  status: "delivered",
  tag: "welcome",
  from: "hello@yourdomain.com",
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  page: 1,
  pageSize: 25,
});

for (const msg of page.data) {
  console.log(`${msg.id}: ${msg.subject} [${msg.status}]`);
}
```

#### `messages.search(query, params?)`

Full-text search across messages.

```ts
const { data: results } = await emailed.messages.search("invoice", {
  startDate: "2026-01-01",
  pageSize: 10,
});
```

#### `messages.cancel(messageId)`

Cancel a scheduled message that has not yet been sent.

```ts
await emailed.messages.cancel("msg_abc123");
```

---

### Domains

Register, verify, and manage sending domains.

#### `domains.add(params)`

Register a new sending domain.

```ts
const { data: domain } = await emailed.domains.add({ name: "yourdomain.com" });
console.log(domain.id);     // "dom_xyz789"
console.log(domain.status); // "pending"
```

#### `domains.get(domainId)`

Retrieve a single domain by ID.

```ts
const { data: domain } = await emailed.domains.get("dom_xyz789");
```

#### `domains.list(params?)`

List all domains with optional pagination.

```ts
const { data: page } = await emailed.domains.list({ page: 1, pageSize: 50 });
for (const d of page.data) {
  console.log(`${d.name} - ${d.status}`);
}
```

#### `domains.verify(domainId)`

Trigger DNS verification. The platform checks that the required records are configured.

```ts
const { data: domain } = await emailed.domains.verify("dom_xyz789");
console.log(domain.status); // "verified" or "failed"
```

#### `domains.getDnsRecords(domainId)`

Get the DNS records that must be configured (DKIM, SPF, DMARC, MX).

```ts
const { data: records } = await emailed.domains.getDnsRecords("dom_xyz789");
console.log(records.dkim);  // { type: "CNAME", name: "...", value: "...", ttl: 3600 }
console.log(records.spf);   // { type: "TXT", name: "...", value: "...", ttl: 3600 }
```

#### `domains.getDns(domainId)`

Get DNS records with per-record verification status.

```ts
const { data: dns } = await emailed.domains.getDns("dom_xyz789");
for (const record of dns.records) {
  console.log(`${record.type} ${record.name} - ${record.verified ? "OK" : "PENDING"}`);
}
```

#### `domains.getHealth(domainId)`

Get a health report with deliverability score and recommendations.

```ts
const { data: health } = await emailed.domains.getHealth("dom_xyz789");
console.log(`Score: ${health.score}/100`);
console.log(`DKIM rotation needed: ${health.dkimRotationNeeded}`);
for (const rec of health.recommendations) {
  console.log(`  - ${rec}`);
}
```

#### `domains.remove(domainId)`

Remove a domain from the account.

```ts
await emailed.domains.remove("dom_xyz789");
```

---

### Webhooks

Create, manage, and test webhook endpoints.

#### `webhooks.create(params)`

Create a new webhook endpoint.

```ts
const { data: webhook } = await emailed.webhooks.create({
  url: "https://yourapp.com/webhooks/emailed",
  events: ["message.delivered", "message.bounced", "message.complained"],
  description: "Production webhook",
});

console.log(webhook.id);     // "wh_abc123"
console.log(webhook.secret); // Save this for signature verification
```

**Parameters (`CreateWebhookParams`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | Yes | HTTPS URL to deliver events to |
| `events` | `string[]` | Yes | Event types to subscribe to |
| `secret` | `string` | No | Custom signing secret (auto-generated if omitted) |
| `description` | `string` | No | Human-readable description |
| `active` | `boolean` | No | Whether the webhook is active (default: true) |

**Supported event types:**

| Event | Description |
|-------|-------------|
| `message.sent` | Message accepted and queued |
| `message.delivered` | Message delivered to recipient |
| `message.bounced` | Message bounced |
| `message.deferred` | Delivery temporarily deferred |
| `message.dropped` | Message dropped (policy/suppression) |
| `message.complained` | Recipient marked as spam |
| `message.opened` | Recipient opened the email |
| `message.clicked` | Recipient clicked a link |
| `domain.verified` | Domain DNS verification passed |
| `domain.failed` | Domain DNS verification failed |
| `contact.subscribed` | Contact subscribed |
| `contact.unsubscribed` | Contact unsubscribed |

#### `webhooks.get(webhookId)`

Retrieve a webhook endpoint by ID.

```ts
const { data: webhook } = await emailed.webhooks.get("wh_abc123");
```

#### `webhooks.list()`

List all webhook endpoints.

```ts
const { data: webhooks } = await emailed.webhooks.list();
```

#### `webhooks.update(webhookId, params)`

Update a webhook endpoint.

```ts
await emailed.webhooks.update("wh_abc123", {
  events: ["message.delivered", "message.bounced"],
  active: false,
});
```

#### `webhooks.delete(webhookId)`

Delete a webhook endpoint.

```ts
await emailed.webhooks.delete("wh_abc123");
```

#### `webhooks.test(webhookId)`

Send a test event to verify your endpoint is working.

```ts
const { data: result } = await emailed.webhooks.test("wh_abc123");
console.log(result.success);   // true
console.log(result.eventType); // "message.delivered"
```

#### `webhooks.listDeliveries(webhookId, options?)`

List recent delivery attempts.

```ts
const { data: deliveries } = await emailed.webhooks.listDeliveries("wh_abc123", {
  limit: 20,
});

for (const d of deliveries) {
  console.log(`${d.id}: ${d.success ? "OK" : "FAILED"} (${d.statusCode})`);
}
```

---

### Contacts

Manage recipients and contact lists.

#### `contacts.upsert(params)`

Create or update a contact. If the email already exists, the contact is updated.

```ts
const { data: contact } = await emailed.contacts.upsert({
  email: "alice@example.com",
  name: "Alice Johnson",
  tags: ["customer", "premium"],
  metadata: { plan: "enterprise" },
  subscribed: true,
});
```

#### `contacts.get(contactId)`

Retrieve a single contact.

```ts
const { data: contact } = await emailed.contacts.get("ct_abc123");
```

#### `contacts.list(params?)`

List contacts with optional filters.

```ts
const { data: page } = await emailed.contacts.list({
  tag: "premium",
  subscribed: true,
  query: "alice",
  pageSize: 50,
});
```

#### `contacts.update(contactId, params)`

Update specific fields on a contact.

```ts
await emailed.contacts.update("ct_abc123", {
  name: "Alice Smith",
  tags: ["customer", "premium", "vip"],
});
```

#### `contacts.remove(contactId)`

Delete a contact.

```ts
await emailed.contacts.remove("ct_abc123");
```

#### `contacts.unsubscribe(contactId)`

Unsubscribe a contact from all future emails.

```ts
await emailed.contacts.unsubscribe("ct_abc123");
```

---

### Analytics

Delivery metrics, engagement tracking, and reporting.

#### `analytics.delivery(params)`

Get aggregate delivery metrics for a time range.

```ts
const { data: stats } = await emailed.analytics.delivery({
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  domainId: "dom_xyz789",  // optional filter
  tag: "transactional",    // optional filter
});

console.log(`Sent: ${stats.sent}`);
console.log(`Delivered: ${stats.delivered} (${(stats.deliveryRate * 100).toFixed(1)}%)`);
console.log(`Bounced: ${stats.bounced} (${(stats.bounceRate * 100).toFixed(1)}%)`);
```

#### `analytics.engagement(params)`

Get engagement metrics (opens, clicks).

```ts
const { data: engagement } = await emailed.analytics.engagement({
  startDate: "2026-04-01",
  endDate: "2026-04-30",
});

console.log(`Opens: ${engagement.opens} (${(engagement.openRate * 100).toFixed(1)}%)`);
console.log(`Clicks: ${engagement.clicks} (${(engagement.clickRate * 100).toFixed(1)}%)`);
```

#### `analytics.deliveryTimeSeries(params)`

Get delivery volume over time.

```ts
const { data: series } = await emailed.analytics.deliveryTimeSeries({
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  granularity: "day",
});

for (const point of series) {
  console.log(`${point.timestamp}: ${point.value} emails`);
}
```

#### `analytics.engagementTimeSeries(params)`

Get engagement (opens + clicks) over time.

```ts
const { data: series } = await emailed.analytics.engagementTimeSeries({
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  granularity: "week",
});
```

#### `analytics.bounceBreakdown(params)`

Get bounce counts broken down by category.

```ts
const { data: bounces } = await emailed.analytics.bounceBreakdown({
  startDate: "2026-04-01",
  endDate: "2026-04-30",
});

// { hard: 12, soft: 45, policy: 3, ... }
for (const [category, count] of Object.entries(bounces)) {
  console.log(`${category}: ${count}`);
}
```

---

### Events

List and retrieve platform events (immutable audit trail).

#### `events.list(params?)`

List events with optional filters.

```ts
const { data: page } = await emailed.events.list({
  type: "message.delivered",
  messageId: "msg_abc123",
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  pageSize: 50,
});

for (const event of page.data) {
  console.log(`${event.timestamp}: ${event.type} (${event.id})`);
}
```

#### `events.get(eventId)`

Retrieve a single event by ID.

```ts
const { data: event } = await emailed.events.get("evt_abc123");
```

---

### Billing

Account usage and plan information.

#### `billing.getUsage()`

Get current billing period usage.

```ts
const { data: usage } = await emailed.billing.getUsage();
console.log(`Emails sent: ${usage.emailsSent}`);
console.log(`Usage: ${usage.percentUsed}%`);
console.log(`Plan: ${usage.planTier}`);
```

#### `billing.getPlan()`

Get current plan details with limits.

```ts
const { data: plan } = await emailed.billing.getPlan();
console.log(`Plan: ${plan.name}`);
console.log(`Email limit: ${plan.limits.emailsPerMonth.toLocaleString()}/month`);
console.log(`Domains: ${plan.limits.domains}`);
console.log(`Webhooks: ${plan.limits.webhooks}`);
```

---

## Webhook Verification

When receiving webhooks, always verify the signature to ensure the event is authentic and has not been tampered with.

### Full verification (recommended)

Verifies the HMAC-SHA256 signature, checks the timestamp is within tolerance, and parses the event payload in one step.

```ts
import {
  verifyWebhook,
  WebhookVerificationError,
  SIGNATURE_HEADER,
} from "@emailed/sdk";
import type { WebhookEvent } from "@emailed/sdk";

// In your HTTP handler:
const rawBody = await request.text(); // raw request body as string
const signature = request.headers.get(SIGNATURE_HEADER);

try {
  const event: WebhookEvent = verifyWebhook({
    payload: rawBody,
    signature: signature!,
    secret: process.env.WEBHOOK_SECRET!,
    tolerance: 300,  // optional: max age in seconds (default: 300)
  });

  switch (event.type) {
    case "message.delivered":
      // handle delivery
      break;
    case "message.bounced":
      // handle bounce
      break;
  }
} catch (err) {
  if (err instanceof WebhookVerificationError) {
    // Signature invalid or event too old
    return new Response("Unauthorized", { status: 401 });
  }
  throw err;
}
```

### Signature-only verification

Verify the signature without parsing or checking age. Useful when you handle parsing separately.

```ts
import { verifySignature, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@emailed/sdk";

const isValid = verifySignature(
  rawBody,                                           // raw request body
  request.headers.get(SIGNATURE_HEADER)!,           // signature header
  process.env.WEBHOOK_SECRET!,                      // signing secret
  request.headers.get(TIMESTAMP_HEADER)!,           // timestamp header
);

if (!isValid) {
  return new Response("Unauthorized", { status: 401 });
}
```

### Type guard for event types

```ts
import { isWebhookEventType } from "@emailed/sdk";

if (isWebhookEventType(event.type)) {
  // event.type is narrowed to WebhookEventType
}
```

### Webhook sub-path import

The verification utilities are also available via a dedicated sub-path for tree-shaking:

```ts
import { verifyWebhook } from "@emailed/sdk/webhooks";
```

---

## Error Handling

The SDK throws typed errors that you can catch and inspect.

### `ApiError`

Thrown when the API returns a non-success HTTP status.

```ts
import { Emailed, ApiError } from "@emailed/sdk";

try {
  await emailed.messages.send({ /* ... */ });
} catch (err) {
  if (err instanceof ApiError) {
    console.error(`Status: ${err.status}`);      // HTTP status code
    console.error(`Code: ${err.code}`);           // Machine-readable error code
    console.error(`Message: ${err.message}`);     // Human-readable message
    console.error(`Request ID: ${err.requestId}`);// For support debugging
    console.error(`Details:`, err.details);       // Additional error context
  }
}
```

### `RateLimitError`

Extends `ApiError`. Thrown when rate limited and all retries are exhausted.

```ts
import { RateLimitError } from "@emailed/sdk";

try {
  await emailed.messages.send({ /* ... */ });
} catch (err) {
  if (err instanceof RateLimitError) {
    console.error(`Rate limited. Resets at: ${err.rateLimitInfo.resetAt}`);
    console.error(`Limit: ${err.rateLimitInfo.limit}`);
    console.error(`Remaining: ${err.rateLimitInfo.remaining}`);
  }
}
```

### `WebhookVerificationError`

Thrown when webhook signature verification fails.

```ts
import { WebhookVerificationError } from "@emailed/sdk";

try {
  const event = verifyWebhook({ /* ... */ });
} catch (err) {
  if (err instanceof WebhookVerificationError) {
    console.error("Verification failed:", err.message);
  }
}
```

### Automatic retries

The client automatically retries on transient failures (HTTP 408, 429, 500, 502, 503, 504) with exponential backoff. Rate limit responses (429) respect the `Retry-After` header. Retries are capped at `maxRetries` (default: 3).

---

## TypeScript Types

All types are exported from the main entry point for full IntelliSense support.

```ts
import type {
  // Client
  AuthMethod,
  ClientConfig,
  SimpleClientConfig,
  ResolvedConfig,
  EmailedConfig,

  // HTTP
  HttpMethod,
  RequestOptions,
  ApiResponse,
  RateLimitInfo,

  // Pagination
  PaginationParams,
  PaginatedList,

  // Messages
  SdkEmailAddress,
  SendMessageParams,
  SdkAttachment,
  Message,
  MessageSearchParams,

  // Domains
  SdkDomain,
  AddDomainParams,
  DomainDnsRecords,
  DnsRecordInstruction,
  DomainDnsResponse,
  DomainDnsRecord,
  DomainHealth,

  // Contacts
  Contact,
  UpsertContactParams,
  ContactListParams,

  // Analytics
  AnalyticsTimeRange,
  AnalyticsGranularity,
  AnalyticsQueryParams,
  DeliveryAnalytics,
  EngagementAnalytics,
  TimeSeriesPoint,

  // Webhooks
  WebhookEventType,
  WebhookEvent,
  WebhookVerifyOptions,
  Webhook,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDelivery,

  // Events
  PlatformEvent,
  EventListParams,

  // Billing
  BillingUsage,
  BillingPlan,

  // Errors
  ApiErrorBody,
} from "@emailed/sdk";
```

---

## Examples

Full runnable examples are in the [`examples/`](./examples) directory:

| Example | Description |
|---------|-------------|
| [`send-email.ts`](./examples/send-email.ts) | Send plain-text and HTML emails, list, search |
| [`domain-setup.ts`](./examples/domain-setup.ts) | Register a domain, configure DNS, verify, health check |
| [`webhook-handler.ts`](./examples/webhook-handler.ts) | Receive and verify webhooks (Hono example) |
| [`analytics-report.ts`](./examples/analytics-report.ts) | Fetch delivery and engagement analytics |
| [`contacts-management.ts`](./examples/contacts-management.ts) | Create, list, update, and unsubscribe contacts |

Run any example:

```bash
EMAILED_API_KEY=em_live_... npx tsx examples/send-email.ts
```

## License

MIT
