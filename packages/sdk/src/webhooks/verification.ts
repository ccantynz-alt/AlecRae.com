/**
 * Webhook signature verification for securing inbound webhook deliveries.
 *
 * The AlecRae platform signs webhook payloads using HMAC-SHA256. This module
 * provides utilities to verify those signatures and parse event payloads.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { WebhookEvent, WebhookVerifyOptions, WebhookEventType } from "../types.js";

/** Default maximum event age in seconds (5 minutes). */
const DEFAULT_TOLERANCE_SECONDS = 300;

/** Header name containing the webhook signature. */
export const SIGNATURE_HEADER = "x-alecrae-signature";

/** Header name containing the event timestamp. */
export const TIMESTAMP_HEADER = "x-alecrae-timestamp";

/**
 * Error thrown when webhook verification fails.
 */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Compute the expected HMAC-SHA256 signature for a webhook payload.
 *
 * The signed content is `<timestamp>.<payload>` to prevent replay attacks.
 *
 * @param payload    Raw request body
 * @param secret     Webhook signing secret
 * @param timestamp  Event timestamp string
 * @returns Hex-encoded HMAC signature
 */
function computeSignature(
  payload: string,
  secret: string,
  timestamp: string,
): string {
  const signedContent = `${timestamp}.${payload}`;
  return createHmac("sha256", secret).update(signedContent).digest("hex");
}

/**
 * Verify a webhook signature and return the parsed event.
 *
 * Checks that:
 * 1. The signature matches the expected HMAC-SHA256 digest (constant-time).
 * 2. The event timestamp is within the tolerance window.
 *
 * @param options  Verification parameters
 * @returns The parsed webhook event
 * @throws {WebhookVerificationError} If the signature is invalid or the event is too old
 */
export function verifyWebhook<T = unknown>(
  options: WebhookVerifyOptions,
): WebhookEvent<T> {
  const { payload, signature, secret, tolerance = DEFAULT_TOLERANCE_SECONDS } = options;

  const payloadString = typeof payload === "string" ? payload : payload.toString("utf8");

  // Parse the payload to extract the timestamp
  let event: WebhookEvent<T>;
  try {
    event = JSON.parse(payloadString) as WebhookEvent<T>;
  } catch {
    throw new WebhookVerificationError("Invalid webhook payload: could not parse JSON");
  }

  if (!event.timestamp) {
    throw new WebhookVerificationError("Invalid webhook payload: missing timestamp");
  }

  // Verify timestamp freshness
  const eventTime = new Date(event.timestamp).getTime();
  const now = Date.now();
  const ageSeconds = Math.abs(now - eventTime) / 1000;

  if (ageSeconds > tolerance) {
    throw new WebhookVerificationError(
      `Webhook event too old: ${Math.round(ageSeconds)}s exceeds tolerance of ${tolerance}s`,
    );
  }

  // Compute and compare signature
  const expectedSignature = computeSignature(payloadString, secret, event.timestamp);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    throw new WebhookVerificationError("Webhook signature verification failed");
  }

  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new WebhookVerificationError("Webhook signature verification failed");
  }

  return event;
}

/**
 * Verify only the signature without parsing the event or checking age.
 *
 * Useful when you need to verify authenticity but handle parsing separately.
 *
 * @param payload    Raw request body
 * @param signature  Signature from the `X-AlecRae-Signature` header
 * @param secret     Webhook signing secret
 * @param timestamp  Timestamp from the `X-AlecRae-Timestamp` header
 * @returns `true` if the signature is valid
 */
export function verifySignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  timestamp: string,
): boolean {
  const payloadString = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = computeSignature(payloadString, secret, timestamp);

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Type guard to check if a string is a valid webhook event type.
 */
export function isWebhookEventType(value: string): value is WebhookEventType {
  const validTypes: ReadonlySet<string> = new Set<string>([
    "message.sent",
    "message.delivered",
    "message.bounced",
    "message.deferred",
    "message.dropped",
    "message.complained",
    "message.opened",
    "message.clicked",
    "domain.verified",
    "domain.failed",
    "contact.subscribed",
    "contact.unsubscribed",
  ]);

  return validTypes.has(value);
}
