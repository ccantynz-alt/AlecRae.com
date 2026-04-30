/**
 * Thread Mutes Route — Silence a thread without unsubscribing
 *
 * POST   /v1/threads/:threadId/mute  — Mute a thread
 * DELETE /v1/threads/:threadId/mute  — Unmute a thread
 * GET    /v1/threads/muted           — List all muted threads for account
 * GET    /v1/threads/:threadId/mute  — Check if thread is muted
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, threadMutes } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const MuteThreadSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const threadMutesRouter = new Hono();

// POST /v1/threads/:threadId/mute — Mute a thread
threadMutesRouter.post(
  "/:threadId/mute",
  requireScope("messages:write"),
  validateBody(MuteThreadSchema),
  async (c) => {
    const threadId = c.req.param("threadId");
    const input = getValidatedBody<z.infer<typeof MuteThreadSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    // Check if already muted
    const [existing] = await db
      .select({ id: threadMutes.id })
      .from(threadMutes)
      .where(
        and(
          eq(threadMutes.accountId, auth.accountId),
          eq(threadMutes.threadId, threadId),
        ),
      )
      .limit(1);

    if (existing) {
      // Update the existing mute (e.g. change expiration)
      await db
        .update(threadMutes)
        .set({
          expiresAt,
        })
        .where(eq(threadMutes.id, existing.id));

      return c.json({
        data: {
          id: existing.id,
          threadId,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          updatedAt: now.toISOString(),
        },
      });
    }

    await db.insert(threadMutes).values({
      id,
      accountId: auth.accountId,
      threadId,
      expiresAt,
      createdAt: now,
    });

    return c.json(
      {
        data: {
          id,
          threadId,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/threads/muted — List all muted threads for account
threadMutesRouter.get(
  "/muted",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select({
        id: threadMutes.id,
        threadId: threadMutes.threadId,
        expiresAt: threadMutes.expiresAt,
        createdAt: threadMutes.createdAt,
      })
      .from(threadMutes)
      .where(eq(threadMutes.accountId, auth.accountId))
      .orderBy(desc(threadMutes.createdAt));

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        threadId: row.threadId,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);

// GET /v1/threads/:threadId/mute — Check if thread is muted
threadMutesRouter.get(
  "/:threadId/mute",
  requireScope("messages:read"),
  async (c) => {
    const threadId = c.req.param("threadId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [mute] = await db
      .select({
        id: threadMutes.id,
        threadId: threadMutes.threadId,
        expiresAt: threadMutes.expiresAt,
        createdAt: threadMutes.createdAt,
      })
      .from(threadMutes)
      .where(
        and(
          eq(threadMutes.accountId, auth.accountId),
          eq(threadMutes.threadId, threadId),
        ),
      )
      .limit(1);

    if (!mute) {
      return c.json({
        data: {
          muted: false,
          threadId,
        },
      });
    }

    // Check if the mute has expired
    const now = new Date();
    if (mute.expiresAt && mute.expiresAt <= now) {
      // Clean up expired mute
      await db
        .delete(threadMutes)
        .where(eq(threadMutes.id, mute.id));

      return c.json({
        data: {
          muted: false,
          threadId,
        },
      });
    }

    return c.json({
      data: {
        muted: true,
        id: mute.id,
        threadId: mute.threadId,
        expiresAt: mute.expiresAt ? mute.expiresAt.toISOString() : null,
        createdAt: mute.createdAt.toISOString(),
      },
    });
  },
);

// DELETE /v1/threads/:threadId/mute — Unmute a thread
threadMutesRouter.delete(
  "/:threadId/mute",
  requireScope("messages:write"),
  async (c) => {
    const threadId = c.req.param("threadId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: threadMutes.id })
      .from(threadMutes)
      .where(
        and(
          eq(threadMutes.accountId, auth.accountId),
          eq(threadMutes.threadId, threadId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Thread ${threadId} is not muted`,
            code: "mute_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(threadMutes)
      .where(eq(threadMutes.id, existing.id));

    return c.json({ deleted: true, threadId });
  },
);

export { threadMutesRouter };
