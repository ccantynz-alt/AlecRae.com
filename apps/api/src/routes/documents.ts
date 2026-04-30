/**
 * Documents Route — AlecRae Docs/Sheets/Slides (replaces Google Docs / Sheets / Slides)
 *
 * POST   /v1/documents                          — Create a document
 * GET    /v1/documents                          — List documents (paginated, filterable)
 * GET    /v1/documents/:id                      — Get a single document
 * PUT    /v1/documents/:id                      — Update a document (+ version history)
 * DELETE /v1/documents/:id                      — Soft delete (set archivedAt)
 * POST   /v1/documents/:id/ai-assist            — AI assist (summarize/expand/rewrite/translate/proofread)
 * POST   /v1/documents/:id/export               — Export (pdf/html/markdown)
 * GET    /v1/documents/folders                  — List folders for account
 * POST   /v1/documents/folders                  — Create folder
 * DELETE /v1/documents/folders/:id              — Delete folder
 * GET    /v1/documents/:id/versions             — List version history
 * POST   /v1/documents/:id/restore/:versionId   — Restore to a specific version
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
import { getDatabase, documents, documentFolders, documentVersions } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  type: z.enum(["doc", "spreadsheet", "presentation", "form"]).default("doc"),
  folderId: z.string().nullable().optional(),
  isTemplate: z.boolean().default(false),
  tags: z.array(z.string().max(100)).max(50).optional(),
});

const UpdateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  isPublic: z.boolean().optional(),
});

const ListDocumentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  type: z.enum(["doc", "spreadsheet", "presentation", "form"]).optional(),
  folderId: z.string().optional(),
});

const AiAssistSchema = z.object({
  action: z.enum(["summarize", "expand", "rewrite", "translate", "proofread"]),
  targetLanguage: z.string().max(50).optional(),
});

const ExportSchema = z.object({
  format: z.enum(["pdf", "html", "markdown"]),
});

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().nullable().optional(),
  color: z.string().max(50).nullable().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text.trim().split(/\s+/).length;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const documentsRouter = new Hono();

// GET /v1/documents/folders — List folders (must be before /:id to avoid conflict)
documentsRouter.get(
  "/folders",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(documentFolders)
      .where(eq(documentFolders.accountId, auth.accountId))
      .orderBy(documentFolders.sortOrder);

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        color: row.color,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);

// POST /v1/documents/folders — Create folder
documentsRouter.post(
  "/folders",
  requireScope("messages:write"),
  validateBody(CreateFolderSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateFolderSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(documentFolders).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      parentId: input.parentId ?? null,
      color: input.color ?? null,
      sortOrder: 0,
      createdAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          parentId: input.parentId ?? null,
          color: input.color ?? null,
          sortOrder: 0,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// DELETE /v1/documents/folders/:id — Delete folder
documentsRouter.delete(
  "/folders/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: documentFolders.id })
      .from(documentFolders)
      .where(
        and(
          eq(documentFolders.id, id),
          eq(documentFolders.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Folder ${id} not found`,
            code: "folder_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(documentFolders)
      .where(
        and(
          eq(documentFolders.id, id),
          eq(documentFolders.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// POST /v1/documents — Create a document
documentsRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateDocumentSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateDocumentSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(documents).values({
      id,
      accountId: auth.accountId,
      title: input.title,
      content: "",
      type: input.type,
      folderId: input.folderId ?? null,
      isPublic: false,
      isTemplate: input.isTemplate,
      collaborators: [],
      tags: input.tags ?? [],
      version: 1,
      wordCount: 0,
      lastEditedBy: auth.accountId,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });

    return c.json(
      {
        data: {
          id,
          title: input.title,
          type: input.type,
          folderId: input.folderId ?? null,
          isTemplate: input.isTemplate,
          tags: input.tags ?? [],
          version: 1,
          wordCount: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/documents — List documents (paginated, filterable)
documentsRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListDocumentsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListDocumentsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [
      eq(documents.accountId, auth.accountId),
      isNull(documents.archivedAt),
    ];

    if (query.cursor) {
      conditions.push(lt(documents.updatedAt, new Date(query.cursor)));
    }

    if (query.type) {
      conditions.push(eq(documents.type, query.type));
    }

    if (query.folderId) {
      conditions.push(eq(documents.folderId, query.folderId));
    }

    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        folderId: documents.folderId,
        isPublic: documents.isPublic,
        isTemplate: documents.isTemplate,
        tags: documents.tags,
        version: documents.version,
        wordCount: documents.wordCount,
        lastEditedBy: documents.lastEditedBy,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(and(...conditions))
      .orderBy(desc(documents.updatedAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.updatedAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        folderId: row.folderId,
        isPublic: row.isPublic,
        isTemplate: row.isTemplate,
        tags: row.tags,
        version: row.version,
        wordCount: row.wordCount,
        lastEditedBy: row.lastEditedBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/documents/:id — Get a single document
documentsRouter.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)))
      .limit(1);

    if (!doc) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Document ${id} not found`,
            code: "document_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        type: doc.type,
        folderId: doc.folderId,
        isPublic: doc.isPublic,
        isTemplate: doc.isTemplate,
        collaborators: doc.collaborators,
        tags: doc.tags,
        version: doc.version,
        wordCount: doc.wordCount,
        lastEditedBy: doc.lastEditedBy,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        archivedAt: doc.archivedAt?.toISOString() ?? null,
      },
    });
  },
);

// PUT /v1/documents/:id — Update a document (+ version history)
documentsRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateDocumentSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateDocumentSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Document ${id} not found`,
            code: "document_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const newVersion = existing.version + 1;
    const newContent = input.content ?? existing.content;
    const newWordCount = input.content !== undefined ? countWords(input.content) : existing.wordCount;

    // Create a version snapshot of the current state before updating
    await db.insert(documentVersions).values({
      id: generateId(),
      documentId: id,
      version: existing.version,
      content: existing.content,
      editedBy: existing.lastEditedBy,
      changeDescription: null,
      createdAt: now,
    });

    // Update the document
    await db
      .update(documents)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
        version: newVersion,
        wordCount: newWordCount,
        lastEditedBy: auth.accountId,
        updatedAt: now,
      })
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        title: input.title ?? existing.title,
        content: newContent,
        tags: input.tags ?? existing.tags,
        isPublic: input.isPublic ?? existing.isPublic,
        version: newVersion,
        wordCount: newWordCount,
        lastEditedBy: auth.accountId,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/documents/:id — Soft delete (set archivedAt)
documentsRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Document ${id} not found`,
            code: "document_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(documents)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)));

    return c.json({ deleted: true, id, archivedAt: now.toISOString() });
  },
);

// POST /v1/documents/:id/ai-assist — AI assist (placeholder)
documentsRouter.post(
  "/:id/ai-assist",
  requireScope("messages:write"),
  validateBody(AiAssistSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof AiAssistSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [doc] = await db
      .select({ id: documents.id, content: documents.content, title: documents.title })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)))
      .limit(1);

    if (!doc) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Document ${id} not found`,
            code: "document_not_found",
          },
        },
        404,
      );
    }

    // Placeholder AI responses by action type
    const placeholders: Record<string, string> = {
      summarize: `Summary of "${doc.title}": This document contains ${countWords(doc.content)} words. AI summarization will be powered by Claude when connected.`,
      expand: `Expanded version of "${doc.title}": The content has been expanded with additional context and detail. AI expansion will be powered by Claude when connected.`,
      rewrite: `Rewritten version of "${doc.title}": The content has been rewritten for clarity and impact. AI rewriting will be powered by Claude when connected.`,
      translate: `Translated version of "${doc.title}" to ${input.targetLanguage ?? "English"}: Translation will be powered by Claude when connected.`,
      proofread: `Proofread version of "${doc.title}": No issues found. AI proofreading will be powered by Claude when connected.`,
    };

    return c.json({
      data: {
        documentId: id,
        action: input.action,
        result: placeholders[input.action] ?? "AI processing complete.",
        targetLanguage: input.targetLanguage ?? null,
      },
    });
  },
);

// POST /v1/documents/:id/export — Export (placeholder)
documentsRouter.post(
  "/:id/export",
  requireScope("messages:read"),
  validateBody(ExportSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof ExportSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [doc] = await db
      .select({ id: documents.id, title: documents.title, content: documents.content })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)))
      .limit(1);

    if (!doc) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Document ${id} not found`,
            code: "document_not_found",
          },
        },
        404,
      );
    }

    // Placeholder export — in production this would generate the actual file
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      html: "text/html",
      markdown: "text/markdown",
    };

    return c.json({
      data: {
        documentId: id,
        format: input.format,
        mimeType: mimeTypes[input.format],
        downloadUrl: `https://storage.alecrae.com/exports/${id}.${input.format}?token=${generateId()}`,
        expiresIn: 3600,
      },
    });
  },
);

// GET /v1/documents/:id/versions — List version history
documentsRouter.get(
  "/:id/versions",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the document belongs to this account
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)))
      .limit(1);

    if (!doc) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Document ${id} not found`,
            code: "document_not_found",
          },
        },
        404,
      );
    }

    const rows = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.version));

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        version: row.version,
        content: row.content,
        editedBy: row.editedBy,
        changeDescription: row.changeDescription,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);

// POST /v1/documents/:id/restore/:versionId — Restore to a specific version
documentsRouter.post(
  "/:id/restore/:versionId",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const versionId = c.req.param("versionId");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the document belongs to this account
    const [existing] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Document ${id} not found`,
            code: "document_not_found",
          },
        },
        404,
      );
    }

    // Find the target version
    const [targetVersion] = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.id, versionId),
          eq(documentVersions.documentId, id),
        ),
      )
      .limit(1);

    if (!targetVersion) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Version ${versionId} not found for document ${id}`,
            code: "version_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const newVersion = existing.version + 1;
    const restoredWordCount = countWords(targetVersion.content);

    // Snapshot the current state before restoring
    await db.insert(documentVersions).values({
      id: generateId(),
      documentId: id,
      version: existing.version,
      content: existing.content,
      editedBy: existing.lastEditedBy,
      changeDescription: `Before restore to version ${targetVersion.version}`,
      createdAt: now,
    });

    // Restore the document content from the target version
    await db
      .update(documents)
      .set({
        content: targetVersion.content,
        version: newVersion,
        wordCount: restoredWordCount,
        lastEditedBy: auth.accountId,
        updatedAt: now,
      })
      .where(and(eq(documents.id, id), eq(documents.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        restoredFromVersion: targetVersion.version,
        restoredFromVersionId: versionId,
        version: newVersion,
        wordCount: restoredWordCount,
        updatedAt: now.toISOString(),
      },
    });
  },
);

export { documentsRouter };
