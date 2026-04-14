/**
 * Example: Receive and verify AlecRae webhooks using Hono.
 *
 * This handler verifies the HMAC-SHA256 signature on every inbound
 * webhook event before processing it, preventing replay and tampering
 * attacks.
 *
 * Run:
 *   WEBHOOK_SECRET=whsec_... npx tsx examples/webhook-handler.ts
 *
 * Works with any framework that gives you access to the raw request body.
 * The example below uses Hono, but adapting to Express, Fastify, or
 * plain Node.js `http.createServer` is straightforward.
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  verifyWebhook,
  WebhookVerificationError,
  SIGNATURE_HEADER,
  isWebhookEventType,
} from "@alecrae/sdk";
import type { WebhookEvent } from "@alecrae/sdk";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

const app = new Hono();

app.post("/webhooks/alecrae", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header(SIGNATURE_HEADER);

  if (!signature) {
    return c.json({ error: "Missing signature header" }, 401);
  }

  // Verify the signature and parse the event in one step.
  // Throws WebhookVerificationError if the signature is invalid
  // or the event is older than 5 minutes (the default tolerance).
  let event: WebhookEvent;
  try {
    event = verifyWebhook({
      payload: rawBody,
      signature,
      secret: WEBHOOK_SECRET,
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn("Webhook verification failed:", err.message);
      return c.json({ error: "Invalid signature" }, 401);
    }
    throw err;
  }

  console.log(`Received event: ${event.type} (${event.id})`);

  // Route the event to the appropriate handler
  if (!isWebhookEventType(event.type)) {
    console.warn(`Unknown event type: ${event.type}`);
    return c.json({ received: true });
  }

  switch (event.type) {
    case "message.delivered":
      console.log("Email delivered:", event.data);
      // Update your database, trigger follow-up workflows, etc.
      break;

    case "message.bounced":
      console.log("Email bounced:", event.data);
      // Mark the address as invalid, notify your team, etc.
      break;

    case "message.opened":
      console.log("Email opened:", event.data);
      break;

    case "message.clicked":
      console.log("Link clicked:", event.data);
      break;

    case "message.complained":
      console.log("Spam complaint received:", event.data);
      // Unsubscribe the recipient immediately
      break;

    case "domain.verified":
      console.log("Domain verified:", event.data);
      break;

    case "domain.failed":
      console.log("Domain verification failed:", event.data);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`, event.data);
  }

  // Always acknowledge receipt promptly. Process heavy work asynchronously.
  return c.json({ received: true });
});

const PORT = parseInt(process.env.PORT ?? "3100", 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Webhook receiver listening on http://localhost:${info.port}`);
});
