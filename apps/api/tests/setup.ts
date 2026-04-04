/**
 * Shared test setup — mocks external services and provides helpers
 * for building isolated Hono test apps.
 *
 * Every test file that imports from this module gets:
 *   - A mock database (chainable query builder)
 *   - Mock BullMQ queue
 *   - Mock external service modules (@emailed/shared, @emailed/dns, @emailed/reputation)
 *   - Helper to create an authenticated Hono app with routes mounted
 *   - Helper to make authenticated requests
 */

import { vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AuthContext } from "../src/middleware/auth.js";

// ─── Mock database ─────────────────────────────────────────────────────────

export function createMockDb() {
  const db: Record<string, any> = {};

  // Every chain method returns `db` for chaining. The db object is "thenable"
  // so `await db.select().from().where()...` always resolves via `.then()`.
  // Use `mockDb.then.mockImplementationOnce((r) => r(data))` to control
  // what each sequential `await db...` resolves to in a route handler.
  db.select = vi.fn().mockReturnValue(db);
  db.from = vi.fn().mockReturnValue(db);
  db.where = vi.fn().mockReturnValue(db);
  db.limit = vi.fn().mockReturnValue(db);
  db.offset = vi.fn().mockReturnValue(db);
  db.orderBy = vi.fn().mockReturnValue(db);
  db.groupBy = vi.fn().mockReturnValue(db);
  db.insert = vi.fn().mockReturnValue(db);
  db.values = vi.fn().mockReturnValue(db);
  db.onConflictDoNothing = vi.fn().mockReturnValue(db);
  db.update = vi.fn().mockReturnValue(db);
  db.set = vi.fn().mockReturnValue(db);
  db.delete = vi.fn().mockReturnValue(db);
  db.catch = vi.fn().mockReturnValue(db);

  // Thenable: every `await db.chain...` resolves to [] by default.
  // Override with mockImplementationOnce to return specific data per query.
  db.then = vi.fn().mockImplementation((resolve: any) => resolve([]));

  return db;
}

export const mockDb = createMockDb();

// ─── Mock all external modules ─────────────────────────────────────────────

// Database
vi.mock("@emailed/db", () => ({
  getDatabase: () => mockDb,
  closeConnection: vi.fn(),
  emails: {
    id: "id",
    accountId: "account_id",
    domainId: "domain_id",
    messageId: "message_id",
    fromAddress: "from_address",
    fromName: "from_name",
    toAddresses: "to_addresses",
    ccAddresses: "cc_addresses",
    bccAddresses: "bcc_addresses",
    replyToAddress: "reply_to_address",
    replyToName: "reply_to_name",
    subject: "subject",
    textBody: "text_body",
    htmlBody: "html_body",
    customHeaders: "custom_headers",
    status: "status",
    tags: "tags",
    sentAt: "sent_at",
    scheduledAt: "scheduled_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    emailsSentThisPeriod: "emails_sent_this_period",
  },
  deliveryResults: {
    id: "id",
    emailId: "email_id",
    recipientAddress: "recipient_address",
    status: "status",
    mxHost: "mx_host",
    remoteResponseCode: "remote_response_code",
    remoteResponse: "remote_response",
    attemptCount: "attempt_count",
    deliveredAt: "delivered_at",
    nextRetryAt: "next_retry_at",
  },
  domains: {
    id: "id",
    domain: "domain",
    accountId: "account_id",
    dkimSelector: "dkim_selector",
    verificationStatus: "verification_status",
    spfVerified: "spf_verified",
    dkimVerified: "dkim_verified",
    dmarcVerified: "dmarc_verified",
    returnPathVerified: "return_path_verified",
    isActive: "is_active",
    isDefault: "is_default",
    createdAt: "created_at",
    updatedAt: "updated_at",
    verifiedAt: "verified_at",
    verificationAttempts: "verification_attempts",
  },
  accounts: {
    id: "id",
    planTier: "plan_tier",
    emailsSentThisPeriod: "emails_sent_this_period",
    updatedAt: "updated_at",
  },
  webhooks: {
    id: "id",
    accountId: "account_id",
    url: "url",
    secret: "secret",
    eventTypes: "event_types",
    isActive: "is_active",
    description: "description",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  webhookDeliveries: {
    id: "id",
    webhookId: "webhook_id",
    eventId: "event_id",
    statusCode: "status_code",
    responseBody: "response_body",
    attemptCount: "attempt_count",
    success: "success",
    nextRetryAt: "next_retry_at",
    createdAt: "created_at",
  },
  events: {
    id: "id",
    accountId: "account_id",
    type: "type",
    messageId: "message_id",
    emailId: "email_id",
    recipient: "recipient",
    bounceType: "bounce_type",
    bounceCategory: "bounce_category",
    diagnosticCode: "diagnostic_code",
    remoteMta: "remote_mta",
    smtpResponse: "smtp_response",
    timestamp: "timestamp",
  },
  templates: {
    id: "id",
    accountId: "account_id",
    name: "name",
    description: "description",
    category: "category",
    subject: "subject",
    htmlBody: "html_body",
    textBody: "text_body",
    variables: "variables",
    version: "version",
    isActive: "is_active",
    createdAt: "created_at",
    updatedAt: "updated_at",
    $inferSelect: {} as any,
  },
  suppressionLists: {
    id: "id",
    email: "email",
    domainId: "domain_id",
    reason: "reason",
    createdAt: "created_at",
  },
  dnsRecords: {
    id: "id",
    domainId: "domain_id",
    type: "type",
    name: "name",
    value: "value",
    ttl: "ttl",
    priority: "priority",
    verified: "verified",
    lastCheckedAt: "last_checked_at",
    purpose: "purpose",
  },
  apiKeys: {
    id: "id",
    accountId: "account_id",
    keyHash: "key_hash",
    isActive: "is_active",
    revokedAt: "revoked_at",
    expiresAt: "expires_at",
    lastUsedAt: "last_used_at",
    permissions: "permissions",
    environment: "environment",
  },
}));

// BullMQ
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "job_1" }),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
    on: vi.fn(),
  })),
}));

// Shared module (Meilisearch, telemetry, search)
vi.mock("@emailed/shared", () => ({
  indexEmail: vi.fn().mockResolvedValue(undefined),
  searchEmails: vi.fn().mockResolvedValue({
    hits: [],
    totalHits: 0,
    processingTimeMs: 1,
    query: "",
  }),
  initSearchIndex: vi.fn().mockResolvedValue(undefined),
  initTelemetry: vi.fn().mockResolvedValue(undefined),
  shutdownTelemetry: vi.fn().mockResolvedValue(undefined),
  telemetryMiddleware: () => async (_c: any, next: any) => next(),
}));

// DNS module
vi.mock("@emailed/dns", () => ({
  generateDomainConfig: vi.fn().mockResolvedValue({
    domainId: "dom_test_001",
    domain: "example.com",
    dkimSelector: "emailed1",
    records: [
      {
        type: "TXT",
        name: "example.com",
        value: "v=spf1 include:_spf.emailed.dev ~all",
        ttl: 3600,
        priority: null,
        verified: false,
        purpose: "spf",
      },
    ],
  }),
  verifyDomainConfig: vi.fn().mockResolvedValue({
    overall: "pending",
    spf: "pending",
    dkim: "pending",
    dmarc: "pending",
    mx: "pending",
    returnPath: "pending",
  }),
  checkDomainHealth: vi.fn().mockResolvedValue({
    domain: "example.com",
    score: 85,
    dkimKeyAge: 30,
    dkimRotationNeeded: false,
    spfLookupCount: 3,
    spfTooManyLookups: false,
    recommendations: [],
    verification: {
      overall: "verified",
      spf: "verified",
      dkim: "verified",
      dmarc: "verified",
      mx: "verified",
      returnPath: "verified",
    },
  }),
  rotateDkimKey: vi.fn().mockResolvedValue({
    oldSelector: "emailed1",
    newSelector: "emailed2",
    dnsRecord: {
      type: "TXT",
      name: "emailed2._domainkey.example.com",
      value: "v=DKIM1; k=rsa; p=MIGfMA0...",
      ttl: 3600,
    },
  }),
}));

// Reputation / warmup
vi.mock("@emailed/reputation", () => ({
  getWarmupOrchestrator: () => ({
    canSend: vi.fn().mockResolvedValue({ allowed: true }),
    recordSend: vi.fn().mockResolvedValue(undefined),
    getSchedule: vi.fn().mockResolvedValue(null),
    startWarmup: vi.fn().mockResolvedValue({ success: true }),
    pauseWarmup: vi.fn().mockResolvedValue({ success: true }),
    adjustSchedule: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

// Webhook dispatcher
vi.mock("../src/lib/webhook-dispatcher.js", () => ({
  startWebhookWorker: vi.fn(),
  stopWebhookWorker: vi.fn(),
  enqueueWebhookDelivery: vi.fn().mockResolvedValue(undefined),
  enqueueWebhookDeliveryForWebhook: vi.fn().mockResolvedValue(undefined),
}));

// Queue
vi.mock("../src/lib/queue.js", () => ({
  getSendQueue: () => ({
    add: vi.fn().mockResolvedValue({ id: "job_1" }),
    close: vi.fn(),
  }),
  closeSendQueue: vi.fn(),
}));

// Billing / usage enforcement
vi.mock("../src/lib/billing.js", () => ({
  checkUsageLimit: vi.fn().mockResolvedValue({
    allowed: true,
    used: 0,
    limit: 10000,
    remaining: 10000,
  }),
  PLANS: {
    free: { sendLimit: 100 },
    starter: { sendLimit: 5000 },
    pro: { sendLimit: 50000 },
    enterprise: { sendLimit: 1_000_000 },
  },
}));

// Rate limit (use passthrough for tests)
vi.mock("../src/middleware/rate-limit.js", () => {
  const passthrough = async (_c: any, next: any) => next();
  return {
    globalIpRateLimit: passthrough,
    authRateLimit: passthrough,
    sendRateLimit: passthrough,
    readRateLimit: passthrough,
    writeRateLimit: passthrough,
    webhookRateLimit: passthrough,
    searchRateLimit: passthrough,
    closeRateLimitRedis: vi.fn(),
  };
});

// Template engine — use the real implementation (pure functions, no IO)
// But mock the type import it uses from @emailed/db
vi.mock("@emailed/db/src/schema/templates.js", () => ({}));

// ─── Reset mock DB state before each test ──────────────────────────────────

beforeEach(() => {
  // Reset all mock call counts but keep default implementations
  vi.clearAllMocks();
  resetMockDb();
});

export function resetMockDb() {
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);
  mockDb.limit.mockReturnValue(mockDb);
  mockDb.offset.mockReturnValue(mockDb);
  mockDb.orderBy.mockReturnValue(mockDb);
  mockDb.groupBy.mockReturnValue(mockDb);
  mockDb.insert.mockReturnValue(mockDb);
  mockDb.values.mockReturnValue(mockDb);
  mockDb.onConflictDoNothing.mockReturnValue(mockDb);
  mockDb.update.mockReturnValue(mockDb);
  mockDb.set.mockReturnValue(mockDb);
  mockDb.delete.mockReturnValue(mockDb);
  mockDb.catch.mockReturnValue(mockDb);
  mockDb.then.mockImplementation((resolve: any) => resolve([]));
}

/**
 * Helper to set up sequential query results for a route handler
 * that makes multiple DB queries. Each call to `mockQuery(data)`
 * adds the data as the next `await db.chain...` result.
 *
 * Usage:
 *   mockQuery([domainRecord]);       // first await
 *   mockQuery(deliveryResults);      // second await
 *   mockQuery([]);                   // third await (empty)
 */
export function mockQuery(data: unknown) {
  mockDb.then.mockImplementationOnce((resolve: any) => resolve(data));
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export const TEST_ACCOUNT_ID = "acct_test_123";
export const TEST_KEY_ID = "key_test_123";

export const DEFAULT_AUTH: AuthContext = {
  accountId: TEST_ACCOUNT_ID,
  keyId: TEST_KEY_ID,
  tier: "pro",
  scopes: [
    "messages:send",
    "messages:read",
    "domains:manage",
    "webhooks:manage",
    "analytics:read",
    "templates:manage",
    "suppressions:manage",
    "account:manage",
    "api_keys:manage",
  ],
};

/**
 * Create a test Hono app with auth middleware that injects the given context.
 */
export function createTestApp(auth: AuthContext = DEFAULT_AUTH): Hono {
  const app = new Hono();

  // Skip auth — inject directly
  app.use("*", async (c, next) => {
    c.set("auth" as never, auth as never);
    await next();
  });

  return app;
}

/**
 * Helper to send a JSON request to a Hono app (via app.request).
 */
export function jsonRequest(
  app: Hono,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
) {
  const { method = "GET", body, headers = {}, query } = options;

  let url = path;
  if (query) {
    const params = new URLSearchParams(query);
    url = `${path}?${params.toString()}`;
  }

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return app.request(url, init);
}
