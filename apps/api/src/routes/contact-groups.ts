/**
 * Contact Groups Route — Group contacts, send to groups
 *
 * POST   /v1/contact-groups                       — Create a group
 * GET    /v1/contact-groups                       — List groups
 * GET    /v1/contact-groups/:id                   — Get group with members
 * PUT    /v1/contact-groups/:id                   — Update group
 * DELETE /v1/contact-groups/:id                   — Delete group
 * POST   /v1/contact-groups/:id/members           — Add members (array of contactIds)
 * DELETE /v1/contact-groups/:id/members/:contactId — Remove member
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, inArray } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  contactGroups,
  contactGroupMembers,
  contacts as contactsTable,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  color: z.string().max(50).optional(),
});

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  color: z.string().max(50).nullable().optional(),
});

const AddMembersSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(500),
});

const ListGroupsQuery = z.object({
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

const contactGroupsRouter = new Hono();

// POST /v1/contact-groups — Create a group
contactGroupsRouter.post(
  "/",
  requireScope("contacts:write"),
  validateBody(CreateGroupSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateGroupSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(contactGroups).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      description: input.description ?? "",
      color: input.color ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          description: input.description ?? "",
          color: input.color ?? null,
          memberCount: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/contact-groups — List groups
contactGroupsRouter.get(
  "/",
  requireScope("contacts:read"),
  validateQuery(ListGroupsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListGroupsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(contactGroups.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(contactGroups.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: contactGroups.id,
        name: contactGroups.name,
        description: contactGroups.description,
        color: contactGroups.color,
        createdAt: contactGroups.createdAt,
        updatedAt: contactGroups.updatedAt,
      })
      .from(contactGroups)
      .where(and(...conditions))
      .orderBy(desc(contactGroups.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    // Fetch member counts for all groups in the page
    const groupIds = page.map((row) => row.id);
    let memberCountMap: Record<string, number> = {};

    if (groupIds.length > 0) {
      const members = await db
        .select({ groupId: contactGroupMembers.groupId })
        .from(contactGroupMembers)
        .where(inArray(contactGroupMembers.groupId, groupIds));

      for (const member of members) {
        memberCountMap[member.groupId] =
          (memberCountMap[member.groupId] ?? 0) + 1;
      }
    }

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        memberCount: memberCountMap[row.id] ?? 0,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/contact-groups/:id — Get group with members
contactGroupsRouter.get(
  "/:id",
  requireScope("contacts:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [group] = await db
      .select()
      .from(contactGroups)
      .where(
        and(
          eq(contactGroups.id, id),
          eq(contactGroups.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!group) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact group ${id} not found`,
            code: "contact_group_not_found",
          },
        },
        404,
      );
    }

    // Fetch members with contact details
    const members = await db
      .select({
        id: contactGroupMembers.id,
        contactId: contactGroupMembers.contactId,
        addedAt: contactGroupMembers.addedAt,
        contactName: contactsTable.name,
        contactEmail: contactsTable.email,
      })
      .from(contactGroupMembers)
      .leftJoin(
        contactsTable,
        eq(contactGroupMembers.contactId, contactsTable.id),
      )
      .where(eq(contactGroupMembers.groupId, id));

    return c.json({
      data: {
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        memberCount: members.length,
        members: members.map((m) => ({
          id: m.id,
          contactId: m.contactId,
          name: m.contactName,
          email: m.contactEmail,
          addedAt: m.addedAt.toISOString(),
        })),
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /v1/contact-groups/:id — Update group
contactGroupsRouter.put(
  "/:id",
  requireScope("contacts:write"),
  validateBody(UpdateGroupSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateGroupSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(contactGroups)
      .where(
        and(
          eq(contactGroups.id, id),
          eq(contactGroups.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact group ${id} not found`,
            code: "contact_group_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(contactGroups)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(contactGroups.id, id),
          eq(contactGroups.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id,
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        color: input.color !== undefined ? input.color : existing.color,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/contact-groups/:id — Delete group
contactGroupsRouter.delete(
  "/:id",
  requireScope("contacts:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: contactGroups.id })
      .from(contactGroups)
      .where(
        and(
          eq(contactGroups.id, id),
          eq(contactGroups.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact group ${id} not found`,
            code: "contact_group_not_found",
          },
        },
        404,
      );
    }

    // Members are cascaded via FK onDelete, but delete explicitly for clarity
    await db
      .delete(contactGroupMembers)
      .where(eq(contactGroupMembers.groupId, id));

    await db
      .delete(contactGroups)
      .where(
        and(
          eq(contactGroups.id, id),
          eq(contactGroups.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// POST /v1/contact-groups/:id/members — Add members (array of contactIds)
contactGroupsRouter.post(
  "/:id/members",
  requireScope("contacts:write"),
  validateBody(AddMembersSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof AddMembersSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the group exists and belongs to this account
    const [group] = await db
      .select({ id: contactGroups.id })
      .from(contactGroups)
      .where(
        and(
          eq(contactGroups.id, id),
          eq(contactGroups.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!group) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact group ${id} not found`,
            code: "contact_group_not_found",
          },
        },
        404,
      );
    }

    // Verify all contacts exist and belong to this account
    const existingContacts = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(
        and(
          inArray(contactsTable.id, input.contactIds),
          eq(contactsTable.accountId, auth.accountId),
        ),
      );

    const existingContactIds = new Set(existingContacts.map((c) => c.id));
    const invalidIds = input.contactIds.filter(
      (cId) => !existingContactIds.has(cId),
    );

    if (invalidIds.length > 0) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Contacts not found: ${invalidIds.join(", ")}`,
            code: "contacts_not_found",
            invalidIds,
          },
        },
        400,
      );
    }

    // Check for existing memberships to avoid duplicate key errors
    const existingMembers = await db
      .select({ contactId: contactGroupMembers.contactId })
      .from(contactGroupMembers)
      .where(
        and(
          eq(contactGroupMembers.groupId, id),
          inArray(contactGroupMembers.contactId, input.contactIds),
        ),
      );

    const alreadyMemberIds = new Set(existingMembers.map((m) => m.contactId));
    const newContactIds = input.contactIds.filter(
      (cId) => !alreadyMemberIds.has(cId),
    );

    const now = new Date();
    const added: Array<{ id: string; contactId: string; addedAt: string }> = [];

    if (newContactIds.length > 0) {
      const rows = newContactIds.map((contactId) => ({
        id: generateId(),
        groupId: id,
        contactId,
        addedAt: now,
      }));

      await db.insert(contactGroupMembers).values(rows);

      for (const row of rows) {
        added.push({
          id: row.id,
          contactId: row.contactId,
          addedAt: now.toISOString(),
        });
      }

      // Update group timestamp
      await db
        .update(contactGroups)
        .set({ updatedAt: now })
        .where(eq(contactGroups.id, id));
    }

    return c.json(
      {
        data: {
          groupId: id,
          added,
          alreadyMembers: Array.from(alreadyMemberIds),
        },
      },
      201,
    );
  },
);

// DELETE /v1/contact-groups/:id/members/:contactId — Remove member
contactGroupsRouter.delete(
  "/:id/members/:contactId",
  requireScope("contacts:write"),
  async (c) => {
    const id = c.req.param("id");
    const contactId = c.req.param("contactId");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the group exists and belongs to this account
    const [group] = await db
      .select({ id: contactGroups.id })
      .from(contactGroups)
      .where(
        and(
          eq(contactGroups.id, id),
          eq(contactGroups.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!group) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact group ${id} not found`,
            code: "contact_group_not_found",
          },
        },
        404,
      );
    }

    // Find the membership record
    const [membership] = await db
      .select({ id: contactGroupMembers.id })
      .from(contactGroupMembers)
      .where(
        and(
          eq(contactGroupMembers.groupId, id),
          eq(contactGroupMembers.contactId, contactId),
        ),
      )
      .limit(1);

    if (!membership) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact ${contactId} is not a member of group ${id}`,
            code: "member_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(contactGroupMembers)
      .where(eq(contactGroupMembers.id, membership.id));

    // Update group timestamp
    const now = new Date();
    await db
      .update(contactGroups)
      .set({ updatedAt: now })
      .where(eq(contactGroups.id, id));

    return c.json({ deleted: true, groupId: id, contactId });
  },
);

export { contactGroupsRouter };
