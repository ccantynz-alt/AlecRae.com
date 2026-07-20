/**
 * Files Route — Attachment management + cloud storage browser
 *
 * GET    /v1/files                        — List all files (paginated, filterable)
 * GET    /v1/files/:id                    — Get file metadata
 * POST   /v1/files/upload                 — Get a presigned upload URL (Vapron object storage)
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
  getValidatedBody,
  validateQuery,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, files } from "@alecrae/db";
import { vapron, isVapronConfigured, VapronError } from "../lib/vapron.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ListFilesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  mimeType: z.string().optional(),
  source: z.enum(["attachment", "upload", "drive"]).optional(),
  emailId: z.string().optional(),
});

const UploadFileSchema = z.object({
  name: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(255),
  size: z.number().int().positive().max(100 * 1024 * 1024), // 100MB ceiling
  emailId: z.string().optional(),
  threadId: z.string().optional(),
});

/** Storage bucket for user-uploaded files (distinct from email attachments, which live inline in message storage). */
const FILES_BUCKET = process.env["VAPRON_FILES_BUCKET"] ?? "alecrae-files";

/** Strip path separators and control chars from a client-supplied filename before using it in a storage key. */
function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately stripping control chars from a client-supplied filename
  return name.replace(/[/\\]/g, "_").replace(/[\x00-\x1f]/g, "").slice(0, 255) || "file";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      const cat = categories[category];
      if (cat) {
        cat.count += row.fileCount;
        cat.size += Number(row.totalSize);
      }
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
        ? page[page.length - 1]?.uploadedAt.toISOString()
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

// POST /v1/files/upload — Get a presigned upload URL (Vapron object storage)
//
// Issue #29 fix (2026-07-21): this used to insert a `files` row and hand back
// a fake `https://storage.alecrae.com/...` URL that 404s on every PUT — silent
// data loss, since the caller believed the upload succeeded. It was left as an
// honest 501 rather than fabricating success. Now wired to Vapron's real
// presigned-upload endpoint (lib/vapron.ts, corrected transport per issue
// #83): the client PUTs its file bytes directly to the returned `uploadUrl`
// (never proxied through our API), and only THEN is the `files` row real —
// created after Vapron confirms it issued a URL, not before. If Vapron is
// unconfigured or errors, this returns an honest 502/503 rather than a fake
// success — same standard as the rest of this session's audit fixes.
filesRouter.post(
  "/upload",
  requireScope("messages:write"),
  validateBody(UploadFileSchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof UploadFileSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    if (!isVapronConfigured()) {
      return c.json(
        {
          error: {
            type: "storage_unavailable",
            message: "File uploads are not available right now — object storage is not configured.",
            code: "storage_unavailable",
          },
        },
        503,
      );
    }

    const id = crypto.randomUUID();
    const storageKey = `${auth.accountId}/${id}/${sanitizeFilename(body.name)}`;

    let uploadUrl: string;
    try {
      const result = await vapron.storage.getUploadUrl({
        bucket: FILES_BUCKET,
        path: storageKey,
        contentType: body.mimeType,
      });
      uploadUrl = result.uploadUrl;
    } catch (err) {
      console.error("[files] Vapron getUploadUrl failed:", err);
      const status = err instanceof VapronError && err.status >= 400 && err.status < 500 ? 502 : 503;
      return c.json(
        {
          error: {
            type: "storage_unavailable",
            message: "Could not get an upload URL from object storage. Please try again shortly.",
            code: "storage_unavailable",
          },
        },
        status,
      );
    }

    const [file] = await db
      .insert(files)
      .values({
        id,
        accountId: auth.accountId,
        name: body.name,
        mimeType: body.mimeType,
        size: body.size,
        storageKey,
        source: "upload",
        emailId: body.emailId ?? null,
        threadId: body.threadId ?? null,
      })
      .returning();

    if (!file) {
      return c.json({ error: { type: "internal_error", message: "Failed to record file", code: "insert_failed" } }, 500);
    }

    return c.json({ data: { file: formatFile(file), uploadUrl } }, 201);
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
