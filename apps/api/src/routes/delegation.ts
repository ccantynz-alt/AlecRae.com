/**
 * Email Delegation & Shared Drafts Routes
 *
 * POST   /v1/delegations              — Create a delegation
 * GET    /v1/delegations              — List delegations (for delegator or delegate)
 * PUT    /v1/delegations/:id          — Update delegation (permissions, scope, isActive)
 * DELETE /v1/delegations/:id          — Revoke delegation
 * GET    /v1/delegations/inbox        — Get emails delegated to current user (placeholder)
 *
 * POST   /v1/shared-drafts            — Create a shared draft
 * GET    /v1/shared-drafts            — List shared drafts (filter by status)
 * GET    /v1/shared-drafts/:id        — Get shared draft with comments
 * PUT    /v1/shared-drafts/:id        — Update shared draft (subject, body, recipients)
 * POST   /v1/shared-drafts/:id/comment       — Add comment to shared draft
 * POST   /v1/shared-drafts/:id/submit-review — Submit draft for review
 * POST   /v1/shared-drafts/:id/approve       — Approve draft
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, or, desc, lt } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, emailDelegations, sharedDrafts } from "@alecrae/db";
import type { DelegationPermissions, SharedDraftComment } from "@alecrae/db/src/schema/delegation.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const DelegationPermissionsSchema = z.object({
  canReply: z.boolean(),
  canArchive: z.boolean(),
  canDelete: z.boolean(),
  canForward: z.boolean(),
});

const CreateDelegationSchema = z.object({
  delegateUserId: z.string().min(1),
  scope: z.enum(["all", "label", "sender", "thread"]),
  scopeValue: z.string().nullable().optional(),
  permissions: DelegationPermissionsSchema,
  expiresAt: z.string().datetime().nullable().optional(),
});

const UpdateDelegationSchema = z.object({
  scope: z.enum(["all", "label", "sender", "thread"]).optional(),
  scopeValue: z.string().nullable().optional(),
  permissions: DelegationPermissionsSchema.partial().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const ListDelegationsQuery = z.object({
  role: z.enum(["delegator", "delegate"]).default("delegator"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const CreateSharedDraftSchema = z.object({
  subject: z.string().max(1000),
  body: z.string().min(1),
  toRecipients: z.array(z.string().email()).default([]),
  ccRecipients: z.array(z.string().email()).default([]),
  reviewers: z.array(z.string()).default([]),
  threadId: z.string().nullable().optional(),
});

const UpdateSharedDraftSchema = z.object({
  subject: z.string().max(1000).optional(),
  body: z.string().min(1).optional(),
  toRecipients: z.array(z.string().email()).optional(),
  ccRecipients: z.array(z.string().email()).optional(),
  reviewers: z.array(z.string()).optional(),
});

const ListSharedDraftsQuery = z.object({
  status: z.enum(["draft", "review", "approved", "sent"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const AddCommentSchema = z.object({
  text: z.string().min(1).max(5000),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Delegation Routes ───────────────────────────────────────────────────────

const delegationRouter = new Hono();

// POST /v1/delegations — Create a delegation
delegationRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateDelegationSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateDelegationSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(emailDelegations).values({
      id,
      accountId: auth.accountId,
      delegatorUserId: auth.userId ?? auth.accountId,
      delegateUserId: input.delegateUserId,
      scope: input.scope,
      scopeValue: input.scopeValue ?? null,
      permissions: input.permissions,
      isActive: true,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          accountId: auth.accountId,
          delegatorUserId: auth.userId ?? auth.accountId,
          delegateUserId: input.delegateUserId,
          scope: input.scope,
          scopeValue: input.scopeValue ?? null,
          permissions: input.permissions,
          isActive: true,
          expiresAt: input.expiresAt ?? null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/delegations — List delegations (for delegator or delegate)
delegationRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListDelegationsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListDelegationsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const userId = auth.userId ?? auth.accountId;

    const conditions = [eq(emailDelegations.accountId, auth.accountId)];

    if (query.role === "delegator") {
      conditions.push(eq(emailDelegations.delegatorUserId, userId));
    } else {
      conditions.push(eq(emailDelegations.delegateUserId, userId));
    }

    if (query.cursor) {
      conditions.push(lt(emailDelegations.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(emailDelegations)
      .where(and(...conditions))
      .orderBy(desc(emailDelegations.createdAt))
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
        accountId: row.accountId,
        delegatorUserId: row.delegatorUserId,
        delegateUserId: row.delegateUserId,
        scope: row.scope,
        scopeValue: row.scopeValue,
        permissions: row.permissions,
        isActive: row.isActive,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// PUT /v1/delegations/:id — Update delegation (permissions, scope, isActive)
delegationRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateDelegationSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateDelegationSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const userId = auth.userId ?? auth.accountId;

    const [existing] = await db
      .select()
      .from(emailDelegations)
      .where(
        and(
          eq(emailDelegations.id, id),
          eq(emailDelegations.accountId, auth.accountId),
          eq(emailDelegations.delegatorUserId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Delegation ${id} not found`,
            code: "delegation_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const mergedPermissions: DelegationPermissions = input.permissions
      ? { ...(existing.permissions as DelegationPermissions), ...input.permissions }
      : (existing.permissions as DelegationPermissions);

    await db
      .update(emailDelegations)
      .set({
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.scopeValue !== undefined ? { scopeValue: input.scopeValue ?? null } : {}),
        ...(input.permissions !== undefined ? { permissions: mergedPermissions } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(emailDelegations.id, id),
          eq(emailDelegations.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id,
        accountId: existing.accountId,
        delegatorUserId: existing.delegatorUserId,
        delegateUserId: existing.delegateUserId,
        scope: input.scope ?? existing.scope,
        scopeValue: input.scopeValue !== undefined ? (input.scopeValue ?? null) : existing.scopeValue,
        permissions: mergedPermissions,
        isActive: input.isActive ?? existing.isActive,
        expiresAt:
          input.expiresAt !== undefined
            ? (input.expiresAt ?? null)
            : existing.expiresAt
              ? existing.expiresAt.toISOString()
              : null,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/delegations/:id — Revoke delegation
delegationRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();
    const userId = auth.userId ?? auth.accountId;

    const [existing] = await db
      .select({ id: emailDelegations.id })
      .from(emailDelegations)
      .where(
        and(
          eq(emailDelegations.id, id),
          eq(emailDelegations.accountId, auth.accountId),
          or(
            eq(emailDelegations.delegatorUserId, userId),
            eq(emailDelegations.delegateUserId, userId),
          ),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Delegation ${id} not found`,
            code: "delegation_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(emailDelegations)
      .where(
        and(
          eq(emailDelegations.id, id),
          eq(emailDelegations.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// GET /v1/delegations/inbox — Get emails delegated to current user (placeholder)
delegationRouter.get(
  "/inbox",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();
    const userId = auth.userId ?? auth.accountId;

    // Fetch active delegations where the current user is the delegate
    const delegations = await db
      .select()
      .from(emailDelegations)
      .where(
        and(
          eq(emailDelegations.delegateUserId, userId),
          eq(emailDelegations.isActive, true),
        ),
      )
      .orderBy(desc(emailDelegations.createdAt));

    // Placeholder: return the delegation scopes so the client can fetch emails accordingly
    return c.json({
      data: {
        delegations: delegations.map((d) => ({
          id: d.id,
          accountId: d.accountId,
          delegatorUserId: d.delegatorUserId,
          scope: d.scope,
          scopeValue: d.scopeValue,
          permissions: d.permissions,
          expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
        })),
        emails: [],
        message: "Email fetching will be wired when the sync engine supports delegation scoping.",
      },
    });
  },
);

// ─── Shared Drafts Routes ────────────────────────────────────────────────────

const sharedDraftsRouter = new Hono();

// POST /v1/shared-drafts — Create a shared draft
sharedDraftsRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateSharedDraftSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateSharedDraftSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(sharedDrafts).values({
      id,
      accountId: auth.accountId,
      creatorUserId: auth.userId ?? auth.accountId,
      subject: input.subject,
      body: input.body,
      toRecipients: input.toRecipients,
      ccRecipients: input.ccRecipients,
      status: "draft",
      reviewers: input.reviewers,
      comments: [],
      threadId: input.threadId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          accountId: auth.accountId,
          creatorUserId: auth.userId ?? auth.accountId,
          subject: input.subject,
          body: input.body,
          toRecipients: input.toRecipients,
          ccRecipients: input.ccRecipients,
          status: "draft",
          reviewers: input.reviewers,
          comments: [],
          threadId: input.threadId ?? null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/shared-drafts — List shared drafts (filter by status)
sharedDraftsRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListSharedDraftsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListSharedDraftsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(sharedDrafts.accountId, auth.accountId)];

    if (query.status) {
      conditions.push(eq(sharedDrafts.status, query.status));
    }

    if (query.cursor) {
      conditions.push(lt(sharedDrafts.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(sharedDrafts)
      .where(and(...conditions))
      .orderBy(desc(sharedDrafts.createdAt))
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
        accountId: row.accountId,
        creatorUserId: row.creatorUserId,
        subject: row.subject,
        body: row.body,
        toRecipients: row.toRecipients,
        ccRecipients: row.ccRecipients,
        status: row.status,
        reviewers: row.reviewers,
        comments: row.comments,
        threadId: row.threadId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/shared-drafts/:id — Get shared draft with comments
sharedDraftsRouter.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [draft] = await db
      .select()
      .from(sharedDrafts)
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      )
      .limit(1);

    if (!draft) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Shared draft ${id} not found`,
            code: "shared_draft_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: draft.id,
        accountId: draft.accountId,
        creatorUserId: draft.creatorUserId,
        subject: draft.subject,
        body: draft.body,
        toRecipients: draft.toRecipients,
        ccRecipients: draft.ccRecipients,
        status: draft.status,
        reviewers: draft.reviewers,
        comments: draft.comments,
        threadId: draft.threadId,
        createdAt: draft.createdAt.toISOString(),
        updatedAt: draft.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /v1/shared-drafts/:id — Update shared draft (subject, body, recipients)
sharedDraftsRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateSharedDraftSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateSharedDraftSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(sharedDrafts)
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Shared draft ${id} not found`,
            code: "shared_draft_not_found",
          },
        },
        404,
      );
    }

    if (existing.status === "sent") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: "Cannot update a draft that has already been sent",
            code: "draft_already_sent",
          },
        },
        409,
      );
    }

    const now = new Date();

    await db
      .update(sharedDrafts)
      .set({
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.toRecipients !== undefined ? { toRecipients: input.toRecipients } : {}),
        ...(input.ccRecipients !== undefined ? { ccRecipients: input.ccRecipients } : {}),
        ...(input.reviewers !== undefined ? { reviewers: input.reviewers } : {}),
        updatedAt: now,
      })
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        accountId: existing.accountId,
        creatorUserId: existing.creatorUserId,
        subject: input.subject ?? existing.subject,
        body: input.body ?? existing.body,
        toRecipients: input.toRecipients ?? existing.toRecipients,
        ccRecipients: input.ccRecipients ?? existing.ccRecipients,
        status: existing.status,
        reviewers: input.reviewers ?? existing.reviewers,
        comments: existing.comments,
        threadId: existing.threadId,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/shared-drafts/:id/comment — Add comment to shared draft
sharedDraftsRouter.post(
  "/:id/comment",
  requireScope("messages:write"),
  validateBody(AddCommentSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof AddCommentSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const userId = auth.userId ?? auth.accountId;

    const [existing] = await db
      .select()
      .from(sharedDrafts)
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Shared draft ${id} not found`,
            code: "shared_draft_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const newComment: SharedDraftComment = {
      userId,
      text: input.text,
      createdAt: now.toISOString(),
    };

    const updatedComments = [
      ...(existing.comments as SharedDraftComment[]),
      newComment,
    ];

    await db
      .update(sharedDrafts)
      .set({
        comments: updatedComments,
        updatedAt: now,
      })
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        comment: newComment,
        totalComments: updatedComments.length,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/shared-drafts/:id/submit-review — Submit draft for review
sharedDraftsRouter.post(
  "/:id/submit-review",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(sharedDrafts)
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Shared draft ${id} not found`,
            code: "shared_draft_not_found",
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
            message: `Draft is in "${existing.status}" status and cannot be submitted for review`,
            code: "invalid_draft_status",
          },
        },
        409,
      );
    }

    const now = new Date();

    await db
      .update(sharedDrafts)
      .set({
        status: "review",
        updatedAt: now,
      })
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        status: "review",
        reviewers: existing.reviewers,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/shared-drafts/:id/approve — Approve draft
sharedDraftsRouter.post(
  "/:id/approve",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(sharedDrafts)
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Shared draft ${id} not found`,
            code: "shared_draft_not_found",
          },
        },
        404,
      );
    }

    if (existing.status !== "review") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Draft is in "${existing.status}" status and cannot be approved (must be in "review")`,
            code: "invalid_draft_status",
          },
        },
        409,
      );
    }

    const now = new Date();

    await db
      .update(sharedDrafts)
      .set({
        status: "approved",
        updatedAt: now,
      })
      .where(
        and(eq(sharedDrafts.id, id), eq(sharedDrafts.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        status: "approved",
        updatedAt: now.toISOString(),
      },
    });
  },
);

export { delegationRouter, sharedDraftsRouter };
