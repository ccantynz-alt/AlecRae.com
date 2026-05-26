/**
 * Email Event Tracking Routes
 *
 * GET /t/:emailId/open.gif  — 1x1 transparent tracking pixel for open detection
 * GET /t/:emailId/click     — Click redirect with tracking
 * POST /v1/events           — Record a custom event (webhook dispatch trigger)
 *
 * These endpoints are intentionally unauthenticated (they are embedded in emails).
 * The emailId serves as a token — it's opaque to the recipient.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDatabase, emails, events } from "@alecrae/db";
import { enqueueWebhookDelivery } from "../lib/webhook-dispatcher.js";

const tracking = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 1x1 transparent GIF (43 bytes)
const TRACKING_PIXEL = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

/**
 * Record an event and trigger webhook dispatch (fire-and-forget).
 */
async function recordEvent(
  emailId: string,
  eventType: string,
  extra: { url?: string; userAgent?: string; ipAddress?: string } = {},
): Promise<void> {
  const db = getDatabase();

  // Look up the email to get account context
  const [emailRecord] = await db
    .select({
      id: emails.id,
      accountId: emails.accountId,
      messageId: emails.messageId,
      tags: emails.tags,
    })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!emailRecord) return;

  const eventId = generateId();

  // Write the event
  await db.insert(events).values({
    id: eventId,
    accountId: emailRecord.accountId,
    emailId: emailRecord.id,
    messageId: emailRecord.messageId,
    type: eventType as "email.opened",
    tags: emailRecord.tags,
    url: extra.url ?? null,
    userAgent: extra.userAgent ?? null,
    ipAddress: extra.ipAddress ?? null,
  });

  // Enqueue webhook delivery via BullMQ (reliable, with retries and audit trail)
  enqueueWebhookDelivery(eventId, emailRecord.accountId).catch((err) => {
    console.error(`[tracking] Webhook enqueue failed: ${err}`);
  });
}


// ─── Open Tracking Pixel ───────────────────────────────────────────────────

tracking.get("/:emailId/open.gif", async (c) => {
  const emailId = c.req.param("emailId");
  const userAgent = c.req.header("User-Agent") ?? "";
  const ip =
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    c.req.header("X-Real-IP") ??
    "";

  // Record event asynchronously — don't delay pixel response
  recordEvent(emailId, "email.opened", {
    userAgent,
    ipAddress: ip,
  }).catch(() => { /* fire-and-forget */ });

  return new Response(TRACKING_PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRACKING_PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
});

// ─── Click Tracking Redirect ───────────────────────────────────────────────

tracking.get("/:emailId/click", async (c) => {
  const emailId = c.req.param("emailId");
  const targetUrl = c.req.query("url");
  const userAgent = c.req.header("User-Agent") ?? "";
  const ip =
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    c.req.header("X-Real-IP") ??
    "";

  if (!targetUrl) {
    return c.text("Missing url parameter", 400);
  }

  // Validate URL to prevent open redirect
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return c.text("Invalid URL protocol", 400);
    }
  } catch {
    return c.text("Invalid URL", 400);
  }

  // Record event asynchronously
  recordEvent(emailId, "email.clicked", {
    url: targetUrl,
    userAgent,
    ipAddress: ip,
  }).catch(() => { /* fire-and-forget */ });

  return c.redirect(targetUrl, 302);
});

// ─── One-Click Unsubscribe (RFC 8058) ──────────────────────────────────────

tracking.post("/:emailId/unsubscribe", async (c) => {
  const emailId = c.req.param("emailId");
  const db = getDatabase();

  // Look up the email to find the sender domain
  const [emailRecord] = await db
    .select({
      id: emails.id,
      fromAddress: emails.fromAddress,
      accountId: emails.accountId,
    })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!emailRecord) {
    return c.text("Not found", 404);
  }

  // Record unsubscribe event
  recordEvent(emailId, "email.unsubscribed", {
    ipAddress:
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      c.req.header("X-Real-IP") ??
      "",
  }).catch(() => { /* fire-and-forget */ });

  return c.text("Unsubscribed", 200);
});

// GET version for browser-based unsubscribe links
tracking.get("/:emailId/unsubscribe", async (c) => {
  const emailId = c.req.param("emailId");

  // Simple confirmation page
  return c.html(`<!DOCTYPE html>
<html><head><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
<h1>You have been unsubscribed</h1>
<p>You will no longer receive emails from this sender.</p>
<form method="POST" action="/t/${emailId}/unsubscribe">
<button type="submit" style="padding:12px 24px;font-size:16px;cursor:pointer">
Confirm Unsubscribe
</button>
</form>
</body></html>`);
});

export { tracking, recordEvent };
