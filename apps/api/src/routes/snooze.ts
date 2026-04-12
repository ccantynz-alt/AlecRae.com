/**
 * Snooze + Schedule Send + Undo Send Routes
 *
 * POST /v1/snooze/:emailId       — Snooze an email (reappears at specified time)
 * DELETE /v1/snooze/:emailId     — Cancel snooze
 * GET /v1/snooze                 — List snoozed emails
 * POST /v1/send/schedule         — Schedule email for future delivery
 * DELETE /v1/send/schedule/:id   — Cancel scheduled send
 * POST /v1/send/undo/:id        — Undo a recently sent email (within window)
 * GET /v1/send/scheduled         — List scheduled emails
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, emails } from "@emailed/db";

// ─── Undo Send Config ────────────────────────────────────────────────────────
// Emails are held for this many seconds before actual delivery.
// During this window, the user can cancel (undo) the send.
const DEFAULT_UNDO_WINDOW_SECONDS = 10;
const MAX_UNDO_WINDOW_SECONDS = 30;

// Track recently sent emails that can still be undone
const undoableEmails = new Map<string, { expiresAt: number; cancelFn: () => void }>();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SnoozeSchema = z.object({
  /** When to resurface the email (ISO 8601 datetime) */
  until: z.string().datetime(),
});

const ScheduleSendSchema = z.object({
  emailId: z.string(),
  /** When to send (ISO 8601 datetime) */
  sendAt: z.string().datetime(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const snooze = new Hono();

// POST /v1/snooze/:emailId — Snooze an email
snooze.post(
  "/:emailId",
  requireScope("messages:write"),
  validateBody(SnoozeSchema),
  async (c) => {
    const emailId = c.req.param("emailId");
    const input = getValidatedBody<z.infer<typeof SnoozeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const until = new Date(input.until);
    if (until <= new Date()) {
      return c.json({ error: { message: "Snooze time must be in the future", code: "invalid_time" } }, 400);
    }

    // Update the email: remove from inbox, set snooze metadata
    await db
      .update(emails)
      .set({
        metadata: { snoozedUntil: until.toISOString() },
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)));

    return c.json({
      data: {
        emailId,
        snoozedUntil: until.toISOString(),
        message: `Email snoozed until ${until.toLocaleString()}`,
      },
    });
  },
);

// DELETE /v1/snooze/:emailId — Cancel snooze
snooze.delete(
  "/:emailId",
  requireScope("messages:write"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    await db
      .update(emails)
      .set({
        metadata: {} as Record<string, string>,
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)));

    return c.json({ data: { emailId, message: "Snooze cancelled" } });
  },
);

// ─── Schedule Send ───────────────────────────────────────────────────────────

const scheduleSend = new Hono();

// POST /v1/send/schedule — Schedule email for future delivery
scheduleSend.post(
  "/schedule",
  requireScope("messages:send"),
  validateBody(ScheduleSendSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ScheduleSendSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const sendAt = new Date(input.sendAt);
    if (sendAt <= new Date()) {
      return c.json({ error: { message: "Send time must be in the future", code: "invalid_time" } }, 400);
    }

    await db
      .update(emails)
      .set({
        scheduledAt: sendAt,
        status: "queued",
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)));

    return c.json({
      data: {
        emailId: input.emailId,
        scheduledAt: sendAt.toISOString(),
        message: `Email scheduled for ${sendAt.toLocaleString()}`,
      },
    });
  },
);

// DELETE /v1/send/schedule/:id — Cancel scheduled send
scheduleSend.delete(
  "/schedule/:id",
  requireScope("messages:write"),
  async (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    await db
      .update(emails)
      .set({
        scheduledAt: null,
        status: "draft",
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)));

    return c.json({ data: { emailId, message: "Scheduled send cancelled. Email moved to drafts." } });
  },
);

// POST /v1/send/undo/:id — Undo a recently sent email
scheduleSend.post(
  "/undo/:id",
  requireScope("messages:write"),
  async (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");

    const undoable = undoableEmails.get(emailId);
    if (!undoable) {
      return c.json(
        { error: { message: "Email cannot be undone. The undo window has expired or email was not sent through Vienna.", code: "undo_expired" } },
        410,
      );
    }

    if (undoable.expiresAt < Date.now()) {
      undoableEmails.delete(emailId);
      return c.json(
        { error: { message: "Undo window has expired", code: "undo_expired" } },
        410,
      );
    }

    // Cancel the pending delivery
    undoable.cancelFn();
    undoableEmails.delete(emailId);

    // Move email back to drafts
    const db = getDatabase();
    await db
      .update(emails)
      .set({
        status: "draft",
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)));

    return c.json({
      data: {
        emailId,
        message: "Email send cancelled. Moved to drafts.",
      },
    });
  },
);

// GET /v1/send/scheduled — List scheduled emails
scheduleSend.get(
  "/scheduled",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const scheduled = await db
      .select({
        id: emails.id,
        subject: emails.subject,
        toAddresses: emails.toAddresses,
        scheduledAt: emails.scheduledAt,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(and(
        eq(emails.accountId, auth.accountId),
        eq(emails.status, "queued"),
      ))
      .limit(50);

    const filtered = scheduled.filter((e) => e.scheduledAt != null);

    return c.json({
      data: filtered.map((e) => ({
        id: e.id,
        subject: e.subject,
        to: e.toAddresses,
        scheduledAt: e.scheduledAt?.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
    });
  },
);

/**
 * Register an email as undoable for the configured window.
 * Called internally after send — not an API route.
 */
export function registerUndoable(emailId: string, cancelFn: () => void, windowSeconds?: number): void {
  const window = Math.min(windowSeconds ?? DEFAULT_UNDO_WINDOW_SECONDS, MAX_UNDO_WINDOW_SECONDS);
  undoableEmails.set(emailId, {
    expiresAt: Date.now() + window * 1000,
    cancelFn,
  });

  // Auto-cleanup after window expires
  setTimeout(() => {
    undoableEmails.delete(emailId);
  }, (window + 5) * 1000);
}

export { snooze, scheduleSend };
