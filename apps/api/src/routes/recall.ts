/**
 * Email Recall Route — Link-Based Email Viewing with Revocation
 *
 * True email recall that actually works (unlike Outlook's joke).
 * Emails are served via secure links — sender can revoke access anytime.
 *
 * POST /v1/recall/enable         — Enable recall for a sent email (converts to link-based)
 * POST /v1/recall/revoke/:id     — Revoke access to an email
 * GET  /v1/recall/status/:id     — Check recall status
 * GET  /v1/recall/view/:token    — Public endpoint: view email via secure link (no auth)
 * POST /v1/recall/self-destruct  — Set auto-destruct timer on an email
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, emails, recallRecords } from "@alecrae/db";
import * as crypto from "node:crypto";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const EnableRecallSchema = z.object({
  emailId: z.string(),
});

const SelfDestructSchema = z.object({
  emailId: z.string(),
  /** Minutes until self-destruct */
  minutes: z.number().int().min(1).max(43200), // max 30 days
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const recall = new Hono();

// POST /v1/recall/enable — Enable recall for a sent email
recall.post(
  "/enable",
  requireScope("recall:write"),
  validateBody(EnableRecallSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof EnableRecallSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the email belongs to this account
    const [email] = await db
      .select({ id: emails.id, status: emails.status })
      .from(emails)
      .where(and(eq(emails.id, input.emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!email) {
      return c.json(
        { error: { type: "not_found", message: "Email not found", code: "email_not_found" } },
        404,
      );
    }

    // Check if already enabled
    const [existing] = await db
      .select()
      .from(recallRecords)
      .where(eq(recallRecords.emailId, input.emailId))
      .limit(1);

    if (existing) {
      const baseUrl = process.env["API_URL"] ?? "https://api.alecrae.com";
      return c.json({
        data: {
          emailId: input.emailId,
          token: existing.token,
          viewUrl: `${baseUrl}/v1/recall/view/${existing.token}`,
          status: existing.revoked ? "revoked" : "active",
          viewCount: existing.viewCount,
        },
      });
    }

    // Generate secure token and persist
    const token = generateSecureToken();
    const id = generateId();

    await db
      .insert(recallRecords)
      .values({
        id,
        emailId: input.emailId,
        accountId: auth.accountId,
        token,
        revoked: false,
        viewCount: 0,
      });

    const baseUrl = process.env["API_URL"] ?? "https://api.alecrae.com";

    return c.json({
      data: {
        emailId: input.emailId,
        token,
        viewUrl: `${baseUrl}/v1/recall/view/${token}`,
        status: "active",
        message: "Email recall enabled. Share the viewUrl with recipients instead of the email content.",
      },
    }, 201);
  },
);

// POST /v1/recall/revoke/:id — Revoke access to an email
recall.post(
  "/revoke/:id",
  requireScope("recall:write"),
  async (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(recallRecords)
      .where(eq(recallRecords.emailId, emailId))
      .limit(1);

    if (!record) {
      return c.json(
        { error: { type: "not_found", message: "No recall record found for this email", code: "recall_not_found" } },
        404,
      );
    }

    if (record.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "forbidden", message: "Not authorized", code: "forbidden" } },
        403,
      );
    }

    const now = new Date();
    await db
      .update(recallRecords)
      .set({ revoked: true, revokedAt: now })
      .where(eq(recallRecords.id, record.id));

    return c.json({
      data: {
        emailId,
        status: "revoked",
        revokedAt: now.toISOString(),
        message: "Email access has been revoked. Recipients can no longer view this email.",
        totalViews: record.viewCount,
      },
    });
  },
);

// GET /v1/recall/status/:id — Check recall status
recall.get(
  "/status/:id",
  requireScope("recall:read"),
  async (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(recallRecords)
      .where(eq(recallRecords.emailId, emailId))
      .limit(1);

    if (!record) {
      return c.json(
        { error: { type: "not_found", message: "No recall record", code: "recall_not_found" } },
        404,
      );
    }

    if (record.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "forbidden", message: "Not authorized", code: "forbidden" } },
        403,
      );
    }

    const isExpired = record.selfDestructAt !== null && record.selfDestructAt <= new Date();

    return c.json({
      data: {
        emailId,
        status: record.revoked ? "revoked" : isExpired ? "expired" : "active",
        viewCount: record.viewCount,
        lastViewedAt: record.lastViewedAt?.toISOString() ?? null,
        revokedAt: record.revokedAt?.toISOString() ?? null,
        selfDestructAt: record.selfDestructAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
      },
    });
  },
);

// GET /v1/recall/view/:token — Public: view email via secure link (NO AUTH)
recall.get(
  "/view/:token",
  async (c) => {
    const token = c.req.param("token");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(recallRecords)
      .where(eq(recallRecords.token, token))
      .limit(1);

    if (!record) {
      return c.html("<html><body><h1>Email not found</h1><p>This email does not exist or the link is invalid.</p></body></html>", 404);
    }

    if (record.revoked) {
      return c.html("<html><body><h1>Email recalled</h1><p>The sender has recalled this email. It is no longer available.</p></body></html>", 410);
    }

    if (record.selfDestructAt && record.selfDestructAt <= new Date()) {
      return c.html("<html><body><h1>Email expired</h1><p>This email has self-destructed and is no longer available.</p></body></html>", 410);
    }

    // Fetch the email content
    const [email] = await db
      .select({
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        subject: emails.subject,
        htmlBody: emails.htmlBody,
        textBody: emails.textBody,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(eq(emails.id, record.emailId))
      .limit(1);

    if (!email) {
      return c.html("<html><body><h1>Email not found</h1></body></html>", 404);
    }

    // Update view stats atomically
    await db
      .update(recallRecords)
      .set({
        viewCount: sql`${recallRecords.viewCount} + 1`,
        lastViewedAt: new Date(),
      })
      .where(eq(recallRecords.id, record.id));

    // Render email
    const fromDisplay = email.fromName ? `${email.fromName} &lt;${email.fromAddress}&gt;` : email.fromAddress;
    const body = email.htmlBody ?? `<pre>${email.textBody ?? ""}</pre>`;

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${email.subject}</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
    .header { border-bottom: 1px solid #e5e5e5; padding-bottom: 16px; margin-bottom: 24px; }
    .from { font-size: 14px; color: #666; }
    .subject { font-size: 22px; font-weight: 600; margin: 8px 0; }
    .date { font-size: 13px; color: #999; }
    .body { line-height: 1.6; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <div class="from">From: ${fromDisplay}</div>
    <div class="subject">${email.subject}</div>
    <div class="date">${email.createdAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
  </div>
  <div class="body">${body}</div>
  <div class="footer">
    Sent via AlecRae &middot; This email may be recalled by the sender at any time.
  </div>
</body>
</html>`);
  },
);

// POST /v1/recall/self-destruct — Set auto-destruct timer
recall.post(
  "/self-destruct",
  requireScope("recall:write"),
  validateBody(SelfDestructSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SelfDestructSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if recall already enabled for this email
    const existingRows = await db
      .select()
      .from(recallRecords)
      .where(eq(recallRecords.emailId, input.emailId))
      .limit(1);

    let record = existingRows[0];

    // Auto-enable recall if not already enabled
    if (!record) {
      const token = generateSecureToken();
      const id = generateId();

      const insertedRows = await db
        .insert(recallRecords)
        .values({
          id,
          emailId: input.emailId,
          accountId: auth.accountId,
          token,
          revoked: false,
          viewCount: 0,
        })
        .returning();

      record = insertedRows[0];
      if (!record) {
        return c.json(
          { error: { type: "server_error", message: "Failed to create recall record", code: "create_failed" } },
          500,
        );
      }
    }

    if (record.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "forbidden", message: "Not authorized", code: "forbidden" } },
        403,
      );
    }

    const selfDestructAt = new Date(Date.now() + input.minutes * 60 * 1000);

    await db
      .update(recallRecords)
      .set({ selfDestructAt })
      .where(eq(recallRecords.id, record.id));

    return c.json({
      data: {
        emailId: input.emailId,
        selfDestructAt: selfDestructAt.toISOString(),
        minutesRemaining: input.minutes,
        message: `Email will self-destruct in ${input.minutes} minutes`,
      },
    });
  },
);

export { recall };
