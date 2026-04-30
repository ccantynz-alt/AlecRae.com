/**
 * Notes Route — Email-linked notes (like Notion meets email)
 *
 * POST   /v1/notes              — Create a note
 * GET    /v1/notes              — List notes (paginated, filterable)
 * GET    /v1/notes/:id          — Get a single note
 * PUT    /v1/notes/:id          — Update a note
 * DELETE /v1/notes/:id          — Delete a note
 * POST   /v1/notes/:id/pin     — Pin/unpin a note
 * GET    /v1/emails/:emailId/notes   — Get all notes linked to an email
 * GET    /v1/threads/:threadId/notes — Get all notes linked to a thread
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, notes } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateNoteSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().min(1),
  emailId: z.string().optional(),
  threadId: z.string().optional(),
  contactId: z.string().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
});

const UpdateNoteSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().min(1).optional(),
  emailId: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
});

const PinNoteSchema = z.object({
  pinned: z.boolean(),
});

const ListNotesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  emailId: z.string().optional(),
  threadId: z.string().optional(),
  contactId: z.string().optional(),
  tag: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatNote(row: {
  id: string;
  title: string;
  content: string;
  htmlContent: string | null;
  emailId: string | null;
  threadId: string | null;
  contactId: string | null;
  tags: string[];
  isPinned: string;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    htmlContent: row.htmlContent,
    emailId: row.emailId,
    threadId: row.threadId,
    contactId: row.contactId,
    tags: row.tags,
    isPinned: row.isPinned === "true",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const notesRouter = new Hono();

// POST /v1/notes — Create a note
notesRouter.post(
  "/",
  requireScope("account:manage"),
  validateBody(CreateNoteSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateNoteSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(notes).values({
      id,
      accountId: auth.accountId,
      title: input.title ?? "",
      content: input.content,
      emailId: input.emailId ?? null,
      threadId: input.threadId ?? null,
      contactId: input.contactId ?? null,
      tags: input.tags ?? [],
      isPinned: "false",
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          title: input.title ?? "",
          content: input.content,
          emailId: input.emailId ?? null,
          threadId: input.threadId ?? null,
          contactId: input.contactId ?? null,
          tags: input.tags ?? [],
          isPinned: false,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/notes — List notes (paginated, filterable)
notesRouter.get(
  "/",
  requireScope("account:manage"),
  validateQuery(ListNotesQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListNotesQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(notes.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(notes.createdAt, new Date(query.cursor)));
    }

    if (query.emailId) {
      conditions.push(eq(notes.emailId, query.emailId));
    }

    if (query.threadId) {
      conditions.push(eq(notes.threadId, query.threadId));
    }

    if (query.contactId) {
      conditions.push(eq(notes.contactId, query.contactId));
    }

    // Tag filtering is done post-query since tags is a JSONB array
    const rows = await db
      .select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.createdAt))
      .limit(query.limit + 1);

    // Filter by tag if specified
    const filtered = query.tag
      ? rows.filter((row) => row.tags.includes(query.tag!))
      : rows;

    const hasMore = filtered.length > query.limit;
    const page = hasMore ? filtered.slice(0, query.limit) : filtered;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map(formatNote),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/notes/:id — Get a single note
notesRouter.get(
  "/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [note] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.accountId, auth.accountId)))
      .limit(1);

    if (!note) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Note ${id} not found`,
            code: "note_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: formatNote(note) });
  },
);

// PUT /v1/notes/:id — Update a note
notesRouter.put(
  "/:id",
  requireScope("account:manage"),
  validateBody(UpdateNoteSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateNoteSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Note ${id} not found`,
            code: "note_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(notes)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.emailId !== undefined ? { emailId: input.emailId ?? null } : {}),
        ...(input.threadId !== undefined ? { threadId: input.threadId ?? null } : {}),
        ...(input.contactId !== undefined ? { contactId: input.contactId ?? null } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        updatedAt: now,
      })
      .where(and(eq(notes.id, id), eq(notes.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        title: input.title ?? existing.title,
        content: input.content ?? existing.content,
        emailId: input.emailId !== undefined ? (input.emailId ?? null) : existing.emailId,
        threadId: input.threadId !== undefined ? (input.threadId ?? null) : existing.threadId,
        contactId: input.contactId !== undefined ? (input.contactId ?? null) : existing.contactId,
        tags: input.tags ?? existing.tags,
        isPinned: existing.isPinned === "true",
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/notes/:id — Delete a note
notesRouter.delete(
  "/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Note ${id} not found`,
            code: "note_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

// POST /v1/notes/:id/pin — Pin/unpin a note
notesRouter.post(
  "/:id/pin",
  requireScope("account:manage"),
  validateBody(PinNoteSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof PinNoteSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Note ${id} not found`,
            code: "note_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(notes)
      .set({
        isPinned: input.pinned ? "true" : "false",
        updatedAt: now,
      })
      .where(and(eq(notes.id, id), eq(notes.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        isPinned: input.pinned,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// ─── Email/Thread-scoped routes ───────────────────────────────────────────────

const emailNotesRouter = new Hono();

// GET /v1/emails/:emailId/notes — Get all notes linked to an email
emailNotesRouter.get(
  "/:emailId/notes",
  requireScope("account:manage"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(notes)
      .where(
        and(eq(notes.accountId, auth.accountId), eq(notes.emailId, emailId)),
      )
      .orderBy(desc(notes.createdAt));

    return c.json({
      data: rows.map(formatNote),
    });
  },
);

const threadNotesRouter = new Hono();

// GET /v1/threads/:threadId/notes — Get all notes linked to a thread
threadNotesRouter.get(
  "/:threadId/notes",
  requireScope("account:manage"),
  async (c) => {
    const threadId = c.req.param("threadId");
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.accountId, auth.accountId),
          eq(notes.threadId, threadId),
        ),
      )
      .orderBy(desc(notes.createdAt));

    return c.json({
      data: rows.map(formatNote),
    });
  },
);

export { notesRouter, emailNotesRouter, threadNotesRouter };
