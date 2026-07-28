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
import { eq, and, or, desc, lt, sql, count, ilike } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
  validateQuery,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, files, emails } from "@alecrae/db";
import { vapron, isVapronConfigured, VapronError } from "../lib/vapron.js";
import {
  checkStorageQuota,
  incrementStorageUsage,
  decrementStorageUsage,
} from "../lib/storage-quota.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const FILE_CATEGORIES = [
  "images",
  "documents",
  "spreadsheets",
  "archives",
  "audio",
  "video",
] as const;
type FileCategory = (typeof FILE_CATEGORIES)[number];

const ListFilesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  mimeType: z.string().optional(),
  source: z.enum(["attachment", "upload", "drive"]).optional(),
  emailId: z.string().optional(),
  /** Free-text match on the file name. */
  q: z.string().trim().min(1).max(200).optional(),
  /**
   * Coarse type filter backing the Files page's tabs. The page has always sent
   * a filter and a search term; neither was declared here, so Zod stripped both
   * and every tab silently returned the same unfiltered list.
   */
  category: z.enum(FILE_CATEGORIES).optional(),
});

/** MIME patterns per coarse category, matched case-insensitively against mime_type. */
const CATEGORY_MIME_PATTERNS: Record<FileCategory, string[]> = {
  images: ["image/%"],
  documents: [
    "application/pdf",
    "text/%",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessing%",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentation%",
    "application/vnd.oasis.opendocument.text",
  ],
  spreadsheets: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheet%",
    "application/vnd.oasis.opendocument.spreadsheet",
    "text/csv",
  ],
  archives: [
    "application/zip",
    "application/x-zip-compressed",
    "application/x-tar",
    "application/gzip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
  ],
  audio: ["audio/%"],
  video: ["video/%"],
};

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
  /** Subject of the email this file came from, when joined in. */
  emailSubject?: string | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    storageKey: row.storageKey,
    source: row.source,
    emailId: row.emailId,
    emailSubject: row.emailSubject ?? null,
    threadId: row.threadId,
    thumbnailKey: row.thumbnailKey,
    uploadedAt: row.uploadedAt.toISOString(),
    // There is no download path yet: Vapron's documented REST surface exposes
    // an upload-URL endpoint but no presigned GET, and guessing one would
    // repeat the transport mistake of issue #83. Callers must not synthesise a
    // URL from storageKey — this flag is the contract, and the UI disables its
    // download affordance on it rather than offering a link that 404s.
    downloadAvailable: false,
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

    // The Files page shows a usage bar, which needs the plan's ceiling. Derived
    // from the same storage-quota source the upload path enforces, so the bar
    // and the 413 can never disagree.
    const quota = await checkStorageQuota(auth.accountId, 0);

    return c.json({
      data: {
        totalFiles: totals?.totalFiles ?? 0,
        totalSize: Number(totals?.totalSize ?? 0),
        maxSize: quota.limitBytes,
        planTier: quota.planTier,
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

    if (query.q) {
      // Escape LIKE wildcards so a literal % or _ in the search box matches itself.
      const escaped = query.q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      conditions.push(ilike(files.name, `%${escaped}%`));
    }

    if (query.category) {
      const patterns = CATEGORY_MIME_PATTERNS[query.category];
      const matches = patterns.map((p) => ilike(files.mimeType, p));
      const combined = matches.length === 1 ? matches[0] : or(...matches);
      if (combined) conditions.push(combined);
    }

    // Left-join the source email so the list can show which message a file
    // arrived on — the UI renders that column and the API never returned it.
    const rows = await db
      .select({
        id: files.id,
        name: files.name,
        mimeType: files.mimeType,
        size: files.size,
        storageKey: files.storageKey,
        source: files.source,
        emailId: files.emailId,
        threadId: files.threadId,
        thumbnailKey: files.thumbnailKey,
        uploadedAt: files.uploadedAt,
        emailSubject: emails.subject,
      })
      .from(files)
      .leftJoin(emails, eq(files.emailId, emails.id))
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

    // Enforce the account's plan storage limit BEFORE issuing an upload URL.
    // lib/storage-quota.ts was fully built and unit-tested but had no
    // production caller at all, so uploads were unbounded — a direct object-
    // storage cost exposure, not just a policy gap.
    const quota = await checkStorageQuota(auth.accountId, body.size);
    if (!quota.allowed) {
      return c.json(
        {
          error: {
            type: "storage_quota_exceeded",
            message:
              `This upload would exceed your plan's storage limit ` +
              `(${quota.currentUsageBytes} of ${quota.limitBytes} bytes used). ` +
              `Delete some files or upgrade your plan.`,
            code: "storage_quota_exceeded",
            currentUsageBytes: quota.currentUsageBytes,
            limitBytes: quota.limitBytes,
            planTier: quota.planTier,
          },
        },
        413,
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

    // Counted at the same moment the row becomes real. The weekly reconciler
    // (reconcileStorageUsage) corrects any drift from uploads that never
    // completed their PUT.
    await incrementStorageUsage(auth.accountId, body.size);

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
      .select({ id: files.id, size: files.size })
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

    // Give the space back. Without this, deletes never freed quota and an
    // account's recorded usage only ever grew.
    await decrementStorageUsage(auth.accountId, existing.size);

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
