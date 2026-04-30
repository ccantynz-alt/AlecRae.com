/**
 * Push Notifications Route — Web Push subscription management
 *
 * POST   /v1/push/subscribe        — Register push subscription
 * DELETE /v1/push/subscribe/:id    — Unregister subscription
 * GET    /v1/push/subscriptions    — List user's subscriptions
 * GET    /v1/push/preferences      — Get notification preferences
 * PUT    /v1/push/preferences      — Update notification preferences
 * POST   /v1/push/test             — Send test notification to all user's devices
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import {
  getDatabase,
  pushSubscriptions,
  pushNotificationPreferences,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const WebPushKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

const SubscribeSchema = z.object({
  platform: z.enum(["web", "ios", "android", "desktop"]),
  endpoint: z.string().url(),
  keys: WebPushKeysSchema.optional(),
  deviceName: z.string().max(255).optional(),
});

const UpdatePreferencesSchema = z.object({
  newEmail: z.enum(["all", "important", "none"]).optional(),
  mentions: z.enum(["all", "none"]).optional(),
  calendarReminders: z.enum(["all", "none"]).optional(),
  securityAlerts: z.enum(["all", "none"]).optional(),
  deliverabilityAlerts: z.enum(["all", "none"]).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format").nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format").nullable().optional(),
  quietHoursTimezone: z.string().nullable().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const pushNotificationsRouter = new Hono();

// POST /subscribe — Register push subscription
pushNotificationsRouter.post(
  "/subscribe",
  requireScope("account:manage"),
  validateBody(SubscribeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SubscribeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const userId = auth.userId ?? auth.accountId;

    // Check if this endpoint is already registered
    const [existing] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint))
      .limit(1);

    if (existing) {
      // Update existing subscription (re-subscribe / refresh)
      const now = new Date();
      await db
        .update(pushSubscriptions)
        .set({
          platform: input.platform,
          keys: input.keys ?? null,
          deviceName: input.deviceName ?? null,
          createdAt: now,
          expiresAt: null,
        })
        .where(eq(pushSubscriptions.id, existing.id));

      return c.json({
        data: {
          id: existing.id,
          platform: input.platform,
          endpoint: input.endpoint,
          deviceName: input.deviceName ?? null,
          updated: true,
        },
      });
    }

    const id = generateId();
    const now = new Date();

    await db.insert(pushSubscriptions).values({
      id,
      userId,
      platform: input.platform,
      endpoint: input.endpoint,
      keys: input.keys ?? null,
      deviceName: input.deviceName ?? null,
      createdAt: now,
      expiresAt: null,
    });

    return c.json(
      {
        data: {
          id,
          platform: input.platform,
          endpoint: input.endpoint,
          deviceName: input.deviceName ?? null,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// DELETE /subscribe/:id — Unregister subscription
pushNotificationsRouter.delete(
  "/subscribe/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const userId = auth.userId ?? auth.accountId;

    const [existing] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.id, id),
          eq(pushSubscriptions.userId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Push subscription ${id} not found`,
            code: "subscription_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.id, id),
          eq(pushSubscriptions.userId, userId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// GET /subscriptions — List user's subscriptions
pushNotificationsRouter.get(
  "/subscriptions",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const userId = auth.userId ?? auth.accountId;

    const rows = await db
      .select({
        id: pushSubscriptions.id,
        platform: pushSubscriptions.platform,
        endpoint: pushSubscriptions.endpoint,
        deviceName: pushSubscriptions.deviceName,
        createdAt: pushSubscriptions.createdAt,
        expiresAt: pushSubscriptions.expiresAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        endpoint: row.endpoint,
        deviceName: row.deviceName,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
      })),
    });
  },
);

// GET /preferences — Get notification preferences
pushNotificationsRouter.get(
  "/preferences",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const userId = auth.userId ?? auth.accountId;

    const [prefs] = await db
      .select()
      .from(pushNotificationPreferences)
      .where(eq(pushNotificationPreferences.userId, userId))
      .limit(1);

    if (!prefs) {
      // Return defaults when no preferences have been saved yet
      return c.json({
        data: {
          newEmail: "important",
          mentions: "all",
          calendarReminders: "all",
          securityAlerts: "all",
          deliverabilityAlerts: "all",
          quietHoursStart: null,
          quietHoursEnd: null,
          quietHoursTimezone: null,
        },
      });
    }

    return c.json({
      data: {
        newEmail: prefs.newEmail,
        mentions: prefs.mentions,
        calendarReminders: prefs.calendarReminders,
        securityAlerts: prefs.securityAlerts,
        deliverabilityAlerts: prefs.deliverabilityAlerts,
        quietHoursStart: prefs.quietHoursStart,
        quietHoursEnd: prefs.quietHoursEnd,
        quietHoursTimezone: prefs.quietHoursTimezone,
        updatedAt: prefs.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /preferences — Update notification preferences
pushNotificationsRouter.put(
  "/preferences",
  requireScope("account:manage"),
  validateBody(UpdatePreferencesSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof UpdatePreferencesSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const userId = auth.userId ?? auth.accountId;
    const now = new Date();

    const [existing] = await db
      .select({ id: pushNotificationPreferences.id })
      .from(pushNotificationPreferences)
      .where(eq(pushNotificationPreferences.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(pushNotificationPreferences)
        .set({
          ...(input.newEmail !== undefined ? { newEmail: input.newEmail } : {}),
          ...(input.mentions !== undefined ? { mentions: input.mentions } : {}),
          ...(input.calendarReminders !== undefined
            ? { calendarReminders: input.calendarReminders }
            : {}),
          ...(input.securityAlerts !== undefined
            ? { securityAlerts: input.securityAlerts }
            : {}),
          ...(input.deliverabilityAlerts !== undefined
            ? { deliverabilityAlerts: input.deliverabilityAlerts }
            : {}),
          ...(input.quietHoursStart !== undefined
            ? { quietHoursStart: input.quietHoursStart }
            : {}),
          ...(input.quietHoursEnd !== undefined
            ? { quietHoursEnd: input.quietHoursEnd }
            : {}),
          ...(input.quietHoursTimezone !== undefined
            ? { quietHoursTimezone: input.quietHoursTimezone }
            : {}),
          updatedAt: now,
        })
        .where(eq(pushNotificationPreferences.id, existing.id));

      return c.json({
        data: {
          updated: true,
          updatedAt: now.toISOString(),
        },
      });
    }

    // Create preferences with defaults + overrides
    const id = generateId();

    await db.insert(pushNotificationPreferences).values({
      id,
      userId,
      newEmail: input.newEmail ?? "important",
      mentions: input.mentions ?? "all",
      calendarReminders: input.calendarReminders ?? "all",
      securityAlerts: input.securityAlerts ?? "all",
      deliverabilityAlerts: input.deliverabilityAlerts ?? "all",
      quietHoursStart: input.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd ?? null,
      quietHoursTimezone: input.quietHoursTimezone ?? null,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          created: true,
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// POST /test — Send test notification to all user's devices
pushNotificationsRouter.post(
  "/test",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const userId = auth.userId ?? auth.accountId;

    const subscriptions = await db
      .select({
        id: pushSubscriptions.id,
        platform: pushSubscriptions.platform,
        endpoint: pushSubscriptions.endpoint,
        keys: pushSubscriptions.keys,
        deviceName: pushSubscriptions.deviceName,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subscriptions.length === 0) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No push subscriptions found. Register a device first via POST /v1/push/subscribe.",
            code: "no_subscriptions",
          },
        },
        404,
      );
    }

    // For now, return a success response indicating which devices would be notified.
    // Real push delivery (web-push library / APNs / FCM) will be integrated later.
    const results = subscriptions.map((sub) => ({
      id: sub.id,
      platform: sub.platform,
      deviceName: sub.deviceName,
      status: "queued" as const,
    }));

    return c.json({
      data: {
        message: "Test notification queued for all registered devices",
        devices: results,
        totalDevices: results.length,
        note: "Push delivery will be processed asynchronously. Real push integration pending.",
      },
    });
  },
);

export { pushNotificationsRouter };
