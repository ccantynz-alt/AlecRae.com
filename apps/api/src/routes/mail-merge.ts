/**
 * Mail Merge Route — Personalized mass emails from CSV/contacts
 *
 * POST   /v1/mail-merge                — Create a mail merge campaign
 * GET    /v1/mail-merge                — List campaigns (paginated)
 * GET    /v1/mail-merge/:id            — Get campaign with recipient statuses
 * PUT    /v1/mail-merge/:id            — Update campaign (only if draft)
 * POST   /v1/mail-merge/:id/recipients — Add recipients
 * POST   /v1/mail-merge/:id/start      — Start sending
 * POST   /v1/mail-merge/:id/cancel     — Cancel sending
 * DELETE /v1/mail-merge/:id            — Delete campaign (only if draft)
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
import { getDatabase, mailMerges } from "@alecrae/db";
import type { MailMergeRecipient } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateMailMergeSchema = z.object({
  name: z.string().min(1).max(255),
  templateId: z.string().optional(),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const UpdateMailMergeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  templateId: z.string().optional(),
  subject: z.string().min(1).max(998).optional(),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const AddRecipientsSchema = z.object({
  recipients: z
    .array(
      z.object({
        email: z.string().email(),
        variables: z.record(z.string()),
      }),
    )
    .min(1)
    .max(1000),
});

const ListMailMergeQuery = z.object({
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

// ─── Routes ───────────────────────────────────────────────────────────────────

const mailMergeRouter = new Hono();

// POST /v1/mail-merge — Create a mail merge campaign
mailMergeRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateMailMergeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateMailMergeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(mailMerges).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      templateId: input.templateId ?? null,
      subject: input.subject,
      htmlBody: input.htmlBody ?? null,
      textBody: input.textBody ?? null,
      status: "draft",
      recipients: [],
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          subject: input.subject,
          status: "draft",
          totalRecipients: 0,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/mail-merge — List campaigns (paginated)
mailMergeRouter.get(
  "/",
  requireScope("messages:write"),
  validateQuery(ListMailMergeQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListMailMergeQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(mailMerges.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(mailMerges.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: mailMerges.id,
        name: mailMerges.name,
        subject: mailMerges.subject,
        status: mailMerges.status,
        totalRecipients: mailMerges.totalRecipients,
        sentCount: mailMerges.sentCount,
        failedCount: mailMerges.failedCount,
        scheduledAt: mailMerges.scheduledAt,
        startedAt: mailMerges.startedAt,
        completedAt: mailMerges.completedAt,
        createdAt: mailMerges.createdAt,
        updatedAt: mailMerges.updatedAt,
      })
      .from(mailMerges)
      .where(and(...conditions))
      .orderBy(desc(mailMerges.createdAt))
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
        subject: row.subject,
        status: row.status,
        totalRecipients: row.totalRecipients,
        sentCount: row.sentCount,
        failedCount: row.failedCount,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        startedAt: row.startedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/mail-merge/:id — Get campaign with recipient statuses
mailMergeRouter.get(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [campaign] = await db
      .select()
      .from(mailMerges)
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      )
      .limit(1);

    if (!campaign) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Mail merge campaign ${id} not found`,
            code: "mail_merge_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: campaign.id,
        name: campaign.name,
        templateId: campaign.templateId,
        subject: campaign.subject,
        htmlBody: campaign.htmlBody,
        textBody: campaign.textBody,
        status: campaign.status,
        recipients: campaign.recipients,
        totalRecipients: campaign.totalRecipients,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
        startedAt: campaign.startedAt?.toISOString() ?? null,
        completedAt: campaign.completedAt?.toISOString() ?? null,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /v1/mail-merge/:id — Update campaign (only if draft)
mailMergeRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateMailMergeSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateMailMergeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(mailMerges)
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Mail merge campaign ${id} not found`,
            code: "mail_merge_not_found",
          },
        },
        404,
      );
    }

    if (existing.status !== "draft") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Cannot update campaign in "${existing.status}" state, must be "draft"`,
            code: "mail_merge_not_draft",
          },
        },
        409,
      );
    }

    const now = new Date();

    await db
      .update(mailMerges)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.templateId !== undefined
          ? { templateId: input.templateId }
          : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.htmlBody !== undefined ? { htmlBody: input.htmlBody } : {}),
        ...(input.textBody !== undefined ? { textBody: input.textBody } : {}),
        ...(input.scheduledAt !== undefined
          ? { scheduledAt: new Date(input.scheduledAt) }
          : {}),
        updatedAt: now,
      })
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        name: input.name ?? existing.name,
        subject: input.subject ?? existing.subject,
        status: existing.status,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/mail-merge/:id/recipients — Add recipients
mailMergeRouter.post(
  "/:id/recipients",
  requireScope("messages:write"),
  validateBody(AddRecipientsSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof AddRecipientsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [campaign] = await db
      .select()
      .from(mailMerges)
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      )
      .limit(1);

    if (!campaign) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Mail merge campaign ${id} not found`,
            code: "mail_merge_not_found",
          },
        },
        404,
      );
    }

    if (campaign.status !== "draft") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Cannot add recipients to campaign in "${campaign.status}" state, must be "draft"`,
            code: "mail_merge_not_draft",
          },
        },
        409,
      );
    }

    const existingRecipients = (campaign.recipients ?? []) as MailMergeRecipient[];
    const existingEmails = new Set(existingRecipients.map((r) => r.email));

    const newRecipients: MailMergeRecipient[] = input.recipients
      .filter((r) => !existingEmails.has(r.email))
      .map((r) => ({
        email: r.email,
        variables: r.variables,
        status: "pending" as const,
      }));

    const allRecipients = [...existingRecipients, ...newRecipients];
    const now = new Date();

    await db
      .update(mailMerges)
      .set({
        recipients: allRecipients,
        totalRecipients: allRecipients.length,
        updatedAt: now,
      })
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        added: newRecipients.length,
        skipped: input.recipients.length - newRecipients.length,
        totalRecipients: allRecipients.length,
      },
    });
  },
);

// POST /v1/mail-merge/:id/start — Start sending
mailMergeRouter.post(
  "/:id/start",
  requireScope("messages:send"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [campaign] = await db
      .select()
      .from(mailMerges)
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      )
      .limit(1);

    if (!campaign) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Mail merge campaign ${id} not found`,
            code: "mail_merge_not_found",
          },
        },
        404,
      );
    }

    if (campaign.status !== "draft") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Cannot start campaign in "${campaign.status}" state, must be "draft"`,
            code: "mail_merge_not_draft",
          },
        },
        409,
      );
    }

    const recipients = (campaign.recipients ?? []) as MailMergeRecipient[];
    if (recipients.length === 0) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Cannot start campaign with no recipients",
            code: "no_recipients",
          },
        },
        400,
      );
    }

    const now = new Date();

    await db
      .update(mailMerges)
      .set({
        status: "sending",
        startedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      );

    // NOTE: Actual email sending is handled by a background worker that
    // picks up campaigns in "sending" status. The worker iterates through
    // recipients, renders templates with variables, sends each email, and
    // updates recipient statuses + sentCount/failedCount as it goes.

    return c.json({
      data: {
        id,
        status: "sending",
        totalRecipients: recipients.length,
        startedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/mail-merge/:id/cancel — Cancel sending
mailMergeRouter.post(
  "/:id/cancel",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [campaign] = await db
      .select()
      .from(mailMerges)
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      )
      .limit(1);

    if (!campaign) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Mail merge campaign ${id} not found`,
            code: "mail_merge_not_found",
          },
        },
        404,
      );
    }

    if (campaign.status !== "sending") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Cannot cancel campaign in "${campaign.status}" state, must be "sending"`,
            code: "mail_merge_not_sending",
          },
        },
        409,
      );
    }

    const now = new Date();

    // Mark unsent recipients as skipped
    const recipients = (campaign.recipients ?? []) as MailMergeRecipient[];
    const updatedRecipients: MailMergeRecipient[] = recipients.map((r) =>
      r.status === "pending" ? { ...r, status: "skipped" as const } : r,
    );

    await db
      .update(mailMerges)
      .set({
        status: "cancelled",
        recipients: updatedRecipients,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        status: "cancelled",
        completedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/mail-merge/:id — Delete campaign (only if draft)
mailMergeRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [campaign] = await db
      .select({ id: mailMerges.id, status: mailMerges.status })
      .from(mailMerges)
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      )
      .limit(1);

    if (!campaign) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Mail merge campaign ${id} not found`,
            code: "mail_merge_not_found",
          },
        },
        404,
      );
    }

    if (campaign.status !== "draft") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Cannot delete campaign in "${campaign.status}" state, must be "draft"`,
            code: "mail_merge_not_draft",
          },
        },
        409,
      );
    }

    await db
      .delete(mailMerges)
      .where(
        and(eq(mailMerges.id, id), eq(mailMerges.accountId, auth.accountId)),
      );

    return c.json({ deleted: true, id });
  },
);

export { mailMergeRouter };
