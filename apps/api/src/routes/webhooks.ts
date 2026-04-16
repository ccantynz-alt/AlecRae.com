import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { CreateWebhookSchema, UpdateWebhookSchema } from "../types.js";
import type { CreateWebhookInput, UpdateWebhookInput } from "../types.js";
import {
  getDatabase,
  webhooks as webhooksTable,
  webhookDeliveries,
  events,
} from "@alecrae/db";
import { enqueueWebhookDeliveryForWebhook } from "../lib/webhook-dispatcher.js";

const webhooks = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
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
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const secret = input.secret ?? generateSecret();
    const now = new Date();

    await db.insert(webhooksTable).values({
      id,
      accountId: auth.accountId,
      url: input.url,
      secret,
      eventTypes: input.events,
      isActive: input.active ?? true,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          url: input.url,
          events: input.events,
          secret: "whsec_••••••••",
          description: input.description ?? null,
          active: input.active ?? true,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/webhooks - List all webhooks
webhooks.get("/", requireScope("webhooks:manage"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const rows = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.accountId, auth.accountId))
    .orderBy(desc(webhooksTable.createdAt));

  const data = rows.map((r) => ({
    id: r.id,
    url: r.url,
    events: r.eventTypes,
    secret: "whsec_••••••••",
    description: r.description,
    active: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return c.json({ data });
});

// GET /v1/webhooks/:id - Get webhook details
webhooks.get("/:id", requireScope("webhooks:manage"), async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  const db = getDatabase();

  const [record] = await db
    .select()
    .from(webhooksTable)
    .where(
      and(eq(webhooksTable.id, id), eq(webhooksTable.accountId, auth.accountId)),
    )
    .limit(1);

  if (!record) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: `Webhook ${id} not found`,
          code: "webhook_not_found",
        },
      },
      404,
    );
  }

  return c.json({
    data: {
      id: record.id,
      url: record.url,
      events: record.eventTypes,
      secret: "whsec_••••••••",
      description: record.description,
      active: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    },
  });
});

// PATCH /v1/webhooks/:id - Update webhook
webhooks.patch(
  "/:id",
  requireScope("webhooks:manage"),
  validateBody(UpdateWebhookSchema),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();
    const updates = getValidatedBody<UpdateWebhookInput>(c);

    const [existing] = await db
      .select({ id: webhooksTable.id })
      .from(webhooksTable)
      .where(
        and(
          eq(webhooksTable.id, id),
          eq(webhooksTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Webhook ${id} not found`,
            code: "webhook_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const setValues: Record<string, unknown> = { updatedAt: now };
    if (updates.url !== undefined) setValues["url"] = updates.url;
    if (updates.events !== undefined) setValues["eventTypes"] = updates.events;
    if (updates.secret !== undefined) setValues["secret"] = updates.secret;
    if (updates.description !== undefined)
      setValues["description"] = updates.description;
    if (updates.active !== undefined) setValues["isActive"] = updates.active;

    await db
      .update(webhooksTable)
      .set(setValues)
      .where(eq(webhooksTable.id, id));

    const [updated] = await db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.id, id))
      .limit(1);

    if (!updated) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Webhook ${id} not found after update`,
            code: "webhook_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: updated.id,
        url: updated.url,
        events: updated.eventTypes,
        secret: "whsec_••••••••",
        description: updated.description,
        active: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  },
);

// DELETE /v1/webhooks/:id - Delete webhook
webhooks.delete("/:id", requireScope("webhooks:manage"), async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  const db = getDatabase();

  const [existing] = await db
    .select({ id: webhooksTable.id })
    .from(webhooksTable)
    .where(
      and(eq(webhooksTable.id, id), eq(webhooksTable.accountId, auth.accountId)),
    )
    .limit(1);

  if (!existing) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: `Webhook ${id} not found`,
          code: "webhook_not_found",
        },
      },
      404,
    );
  }

  await db.delete(webhooksTable).where(eq(webhooksTable.id, id));
  return c.json({ deleted: true, id });
});

// POST /v1/webhooks/:id/test - Send test event via the real dispatcher
webhooks.post("/:id/test", requireScope("webhooks:manage"), async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  const db = getDatabase();

  const [record] = await db
    .select()
    .from(webhooksTable)
    .where(
      and(eq(webhooksTable.id, id), eq(webhooksTable.accountId, auth.accountId)),
    )
    .limit(1);

  if (!record) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: `Webhook ${id} not found`,
          code: "webhook_not_found",
        },
      },
      404,
    );
  }

  // Create a real test event in the DB so the dispatcher can process it
  const eventId = `evt_test_${generateId()}`;
  const eventType =
    (record.eventTypes?.[0] as string | undefined) ?? "email.delivered";

  await db.insert(events).values({
    id: eventId,
    accountId: auth.accountId,
    type: eventType as "email.delivered",
    messageId: `msg_test_${generateId()}`,
    recipient: "test@example.com",
  });

  // Enqueue delivery through the real BullMQ pipeline
  await enqueueWebhookDeliveryForWebhook(id, eventId, auth.accountId);

  return c.json({
    data: {
      success: true,
      eventId,
      eventType,
      message:
        "Test event created and enqueued for delivery via the webhook pipeline",
    },
  });
});

// GET /v1/webhooks/:id/deliveries - List recent delivery attempts
webhooks.get(
  "/:id/deliveries",
  requireScope("webhooks:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the webhook belongs to this account
    const [record] = await db
      .select({ id: webhooksTable.id })
      .from(webhooksTable)
      .where(
        and(
          eq(webhooksTable.id, id),
          eq(webhooksTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Webhook ${id} not found`,
            code: "webhook_not_found",
          },
        },
        404,
      );
    }

    // Parse pagination params
    const limit = Math.min(
      parseInt(c.req.query("limit") ?? "50", 10) || 50,
      100,
    );
    const offset = parseInt(c.req.query("offset") ?? "0", 10) || 0;

    const rows = await db
      .select({
        id: webhookDeliveries.id,
        eventId: webhookDeliveries.eventId,
        statusCode: webhookDeliveries.statusCode,
        responseBody: webhookDeliveries.responseBody,
        attemptCount: webhookDeliveries.attemptCount,
        success: webhookDeliveries.success,
        nextRetryAt: webhookDeliveries.nextRetryAt,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      statusCode: r.statusCode !== null && r.statusCode !== undefined ? parseInt(r.statusCode, 10) : null,
      responseBody: r.responseBody,
      attemptCount: r.attemptCount,
      success: r.success,
      nextRetryAt: r.nextRetryAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return c.json({ data, limit, offset });
  },
);

export { webhooks };
