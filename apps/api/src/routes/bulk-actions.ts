/**
 * Bulk Actions Route — Select multiple emails and act on them at once
 *
 * POST /v1/bulk/archive — Archive emails
 * POST /v1/bulk/delete  — Delete emails
 * POST /v1/bulk/read    — Mark as read
 * POST /v1/bulk/unread  — Mark as unread
 * POST /v1/bulk/star    — Star emails
 * POST /v1/bulk/unstar  — Unstar emails
 * POST /v1/bulk/label   — Apply label to emails
 * POST /v1/bulk/move    — Move emails to folder
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, emails, emailLabels } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const EmailIdsSchema = z.object({
  emailIds: z
    .array(z.string().min(1))
    .min(1, "At least one email ID is required")
    .max(500, "Cannot process more than 500 emails at once"),
});

const LabelSchema = z.object({
  emailIds: z
    .array(z.string().min(1))
    .min(1, "At least one email ID is required")
    .max(500, "Cannot process more than 500 emails at once"),
  labelId: z.string().min(1),
});

const MoveSchema = z.object({
  emailIds: z
    .array(z.string().min(1))
    .min(1, "At least one email ID is required")
    .max(500, "Cannot process more than 500 emails at once"),
  folder: z.enum(["inbox", "archive", "trash"]),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build a WHERE condition scoped to both the email IDs and the authenticated account.
 */
function scopedWhere(accountId: string, emailIds: string[]): ReturnType<typeof and> {
  return and(
    inArray(emails.id, emailIds),
    eq(emails.accountId, accountId),
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const bulkActionsRouter = new Hono();

// POST /v1/bulk/archive — Archive emails
bulkActionsRouter.post(
  "/archive",
  requireScope("messages:write"),
  validateBody(EmailIdsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EmailIdsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    await db
      .update(emails)
      .set({ folder: "archive", updatedAt: now })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "archive",
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/delete — Move emails to the trash folder
bulkActionsRouter.post(
  "/delete",
  requireScope("messages:write"),
  validateBody(EmailIdsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EmailIdsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    await db
      .update(emails)
      .set({ folder: "trash", updatedAt: now })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "delete",
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/read — Mark emails as read
bulkActionsRouter.post(
  "/read",
  requireScope("messages:write"),
  validateBody(EmailIdsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EmailIdsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    await db
      .update(emails)
      .set({ isRead: true, updatedAt: now })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "read",
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/unread — Mark emails as unread
bulkActionsRouter.post(
  "/unread",
  requireScope("messages:write"),
  validateBody(EmailIdsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EmailIdsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    await db
      .update(emails)
      .set({ isRead: false, updatedAt: now })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "unread",
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/star — Star emails
bulkActionsRouter.post(
  "/star",
  requireScope("messages:write"),
  validateBody(EmailIdsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EmailIdsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    await db
      .update(emails)
      .set({ isStarred: true, updatedAt: now })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "star",
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/unstar — Unstar emails
bulkActionsRouter.post(
  "/unstar",
  requireScope("messages:write"),
  validateBody(EmailIdsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EmailIdsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    await db
      .update(emails)
      .set({ isStarred: false, updatedAt: now })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "unstar",
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/label — Apply a label to emails
bulkActionsRouter.post(
  "/label",
  requireScope("messages:write"),
  validateBody(LabelSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof LabelSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    // There were TWO label systems that never saw each other (issue #76c).
    // This endpoint wrote a `label:<id>` string into the emails.tags JSONB
    // array; POST /v1/labels/:id/apply wrote rows into the email_labels join
    // table. Nothing reconciled them, so labelling from the bulk toolbar and
    // from the labels manager produced separate, mutually invisible state.
    //
    // `email_labels` wins: it is the real relational model, it has the FK
    // cascade that cleans up when a label is deleted, and the labels CRUD is
    // already built on it. A magic string inside a general-purpose tags array
    // has none of that — deleting a label would have left orphaned
    // `label:<id>` strings on every message forever.
    //
    // Ownership is checked before inserting: `scopedWhere` constrains updates
    // to the caller's own mail, and an insert has no WHERE, so the emails are
    // resolved through it first rather than trusting the ids from the body.
    const owned = await db
      .select({ id: emails.id })
      .from(emails)
      .where(scopedWhere(auth.accountId, input.emailIds));

    if (owned.length > 0) {
      await db
        .insert(emailLabels)
        .values(
          owned.map((row) => ({
            id: generateId(),
            emailId: row.id,
            labelId: input.labelId,
            appliedAt: now,
          })),
        )
        // Re-labelling something already labelled is a no-op, not an error.
        .onConflictDoNothing({
          target: [emailLabels.emailId, emailLabels.labelId],
        });
    }

    return c.json({
      data: {
        action: "label",
        labelId: input.labelId,
        // What was actually labelled, not what was asked for — the two differ
        // when an id belongs to someone else or does not exist.
        count: owned.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/move — Move emails to a folder
bulkActionsRouter.post(
  "/move",
  requireScope("messages:write"),
  validateBody(MoveSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof MoveSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    await db
      .update(emails)
      .set({ folder: input.folder, updatedAt: now })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "move",
        folder: input.folder,
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

export { bulkActionsRouter };
