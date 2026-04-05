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
import { eq, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, emails } from "@emailed/db";
import * as crypto from "node:crypto";

// ─── In-memory recall state (production: DB table) ──────────────────────────

interface RecallRecord {
  emailId: string;
  accountId: string;
  token: string;
  revoked: boolean;
  revokedAt?: Date;
  selfDestructAt?: Date;
  viewCount: number;
  lastViewedAt?: Date;
  createdAt: Date;
}

const recallStore = new Map<string, RecallRecord>(); // token -> record
const emailToToken = new Map<string, string>(); // emailId -> token

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
    const existingToken = emailToToken.get(input.emailId);
    if (existingToken) {
      const record = recallStore.get(existingToken)!;
      return c.json({
        data: {
          emailId: input.emailId,
          token: existingToken,
          viewUrl: `${process.env["API_URL"] ?? "https://api.vienna.com"}/v1/recall/view/${existingToken}`,
          status: record.revoked ? "revoked" : "active",
          viewCount: record.viewCount,
        },
      });
    }

    // Generate secure token
    const token = generateSecureToken();
    const record: RecallRecord = {
      emailId: input.emailId,
      accountId: auth.accountId,
      token,
      revoked: false,
      viewCount: 0,
      createdAt: new Date(),
    };

    recallStore.set(token, record);
    emailToToken.set(input.emailId, token);

    const baseUrl = process.env["API_URL"] ?? "https://api.vienna.com";

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

    const token = emailToToken.get(emailId);
    if (!token) {
      return c.json(
        { error: { type: "not_found", message: "No recall record found for this email", code: "recall_not_found" } },
        404,
      );
    }

    const record = recallStore.get(token)!;
    if (record.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "forbidden", message: "Not authorized", code: "forbidden" } },
        403,
      );
    }

    record.revoked = true;
    record.revokedAt = new Date();

    return c.json({
      data: {
        emailId,
        status: "revoked",
        revokedAt: record.revokedAt.toISOString(),
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
  (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");

    const token = emailToToken.get(emailId);
    if (!token) {
      return c.json(
        { error: { type: "not_found", message: "No recall record", code: "recall_not_found" } },
        404,
      );
    }

    const record = recallStore.get(token)!;
    if (record.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "forbidden", message: "Not authorized", code: "forbidden" } },
        403,
      );
    }

    return c.json({
      data: {
        emailId,
        status: record.revoked ? "revoked" : record.selfDestructAt && record.selfDestructAt <= new Date() ? "expired" : "active",
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

    const record = recallStore.get(token);
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
    const db = getDatabase();
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

    // Update view stats
    record.viewCount++;
    record.lastViewedAt = new Date();

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
    Sent via Vienna &middot; This email may be recalled by the sender at any time.
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

    let token = emailToToken.get(input.emailId);

    // Auto-enable recall if not already enabled
    if (!token) {
      token = generateSecureToken();
      const record: RecallRecord = {
        emailId: input.emailId,
        accountId: auth.accountId,
        token,
        revoked: false,
        viewCount: 0,
        createdAt: new Date(),
      };
      recallStore.set(token, record);
      emailToToken.set(input.emailId, token);
    }

    const record = recallStore.get(token)!;
    if (record.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "forbidden", message: "Not authorized", code: "forbidden" } },
        403,
      );
    }

    record.selfDestructAt = new Date(Date.now() + input.minutes * 60 * 1000);

    return c.json({
      data: {
        emailId: input.emailId,
        selfDestructAt: record.selfDestructAt.toISOString(),
        minutesRemaining: input.minutes,
        message: `Email will self-destruct in ${input.minutes} minutes`,
      },
    });
  },
);

export { recall };
