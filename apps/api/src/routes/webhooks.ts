import { Hono } from "hono";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { CreateWebhookSchema, UpdateWebhookSchema } from "../types.js";
import type { WebhookRecord, CreateWebhookInput, UpdateWebhookInput } from "../types.js";

const webhooks = new Hono();

// In-memory store for development.
const webhookStore = new Map<string, WebhookRecord>();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// POST /v1/webhooks - Create webhook endpoint
webhooks.post(
  "/",
  requireScope("webhooks:manage"),
  validateBody(CreateWebhookSchema),
  async (c) => {
    const input = getValidatedBody<CreateWebhookInput>(c);
    const id = generateId();
    const now = new Date().toISOString();

    const record: WebhookRecord = {
      id,
      url: input.url,
      events: input.events,
      secret: input.secret,
      description: input.description,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };

    webhookStore.set(id, record);

    // Redact the secret in the response
    const response = { ...record, secret: record.secret ? "••••••••" : undefined };
    return c.json({ data: response }, 201);
  },
);

// GET /v1/webhooks - List all webhooks
webhooks.get(
  "/",
  requireScope("webhooks:manage"),
  async (c) => {
    const records = Array.from(webhookStore.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r, secret: r.secret ? "••••••••" : undefined }));

    return c.json({ data: records });
  },
);

// GET /v1/webhooks/:id - Get webhook details
webhooks.get(
  "/:id",
  requireScope("webhooks:manage"),
  async (c) => {
    const id = c.req.param("id");
    const record = webhookStore.get(id);

    if (!record) {
      return c.json(
        { error: { type: "not_found", message: `Webhook ${id} not found`, code: "webhook_not_found" } },
        404,
      );
    }

    const response = { ...record, secret: record.secret ? "••••••••" : undefined };
    return c.json({ data: response });
  },
);

// PATCH /v1/webhooks/:id - Update webhook
webhooks.patch(
  "/:id",
  requireScope("webhooks:manage"),
  validateBody(UpdateWebhookSchema),
  async (c) => {
    const id = c.req.param("id");
    const record = webhookStore.get(id);

    if (!record) {
      return c.json(
        { error: { type: "not_found", message: `Webhook ${id} not found`, code: "webhook_not_found" } },
        404,
      );
    }

    const updates = getValidatedBody<UpdateWebhookInput>(c);
    const now = new Date().toISOString();

    if (updates.url !== undefined) record.url = updates.url;
    if (updates.events !== undefined) record.events = updates.events;
    if (updates.secret !== undefined) record.secret = updates.secret;
    if (updates.description !== undefined) record.description = updates.description;
    if (updates.active !== undefined) record.active = updates.active;
    record.updatedAt = now;

    const response = { ...record, secret: record.secret ? "••••••••" : undefined };
    return c.json({ data: response });
  },
);

// DELETE /v1/webhooks/:id - Delete webhook
webhooks.delete(
  "/:id",
  requireScope("webhooks:manage"),
  async (c) => {
    const id = c.req.param("id");
    const record = webhookStore.get(id);

    if (!record) {
      return c.json(
        { error: { type: "not_found", message: `Webhook ${id} not found`, code: "webhook_not_found" } },
        404,
      );
    }

    webhookStore.delete(id);
    return c.json({ deleted: true, id });
  },
);

// POST /v1/webhooks/:id/test - Send test event to webhook
webhooks.post(
  "/:id/test",
  requireScope("webhooks:manage"),
  async (c) => {
    const id = c.req.param("id");
    const record = webhookStore.get(id);

    if (!record) {
      return c.json(
        { error: { type: "not_found", message: `Webhook ${id} not found`, code: "webhook_not_found" } },
        404,
      );
    }

    // In production: dispatch a test event to the webhook URL
    const testPayload = {
      id: `evt_test_${generateId()}`,
      type: record.events[0] ?? "delivered",
      timestamp: new Date().toISOString(),
      data: {
        messageId: `msg_test_${generateId()}`,
        recipient: "test@example.com",
      },
    };

    return c.json({
      data: {
        success: true,
        payload: testPayload,
        message: "Test event dispatched",
      },
    });
  },
);

export { webhooks };
