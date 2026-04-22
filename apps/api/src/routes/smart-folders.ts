/**
 * Smart Folders Route — Saved Searches / Custom Views that auto-populate
 *
 * POST   /v1/smart-folders              — Create a smart folder
 * GET    /v1/smart-folders              — List smart folders
 * GET    /v1/smart-folders/:id          — Get a single smart folder
 * PUT    /v1/smart-folders/:id          — Update a smart folder
 * DELETE /v1/smart-folders/:id          — Delete a smart folder
 * GET    /v1/smart-folders/:id/emails   — Get emails matching this folder's filters
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, ilike, gte, lte, sql, exists } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, smartFolders, emails } from "@alecrae/db";
import type { SmartFolderFilter } from "@alecrae/db";
import type { SQL } from "drizzle-orm";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SmartFolderFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  hasAttachment: z.boolean().optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
  dateAfter: z.string().optional(),
  dateBefore: z.string().optional(),
  query: z.string().optional(),
  senderDomain: z.string().optional(),
  category: z.string().optional(),
});

const CreateSmartFolderSchema = z.object({
  name: z.string().min(1).max(255),
  icon: z.string().max(50).optional(),
  color: z.string().max(50).optional(),
  type: z.enum(["smart", "saved_search"]).optional(),
  filters: SmartFolderFilterSchema,
  sortOrder: z.number().int().min(0).optional(),
});

const UpdateSmartFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(50).optional(),
  type: z.enum(["smart", "saved_search"]).optional(),
  filters: SmartFolderFilterSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const ListSmartFoldersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  type: z.enum(["smart", "saved_search"]).optional(),
});

const ListFolderEmailsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build dynamic WHERE conditions from a SmartFolderFilter against the emails table.
 * Only applies filters for columns that actually exist on the emails table.
 */
function buildFilterConditions(
  filter: SmartFolderFilter,
  accountId: string,
): SQL[] {
  const conditions: SQL[] = [eq(emails.accountId, accountId)];

  if (filter.from) {
    conditions.push(ilike(emails.fromAddress, `%${filter.from}%`));
  }

  if (filter.to) {
    // toAddresses is JSONB — use a text cast for pattern matching
    conditions.push(
      sql`${emails.toAddresses}::text ILIKE ${"%" + filter.to + "%"}`,
    );
  }

  if (filter.subject) {
    conditions.push(ilike(emails.subject, `%${filter.subject}%`));
  }

  if (filter.hasAttachment === true) {
    conditions.push(
      exists(
        sql`SELECT 1 FROM attachments WHERE attachments.email_id = ${emails.id}`,
      ),
    );
  } else if (filter.hasAttachment === false) {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM attachments WHERE attachments.email_id = ${emails.id})`,
    );
  }

  if (filter.dateAfter) {
    conditions.push(gte(emails.createdAt, new Date(filter.dateAfter)));
  }

  if (filter.dateBefore) {
    conditions.push(lte(emails.createdAt, new Date(filter.dateBefore)));
  }

  if (filter.query) {
    // Full-text search across subject and text body
    conditions.push(
      sql`(${emails.subject} ILIKE ${"%" + filter.query + "%"} OR ${emails.textBody} ILIKE ${"%" + filter.query + "%"})`,
    );
  }

  if (filter.senderDomain) {
    // Match the domain portion of fromAddress
    conditions.push(
      ilike(emails.fromAddress, `%@${filter.senderDomain}`),
    );
  }

  if (filter.labels && filter.labels.length > 0) {
    // Labels stored in the tags JSONB array on the emails table
    for (const label of filter.labels) {
      conditions.push(
        sql`${emails.tags} @> ${JSON.stringify([label])}::jsonb`,
      );
    }
  }

  if (filter.category) {
    // Category stored in metadata JSONB
    conditions.push(
      sql`${emails.metadata}->>'category' = ${filter.category}`,
    );
  }

  // isRead and isStarred — stored in metadata JSONB if present
  if (filter.isRead !== undefined) {
    conditions.push(
      sql`(${emails.metadata}->>'isRead')::boolean = ${filter.isRead}`,
    );
  }

  if (filter.isStarred !== undefined) {
    conditions.push(
      sql`(${emails.metadata}->>'isStarred')::boolean = ${filter.isStarred}`,
    );
  }

  return conditions;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const smartFoldersRouter = new Hono();

// POST /v1/smart-folders — Create a smart folder
smartFoldersRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateSmartFolderSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateSmartFolderSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(smartFolders).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      icon: input.icon ?? null,
      color: input.color ?? null,
      type: input.type ?? "smart",
      filters: input.filters,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          icon: input.icon ?? null,
          color: input.color ?? null,
          type: input.type ?? "smart",
          filters: input.filters,
          sortOrder: input.sortOrder ?? 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/smart-folders — List smart folders
smartFoldersRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListSmartFoldersQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListSmartFoldersQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions: SQL[] = [eq(smartFolders.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(smartFolders.createdAt, new Date(query.cursor)));
    }

    if (query.type) {
      conditions.push(eq(smartFolders.type, query.type));
    }

    const rows = await db
      .select({
        id: smartFolders.id,
        name: smartFolders.name,
        icon: smartFolders.icon,
        color: smartFolders.color,
        type: smartFolders.type,
        filters: smartFolders.filters,
        sortOrder: smartFolders.sortOrder,
        createdAt: smartFolders.createdAt,
        updatedAt: smartFolders.updatedAt,
      })
      .from(smartFolders)
      .where(and(...conditions))
      .orderBy(desc(smartFolders.createdAt))
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
        icon: row.icon,
        color: row.color,
        type: row.type,
        filters: row.filters,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/smart-folders/:id — Get a single smart folder
smartFoldersRouter.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [folder] = await db
      .select()
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.accountId, auth.accountId)))
      .limit(1);

    if (!folder) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart folder ${id} not found`,
            code: "smart_folder_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
        type: folder.type,
        filters: folder.filters,
        sortOrder: folder.sortOrder,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /v1/smart-folders/:id — Update a smart folder
smartFoldersRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateSmartFolderSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateSmartFolderSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: smartFolders.id })
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart folder ${id} not found`,
            code: "smart_folder_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(smartFolders)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        updatedAt: now,
      })
      .where(and(eq(smartFolders.id, id), eq(smartFolders.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/smart-folders/:id — Delete a smart folder
smartFoldersRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: smartFolders.id })
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart folder ${id} not found`,
            code: "smart_folder_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

// GET /v1/smart-folders/:id/emails — Get emails matching this folder's filters
smartFoldersRouter.get(
  "/:id/emails",
  requireScope("messages:read"),
  validateQuery(ListFolderEmailsQuery),
  async (c) => {
    const id = c.req.param("id");
    const query = getValidatedQuery<z.infer<typeof ListFolderEmailsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Fetch the smart folder to get its filter criteria
    const [folder] = await db
      .select()
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.accountId, auth.accountId)))
      .limit(1);

    if (!folder) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Smart folder ${id} not found`,
            code: "smart_folder_not_found",
          },
        },
        404,
      );
    }

    // Build dynamic WHERE conditions from the folder's filter JSON
    const conditions = buildFilterConditions(folder.filters, auth.accountId);

    if (query.cursor) {
      conditions.push(lt(emails.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: emails.id,
        messageId: emails.messageId,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        toAddresses: emails.toAddresses,
        subject: emails.subject,
        status: emails.status,
        tags: emails.tags,
        createdAt: emails.createdAt,
        sentAt: emails.sentAt,
      })
      .from(emails)
      .where(and(...conditions))
      .orderBy(desc(emails.createdAt))
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
        messageId: row.messageId,
        fromAddress: row.fromAddress,
        fromName: row.fromName,
        toAddresses: row.toAddresses,
        subject: row.subject,
        status: row.status,
        tags: row.tags,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

export { smartFoldersRouter };
