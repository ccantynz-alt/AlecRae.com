/**
 * Zapier/Make/n8n Integration Route — Outbound Webhook Connectors
 *
 * POST   /v1/integrations            — Create an integration
 * GET    /v1/integrations            — List integrations
 * GET    /v1/integrations/:id        — Get integration
 * PUT    /v1/integrations/:id        — Update integration
 * DELETE /v1/integrations/:id        — Delete integration
 * POST   /v1/integrations/:id/test   — Send test payload
 * GET    /v1/integrations/events     — List available event types
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, webhookIntegrations } from "@alecrae/db";

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
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

const AVAILABLE_EVENTS = [
  { type: "email.received", description: "When a new email arrives" },
  { type: "email.sent", description: "When an email is sent" },
  { type: "email.opened", description: "When a sent email is opened" },
  { type: "email.clicked", description: "When a link in a sent email is clicked" },
  { type: "email.replied", description: "When a reply is received" },
  { type: "email.bounced", description: "When an email bounces" },
  { type: "contact.created", description: "When a new contact is created" },
  { type: "contact.updated", description: "When a contact is updated" },
  { type: "label.applied", description: "When a label is applied to an email" },
  { type: "thread.muted", description: "When a thread is muted" },
  { type: "snooze.triggered", description: "When a snoozed email resurfaces" },
] as const;

const CreateIntegrationSchema = z.object({
  platform: z.enum(["zapier", "make", "n8n", "custom"]),
  name: z.string().min(1).max(255),
  webhookUrl: z.string().url(),
  events: z.array(z.string()).min(1).max(20),
  filters: z.record(z.unknown()).optional(),
});

const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  webhookUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  events: z.array(z.string()).min(1).max(20).optional(),
  filters: z.record(z.unknown()).optional(),
});

const integrationsRouter = new Hono();

integrationsRouter.get(
  "/events",
  requireScope("account:manage"),
  async (c) => {
    return c.json({ data: AVAILABLE_EVENTS });
  },
);

integrationsRouter.post(
  "/",
  requireScope("account:manage"),
  validateBody(CreateIntegrationSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateIntegrationSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const id = generateId();
    const secret = generateSecret();
    const now = new Date();

    await db.insert(webhookIntegrations).values({
      id,
      accountId: auth.accountId,
      platform: input.platform,
      name: input.name,
      webhookUrl: input.webhookUrl,
      secret,
      triggerConfig: { events: input.events, filters: input.filters },
      createdAt: now,
      updatedAt: now,
    });

    return c.json({ data: { id, name: input.name, platform: input.platform, secret, createdAt: now.toISOString() } }, 201);
  },
);

integrationsRouter.get(
  "/",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(webhookIntegrations)
      .where(eq(webhookIntegrations.accountId, auth.accountId))
      .orderBy(desc(webhookIntegrations.createdAt));

    return c.json({
      data: rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        name: r.name,
        webhookUrl: r.webhookUrl,
        isActive: r.isActive,
        triggerConfig: r.triggerConfig,
        lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  },
);

integrationsRouter.get(
  "/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [integration] = await db
      .select()
      .from(webhookIntegrations)
      .where(and(eq(webhookIntegrations.id, id), eq(webhookIntegrations.accountId, auth.accountId)))
      .limit(1);

    if (!integration) {
      return c.json({ error: { type: "not_found", message: "Integration not found", code: "integration_not_found" } }, 404);
    }

    return c.json({
      data: {
        ...integration,
        createdAt: integration.createdAt.toISOString(),
        updatedAt: integration.updatedAt.toISOString(),
        lastTriggeredAt: integration.lastTriggeredAt?.toISOString() ?? null,
      },
    });
  },
);

integrationsRouter.put(
  "/:id",
  requireScope("account:manage"),
  validateBody(UpdateIntegrationSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateIntegrationSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: webhookIntegrations.id })
      .from(webhookIntegrations)
      .where(and(eq(webhookIntegrations.id, id), eq(webhookIntegrations.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { type: "not_found", message: "Integration not found", code: "integration_not_found" } }, 404);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates["name"] = input.name;
    if (input.webhookUrl !== undefined) updates["webhookUrl"] = input.webhookUrl;
    if (input.isActive !== undefined) updates["isActive"] = input.isActive;
    if (input.events !== undefined || input.filters !== undefined) {
      updates["triggerConfig"] = { events: input.events ?? [], filters: input.filters };
    }

    await db.update(webhookIntegrations).set(updates).where(eq(webhookIntegrations.id, id));
    return c.json({ data: { id, updated: true } });
  },
);

integrationsRouter.delete(
  "/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    await db.delete(webhookIntegrations).where(
      and(eq(webhookIntegrations.id, id), eq(webhookIntegrations.accountId, auth.accountId)),
    );
    return c.json({ deleted: true, id });
  },
);

integrationsRouter.post(
  "/:id/test",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [integration] = await db
      .select()
      .from(webhookIntegrations)
      .where(and(eq(webhookIntegrations.id, id), eq(webhookIntegrations.accountId, auth.accountId)))
      .limit(1);

    if (!integration) {
      return c.json({ error: { type: "not_found", message: "Integration not found", code: "integration_not_found" } }, 404);
    }

    const testPayload = {
      event: "test",
      timestamp: new Date().toISOString(),
      data: { message: "This is a test webhook from AlecRae", integrationId: id, accountId: auth.accountId },
    };

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "AlecRae-Webhook/1.0",
        "X-AlecRae-Event": "test",
      };

      if (integration.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw", encoder.encode(integration.secret),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
        );
        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(testPayload)));
        const hexSig = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
        headers["X-AlecRae-Signature"] = "sha256=" + hexSig;
      }

      const response = await fetch(integration.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      return c.json({ data: { success: response.ok, statusCode: response.status, statusText: response.statusText } });
    } catch (err) {
      return c.json({ data: { success: false, error: err instanceof Error ? err.message : "Unknown error" } });
    }
  },
);

export { integrationsRouter };
