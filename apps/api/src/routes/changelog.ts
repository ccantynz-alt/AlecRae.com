/**
 * Changelog Route (C8) — Public Release Notes
 *
 * Public listing of AlecRae releases and updates. Read endpoints are public
 * (no auth). Write endpoints (create/update/delete) require admin scope.
 *
 * GET    /v1/changelog          — List published changelog entries (paginated)
 * GET    /v1/changelog/:id      — Get a single entry
 * POST   /v1/changelog          — Create entry (admin only)
 * PUT    /v1/changelog/:id      — Update entry (admin only)
 * DELETE /v1/changelog/:id      — Soft-delete entry (admin only)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc, and, lte, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  validateParams,
  getValidatedBody,
  getValidatedQuery,
  getValidatedParams,
} from "../middleware/validator.js";
import { getDatabase, changelogEntries } from "@alecrae/db";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const ChangelogCategorySchema = z.enum([
  "feature",
  "improvement",
  "fix",
  "security",
  "breaking",
]);

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: ChangelogCategorySchema.optional(),
});

type ListQuery = z.infer<typeof ListQuerySchema>;

const IdParamsSchema = z.object({
  id: z.string().min(1),
});

type IdParams = z.infer<typeof IdParamsSchema>;

const CreateSchema = z.object({
  version: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  category: ChangelogCategorySchema,
  isPublished: z.boolean().default(false),
  authorName: z.string().min(1).max(200).default("AlecRae Team"),
  publishedAt: z.string().datetime().optional(),
});

type CreateInput = z.infer<typeof CreateSchema>;

const UpdateSchema = z.object({
  version: z.string().min(1).max(50).optional(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  category: ChangelogCategorySchema.optional(),
  isPublished: z.boolean().optional(),
  authorName: z.string().min(1).max(200).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});

type UpdateInput = z.infer<typeof UpdateSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

const changelog = new Hono();

// ─── GET / — List published entries (PUBLIC, no auth) ─────────────────────────

changelog.get(
  "/",
  validateQuery(ListQuerySchema),
  async (c) => {
    const query = getValidatedQuery<ListQuery>(c);
    const db = getDatabase();
    const offset = (query.page - 1) * query.limit;

    const conditions = [
      eq(changelogEntries.isPublished, true),
      lte(changelogEntries.publishedAt, new Date()),
    ];

    if (query.category) {
      conditions.push(eq(changelogEntries.category, query.category));
    }

    const whereClause = and(...conditions);

    const [entries, countResult] = await Promise.all([
      db
        .select()
        .from(changelogEntries)
        .where(whereClause)
        .orderBy(desc(changelogEntries.publishedAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(changelogEntries)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return c.json({
      data: {
        entries: entries.map((entry) => ({
          id: entry.id,
          version: entry.version,
          title: entry.title,
          content: entry.content,
          category: entry.category,
          publishedAt: entry.publishedAt?.toISOString() ?? null,
          authorName: entry.authorName,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
          hasMore: query.page * query.limit < total,
        },
      },
    });
  },
);

// ─── GET /:id — Get single entry (PUBLIC, no auth) ───────────────────────────

changelog.get(
  "/:id",
  validateParams(IdParamsSchema),
  async (c) => {
    const { id } = getValidatedParams<IdParams>(c);
    const db = getDatabase();

    const [entry] = await db
      .select()
      .from(changelogEntries)
      .where(
        and(
          eq(changelogEntries.id, id),
          eq(changelogEntries.isPublished, true),
        ),
      )
      .limit(1);

    if (!entry) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Changelog entry not found",
            code: "changelog_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: entry.id,
        version: entry.version,
        title: entry.title,
        content: entry.content,
        category: entry.category,
        publishedAt: entry.publishedAt?.toISOString() ?? null,
        authorName: entry.authorName,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    });
  },
);

// ─── POST / — Create entry (admin only) ──────────────────────────────────────

changelog.post(
  "/",
  requireScope("admin:write"),
  validateBody(CreateSchema),
  async (c) => {
    const body = getValidatedBody<CreateInput>(c);
    const db = getDatabase();
    const id = generateId();

    const publishedAt = body.isPublished
      ? body.publishedAt
        ? new Date(body.publishedAt)
        : new Date()
      : null;

    const [entry] = await db
      .insert(changelogEntries)
      .values({
        id,
        version: body.version,
        title: body.title,
        content: body.content,
        category: body.category,
        isPublished: body.isPublished,
        publishedAt,
        authorName: body.authorName,
      })
      .returning();

    if (!entry) {
      return c.json(
        {
          error: {
            type: "server_error",
            message: "Failed to create changelog entry",
            code: "create_failed",
          },
        },
        500,
      );
    }

    return c.json(
      {
        data: {
          id: entry.id,
          version: entry.version,
          title: entry.title,
          content: entry.content,
          category: entry.category,
          isPublished: entry.isPublished,
          publishedAt: entry.publishedAt?.toISOString() ?? null,
          authorName: entry.authorName,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        },
      },
      201,
    );
  },
);

// ─── PUT /:id — Update entry (admin only) ────────────────────────────────────

changelog.put(
  "/:id",
  requireScope("admin:write"),
  validateParams(IdParamsSchema),
  validateBody(UpdateSchema),
  async (c) => {
    const { id } = getValidatedParams<IdParams>(c);
    const body = getValidatedBody<UpdateInput>(c);
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(changelogEntries)
      .where(eq(changelogEntries.id, id))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Changelog entry not found",
            code: "changelog_not_found",
          },
        },
        404,
      );
    }

    const setClause: Record<string, unknown> = { updatedAt: new Date() };

    if (body.version !== undefined) setClause["version"] = body.version;
    if (body.title !== undefined) setClause["title"] = body.title;
    if (body.content !== undefined) setClause["content"] = body.content;
    if (body.category !== undefined) setClause["category"] = body.category;
    if (body.authorName !== undefined) setClause["authorName"] = body.authorName;

    if (body.isPublished !== undefined) {
      setClause["isPublished"] = body.isPublished;
      if (body.isPublished && !existing.publishedAt) {
        setClause["publishedAt"] = body.publishedAt
          ? new Date(body.publishedAt)
          : new Date();
      }
    }

    if (body.publishedAt !== undefined) {
      setClause["publishedAt"] = body.publishedAt
        ? new Date(body.publishedAt)
        : null;
    }

    const [updated] = await db
      .update(changelogEntries)
      .set(setClause)
      .where(eq(changelogEntries.id, id))
      .returning();

    if (!updated) {
      return c.json(
        {
          error: {
            type: "server_error",
            message: "Failed to update changelog entry",
            code: "update_failed",
          },
        },
        500,
      );
    }

    return c.json({
      data: {
        id: updated.id,
        version: updated.version,
        title: updated.title,
        content: updated.content,
        category: updated.category,
        isPublished: updated.isPublished,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
        authorName: updated.authorName,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  },
);

// ─── DELETE /:id — Delete entry (admin only) ─────────────────────────────────

changelog.delete(
  "/:id",
  requireScope("admin:write"),
  validateParams(IdParamsSchema),
  async (c) => {
    const { id } = getValidatedParams<IdParams>(c);
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(changelogEntries)
      .where(eq(changelogEntries.id, id))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Changelog entry not found",
            code: "changelog_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(changelogEntries)
      .where(eq(changelogEntries.id, id));

    return c.json({
      data: {
        deleted: true,
        id,
      },
    });
  },
);

export { changelog };
