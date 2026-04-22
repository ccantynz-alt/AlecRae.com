/**
 * Contacts Extended Route — CRM-lite Contacts Intelligence
 *
 * GET    /v1/contacts-extended/interactions/:contactId  — List interactions for a contact (cursor pagination)
 * POST   /v1/contacts-extended/interactions             — Log an interaction
 * GET    /v1/contacts-extended/reminders                — List pending reminders for account
 * POST   /v1/contacts-extended/reminders                — Create a follow-up reminder
 * PUT    /v1/contacts-extended/reminders/:id            — Update a reminder
 * POST   /v1/contacts-extended/reminders/:id/complete   — Mark reminder as completed
 * DELETE /v1/contacts-extended/reminders/:id            — Delete a reminder
 * GET    /v1/contacts-extended/insights/:contactId      — AI contact insights (placeholder)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, lte, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  contactInteractions,
  contactReminders,
  contacts,
} from "@alecrae/db";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const ListInteractionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  type: z
    .enum(["email_sent", "email_received", "meeting", "call", "note"])
    .optional(),
});

const CreateInteractionSchema = z.object({
  contactId: z.string().min(1),
  type: z.enum(["email_sent", "email_received", "meeting", "call", "note"]),
  subject: z.string().max(1000).optional(),
  occurredAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

const CreateReminderSchema = z.object({
  contactId: z.string().min(1),
  title: z.string().min(1).max(500),
  reminderAt: z.string().datetime(),
});

const UpdateReminderSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  reminderAt: z.string().datetime().optional(),
});

const ListRemindersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Routes ─────────────────────────────────────────────────────────────────

const contactsExtendedRouter = new Hono();

// ─── GET /interactions/:contactId — List interactions for a contact ──────────

contactsExtendedRouter.get(
  "/interactions/:contactId",
  requireScope("messages:read"),
  validateQuery(ListInteractionsQuery),
  async (c) => {
    const contactId = c.req.param("contactId");
    const query = getValidatedQuery<z.infer<typeof ListInteractionsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the contact belongs to this account
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Contact not found",
            code: "contact_not_found",
          },
        },
        404,
      );
    }

    const conditions = [
      eq(contactInteractions.accountId, auth.accountId),
      eq(contactInteractions.contactId, contactId),
    ];

    if (query.cursor) {
      conditions.push(
        lt(contactInteractions.occurredAt, new Date(query.cursor)),
      );
    }

    if (query.type) {
      conditions.push(eq(contactInteractions.type, query.type));
    }

    const rows = await db
      .select()
      .from(contactInteractions)
      .where(and(...conditions))
      .orderBy(desc(contactInteractions.occurredAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.occurredAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        contactId: row.contactId,
        type: row.type,
        subject: row.subject,
        occurredAt: row.occurredAt.toISOString(),
        metadata: row.metadata,
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── POST /interactions — Log an interaction ─────────────────────────────────

contactsExtendedRouter.post(
  "/interactions",
  requireScope("messages:write"),
  validateBody(CreateInteractionSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateInteractionSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the contact belongs to this account
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, input.contactId),
          eq(contacts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Contact not found",
            code: "contact_not_found",
          },
        },
        404,
      );
    }

    const id = generateId();
    const occurredAt = new Date(input.occurredAt);

    await db.insert(contactInteractions).values({
      id,
      accountId: auth.accountId,
      contactId: input.contactId,
      type: input.type,
      subject: input.subject ?? null,
      occurredAt,
      metadata: input.metadata ?? {},
    });

    return c.json(
      {
        data: {
          id,
          contactId: input.contactId,
          type: input.type,
          subject: input.subject ?? null,
          occurredAt: occurredAt.toISOString(),
          metadata: input.metadata ?? {},
        },
      },
      201,
    );
  },
);

// ─── GET /reminders — List pending reminders for account ─────────────────────

contactsExtendedRouter.get(
  "/reminders",
  requireScope("messages:read"),
  validateQuery(ListRemindersQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListRemindersQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [
      eq(contactReminders.accountId, auth.accountId),
      eq(contactReminders.isCompleted, false),
    ];

    if (query.cursor) {
      conditions.push(
        lt(contactReminders.reminderAt, new Date(query.cursor)),
      );
    }

    const rows = await db
      .select()
      .from(contactReminders)
      .where(and(...conditions))
      .orderBy(contactReminders.reminderAt)
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.reminderAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        contactId: row.contactId,
        title: row.title,
        reminderAt: row.reminderAt.toISOString(),
        isCompleted: row.isCompleted,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── POST /reminders — Create a follow-up reminder ──────────────────────────

contactsExtendedRouter.post(
  "/reminders",
  requireScope("messages:write"),
  validateBody(CreateReminderSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateReminderSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the contact belongs to this account
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, input.contactId),
          eq(contacts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Contact not found",
            code: "contact_not_found",
          },
        },
        404,
      );
    }

    const id = generateId();
    const now = new Date();
    const reminderAt = new Date(input.reminderAt);

    await db.insert(contactReminders).values({
      id,
      accountId: auth.accountId,
      contactId: input.contactId,
      title: input.title,
      reminderAt,
      isCompleted: false,
      createdAt: now,
    });

    return c.json(
      {
        data: {
          id,
          contactId: input.contactId,
          title: input.title,
          reminderAt: reminderAt.toISOString(),
          isCompleted: false,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// ─── PUT /reminders/:id — Update a reminder ─────────────────────────────────

contactsExtendedRouter.put(
  "/reminders/:id",
  requireScope("messages:write"),
  validateBody(UpdateReminderSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateReminderSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(contactReminders)
      .where(
        and(
          eq(contactReminders.id, id),
          eq(contactReminders.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Reminder not found",
            code: "reminder_not_found",
          },
        },
        404,
      );
    }

    const updateFields: Record<string, unknown> = {};
    if (input.title !== undefined) {
      updateFields["title"] = input.title;
    }
    if (input.reminderAt !== undefined) {
      updateFields["reminderAt"] = new Date(input.reminderAt);
    }

    if (Object.keys(updateFields).length === 0) {
      return c.json({
        data: {
          id: existing.id,
          contactId: existing.contactId,
          title: existing.title,
          reminderAt: existing.reminderAt.toISOString(),
          isCompleted: existing.isCompleted,
          createdAt: existing.createdAt.toISOString(),
        },
      });
    }

    await db
      .update(contactReminders)
      .set(updateFields)
      .where(
        and(
          eq(contactReminders.id, id),
          eq(contactReminders.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id: existing.id,
        contactId: existing.contactId,
        title: input.title ?? existing.title,
        reminderAt: input.reminderAt ?? existing.reminderAt.toISOString(),
        isCompleted: existing.isCompleted,
        createdAt: existing.createdAt.toISOString(),
      },
    });
  },
);

// ─── POST /reminders/:id/complete — Mark reminder as completed ──────────────

contactsExtendedRouter.post(
  "/reminders/:id/complete",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(contactReminders)
      .where(
        and(
          eq(contactReminders.id, id),
          eq(contactReminders.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Reminder not found",
            code: "reminder_not_found",
          },
        },
        404,
      );
    }

    await db
      .update(contactReminders)
      .set({ isCompleted: true })
      .where(
        and(
          eq(contactReminders.id, id),
          eq(contactReminders.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id: existing.id,
        contactId: existing.contactId,
        title: existing.title,
        reminderAt: existing.reminderAt.toISOString(),
        isCompleted: true,
        createdAt: existing.createdAt.toISOString(),
      },
    });
  },
);

// ─── DELETE /reminders/:id — Delete a reminder ──────────────────────────────

contactsExtendedRouter.delete(
  "/reminders/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: contactReminders.id })
      .from(contactReminders)
      .where(
        and(
          eq(contactReminders.id, id),
          eq(contactReminders.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Reminder not found",
            code: "reminder_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(contactReminders)
      .where(
        and(
          eq(contactReminders.id, id),
          eq(contactReminders.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// ─── GET /insights/:contactId — AI contact insights (placeholder) ───────────

contactsExtendedRouter.get(
  "/insights/:contactId",
  requireScope("messages:read"),
  async (c) => {
    const contactId = c.req.param("contactId");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the contact belongs to this account
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Contact not found",
            code: "contact_not_found",
          },
        },
        404,
      );
    }

    // Aggregate interaction data for insights
    const [interactionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactInteractions)
      .where(
        and(
          eq(contactInteractions.accountId, auth.accountId),
          eq(contactInteractions.contactId, contactId),
        ),
      );

    const [latestInteraction] = await db
      .select()
      .from(contactInteractions)
      .where(
        and(
          eq(contactInteractions.accountId, auth.accountId),
          eq(contactInteractions.contactId, contactId),
        ),
      )
      .orderBy(desc(contactInteractions.occurredAt))
      .limit(1);

    // Count by type
    const typeCounts = await db
      .select({
        type: contactInteractions.type,
        count: sql<number>`count(*)::int`,
      })
      .from(contactInteractions)
      .where(
        and(
          eq(contactInteractions.accountId, auth.accountId),
          eq(contactInteractions.contactId, contactId),
        ),
      )
      .groupBy(contactInteractions.type);

    const typeBreakdown: Record<string, number> = {};
    for (const row of typeCounts) {
      typeBreakdown[row.type] = row.count;
    }

    // Pending reminders count
    const [pendingReminders] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactReminders)
      .where(
        and(
          eq(contactReminders.accountId, auth.accountId),
          eq(contactReminders.contactId, contactId),
          eq(contactReminders.isCompleted, false),
        ),
      );

    // Calculate days since last interaction
    const daysSinceLastInteraction = latestInteraction
      ? Math.floor(
          (Date.now() - latestInteraction.occurredAt.getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : null;

    // Compute interaction frequency (per 30 days, based on available data)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactInteractions)
      .where(
        and(
          eq(contactInteractions.accountId, auth.accountId),
          eq(contactInteractions.contactId, contactId),
          lte(
            sql`${contactInteractions.occurredAt}`,
            sql`now()`,
          ),
          sql`${contactInteractions.occurredAt} >= ${thirtyDaysAgo}`,
        ),
      );

    // Placeholder AI insights — in production, Claude would generate these
    const suggestedFollowUps: string[] = [];
    if (daysSinceLastInteraction !== null && daysSinceLastInteraction > 14) {
      suggestedFollowUps.push(
        `It has been ${daysSinceLastInteraction} days since your last interaction. Consider reaching out.`,
      );
    }
    if ((pendingReminders?.count ?? 0) > 0) {
      suggestedFollowUps.push(
        `You have ${pendingReminders?.count ?? 0} pending reminder(s) for this contact.`,
      );
    }
    if ((typeBreakdown["email_sent"] ?? 0) > (typeBreakdown["email_received"] ?? 0) * 2) {
      suggestedFollowUps.push(
        "You send significantly more emails than you receive from this contact. They may prefer other communication channels.",
      );
    }

    // Relationship strength placeholder (0-100)
    const totalInteractions = interactionCount?.count ?? 0;
    const recency = daysSinceLastInteraction !== null ? Math.max(0, 100 - daysSinceLastInteraction * 2) : 0;
    const frequency = Math.min(100, (recentCount?.count ?? 0) * 10);
    const relationshipStrength = Math.round((recency * 0.6 + frequency * 0.4));

    return c.json({
      data: {
        contactId,
        contactName: contact.name,
        contactEmail: contact.email,
        summary: {
          totalInteractions,
          interactionsByType: typeBreakdown,
          lastInteractionAt: latestInteraction?.occurredAt.toISOString() ?? null,
          daysSinceLastInteraction,
          interactionsLast30Days: recentCount?.count ?? 0,
          pendingReminders: pendingReminders?.count ?? 0,
        },
        relationshipStrength,
        suggestedFollowUps,
        generatedAt: new Date().toISOString(),
      },
    });
  },
);

export { contactsExtendedRouter };
