/**
 * AlecRae Chat — Secure Internal Messaging for Teams
 *
 * POST   /v1/chat/channels                     — Create a channel
 * GET    /v1/chat/channels                     — List user's channels
 * GET    /v1/chat/channels/:id                 — Get channel with recent messages
 * POST   /v1/chat/channels/:id/messages        — Send a message
 * GET    /v1/chat/channels/:id/messages        — Get messages (paginated)
 * PUT    /v1/chat/messages/:id                 — Edit a message
 * DELETE /v1/chat/messages/:id                 — Delete a message (soft delete)
 * POST   /v1/chat/channels/:id/members         — Add members
 * DELETE /v1/chat/channels/:id/members/:userId — Remove member
 * POST   /v1/chat/channels/:id/read            — Mark channel as read
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
import { getDatabase, chatChannels, chatMembers, chatMessages } from "@alecrae/db";
import { getWorkspaceRole } from "../lib/workspace-membership.js";

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Every channel route below previously trusted `channelId`/`userId` from the
 * URL alone — no check that the caller was ever a member of the channel, let
 * alone the same workspace. Any authenticated user could read, post to,
 * manage membership of, or mark-read any channel in any tenant by guessing
 * its id. This is the single membership check every handler must go through.
 *
 * Returns the channel row + caller's membership role, or null if the channel
 * doesn't exist or the caller isn't a member of it (the two cases are
 * deliberately indistinguishable to the caller — 404 either way — so this
 * can't be used to enumerate channel ids that belong to other tenants).
 */
async function requireChannelMembership(
  channelId: string,
  userId: string,
): Promise<{ channel: typeof chatChannels.$inferSelect; role: string } | null> {
  const db = getDatabase();
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) return null;

  const [membership] = await db
    .select({ role: chatMembers.role })
    .from(chatMembers)
    .where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.userId, userId)))
    .limit(1);
  if (!membership) return null;

  return { channel, role: membership.role };
}

const CHANNEL_NOT_FOUND = {
  error: { type: "not_found", message: "Channel not found", code: "channel_not_found" },
} as const;

const CreateChannelSchema = z.object({
  type: z.enum(["direct", "group", "thread"]).optional(),
  name: z.string().min(1).max(255).optional(),
  topic: z.string().max(500).optional(),
  memberIds: z.array(z.string()).min(1).max(100),
  emailThreadId: z.string().optional(),
});

const SendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  replyToId: z.string().optional(),
});

const EditMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

const AddMembersSchema = z.object({
  userIds: z.array(z.string()).min(1).max(100),
});

const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const chatRouter = new Hono();

chatRouter.post(
  "/channels",
  requireScope("messages:write"),
  validateBody(CreateChannelSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateChannelSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Every invited member must belong to the same workspace as the creator
    // — otherwise this is a way to hand a channel's contents to an outsider.
    for (const userId of input.memberIds) {
      const role = await getWorkspaceRole(userId, auth.accountId);
      if (!role) {
        return c.json(
          {
            error: {
              type: "validation_error",
              message: `User ${userId} is not a member of this workspace.`,
              code: "member_not_in_workspace",
            },
          },
          400,
        );
      }
    }

    const channelId = generateId();
    const now = new Date();

    await db.insert(chatChannels).values({
      id: channelId,
      accountId: auth.accountId,
      type: input.type ?? "group",
      name: input.name ?? null,
      topic: input.topic ?? null,
      emailThreadId: input.emailThreadId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const allMemberIds = [auth.userId ?? "", ...input.memberIds].filter(Boolean);
    const uniqueIds = [...new Set(allMemberIds)];

    const memberValues = uniqueIds.map((userId, i) => ({
      id: generateId(),
      channelId,
      userId,
      role: i === 0 ? "admin" : "member",
      joinedAt: now,
    }));

    if (memberValues.length > 0) {
      await db.insert(chatMembers).values(memberValues);
    }

    return c.json({
      data: {
        id: channelId,
        type: input.type ?? "group",
        name: input.name,
        memberCount: uniqueIds.length,
        createdAt: now.toISOString(),
      },
    }, 201);
  },
);

chatRouter.get(
  "/channels",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const memberships = await db
      .select({ channelId: chatMembers.channelId })
      .from(chatMembers)
      .where(eq(chatMembers.userId, auth.userId ?? ""));

    if (memberships.length === 0) {
      return c.json({ data: [] });
    }

    const channels = [];
    for (const m of memberships) {
      const [ch] = await db
        .select()
        .from(chatChannels)
        .where(and(eq(chatChannels.id, m.channelId), eq(chatChannels.isArchived, false)))
        .limit(1);

      if (ch) {
        channels.push({
          id: ch.id,
          type: ch.type,
          name: ch.name,
          topic: ch.topic,
          createdAt: ch.createdAt.toISOString(),
          updatedAt: ch.updatedAt.toISOString(),
        });
      }
    }

    return c.json({ data: channels });
  },
);

chatRouter.get(
  "/channels/:id",
  requireScope("messages:read"),
  async (c) => {
    const channelId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const membership = await requireChannelMembership(channelId, auth.userId ?? "");
    if (!membership) {
      return c.json(CHANNEL_NOT_FOUND, 404);
    }
    const { channel } = membership;

    const members = await db.select().from(chatMembers).where(eq(chatMembers.channelId, channelId));

    const recentMessages = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.channelId, channelId), isNull(chatMessages.deletedAt)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(20);

    return c.json({
      data: {
        id: channel.id,
        type: channel.type,
        name: channel.name,
        topic: channel.topic,
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString(),
        members: members.map((m) => ({
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        })),
        recentMessages: recentMessages.reverse().map((m) => ({
          id: m.id,
          senderId: m.senderId,
          content: m.content,
          replyToId: m.replyToId,
          isEdited: m.isEdited,
          createdAt: m.createdAt.toISOString(),
        })),
      },
    });
  },
);

chatRouter.post(
  "/channels/:id/messages",
  requireScope("messages:write"),
  validateBody(SendMessageSchema),
  async (c) => {
    const channelId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof SendMessageSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const membership = await requireChannelMembership(channelId, auth.userId ?? "");
    if (!membership) {
      return c.json(CHANNEL_NOT_FOUND, 404);
    }

    const msgId = generateId();
    const now = new Date();

    await db.insert(chatMessages).values({
      id: msgId,
      channelId,
      senderId: auth.userId ?? "",
      content: input.content,
      replyToId: input.replyToId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await db.update(chatChannels).set({ updatedAt: now }).where(eq(chatChannels.id, channelId));

    return c.json({ data: { id: msgId, channelId, content: input.content, createdAt: now.toISOString() } }, 201);
  },
);

chatRouter.get(
  "/channels/:id/messages",
  requireScope("messages:read"),
  validateQuery(PaginationQuery),
  async (c) => {
    const channelId = c.req.param("id");
    const query = getValidatedQuery<z.infer<typeof PaginationQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const membership = await requireChannelMembership(channelId, auth.userId ?? "");
    if (!membership) {
      return c.json(CHANNEL_NOT_FOUND, 404);
    }

    const conditions = [eq(chatMessages.channelId, channelId), isNull(chatMessages.deletedAt)];
    if (query.cursor) {
      conditions.push(lt(chatMessages.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]?.createdAt.toISOString() : null;

    return c.json({
      data: page.reverse().map((m) => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        replyToId: m.replyToId,
        isEdited: m.isEdited,
        createdAt: m.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

chatRouter.put(
  "/messages/:id",
  requireScope("messages:write"),
  validateBody(EditMessageSchema),
  async (c) => {
    const msgId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof EditMessageSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: chatMessages.id, senderId: chatMessages.senderId })
      .from(chatMessages)
      .where(and(eq(chatMessages.id, msgId), isNull(chatMessages.deletedAt)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { type: "not_found", message: "Message not found", code: "message_not_found" } }, 404);
    }
    if (existing.senderId !== (auth.userId ?? "")) {
      return c.json({ error: { type: "forbidden", message: "Can only edit your own messages", code: "not_author" } }, 403);
    }

    await db.update(chatMessages).set({ content: input.content, isEdited: true, updatedAt: new Date() }).where(eq(chatMessages.id, msgId));
    return c.json({ data: { id: msgId, updated: true } });
  },
);

chatRouter.delete(
  "/messages/:id",
  requireScope("messages:write"),
  async (c) => {
    const msgId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: chatMessages.id, senderId: chatMessages.senderId })
      .from(chatMessages)
      .where(and(eq(chatMessages.id, msgId), isNull(chatMessages.deletedAt)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { type: "not_found", message: "Message not found", code: "message_not_found" } }, 404);
    }
    if (existing.senderId !== (auth.userId ?? "")) {
      return c.json({ error: { type: "forbidden", message: "Can only delete your own messages", code: "not_author" } }, 403);
    }

    await db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.id, msgId));
    return c.json({ deleted: true, id: msgId });
  },
);

chatRouter.post(
  "/channels/:id/members",
  requireScope("messages:write"),
  validateBody(AddMembersSchema),
  async (c) => {
    const channelId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof AddMembersSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const membership = await requireChannelMembership(channelId, auth.userId ?? "");
    if (!membership) {
      return c.json(CHANNEL_NOT_FOUND, 404);
    }
    if (membership.role !== "admin") {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "Only channel admins can add members.",
            code: "not_channel_admin",
          },
        },
        403,
      );
    }

    for (const userId of input.userIds) {
      const role = await getWorkspaceRole(userId, membership.channel.accountId);
      if (!role) {
        return c.json(
          {
            error: {
              type: "validation_error",
              message: `User ${userId} is not a member of this workspace.`,
              code: "member_not_in_workspace",
            },
          },
          400,
        );
      }
    }

    const now = new Date();

    const values = input.userIds.map((userId) => ({
      id: generateId(),
      channelId,
      userId,
      role: "member",
      joinedAt: now,
    }));

    await db.insert(chatMembers).values(values).onConflictDoNothing();
    return c.json({ data: { added: values.length } }, 201);
  },
);

chatRouter.delete(
  "/channels/:id/members/:userId",
  requireScope("messages:write"),
  async (c) => {
    const channelId = c.req.param("id");
    const targetUserId = c.req.param("userId");
    const auth = c.get("auth");
    const db = getDatabase();

    const membership = await requireChannelMembership(channelId, auth.userId ?? "");
    if (!membership) {
      return c.json(CHANNEL_NOT_FOUND, 404);
    }
    const isSelf = targetUserId === (auth.userId ?? "");
    if (!isSelf && membership.role !== "admin") {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "Only channel admins can remove other members.",
            code: "not_channel_admin",
          },
        },
        403,
      );
    }

    await db.delete(chatMembers).where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.userId, targetUserId)));
    return c.json({ deleted: true });
  },
);

chatRouter.post(
  "/channels/:id/read",
  requireScope("messages:write"),
  async (c) => {
    const channelId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const membership = await requireChannelMembership(channelId, auth.userId ?? "");
    if (!membership) {
      return c.json(CHANNEL_NOT_FOUND, 404);
    }

    await db.update(chatMembers).set({ lastReadAt: new Date() })
      .where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.userId, auth.userId ?? "")));
    return c.json({ data: { marked: true } });
  },
);

export { chatRouter };
