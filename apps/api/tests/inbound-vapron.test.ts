/**
 * Vapron inbound webhook — issue #171 (AlecRae ⇄ Vapron mail integration).
 *
 * Proves the HMAC verify path against the ACTUAL signing scheme
 * (`HMAC-SHA256(`${timestamp}.${rawBody}`)`, hex) rather than a self-referential
 * mock, plus the account resolution + store mapping, and every status the
 * contract with Vapron's retrying sink bridge depends on.
 *
 * `storeReceivedEmail` and the DB domain lookup are mocked — this is the
 * adapter, not the store.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { ReceivedEmailInput } from "../src/lib/received-email-store.js";

const SECRET = "vapron-shared-inbound-secret-value";

// ── Mocked collaborators ────────────────────────────────────────────────────
let storeCallCount = 0;
let lastStoreInput: ReceivedEmailInput | null = null;
let storeResult: { stored: boolean; id: string | null } = { stored: true, id: "em_1" };
let storeThrows = false;

vi.mock("../src/lib/received-email-store.js", () => ({
  storeReceivedEmail: vi.fn(async (input: ReceivedEmailInput) => {
    storeCallCount++;
    lastStoreInput = input;
    if (storeThrows) throw new Error("store down");
    return storeResult;
  }),
}));

let domainRows: { accountId: string; domainId: string; domain: string }[] = [];
let domainLookupThrows = false;

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => {
        if (domainLookupThrows) return Promise.reject(new Error("db down"));
        return Promise.resolve(domainRows);
      },
    }),
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

// Static import is fine — vi.mock calls are hoisted above it.
import { inboundVapron } from "../src/routes/inbound-vapron.js";

// ── Helpers ─────────────────────────────────────────────────────────────────
function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function sign(secret: string, timestamp: number | string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function signedHeaders(
  secret: string,
  timestamp: number | string,
  body: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-vapron-signature": sign(secret, timestamp, body),
    "x-vapron-timestamp": String(timestamp),
    "x-vapron-event-type": "inbound.email.received",
    "x-vapron-route-id": "route_1",
    "user-agent": "vapron-email-receive/1.0",
  };
}

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "inbound.email.received",
    tenantId: "davenroe.com",
    routeId: "route_1",
    receivedAt: "2026-08-08T10:00:00.000Z",
    envelope: {
      mailFrom: "sender@example.com",
      rcptTo: ["info@davenroe.com"],
      remoteAddress: "203.0.113.9",
      tls: true,
    },
    authentication: { spf: "pass", dkim: "pass" },
    message: {
      messageId: "<abc@example.com>",
      from: { address: "sender@example.com", name: "Sender" },
      to: [{ address: "info@davenroe.com" }],
      cc: [],
      subject: "Hello there",
      date: "2026-08-08T10:00:00.000Z",
      references: [],
      textBody: "the body text",
    },
    attachments: [],
    ...over,
  };
}

function post(body: string, headers: Record<string, string>): Promise<Response> {
  return inboundVapron.request("/vapron", { method: "POST", headers, body });
}

describe("Vapron inbound webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeCallCount = 0;
    lastStoreInput = null;
    storeResult = { stored: true, id: "em_1" };
    storeThrows = false;
    domainLookupThrows = false;
    domainRows = [{ accountId: "acct_1", domainId: "dom_1", domain: "davenroe.com" }];
    process.env["INBOUND_WEBHOOK_SECRET"] = SECRET;
  });

  it("stores a valid, freshly-signed message mapped to the resolved account", async () => {
    const body = JSON.stringify(payload());
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(200);
    expect(storeCallCount).toBe(1);
    expect(lastStoreInput).not.toBeNull();
    const input = lastStoreInput as ReceivedEmailInput;
    expect(input.accountId).toBe("acct_1");
    expect(input.source).toBe("inbound");
    expect(input.backfill).toBe(false);
    expect(input.from.address).toBe("sender@example.com");
    expect(input.subject).toBe("Hello there");
    expect(input.textBody).toBe("the body text");
    expect(input.messageId).toBe("<abc@example.com>");
    expect(input.to[0]?.address).toBe("info@davenroe.com");
  });

  it("rejects a bad signature with 401 and stores nothing", async () => {
    const body = JSON.stringify(payload());
    const headers = signedHeaders(SECRET, nowSec(), body);
    headers["x-vapron-signature"] = sign("wrong-secret", nowSec(), body);

    const res = await post(body, headers);

    expect(res.status).toBe(401);
    expect(storeCallCount).toBe(0);
  });

  it("rejects a non-hex signature with 401 without throwing", async () => {
    const body = JSON.stringify(payload());
    const headers = signedHeaders(SECRET, nowSec(), body);
    headers["x-vapron-signature"] = "not-a-hex-signature!!";

    const res = await post(body, headers);

    expect(res.status).toBe(401);
    expect(storeCallCount).toBe(0);
  });

  it("rejects a stale timestamp with 401 even when the signature matches it", async () => {
    const stale = nowSec() - 400; // > 300s window
    const body = JSON.stringify(payload());
    // Signed correctly for the stale timestamp — the replay guard must still bite.
    const res = await post(body, signedHeaders(SECRET, stale, body));

    expect(res.status).toBe(401);
    expect(storeCallCount).toBe(0);
  });

  it("rejects missing signature/timestamp headers with 401", async () => {
    const body = JSON.stringify(payload());
    const res = await post(body, { "content-type": "application/json" });

    expect(res.status).toBe(401);
    expect(storeCallCount).toBe(0);
  });

  it("returns 503 when the secret is unset (fail closed)", async () => {
    delete process.env["INBOUND_WEBHOOK_SECRET"];
    const body = JSON.stringify(payload());
    // Sign with something — it can't matter, the endpoint refuses before verifying.
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(503);
    expect(storeCallCount).toBe(0);
  });

  it("returns 400 for a body that is not valid JSON", async () => {
    const body = "this is not json";
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(400);
    expect(storeCallCount).toBe(0);
  });

  it("returns 400 for a schema-invalid payload", async () => {
    // Valid JSON, valid signature, but missing required `envelope`/`message`.
    const body = JSON.stringify({ type: "inbound.email.received", tenantId: "davenroe.com" });
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(400);
    expect(storeCallCount).toBe(0);
  });

  it("accepts and drops (200) when no hosted domain matches — no infinite retry", async () => {
    domainRows = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = JSON.stringify(payload());
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(200);
    expect(storeCallCount).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns 502 (retryable) when the store throws — mail is not lost", async () => {
    storeThrows = true;
    const body = JSON.stringify(payload());
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(502);
    expect(storeCallCount).toBe(1);
  });

  it("returns 502 (retryable) when domain resolution errors", async () => {
    domainLookupThrows = true;
    const body = JSON.stringify(payload());
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(502);
    expect(storeCallCount).toBe(0);
  });

  it("prefers the tenantId domain when several recipients are hosted", async () => {
    domainRows = [
      { accountId: "acct_other", domainId: "dom_other", domain: "other.com" },
      { accountId: "acct_1", domainId: "dom_1", domain: "davenroe.com" },
    ];
    const body = JSON.stringify(
      payload({
        message: {
          messageId: "<multi@example.com>",
          from: { address: "sender@example.com" },
          to: [{ address: "info@davenroe.com" }, { address: "x@other.com" }],
          cc: [],
          subject: "multi",
          date: "2026-08-08T10:00:00.000Z",
          references: [],
          textBody: "b",
        },
      }),
    );
    const res = await post(body, signedHeaders(SECRET, nowSec(), body));

    expect(res.status).toBe(200);
    expect((lastStoreInput as ReceivedEmailInput).accountId).toBe("acct_1");
  });
});
