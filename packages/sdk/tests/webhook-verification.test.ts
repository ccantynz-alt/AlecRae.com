import { describe, it, expect } from "bun:test";
import { createHmac } from "node:crypto";
import {
  verifyWebhook,
  verifySignature,
  isWebhookEventType,
  WebhookVerificationError,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "../src/webhooks/verification.js";

/** Helper: compute a valid HMAC signature for a given payload and secret. */
function sign(payload: string, secret: string, timestamp: string): string {
  const signedContent = `${timestamp}.${payload}`;
  return createHmac("sha256", secret).update(signedContent).digest("hex");
}

/** Helper: create a valid webhook payload JSON string. */
function makePayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt_123",
    type: "message.delivered",
    timestamp: new Date().toISOString(),
    data: { messageId: "msg_456" },
    ...overrides,
  });
}

describe("verifyWebhook", () => {
  const secret = "whsec_test_secret_key";

  it("should verify and return a valid webhook event", () => {
    const payload = makePayload();
    const parsed = JSON.parse(payload);
    const signature = sign(payload, secret, parsed.timestamp);

    const event = verifyWebhook({ payload, signature, secret });
    expect(event.id).toBe("evt_123");
    expect(event.type).toBe("message.delivered");
  });

  it("should accept a Buffer payload", () => {
    const payload = makePayload();
    const parsed = JSON.parse(payload);
    const signature = sign(payload, secret, parsed.timestamp);

    const event = verifyWebhook({
      payload: Buffer.from(payload),
      signature,
      secret,
    });
    expect(event.id).toBe("evt_123");
  });

  it("should throw on an invalid signature", () => {
    const payload = makePayload();
    expect(() =>
      verifyWebhook({ payload, signature: "bad_signature", secret }),
    ).toThrow(WebhookVerificationError);
  });

  it("should throw on an expired event beyond the tolerance window", () => {
    const oldTimestamp = new Date(Date.now() - 600_000).toISOString(); // 10 minutes ago
    const payload = makePayload({ timestamp: oldTimestamp });
    const signature = sign(payload, secret, oldTimestamp);

    expect(() =>
      verifyWebhook({ payload, signature, secret, tolerance: 300 }),
    ).toThrow("too old");
  });

  it("should accept events within a custom tolerance window", () => {
    const recentTimestamp = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
    const payload = makePayload({ timestamp: recentTimestamp });
    const signature = sign(payload, secret, recentTimestamp);

    const event = verifyWebhook({ payload, signature, secret, tolerance: 120 });
    expect(event.timestamp).toBe(recentTimestamp);
  });

  it("should throw on invalid JSON payload", () => {
    expect(() =>
      verifyWebhook({ payload: "not json", signature: "abc", secret }),
    ).toThrow("could not parse JSON");
  });

  it("should throw on payload missing timestamp", () => {
    const payload = JSON.stringify({ id: "evt_1", type: "test" });
    const signature = sign(payload, secret, "");

    expect(() =>
      verifyWebhook({ payload, signature, secret }),
    ).toThrow("missing timestamp");
  });

  it("should throw when signature length differs from expected", () => {
    const payload = makePayload();
    // Signature that is obviously wrong length
    expect(() =>
      verifyWebhook({ payload, signature: "abc", secret }),
    ).toThrow(WebhookVerificationError);
  });
});

describe("verifySignature", () => {
  const secret = "test_secret";
  const timestamp = "2026-04-03T12:00:00Z";

  it("should return true for a valid signature", () => {
    const payload = '{"data":"test"}';
    const sig = sign(payload, secret, timestamp);
    expect(verifySignature(payload, sig, secret, timestamp)).toBe(true);
  });

  it("should return false for an invalid signature", () => {
    expect(verifySignature("data", "invalid_hex", secret, timestamp)).toBe(false);
  });

  it("should return false when the payload has been tampered with", () => {
    const payload = '{"data":"original"}';
    const sig = sign(payload, secret, timestamp);
    expect(verifySignature('{"data":"tampered"}', sig, secret, timestamp)).toBe(false);
  });

  it("should return false when using the wrong secret", () => {
    const payload = '{"data":"test"}';
    const sig = sign(payload, secret, timestamp);
    expect(verifySignature(payload, sig, "wrong_secret", timestamp)).toBe(false);
  });
});

describe("isWebhookEventType", () => {
  it("should return true for valid event types", () => {
    expect(isWebhookEventType("message.sent")).toBe(true);
    expect(isWebhookEventType("message.delivered")).toBe(true);
    expect(isWebhookEventType("message.bounced")).toBe(true);
    expect(isWebhookEventType("domain.verified")).toBe(true);
    expect(isWebhookEventType("contact.unsubscribed")).toBe(true);
  });

  it("should return false for invalid event types", () => {
    expect(isWebhookEventType("invalid.type")).toBe(false);
    expect(isWebhookEventType("")).toBe(false);
    expect(isWebhookEventType("message")).toBe(false);
  });
});

describe("constants", () => {
  it("should export the correct header names", () => {
    expect(SIGNATURE_HEADER).toBe("x-emailed-signature");
    expect(TIMESTAMP_HEADER).toBe("x-emailed-timestamp");
  });
});
