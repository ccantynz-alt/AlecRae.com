import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, validateQuery, getValidatedBody, getValidatedQuery } from "../middleware/validator.js";
import { SendMessageSchema, PaginationSchema } from "../types.js";
import type { MessageRecord, PaginatedResponse, SendMessageInput, PaginationParams } from "../types.js";

const messages = new Hono();

// In-memory store for development. Production uses persistent storage.
const messageStore = new Map<string, MessageRecord>();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const ListMessagesQuery = PaginationSchema.extend({
  status: z.enum(["queued", "sending", "delivered", "bounced", "deferred", "complained", "failed"]).optional(),
  tag: z.string().optional(),
});

// POST /v1/messages - Send email
messages.post(
  "/",
  requireScope("messages:send"),
  validateBody(SendMessageSchema),
  async (c) => {
    const input = getValidatedBody<SendMessageInput>(c);
    const auth = c.get("auth");
    const id = generateId();
    const now = new Date().toISOString();

    const record: MessageRecord = {
      id,
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      status: input.scheduledAt ? "queued" : "sending",
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };

    messageStore.set(id, record);

    // In production: enqueue to MTA service for delivery
    // If not scheduled, immediately transition to sending pipeline.
    if (!input.scheduledAt) {
      // Simulate async send: mark as delivered after short delay
      setTimeout(() => {
        const msg = messageStore.get(id);
        if (msg && msg.status === "sending") {
          msg.status = "delivered";
          msg.deliveredAt = new Date().toISOString();
          msg.updatedAt = msg.deliveredAt;
        }
      }, 1000);
    }

    return c.json(
      {
        id,
        status: record.status,
        createdAt: record.createdAt,
      },
      202,
    );
  },
);

// GET /v1/messages/:id - Get message status
messages.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const record = messageStore.get(id);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Message ${id} not found`,
            code: "message_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: record });
  },
);

// GET /v1/messages - List messages with pagination
messages.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListMessagesQuery),
  async (c) => {
    const query = getValidatedQuery<PaginationParams & { status?: string; tag?: string }>(c);
    const { cursor, limit, status, tag } = query;

    let entries = Array.from(messageStore.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (status) {
      entries = entries.filter((m) => m.status === status);
    }

    if (tag) {
      entries = entries.filter((m) => m.tags?.includes(tag));
    }

    // Cursor-based pagination: cursor is the createdAt timestamp of the last item
    if (cursor) {
      const cursorIdx = entries.findIndex((m) => m.createdAt < cursor);
      if (cursorIdx > 0) {
        entries = entries.slice(cursorIdx);
      }
    }

    const page = entries.slice(0, limit);
    const hasMore = entries.length > limit;
    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]!.createdAt : null;

    const response: PaginatedResponse<MessageRecord> = {
      data: page,
      cursor: nextCursor,
      hasMore,
    };

    return c.json(response);
  },
);

export { messages };
