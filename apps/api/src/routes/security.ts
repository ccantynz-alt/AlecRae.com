/**
 * Security Routes — Sender Verification (B5) + Phishing Protection (B6)
 *
 * GET  /v1/security                     — Overview counts (real rows only)
 * GET  /v1/security/events              — Recent threat + phishing-report events
 * POST /v1/security/verify-sender       — Verify a sender from email + headers
 * POST /v1/security/check-sender        — Alias for verify-sender
 * POST /v1/security/check-phishing      — Run a phishing analysis on an email
 * GET  /v1/security/check-email/:id     — Convenience: load email + run both
 * POST /v1/security/report-phishing     — User reports an email as phishing
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";

import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  verifySender,
  type SenderVerification,
} from "@alecrae/ai-engine/security/sender-verify";
import {
  analyzePhishing,
  type PhishingAnalysis,
  type PhishingInput,
  type PhishingLink,
  type PhishingAttachment,
} from "@alecrae/ai-engine/security/phishing";
import {
  getDatabase,
  emails,
  attachments as attachmentsTable,
  phishingReports,
  threatDetections,
} from "@alecrae/db";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const VerifySenderSchema = z.object({
  email: z.string().email().max(320),
  headers: z.record(z.string()).default({}),
});

const PhishingLinkSchema = z.object({
  href: z.string().min(1).max(4_096),
  text: z.string().max(1_024).optional(),
});

const PhishingAttachmentSchema = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
});

const CheckPhishingSchema = z.object({
  from: z.string().min(3).max(998),
  replyTo: z.string().max(998).optional(),
  subject: z.string().max(998).default(""),
  body: z.string().default(""),
  links: z.array(PhishingLinkSchema).max(200).default([]),
  headers: z.record(z.string()).default({}),
  attachments: z.array(PhishingAttachmentSchema).max(50).optional(),
});

const ReportPhishingSchema = z.object({
  emailId: z.string().min(1).max(128).optional(),
  fromAddress: z.string().email().max(320),
  subject: z.string().max(998).default(""),
  reason: z.string().max(2_000).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function aiErrorResponse(err: unknown): {
  status: 500 | 503;
  body: { error: { type: string; message: string; code: string } };
} {
  const message = err instanceof Error ? err.message : "Unknown AI error";
  if (message.includes("ANTHROPIC_API_KEY")) {
    return {
      status: 503,
      body: {
        error: {
          type: "service_unavailable",
          message: "AI service is not configured",
          code: "ai_unavailable",
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: { type: "ai_error", message, code: "ai_error" },
    },
  };
}

function extractLinksFromHtml(html: string): PhishingLink[] {
  const out: PhishingLink[] = [];
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = (m[2] ?? "").replace(/<[^>]+>/g, "").trim();
    if (href) {
      if (text) out.push({ href, text });
      else out.push({ href });
    }
  }
  return out;
}

function extractLinksFromText(text: string): PhishingLink[] {
  const re = /https?:\/\/[^\s"'<>)]+/gi;
  return [...text.matchAll(re)].map((m) => ({ href: m[0] }));
}

function safeRandomId(): string {
  return `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Router ──────────────────────────────────────────────────────────────────

const security = new Hono();

// ─── POST /v1/security/verify-sender ─────────────────────────────────────────

security.post(
  "/verify-sender",
  requireScope("messages:read"),
  validateBody(VerifySenderSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof VerifySenderSchema>>(c);
    try {
      const verification: SenderVerification = await verifySender(
        input.email,
        input.headers,
      );
      return c.json({ data: verification });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

// ─── POST /v1/security/check-sender (alias for verify-sender) ────────────────

security.post(
  "/check-sender",
  requireScope("messages:read"),
  validateBody(VerifySenderSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof VerifySenderSchema>>(c);
    try {
      const verification: SenderVerification = await verifySender(
        input.email,
        input.headers,
      );
      return c.json({ data: verification });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

// ─── POST /v1/security/check-phishing ────────────────────────────────────────

security.post(
  "/check-phishing",
  requireScope("messages:read"),
  validateBody(CheckPhishingSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CheckPhishingSchema>>(c);
    try {
      const senderVerification = await verifySender(input.from, input.headers);
      const phishingInput: PhishingInput = {
        from: input.from,
        subject: input.subject,
        body: input.body,
        links: input.links.map((l): PhishingLink =>
          l.text !== undefined ? { href: l.href, text: l.text } : { href: l.href },
        ),
        headers: input.headers,
        senderVerification,
        ...(input.replyTo !== undefined ? { replyTo: input.replyTo } : {}),
        ...(input.attachments !== undefined
          ? { attachments: input.attachments }
          : {}),
      };
      const analysis: PhishingAnalysis = await analyzePhishing(phishingInput);
      return c.json({ data: { senderVerification, phishing: analysis } });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

// ─── GET /v1/security/check-email/:emailId ───────────────────────────────────

security.get(
  "/check-email/:emailId",
  requireScope("messages:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Email not found",
            code: "email_not_found",
          },
        },
        404,
      );
    }

    const attachmentRows = await db
      .select()
      .from(attachmentsTable)
      .where(eq(attachmentsTable.emailId, record.id));

    const headers = record.customHeaders ?? {};
    const html = record.htmlBody ?? "";
    const text = record.textBody ?? "";
    const links: PhishingLink[] = html
      ? extractLinksFromHtml(html)
      : extractLinksFromText(text);

    const phishingAttachments: PhishingAttachment[] = attachmentRows.map(
      (a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      }),
    );

    try {
      const senderVerification = await verifySender(record.fromAddress, headers);
      const phishing = await analyzePhishing({
        from: record.fromName
          ? `${record.fromName} <${record.fromAddress}>`
          : record.fromAddress,
        subject: record.subject,
        body: text || html,
        links,
        headers,
        senderVerification,
        attachments: phishingAttachments,
        ...(record.replyToAddress
          ? { replyTo: record.replyToAddress }
          : {}),
      });

      return c.json({
        data: {
          emailId: record.id,
          senderVerification,
          phishing,
        },
      });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

// ─── POST /v1/security/report-phishing ───────────────────────────────────────

security.post(
  "/report-phishing",
  requireScope("messages:write"),
  validateBody(ReportPhishingSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ReportPhishingSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Persisted in the `phishing_reports` table so reports survive restarts.
    const reportedAt = new Date();
    const report = {
      id: safeRandomId(),
      accountId: auth.accountId,
      emailId: input.emailId ?? null,
      fromAddress: input.fromAddress.toLowerCase(),
      subject: input.subject,
      reason: input.reason ?? null,
      reportedAt: reportedAt.toISOString(),
    };

    await db.insert(phishingReports).values({
      id: report.id,
      accountId: report.accountId,
      emailId: report.emailId,
      fromAddress: report.fromAddress,
      subject: report.subject,
      reason: report.reason,
      reportedAt,
    });

    return c.json({
      data: {
        report,
        message:
          "Thanks — your report has been recorded and will improve future phishing detection.",
      },
    });
  },
);

// ─── GET /v1/security ────────────────────────────────────────────────────────
//
// The Security Center's default Overview tab — the first thing every user sees
// — called this and it did not exist, so the page 404'd on load for everyone.
//
// Every number below is counted from real rows. There is deliberately NO
// "security score": nothing in this codebase computes one, and inventing a
// number to fill a gauge is the same fabrication already removed from
// security-intelligence.ts (issue #84). `score` is null and the UI says so.

security.get(
  "/",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [threatRows, phishingRows] = await Promise.all([
      db
        .select({ threatType: threatDetections.threatType })
        .from(threatDetections)
        .where(eq(threatDetections.accountId, auth.accountId)),
      db
        .select({ fromAddress: phishingReports.fromAddress })
        .from(phishingReports)
        .where(eq(phishingReports.accountId, auth.accountId)),
    ]);

    // Distinct senders the user has reported — a real "suspicious senders"
    // figure, rather than a count of reports which would double-count repeats.
    const suspiciousSenders = new Set(
      phishingRows.map((r) => r.fromAddress.toLowerCase()),
    ).size;

    return c.json({
      data: {
        // Null, not 0 and not invented. See the note above.
        score: null,
        scoreAvailable: false,
        threatsDetected: threatRows.length,
        phishingReported: phishingRows.length,
        suspiciousSenders,
      },
    });
  },
);

// ─── GET /v1/security/events ─────────────────────────────────────────────────
//
// Also called by the Overview tab and also missing. Assembled from the two
// tables that genuinely record security activity: detected threats and
// user-reported phishing.

const EventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

security.get(
  "/events",
  requireScope("messages:read"),
  async (c) => {
    const parsed = EventsQuerySchema.safeParse({ limit: c.req.query("limit") ?? undefined });
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_query", message: "limit must be 1-100" } }, 400);
    }
    const auth = c.get("auth");
    const db = getDatabase();
    const { limit } = parsed.data;

    const [threatRows, phishingRows] = await Promise.all([
      db
        .select({
          id: threatDetections.id,
          threatType: threatDetections.threatType,
          severity: threatDetections.severity,
          aiExplanation: threatDetections.aiExplanation,
          createdAt: threatDetections.createdAt,
        })
        .from(threatDetections)
        .where(eq(threatDetections.accountId, auth.accountId))
        .orderBy(desc(threatDetections.createdAt))
        .limit(limit),
      db
        .select({
          id: phishingReports.id,
          fromAddress: phishingReports.fromAddress,
          subject: phishingReports.subject,
          reportedAt: phishingReports.reportedAt,
        })
        .from(phishingReports)
        .where(eq(phishingReports.accountId, auth.accountId))
        .orderBy(desc(phishingReports.reportedAt))
        .limit(limit),
    ]);

    const events = [
      ...threatRows.map((t) => ({
        id: t.id,
        type: t.threatType,
        description: t.aiExplanation,
        severity: t.severity,
        createdAt: t.createdAt.toISOString(),
      })),
      ...phishingRows.map((p) => ({
        id: p.id,
        type: "phishing_reported",
        description: `You reported "${p.subject}" from ${p.fromAddress}`,
        // A user report is a signal, not a graded detection — "medium" is the
        // honest placement rather than borrowing a severity nothing assigned.
        severity: "medium" as const,
        createdAt: p.reportedAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);

    return c.json({ data: events });
  },
);

// ─── Per-email security router (mounted at /v1/emails) ──────────────────────
//
// GET /v1/emails/:emailId/security — full security report for a specific email

const emailSecurity = new Hono();

emailSecurity.get(
  "/:emailId/security",
  requireScope("messages:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Email not found",
            code: "email_not_found",
          },
        },
        404,
      );
    }

    const attachmentRows = await db
      .select()
      .from(attachmentsTable)
      .where(eq(attachmentsTable.emailId, record.id));

    const headers = record.customHeaders ?? {};
    const html = record.htmlBody ?? "";
    const text = record.textBody ?? "";
    const links: PhishingLink[] = html
      ? extractLinksFromHtml(html)
      : extractLinksFromText(text);

    const phishingAttachments: PhishingAttachment[] = attachmentRows.map(
      (a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      }),
    );

    try {
      const senderVerification = await verifySender(record.fromAddress, headers);
      const phishing = await analyzePhishing({
        from: record.fromName
          ? `${record.fromName} <${record.fromAddress}>`
          : record.fromAddress,
        subject: record.subject,
        body: text || html,
        links,
        headers,
        senderVerification,
        attachments: phishingAttachments,
        ...(record.replyToAddress
          ? { replyTo: record.replyToAddress }
          : {}),
      });

      return c.json({
        data: {
          emailId: record.id,
          subject: record.subject,
          from: record.fromAddress,
          fromName: record.fromName ?? null,
          senderVerification,
          phishing,
          checkedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

export { security, emailSecurity };
