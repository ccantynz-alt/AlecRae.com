/**
 * Files Route — Attachment management + cloud storage browser
 *
 * GET    /v1/files                        — List all files (paginated, filterable)
 * GET    /v1/files/:id                    — Get file metadata
 * POST   /v1/files/upload                 — Upload a file (presigned URL placeholder)
 * DELETE /v1/files/:id                    — Delete a file
 * GET    /v1/files/stats                  — Get storage usage stats
 * GET    /v1/emails/:emailId/attachments  — List attachments for an email
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, sql, count } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, files } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const UploadFileSchema = z.object({
  name: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  size: z.number().int().min(1),
  emailId: z.string().optional(),
  threadId: z.string().optional(),
  source: z.enum(["attachment", "upload", "drive"]).default("upload"),
});

const ListFilesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  mimeType: z.string().optional(),
  source: z.enum(["attachment", "upload", "drive"]).optional(),
  emailId: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatFile(row: {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storageKey: string;
  source: "attachment" | "upload" | "drive";
  emailId: string | null;
  threadId: string | null;
  thumbnailKey: string | null;
  uploadedAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    storageKey: row.storageKey,
    source: row.source,
    emailId: row.emailId,
    threadId: row.threadId,
    thumbnailKey: row.thumbnailKey,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const filesRouter = new Hono();

// GET /v1/files/stats — Get storage usage stats (must be before /:id to avoid conflict)
filesRouter.get(
  "/stats",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Total count and size
    const [totals] = await db
      .select({
        totalFiles: count(),
        totalSize: sql<string>`coalesce(sum(${files.size}), 0)`,
      })
      .from(files)
      .where(eq(files.accountId, auth.accountId));

    // Breakdown by mime type category
    const breakdown = await db
      .select({
        mimeType: files.mimeType,
        fileCount: count(),
        totalSize: sql<string>`coalesce(sum(${files.size}), 0)`,
      })
      .from(files)
      .where(eq(files.accountId, auth.accountId))
      .groupBy(files.mimeType);

    // Group by broad category (image, document, audio, video, other)
    const categories: Record<string, { count: number; size: number }> = {};

    for (const row of breakdown) {
      const mime = row.mimeType;
      let category = "other";
      if (mime.startsWith("image/")) category = "image";
      else if (mime.startsWith("video/")) category = "video";
      else if (mime.startsWith("audio/")) category = "audio";
      else if (
        mime.startsWith("text/") ||
        mime.includes("pdf") ||
        mime.includes("document") ||
        mime.includes("spreadsheet") ||
        mime.includes("presentation")
      )
        category = "document";

      if (!categories[category]) {
        categories[category] = { count: 0, size: 0 };
      }
      categories[category].count += row.fileCount;
      categories[category].size += Number(row.totalSize);
    }

    return c.json({
      data: {
        totalFiles: totals?.totalFiles ?? 0,
        totalSize: Number(totals?.totalSize ?? 0),
        breakdown: categories,
      },
    });
  },
);

// GET /v1/files — List all files (paginated, filterable)
filesRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListFilesQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListFilesQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(files.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(files.uploadedAt, new Date(query.cursor)));
    }

    if (query.mimeType) {
      conditions.push(eq(files.mimeType, query.mimeType));
    }

    if (query.source) {
      conditions.push(eq(files.source, query.source));
    }

    if (query.emailId) {
      conditions.push(eq(files.emailId, query.emailId));
    }

    const rows = await db
      .select()
      .from(files)
      .where(and(...conditions))
      .orderBy(desc(files.uploadedAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.uploadedAt.toISOString()
        : null;

    return c.json({
      data: page.map(formatFile),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/files/:id — Get file metadata
filesRouter.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.accountId, auth.accountId)))
      .limit(1);

    if (!file) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `File ${id} not found`,
            code: "file_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: formatFile(file) });
  },
);

// POST /v1/files/upload — Upload a file (presigned URL placeholder)
filesRouter.post(
  "/upload",
  requireScope("messages:write"),
  validateBody(UploadFileSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof UploadFileSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const storageKey = `${auth.accountId}/${id}/${input.name}`;
    const now = new Date();

    await db.insert(files).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      mimeType: input.mimeType,
      size: input.size,
      storageKey,
      source: input.source,
      emailId: input.emailId ?? null,
      threadId: input.threadId ?? null,
      thumbnailKey: null,
      uploadedAt: now,
    });

    // In production this would return a presigned R2 upload URL.
    // For now we return the storage key and a placeholder upload URL.
    const presignedUrl = `https://storage.alecrae.com/upload/${storageKey}?token=${id}`;

    return c.json(
      {
        data: {
          id,
          name: input.name,
          storageKey,
          uploadUrl: presignedUrl,
          expiresIn: 3600,
          uploadedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// DELETE /v1/files/:id — Delete a file
filesRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, id), eq(files.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `File ${id} not found`,
            code: "file_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(files)
      .where(and(eq(files.id, id), eq(files.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

// ─── Email-scoped routes ──────────────────────────────────────────────────────

const emailAttachmentsRouter = new Hono();

// GET /v1/emails/:emailId/attachments — List attachments for an email
emailAttachmentsRouter.get(
  "/:emailId/attachments",
  requireScope("messages:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(files)
      .where(
        and(eq(files.accountId, auth.accountId), eq(files.emailId, emailId)),
      )
      .orderBy(desc(files.uploadedAt));

    return c.json({
      data: rows.map(formatFile),
    });
  },
);

export { filesRouter, emailAttachmentsRouter };
