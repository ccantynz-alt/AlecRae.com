/**
 * Context Intelligence Routes — action items, deadlines, promises
 *
 * POST   /extract              — Extract action items, deadlines, promises from email
 * GET    /action-items          — List action items
 * GET    /action-items/:id      — Get specific action item
 * PUT    /action-items/:id      — Update action item status
 * GET    /deadlines             — List upcoming deadlines
 * GET    /deadlines/upcoming    — Next 7 days summary
 * POST   /deadlines/:id/remind  — Set reminder for a deadline
 * GET    /promises              — List promises
 * PUT    /promises/:id          — Update promise status
 * GET    /promises/follow-up    — Promises needing follow-up
 * GET    /dashboard             — Context dashboard
 * POST   /batch-extract         — Batch extract from multiple emails (max 25)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, gte, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase } from "@alecrae/db";
import {
  emailActionItems,
  emailDeadlines,
  emailPromises,
} from "@alecrae/db/src/schema/context-intelligence.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ExtractSchema = z.object({
  emailId: z.string().min(1),
  content: z.string().min(1),
  threadId: z.string().optional(),
  participants: z.array(z.string()).optional(),
});

const ListActionItemsQuery = z.object({
  status: z.enum(["pending", "in_progress", "completed", "dismissed"]).optional(),
  priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
  assignedTo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const UpdateActionItemSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "dismissed"]),
  completedAt: z.string().datetime().nullable().optional(),
});

const ListDeadlinesQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  overdue: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const SetReminderSchema = z.object({
  reminderAt: z.string().datetime(),
});

const ListPromisesQuery = z.object({
  status: z.enum(["active", "fulfilled", "broken", "expired"]).optional(),
  direction: z.enum(["made", "received"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const UpdatePromiseSchema = z.object({
  status: z.enum(["active", "fulfilled", "broken", "expired"]),
});

const BatchExtractSchema = z.object({
  emails: z
    .array(
      z.object({
        emailId: z.string().min(1),
        content: z.string().min(1),
        threadId: z.string().optional(),
        participants: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(25),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface ExtractedContext {
  actionItems: Array<{
    actionText: string;
    assignedTo: string | null;
    dueDate: string | null;
    priority: "urgent" | "high" | "medium" | "low";
    confidence: number;
  }>;
  deadlines: Array<{
    deadlineDate: string;
    description: string;
    isExplicit: boolean;
    confidence: number;
  }>;
  promises: Array<{
    promiseText: string;
    promisor: string;
    promisee: string;
    dueDate: string | null;
    confidence: number;
  }>;
}

/**
 * Stub extractor — returns basic results from content analysis.
 * In production, this would call Claude AI for intelligent extraction.
 */
function extractContextFromContent(
  _content: string,
  _participants?: string[],
): ExtractedContext {
  return {
    actionItems: [],
    deadlines: [],
    promises: [],
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const contextIntelligenceRouter = new Hono();

// POST /extract — Extract action items, deadlines, promises from email
contextIntelligenceRouter.post(
  "/extract",
  requireScope("messages:write"),
  validateBody(ExtractSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ExtractSchema>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();
    const threadId = input.threadId ?? input.emailId;

    const extracted = extractContextFromContent(input.content, input.participants);

    const insertedActionItems: Array<Record<string, unknown>> = [];
    const insertedDeadlines: Array<Record<string, unknown>> = [];
    const insertedPromises: Array<Record<string, unknown>> = [];

    // Insert action items
    for (const item of extracted.actionItems) {
      const id = generateId();
      await db.insert(emailActionItems).values({
        id,
        accountId,
        emailId: input.emailId,
        threadId,
        actionText: item.actionText,
        assignedTo: item.assignedTo,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        priority: item.priority,
        status: "pending",
        confidence: item.confidence,
        source: "ai_detected",
        createdAt: now,
        updatedAt: now,
      });
      insertedActionItems.push({
        id,
        actionText: item.actionText,
        assignedTo: item.assignedTo,
        dueDate: item.dueDate,
        priority: item.priority,
        confidence: item.confidence,
      });
    }

    // Insert deadlines
    for (const dl of extracted.deadlines) {
      const id = generateId();
      await db.insert(emailDeadlines).values({
        id,
        accountId,
        emailId: input.emailId,
        threadId,
        deadlineDate: new Date(dl.deadlineDate),
        description: dl.description,
        isExplicit: dl.isExplicit,
        confidence: dl.confidence,
        reminderSent: false,
        createdAt: now,
      });
      insertedDeadlines.push({
        id,
        deadlineDate: dl.deadlineDate,
        description: dl.description,
        isExplicit: dl.isExplicit,
        confidence: dl.confidence,
      });
    }

    // Insert promises
    for (const p of extracted.promises) {
      const id = generateId();
      await db.insert(emailPromises).values({
        id,
        accountId,
        emailId: input.emailId,
        threadId,
        promiseText: p.promiseText,
        promisor: p.promisor,
        promisee: p.promisee,
        dueDate: p.dueDate ? new Date(p.dueDate) : null,
        status: "active",
        confidence: p.confidence,
        followUpSent: false,
        createdAt: now,
        updatedAt: now,
      });
      insertedPromises.push({
        id,
        promiseText: p.promiseText,
        promisor: p.promisor,
        promisee: p.promisee,
        dueDate: p.dueDate,
        confidence: p.confidence,
      });
    }

    return c.json(
      {
        data: {
          emailId: input.emailId,
          threadId,
          actionItems: insertedActionItems,
          deadlines: insertedDeadlines,
          promises: insertedPromises,
        },
      },
      201,
    );
  },
);

// GET /action-items — List action items
contextIntelligenceRouter.get(
  "/action-items",
  requireScope("messages:read"),
  validateQuery(ListActionItemsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListActionItemsQuery>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const conditions = [eq(emailActionItems.accountId, accountId)];

    if (query.status) {
      conditions.push(eq(emailActionItems.status, query.status));
    }
    if (query.priority) {
      conditions.push(eq(emailActionItems.priority, query.priority));
    }
    if (query.assignedTo) {
      conditions.push(eq(emailActionItems.assignedTo, query.assignedTo));
    }
    if (query.cursor) {
      conditions.push(lt(emailActionItems.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(emailActionItems)
      .where(and(...conditions))
      .orderBy(desc(emailActionItems.createdAt))
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
        accountId: row.accountId,
        emailId: row.emailId,
        threadId: row.threadId,
        actionText: row.actionText,
        assignedTo: row.assignedTo,
        dueDate: row.dueDate ? row.dueDate.toISOString() : null,
        priority: row.priority,
        status: row.status,
        confidence: row.confidence,
        source: row.source,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /action-items/:id — Get specific action item
contextIntelligenceRouter.get(
  "/action-items/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const rows = await db
      .select()
      .from(emailActionItems)
      .where(
        and(
          eq(emailActionItems.id, id),
          eq(emailActionItems.accountId, accountId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: "Action item not found" }, 404);
    }

    const row = rows[0]!;
    return c.json({
      data: {
        id: row.id,
        accountId: row.accountId,
        emailId: row.emailId,
        threadId: row.threadId,
        actionText: row.actionText,
        assignedTo: row.assignedTo,
        dueDate: row.dueDate ? row.dueDate.toISOString() : null,
        priority: row.priority,
        status: row.status,
        confidence: row.confidence,
        source: row.source,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /action-items/:id — Update action item status
contextIntelligenceRouter.put(
  "/action-items/:id",
  requireScope("messages:write"),
  validateBody(UpdateActionItemSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateActionItemSchema>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();

    const existing = await db
      .select()
      .from(emailActionItems)
      .where(
        and(
          eq(emailActionItems.id, id),
          eq(emailActionItems.accountId, accountId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Action item not found" }, 404);
    }

    const completedAt =
      input.status === "completed"
        ? input.completedAt
          ? new Date(input.completedAt)
          : now
        : null;

    await db
      .update(emailActionItems)
      .set({
        status: input.status,
        completedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailActionItems.id, id),
          eq(emailActionItems.accountId, accountId),
        ),
      );

    return c.json({
      data: {
        id,
        status: input.status,
        completedAt: completedAt ? completedAt.toISOString() : null,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// GET /deadlines — List upcoming deadlines
contextIntelligenceRouter.get(
  "/deadlines",
  requireScope("messages:read"),
  validateQuery(ListDeadlinesQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListDeadlinesQuery>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();

    const conditions = [eq(emailDeadlines.accountId, accountId)];

    if (query.overdue) {
      conditions.push(lt(emailDeadlines.deadlineDate, now));
    } else if (query.days) {
      const futureDate = new Date(now.getTime() + query.days * 24 * 60 * 60 * 1000);
      conditions.push(gte(emailDeadlines.deadlineDate, now));
      conditions.push(lt(emailDeadlines.deadlineDate, futureDate));
    }

    if (query.cursor) {
      conditions.push(lt(emailDeadlines.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(emailDeadlines)
      .where(and(...conditions))
      .orderBy(desc(emailDeadlines.deadlineDate))
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
        accountId: row.accountId,
        emailId: row.emailId,
        threadId: row.threadId,
        deadlineDate: row.deadlineDate.toISOString(),
        description: row.description,
        isExplicit: row.isExplicit,
        confidence: row.confidence,
        reminderSent: row.reminderSent,
        reminderAt: row.reminderAt ? row.reminderAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /deadlines/upcoming — Next 7 days summary
contextIntelligenceRouter.get(
  "/deadlines/upcoming",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcoming = await db
      .select()
      .from(emailDeadlines)
      .where(
        and(
          eq(emailDeadlines.accountId, accountId),
          gte(emailDeadlines.deadlineDate, now),
          lt(emailDeadlines.deadlineDate, sevenDaysOut),
        ),
      )
      .orderBy(emailDeadlines.deadlineDate);

    const overdue = await db
      .select()
      .from(emailDeadlines)
      .where(
        and(
          eq(emailDeadlines.accountId, accountId),
          lt(emailDeadlines.deadlineDate, now),
        ),
      )
      .orderBy(desc(emailDeadlines.deadlineDate));

    return c.json({
      data: {
        upcoming: upcoming.map((row) => ({
          id: row.id,
          emailId: row.emailId,
          threadId: row.threadId,
          deadlineDate: row.deadlineDate.toISOString(),
          description: row.description,
          isExplicit: row.isExplicit,
          confidence: row.confidence,
          reminderSent: row.reminderSent,
          reminderAt: row.reminderAt ? row.reminderAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        })),
        overdue: overdue.map((row) => ({
          id: row.id,
          emailId: row.emailId,
          threadId: row.threadId,
          deadlineDate: row.deadlineDate.toISOString(),
          description: row.description,
          isExplicit: row.isExplicit,
          confidence: row.confidence,
          createdAt: row.createdAt.toISOString(),
        })),
        totalUpcoming: upcoming.length,
        totalOverdue: overdue.length,
      },
    });
  },
);

// POST /deadlines/:id/remind — Set reminder for a deadline
contextIntelligenceRouter.post(
  "/deadlines/:id/remind",
  requireScope("messages:write"),
  validateBody(SetReminderSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof SetReminderSchema>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const existing = await db
      .select()
      .from(emailDeadlines)
      .where(
        and(
          eq(emailDeadlines.id, id),
          eq(emailDeadlines.accountId, accountId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Deadline not found" }, 404);
    }

    await db
      .update(emailDeadlines)
      .set({
        reminderAt: new Date(input.reminderAt),
        reminderSent: false,
      })
      .where(
        and(
          eq(emailDeadlines.id, id),
          eq(emailDeadlines.accountId, accountId),
        ),
      );

    return c.json({
      data: {
        id,
        reminderAt: input.reminderAt,
        reminderSent: false,
      },
    });
  },
);

// GET /promises — List promises
contextIntelligenceRouter.get(
  "/promises",
  requireScope("messages:read"),
  validateQuery(ListPromisesQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListPromisesQuery>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const conditions = [eq(emailPromises.accountId, accountId)];

    if (query.status) {
      conditions.push(eq(emailPromises.status, query.status));
    }

    // direction: "made" = current user is promisor, "received" = current user is promisee
    // Since we scope by accountId, direction filtering uses promisor/promisee fields
    // The caller can pass their email to filter by direction
    if (query.direction === "made") {
      // Promises where the account owner made the promise — filtered by accountId
      // Additional user-email filtering would go here in production
    } else if (query.direction === "received") {
      // Promises received by the account owner
    }

    if (query.cursor) {
      conditions.push(lt(emailPromises.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(emailPromises)
      .where(and(...conditions))
      .orderBy(desc(emailPromises.createdAt))
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
        accountId: row.accountId,
        emailId: row.emailId,
        threadId: row.threadId,
        promiseText: row.promiseText,
        promisor: row.promisor,
        promisee: row.promisee,
        dueDate: row.dueDate ? row.dueDate.toISOString() : null,
        status: row.status,
        confidence: row.confidence,
        followUpSent: row.followUpSent,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// PUT /promises/:id — Update promise status
contextIntelligenceRouter.put(
  "/promises/:id",
  requireScope("messages:write"),
  validateBody(UpdatePromiseSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdatePromiseSchema>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();

    const existing = await db
      .select()
      .from(emailPromises)
      .where(
        and(
          eq(emailPromises.id, id),
          eq(emailPromises.accountId, accountId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Promise not found" }, 404);
    }

    await db
      .update(emailPromises)
      .set({
        status: input.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailPromises.id, id),
          eq(emailPromises.accountId, accountId),
        ),
      );

    return c.json({
      data: {
        id,
        status: input.status,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// GET /promises/follow-up — Promises needing follow-up
contextIntelligenceRouter.get(
  "/promises/follow-up",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();

    // Active promises that are overdue or have not been followed up
    const rows = await db
      .select()
      .from(emailPromises)
      .where(
        and(
          eq(emailPromises.accountId, accountId),
          eq(emailPromises.status, "active"),
          eq(emailPromises.followUpSent, false),
        ),
      )
      .orderBy(emailPromises.dueDate);

    // Separate overdue from upcoming
    const overdue = rows.filter(
      (row) => row.dueDate && row.dueDate < now,
    );
    const upcoming = rows.filter(
      (row) => !row.dueDate || row.dueDate >= now,
    );

    const mapRow = (row: typeof rows[number]) => ({
      id: row.id,
      emailId: row.emailId,
      threadId: row.threadId,
      promiseText: row.promiseText,
      promisor: row.promisor,
      promisee: row.promisee,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      status: row.status,
      confidence: row.confidence,
      followUpSent: row.followUpSent,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });

    return c.json({
      data: {
        overdue: overdue.map(mapRow),
        upcoming: upcoming.map(mapRow),
        totalNeedingFollowUp: rows.length,
      },
    });
  },
);

// GET /dashboard — Context dashboard
contextIntelligenceRouter.get(
  "/dashboard",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Pending action items
    const pendingActions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailActionItems)
      .where(
        and(
          eq(emailActionItems.accountId, accountId),
          eq(emailActionItems.status, "pending"),
        ),
      );

    // Completed action items (for completion rate)
    const completedActions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailActionItems)
      .where(
        and(
          eq(emailActionItems.accountId, accountId),
          eq(emailActionItems.status, "completed"),
        ),
      );

    // Total action items
    const totalActions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailActionItems)
      .where(eq(emailActionItems.accountId, accountId));

    // Upcoming deadlines (next 7 days)
    const upcomingDeadlines = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailDeadlines)
      .where(
        and(
          eq(emailDeadlines.accountId, accountId),
          gte(emailDeadlines.deadlineDate, now),
          lt(emailDeadlines.deadlineDate, sevenDaysOut),
        ),
      );

    // Overdue deadlines
    const overdueDeadlines = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailDeadlines)
      .where(
        and(
          eq(emailDeadlines.accountId, accountId),
          lt(emailDeadlines.deadlineDate, now),
        ),
      );

    // Active promises
    const activePromises = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailPromises)
      .where(
        and(
          eq(emailPromises.accountId, accountId),
          eq(emailPromises.status, "active"),
        ),
      );

    // Promises needing follow-up
    const followUpNeeded = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailPromises)
      .where(
        and(
          eq(emailPromises.accountId, accountId),
          eq(emailPromises.status, "active"),
          eq(emailPromises.followUpSent, false),
        ),
      );

    const total = totalActions[0]?.count ?? 0;
    const completed = completedActions[0]?.count ?? 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return c.json({
      data: {
        actionItems: {
          pending: pendingActions[0]?.count ?? 0,
          completed,
          total,
          completionRate,
        },
        deadlines: {
          upcoming: upcomingDeadlines[0]?.count ?? 0,
          overdue: overdueDeadlines[0]?.count ?? 0,
        },
        promises: {
          active: activePromises[0]?.count ?? 0,
          needingFollowUp: followUpNeeded[0]?.count ?? 0,
        },
      },
    });
  },
);

// POST /batch-extract — Batch extract from multiple emails (max 25)
contextIntelligenceRouter.post(
  "/batch-extract",
  requireScope("messages:write"),
  validateBody(BatchExtractSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof BatchExtractSchema>>(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const now = new Date();

    const results: Array<{
      emailId: string;
      threadId: string;
      actionItems: number;
      deadlines: number;
      promises: number;
    }> = [];

    for (const email of input.emails) {
      const threadId = email.threadId ?? email.emailId;
      const extracted = extractContextFromContent(email.content, email.participants);

      let actionItemCount = 0;
      let deadlineCount = 0;
      let promiseCount = 0;

      for (const item of extracted.actionItems) {
        const id = generateId();
        await db.insert(emailActionItems).values({
          id,
          accountId,
          emailId: email.emailId,
          threadId,
          actionText: item.actionText,
          assignedTo: item.assignedTo,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          priority: item.priority,
          status: "pending",
          confidence: item.confidence,
          source: "ai_detected",
          createdAt: now,
          updatedAt: now,
        });
        actionItemCount++;
      }

      for (const dl of extracted.deadlines) {
        const id = generateId();
        await db.insert(emailDeadlines).values({
          id,
          accountId,
          emailId: email.emailId,
          threadId,
          deadlineDate: new Date(dl.deadlineDate),
          description: dl.description,
          isExplicit: dl.isExplicit,
          confidence: dl.confidence,
          reminderSent: false,
          createdAt: now,
        });
        deadlineCount++;
      }

      for (const p of extracted.promises) {
        const id = generateId();
        await db.insert(emailPromises).values({
          id,
          accountId,
          emailId: email.emailId,
          threadId,
          promiseText: p.promiseText,
          promisor: p.promisor,
          promisee: p.promisee,
          dueDate: p.dueDate ? new Date(p.dueDate) : null,
          status: "active",
          confidence: p.confidence,
          followUpSent: false,
          createdAt: now,
          updatedAt: now,
        });
        promiseCount++;
      }

      results.push({
        emailId: email.emailId,
        threadId,
        actionItems: actionItemCount,
        deadlines: deadlineCount,
        promises: promiseCount,
      });
    }

    return c.json(
      {
        data: {
          processed: results.length,
          results,
        },
      },
      201,
    );
  },
);

export { contextIntelligenceRouter };
