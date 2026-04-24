/**
 * Labels Route — Shared label/tag CRUD with nested hierarchy + apply/remove
 *
 * POST   /v1/labels              — Create a label
 * GET    /v1/labels              — List all labels for account (tree structure)
 * PUT    /v1/labels/:id          — Update label (name, color, parent)
 * DELETE /v1/labels/:id          — Delete label
 * POST   /v1/labels/:id/apply    — Apply label to email(s)
 * DELETE /v1/labels/:id/apply    — Remove label from email(s)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, labels, emailLabels } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateLabelSchema = z.object({
  name: z.string().min(1).max(255),
  color: z.string().max(50).default("#6b7280"),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isShared: z.boolean().optional(),
});

const UpdateLabelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color: z.string().max(50).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isShared: z.boolean().optional(),
});

const ApplyLabelSchema = z.object({
  emailIds: z.array(z.string().min(1)).min(1).max(100),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface LabelRow {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  sortOrder: number;
  isSystem: boolean;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LabelTreeNode extends LabelRow {
  children: LabelTreeNode[];
}

/**
 * Build a nested tree structure from a flat list of labels.
 * Top-level labels have parentId = null.
 */
function buildLabelTree(flatLabels: LabelRow[]): LabelTreeNode[] {
  const nodeMap = new Map<string, LabelTreeNode>();
  const roots: LabelTreeNode[] = [];

  // Create nodes
  for (const label of flatLabels) {
    nodeMap.set(label.id, { ...label, children: [] });
  }

  // Wire parent-child relationships
  for (const label of flatLabels) {
    const node = nodeMap.get(label.id)!;
    if (label.parentId !== null) {
      const parent = nodeMap.get(label.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan label — treat as root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Sort children by sortOrder
  const sortChildren = (nodes: LabelTreeNode[]): void => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const labelsRouter = new Hono();

// POST /v1/labels — Create a label
labelsRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateLabelSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateLabelSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // If parentId is provided, verify it belongs to the same account
    if (input.parentId) {
      const [parent] = await db
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.id, input.parentId), eq(labels.accountId, auth.accountId)))
        .limit(1);

      if (!parent) {
        return c.json(
          {
            error: {
              type: "not_found",
              message: `Parent label ${input.parentId} not found`,
              code: "parent_label_not_found",
            },
          },
          404,
        );
      }
    }

    const id = generateId();
    const now = new Date();

    await db.insert(labels).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      color: input.color,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      isSystem: false,
      isShared: input.isShared ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          color: input.color,
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder ?? 0,
          isSystem: false,
          isShared: input.isShared ?? false,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/labels — List all labels for account (tree structure)
labelsRouter.get(
  "/",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select({
        id: labels.id,
        name: labels.name,
        color: labels.color,
        parentId: labels.parentId,
        sortOrder: labels.sortOrder,
        isSystem: labels.isSystem,
        isShared: labels.isShared,
        createdAt: labels.createdAt,
        updatedAt: labels.updatedAt,
      })
      .from(labels)
      .where(eq(labels.accountId, auth.accountId));

    const flatLabels: LabelRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isSystem: row.isSystem,
      isShared: row.isShared,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    const tree = buildLabelTree(flatLabels);

    return c.json({
      data: tree,
      total: flatLabels.length,
    });
  },
);

// PUT /v1/labels/:id — Update label (name, color, parent)
labelsRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateLabelSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateLabelSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(labels)
      .where(and(eq(labels.id, id), eq(labels.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Label ${id} not found`,
            code: "label_not_found",
          },
        },
        404,
      );
    }

    // Cannot modify system labels
    if (existing.isSystem) {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "Cannot modify a system label",
            code: "system_label_immutable",
          },
        },
        403,
      );
    }

    // If changing parentId, verify it belongs to the same account and isn't self-referential
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) {
        return c.json(
          {
            error: {
              type: "validation_error",
              message: "A label cannot be its own parent",
              code: "self_referential_parent",
            },
          },
          400,
        );
      }

      const [parent] = await db
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.id, input.parentId), eq(labels.accountId, auth.accountId)))
        .limit(1);

      if (!parent) {
        return c.json(
          {
            error: {
              type: "not_found",
              message: `Parent label ${input.parentId} not found`,
              code: "parent_label_not_found",
            },
          },
          404,
        );
      }
    }

    const now = new Date();

    await db
      .update(labels)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isShared !== undefined ? { isShared: input.isShared } : {}),
        updatedAt: now,
      })
      .where(and(eq(labels.id, id), eq(labels.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        name: input.name ?? existing.name,
        color: input.color ?? existing.color,
        parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        isShared: input.isShared ?? existing.isShared,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/labels/:id — Delete label
labelsRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: labels.id, isSystem: labels.isSystem })
      .from(labels)
      .where(and(eq(labels.id, id), eq(labels.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Label ${id} not found`,
            code: "label_not_found",
          },
        },
        404,
      );
    }

    if (existing.isSystem) {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "Cannot delete a system label",
            code: "system_label_immutable",
          },
        },
        403,
      );
    }

    // Cascade: emailLabels FK has onDelete: cascade, so associations are auto-removed.
    // Re-parent children to the deleted label's parent (or null).
    // First, find if this label has children and re-parent them.
    const children = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.parentId, id), eq(labels.accountId, auth.accountId)));

    if (children.length > 0) {
      // Get deleted label's parent so children inherit it
      const [deletedLabel] = await db
        .select({ parentId: labels.parentId })
        .from(labels)
        .where(eq(labels.id, id))
        .limit(1);

      const newParentId = deletedLabel?.parentId ?? null;

      await db
        .update(labels)
        .set({ parentId: newParentId, updatedAt: new Date() })
        .where(and(eq(labels.parentId, id), eq(labels.accountId, auth.accountId)));
    }

    await db
      .delete(labels)
      .where(and(eq(labels.id, id), eq(labels.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

// POST /v1/labels/:id/apply — Apply label to email(s)
labelsRouter.post(
  "/:id/apply",
  requireScope("messages:write"),
  validateBody(ApplyLabelSchema),
  async (c) => {
    const labelId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof ApplyLabelSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the label belongs to this account
    const [label] = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.id, labelId), eq(labels.accountId, auth.accountId)))
      .limit(1);

    if (!label) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Label ${labelId} not found`,
            code: "label_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const insertValues = input.emailIds.map((emailId) => ({
      id: generateId(),
      emailId,
      labelId,
      appliedAt: now,
    }));

    // Use ON CONFLICT DO NOTHING to handle duplicates gracefully
    await db
      .insert(emailLabels)
      .values(insertValues)
      .onConflictDoNothing({ target: [emailLabels.emailId, emailLabels.labelId] });

    return c.json({
      data: {
        labelId,
        emailIds: input.emailIds,
        applied: true,
      },
    });
  },
);

// DELETE /v1/labels/:id/apply — Remove label from email(s)
labelsRouter.delete(
  "/:id/apply",
  requireScope("messages:write"),
  validateBody(ApplyLabelSchema),
  async (c) => {
    const labelId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof ApplyLabelSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the label belongs to this account
    const [label] = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.id, labelId), eq(labels.accountId, auth.accountId)))
      .limit(1);

    if (!label) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Label ${labelId} not found`,
            code: "label_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(emailLabels)
      .where(
        and(
          eq(emailLabels.labelId, labelId),
          inArray(emailLabels.emailId, input.emailIds),
        ),
      );

    return c.json({
      data: {
        labelId,
        emailIds: input.emailIds,
        removed: true,
      },
    });
  },
);

export { labelsRouter };
