/**
 * Notification Intelligence Route — AI-powered smart notification management
 *
 * GET    /v1/notifications/rules          — List notification rules
 * POST   /v1/notifications/rules          — Create rule
 * PUT    /v1/notifications/rules/:id      — Update rule
 * DELETE /v1/notifications/rules/:id      — Delete rule
 * POST   /v1/notifications/evaluate       — Evaluate how an email should be notified
 * GET    /v1/notifications/batches        — Get pending notification batches
 * POST   /v1/notifications/batches/:id/deliver — Deliver a batch now
 * POST   /v1/focus/start                  — Start a focus session
 * POST   /v1/focus/end                    — End current focus session
 * GET    /v1/focus/current                — Get current focus session status
 * GET    /v1/focus/deferred               — Get emails deferred during focus session
 * GET    /v1/notifications/digest         — Get AI notification digest
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, isNull } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  notificationRules,
  notificationBatches,
  focusSessions,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TimeRangeSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});

const ConditionsSchema = z.object({
  senderVip: z.boolean().optional(),
  urgencyMin: z.number().min(0).max(100).optional(),
  keywords: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  timeRange: TimeRangeSchema.optional(),
});

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(255),
  conditions: ConditionsSchema,
  action: z.enum([
    "notify_immediately",
    "batch_hourly",
    "batch_daily",
    "suppress",
    "summary_only",
  ]),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
});

const UpdateRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  conditions: ConditionsSchema.optional(),
  action: z
    .enum([
      "notify_immediately",
      "batch_hourly",
      "batch_daily",
      "suppress",
      "summary_only",
    ])
    .optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

const EvaluateSchema = z.object({
  emailId: z.string().min(1),
  from: z.string().min(1),
  subject: z.string().min(1),
  urgencyScore: z.number().min(0).max(100).optional(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const StartFocusSchema = z.object({
  mode: z.enum(["deep_work", "meeting", "break", "custom"]),
  durationMinutes: z.number().int().min(1).max(1440),
  allowedSenders: z.array(z.string()).optional(),
  breakThroughUrgency: z.number().int().min(0).max(100).default(90),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Notification Rules Routes ────────────────────────────────────────────────

const notificationsRouter = new Hono();

// GET /rules — List notification rules
notificationsRouter.get(
  "/rules",
  requireScope("account:manage"),
  validateQuery(ListQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(notificationRules.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(notificationRules.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: notificationRules.id,
        name: notificationRules.name,
        conditions: notificationRules.conditions,
        action: notificationRules.action,
        isActive: notificationRules.isActive,
        priority: notificationRules.priority,
        createdAt: notificationRules.createdAt,
        updatedAt: notificationRules.updatedAt,
      })
      .from(notificationRules)
      .where(and(...conditions))
      .orderBy(desc(notificationRules.priority))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        name: row.name,
        conditions: row.conditions,
        action: row.action,
        isActive: row.isActive,
        priority: row.priority,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// POST /rules — Create rule
notificationsRouter.post(
  "/rules",
  requireScope("account:manage"),
  validateBody(CreateRuleSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateRuleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(notificationRules).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      conditions: input.conditions,
      action: input.action,
      isActive: input.isActive,
      priority: input.priority,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          conditions: input.conditions,
          action: input.action,
          isActive: input.isActive,
          priority: input.priority,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// PUT /rules/:id — Update rule
notificationsRouter.put(
  "/rules/:id",
  requireScope("account:manage"),
  validateBody(UpdateRuleSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateRuleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: notificationRules.id })
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.id, id),
          eq(notificationRules.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Notification rule ${id} not found`,
            code: "notification_rule_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(notificationRules)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
        ...(input.action !== undefined ? { action: input.action } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationRules.id, id),
          eq(notificationRules.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /rules/:id — Delete rule
notificationsRouter.delete(
  "/rules/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: notificationRules.id })
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.id, id),
          eq(notificationRules.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Notification rule ${id} not found`,
            code: "notification_rule_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(notificationRules)
      .where(
        and(
          eq(notificationRules.id, id),
          eq(notificationRules.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// POST /evaluate — Evaluate how an email should be notified
notificationsRouter.post(
  "/evaluate",
  requireScope("account:manage"),
  validateBody(EvaluateSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EvaluateSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Fetch all active rules for this account, ordered by priority descending
    const rules = await db
      .select()
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.accountId, auth.accountId),
          eq(notificationRules.isActive, true),
        ),
      )
      .orderBy(desc(notificationRules.priority));

    // Check if user is in an active focus session
    const now = new Date();
    const [activeSession] = await db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.accountId, auth.accountId),
          eq(focusSessions.isActive, true),
        ),
      )
      .limit(1);

    // If in focus mode, check break-through conditions
    if (activeSession) {
      const urgency = input.urgencyScore ?? 0;
      const allowedSenders = (activeSession.allowedSenders ?? []) as string[];
      const senderAllowed = allowedSenders.includes(input.from);
      const urgencyBreaksThrough = urgency >= activeSession.breakThroughUrgency;

      if (!senderAllowed && !urgencyBreaksThrough) {
        // Defer — increment deferred count
        await db
          .update(focusSessions)
          .set({ emailsDeferred: activeSession.emailsDeferred + 1 })
          .where(eq(focusSessions.id, activeSession.id));

        return c.json({
          data: {
            emailId: input.emailId,
            action: "deferred" as const,
            reason: "Focus session active — email deferred until session ends",
            focusMode: activeSession.mode,
            endsAt: activeSession.endsAt.toISOString(),
          },
        });
      }
    }

    // Evaluate rules in priority order — first match wins
    for (const rule of rules) {
      const conditions = rule.conditions as {
        senderVip?: boolean;
        urgencyMin?: number;
        keywords?: string[];
        labels?: string[];
        timeRange?: { start: string; end: string };
      };

      let matches = true;

      // Check urgency threshold
      if (conditions.urgencyMin !== undefined) {
        const urgency = input.urgencyScore ?? 0;
        if (urgency < conditions.urgencyMin) {
          matches = false;
        }
      }

      // Check keyword match in subject
      if (matches && conditions.keywords && conditions.keywords.length > 0) {
        const subjectLower = input.subject.toLowerCase();
        const hasKeyword = conditions.keywords.some((kw) =>
          subjectLower.includes(kw.toLowerCase()),
        );
        if (!hasKeyword) {
          matches = false;
        }
      }

      // Check time range (hour-of-day)
      if (matches && conditions.timeRange) {
        const currentHour = now.getHours();
        const startHour = parseInt(conditions.timeRange.start.split(":")[0] ?? "0", 10);
        const endHour = parseInt(conditions.timeRange.end.split(":")[0] ?? "23", 10);

        if (startHour <= endHour) {
          if (currentHour < startHour || currentHour > endHour) {
            matches = false;
          }
        } else {
          // Wraps midnight (e.g. 22:00 - 06:00)
          if (currentHour < startHour && currentHour > endHour) {
            matches = false;
          }
        }
      }

      if (matches) {
        return c.json({
          data: {
            emailId: input.emailId,
            action: rule.action,
            matchedRule: {
              id: rule.id,
              name: rule.name,
              priority: rule.priority,
            },
          },
        });
      }
    }

    // No rule matched — default to immediate notification
    return c.json({
      data: {
        emailId: input.emailId,
        action: "notify_immediately" as const,
        matchedRule: null,
        reason: "No matching rule — defaulting to immediate notification",
      },
    });
  },
);

// GET /batches — Get pending notification batches
notificationsRouter.get(
  "/batches",
  requireScope("account:manage"),
  validateQuery(ListQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [
      eq(notificationBatches.accountId, auth.accountId),
      isNull(notificationBatches.deliveredAt),
    ];

    if (query.cursor) {
      conditions.push(lt(notificationBatches.scheduledFor, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: notificationBatches.id,
        emailIds: notificationBatches.emailIds,
        scheduledFor: notificationBatches.scheduledFor,
        summary: notificationBatches.summary,
        createdAt: notificationBatches.createdAt,
      })
      .from(notificationBatches)
      .where(and(...conditions))
      .orderBy(desc(notificationBatches.scheduledFor))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.scheduledFor.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        emailIds: row.emailIds,
        scheduledFor: row.scheduledFor.toISOString(),
        summary: row.summary,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// POST /batches/:id/deliver — Deliver a batch now
notificationsRouter.post(
  "/batches/:id/deliver",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [batch] = await db
      .select()
      .from(notificationBatches)
      .where(
        and(
          eq(notificationBatches.id, id),
          eq(notificationBatches.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!batch) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Notification batch ${id} not found`,
            code: "batch_not_found",
          },
        },
        404,
      );
    }

    if (batch.deliveredAt) {
      return c.json({
        data: {
          id: batch.id,
          alreadyDelivered: true,
          deliveredAt: batch.deliveredAt.toISOString(),
        },
      });
    }

    const now = new Date();

    await db
      .update(notificationBatches)
      .set({ deliveredAt: now })
      .where(eq(notificationBatches.id, id));

    return c.json({
      data: {
        id: batch.id,
        delivered: true,
        deliveredAt: now.toISOString(),
        emailCount: (batch.emailIds as string[]).length,
      },
    });
  },
);

// GET /digest — Get AI notification digest
notificationsRouter.get(
  "/digest",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Get all pending (undelivered) batches for this account
    const pendingBatches = await db
      .select()
      .from(notificationBatches)
      .where(
        and(
          eq(notificationBatches.accountId, auth.accountId),
          isNull(notificationBatches.deliveredAt),
        ),
      )
      .orderBy(desc(notificationBatches.scheduledFor))
      .limit(50);

    // Gather all email IDs from pending batches
    const allEmailIds: string[] = [];
    for (const batch of pendingBatches) {
      const ids = batch.emailIds as string[];
      for (const emailId of ids) {
        allEmailIds.push(emailId);
      }
    }

    // Get active rules for context
    const activeRules = await db
      .select({
        id: notificationRules.id,
        name: notificationRules.name,
        action: notificationRules.action,
      })
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.accountId, auth.accountId),
          eq(notificationRules.isActive, true),
        ),
      );

    // Check for active focus session
    const [activeSession] = await db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.accountId, auth.accountId),
          eq(focusSessions.isActive, true),
        ),
      )
      .limit(1);

    return c.json({
      data: {
        pendingBatchCount: pendingBatches.length,
        totalPendingEmails: allEmailIds.length,
        batches: pendingBatches.map((b) => ({
          id: b.id,
          emailCount: (b.emailIds as string[]).length,
          scheduledFor: b.scheduledFor.toISOString(),
          summary: b.summary,
        })),
        activeRuleCount: activeRules.length,
        focusSession: activeSession
          ? {
              id: activeSession.id,
              mode: activeSession.mode,
              endsAt: activeSession.endsAt.toISOString(),
              emailsDeferred: activeSession.emailsDeferred,
            }
          : null,
        generatedAt: new Date().toISOString(),
      },
    });
  },
);

// ─── Focus Session Routes ─────────────────────────────────────────────────────

const focusRouter = new Hono();

// POST /start — Start a focus session
focusRouter.post(
  "/start",
  requireScope("account:manage"),
  validateBody(StartFocusSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof StartFocusSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // End any existing active session first
    const [existingSession] = await db
      .select({ id: focusSessions.id })
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.accountId, auth.accountId),
          eq(focusSessions.isActive, true),
        ),
      )
      .limit(1);

    if (existingSession) {
      await db
        .update(focusSessions)
        .set({ isActive: false })
        .where(eq(focusSessions.id, existingSession.id));
    }

    const id = generateId();
    const now = new Date();
    const endsAt = new Date(now.getTime() + input.durationMinutes * 60 * 1000);

    await db.insert(focusSessions).values({
      id,
      accountId: auth.accountId,
      startedAt: now,
      endsAt,
      mode: input.mode,
      allowedSenders: input.allowedSenders ?? [],
      breakThroughUrgency: input.breakThroughUrgency,
      emailsDeferred: 0,
      isActive: true,
    });

    return c.json(
      {
        data: {
          id,
          mode: input.mode,
          startedAt: now.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMinutes: input.durationMinutes,
          allowedSenders: input.allowedSenders ?? [],
          breakThroughUrgency: input.breakThroughUrgency,
        },
      },
      201,
    );
  },
);

// POST /end — End current focus session
focusRouter.post(
  "/end",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [session] = await db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.accountId, auth.accountId),
          eq(focusSessions.isActive, true),
        ),
      )
      .limit(1);

    if (!session) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No active focus session to end",
            code: "no_active_focus_session",
          },
        },
        404,
      );
    }

    await db
      .update(focusSessions)
      .set({ isActive: false })
      .where(eq(focusSessions.id, session.id));

    return c.json({
      data: {
        id: session.id,
        mode: session.mode,
        startedAt: session.startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        emailsDeferred: session.emailsDeferred,
      },
    });
  },
);

// GET /current — Get current focus session status
focusRouter.get(
  "/current",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [session] = await db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.accountId, auth.accountId),
          eq(focusSessions.isActive, true),
        ),
      )
      .limit(1);

    if (!session) {
      return c.json({ data: null });
    }

    const now = new Date();
    const remainingMs = session.endsAt.getTime() - now.getTime();
    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));

    // Auto-expire if past end time
    if (remainingMs <= 0) {
      await db
        .update(focusSessions)
        .set({ isActive: false })
        .where(eq(focusSessions.id, session.id));

      return c.json({
        data: {
          id: session.id,
          mode: session.mode,
          startedAt: session.startedAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          isActive: false,
          expired: true,
          emailsDeferred: session.emailsDeferred,
          remainingMinutes: 0,
          allowedSenders: session.allowedSenders,
          breakThroughUrgency: session.breakThroughUrgency,
        },
      });
    }

    return c.json({
      data: {
        id: session.id,
        mode: session.mode,
        startedAt: session.startedAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        isActive: true,
        expired: false,
        emailsDeferred: session.emailsDeferred,
        remainingMinutes,
        allowedSenders: session.allowedSenders,
        breakThroughUrgency: session.breakThroughUrgency,
      },
    });
  },
);

// GET /deferred — Get emails deferred during focus session
focusRouter.get(
  "/deferred",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Get the most recent focus session (active or not)
    const [session] = await db
      .select()
      .from(focusSessions)
      .where(eq(focusSessions.accountId, auth.accountId))
      .orderBy(desc(focusSessions.startedAt))
      .limit(1);

    if (!session) {
      return c.json({
        data: {
          session: null,
          emailsDeferred: 0,
          message: "No focus sessions found",
        },
      });
    }

    return c.json({
      data: {
        session: {
          id: session.id,
          mode: session.mode,
          startedAt: session.startedAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          isActive: session.isActive,
        },
        emailsDeferred: session.emailsDeferred,
      },
    });
  },
);

export { notificationsRouter, focusRouter };
