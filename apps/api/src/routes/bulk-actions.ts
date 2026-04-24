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
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, emails } from "@alecrae/db";

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
  folder: z.string().min(1),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// POST /v1/bulk/archive — Archive emails (add "archived" tag)
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
      .set({
        tags: sql`(
          SELECT jsonb_agg(DISTINCT val)
          FROM jsonb_array_elements(
            COALESCE(${emails.tags}, '[]'::jsonb) || '["archived"]'::jsonb
          ) AS val
        )`,
        updatedAt: now,
      })
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

// POST /v1/bulk/delete — Soft-delete emails (set status to "dropped")
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
      .set({
        tags: sql`(
          SELECT jsonb_agg(DISTINCT val)
          FROM jsonb_array_elements(
            COALESCE(${emails.tags}, '[]'::jsonb) || '["deleted"]'::jsonb
          ) AS val
        )`,
        updatedAt: now,
      })
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

// POST /v1/bulk/read — Mark emails as read (add "read" tag)
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
      .set({
        tags: sql`(
          SELECT jsonb_agg(DISTINCT val)
          FROM jsonb_array_elements(
            COALESCE(${emails.tags}, '[]'::jsonb) || '["read"]'::jsonb
          ) AS val
          WHERE val::text != '"unread"'
        )`,
        updatedAt: now,
      })
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

// POST /v1/bulk/unread — Mark emails as unread (add "unread" tag, remove "read")
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
      .set({
        tags: sql`(
          SELECT jsonb_agg(DISTINCT val)
          FROM jsonb_array_elements(
            COALESCE(${emails.tags}, '[]'::jsonb) || '["unread"]'::jsonb
          ) AS val
          WHERE val::text != '"read"'
        )`,
        updatedAt: now,
      })
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

// POST /v1/bulk/star — Star emails (add "starred" tag)
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
      .set({
        tags: sql`(
          SELECT jsonb_agg(DISTINCT val)
          FROM jsonb_array_elements(
            COALESCE(${emails.tags}, '[]'::jsonb) || '["starred"]'::jsonb
          ) AS val
        )`,
        updatedAt: now,
      })
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

// POST /v1/bulk/unstar — Unstar emails (remove "starred" tag)
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
      .set({
        tags: sql`(
          SELECT COALESCE(
            (SELECT jsonb_agg(val)
             FROM jsonb_array_elements(COALESCE(${emails.tags}, '[]'::jsonb)) AS val
             WHERE val::text != '"starred"'),
            '[]'::jsonb
          )
        )`,
        updatedAt: now,
      })
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

// POST /v1/bulk/label — Apply a label to emails (add label ID to tags)
bulkActionsRouter.post(
  "/label",
  requireScope("messages:write"),
  validateBody(LabelSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof LabelSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();
    const labelTag = `label:${input.labelId}`;

    await db
      .update(emails)
      .set({
        tags: sql`(
          SELECT jsonb_agg(DISTINCT val)
          FROM jsonb_array_elements(
            COALESCE(${emails.tags}, '[]'::jsonb) || ${JSON.stringify([labelTag])}::jsonb
          ) AS val
        )`,
        updatedAt: now,
      })
      .where(scopedWhere(auth.accountId, input.emailIds));

    return c.json({
      data: {
        action: "label",
        labelId: input.labelId,
        count: input.emailIds.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/bulk/move — Move emails to a folder (set folder in metadata)
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
      .set({
        metadata: sql`jsonb_set(
          COALESCE(${emails.metadata}, '{}'::jsonb),
          '{folder}',
          ${JSON.stringify(input.folder)}::jsonb
        )`,
        updatedAt: now,
      })
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
