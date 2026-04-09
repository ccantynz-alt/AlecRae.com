/**
 * Security Routes — Sender Verification (B5) + Phishing Protection (B6)
 *
 * POST /v1/security/verify-sender       — Verify a sender from email + headers
 * POST /v1/security/check-sender        — Alias for verify-sender
 * POST /v1/security/check-phishing      — Run a phishing analysis on an email
 * GET  /v1/security/check-email/:id     — Convenience: load email + run both
 * POST /v1/security/report-phishing     — User reports an email as phishing
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  verifySender,
  type SenderVerification,
} from "@emailed/ai-engine/security/sender-verify";
import {
  analyzePhishing,
  type PhishingAnalysis,
  type PhishingInput,
  type PhishingLink,
  type PhishingAttachment,
} from "@emailed/ai-engine/security/phishing";
import { getDatabase, emails, attachments as attachmentsTable } from "@emailed/db";

// ─── In-memory phishing report store (DB-backed in a future migration) ───────

interface PhishingReport {
  readonly id: string;
  readonly accountId: string;
  readonly emailId: string | null;
  readonly fromAddress: string;
  readonly subject: string;
  readonly reason: string | null;
  readonly reportedAt: string;
}

const phishingReports = new Map<string, PhishingReport[]>();

function recordReport(report: PhishingReport): void {
  const list = phishingReports.get(report.accountId) ?? [];
  list.push(report);
  phishingReports.set(report.accountId, list);
}

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

    const report: PhishingReport = {
      id: safeRandomId(),
      accountId: auth.accountId,
      emailId: input.emailId ?? null,
      fromAddress: input.fromAddress.toLowerCase(),
      subject: input.subject,
      reason: input.reason ?? null,
      reportedAt: new Date().toISOString(),
    };
    recordReport(report);

    return c.json({
      data: {
        report,
        message:
          "Thanks — your report has been recorded and will improve future phishing detection.",
      },
    });
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
