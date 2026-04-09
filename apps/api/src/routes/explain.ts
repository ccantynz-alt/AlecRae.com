/**
 * Explain Routes — Newsletter Auto-Summary + "Why is this in my inbox?"
 *
 * POST /v1/explain/newsletter        — Summarise a newsletter (Haiku)
 * POST /v1/explain/email             — Explain why an email is in the inbox (Sonnet)
 * GET  /v1/explain/email/:emailId    — Convenience: load email + history from DB and explain
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq, lt, count, max } from "drizzle-orm";

import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  summarizeNewsletter,
  type NewsletterSummary,
} from "@emailed/ai-engine/inbox/newsletter-summarizer";
import {
  explainEmail,
  type EmailExplanation,
  type ExplainEmailInput,
} from "@emailed/ai-engine/inbox/email-explainer";
import { DEFAULT_CATEGORIES, getScreenerDecisionAsync } from "@emailed/ai-engine/inbox";
import { getDatabase, emails } from "@emailed/db";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const NewsletterSchema = z.object({
  htmlBody: z.string().default(""),
  textBody: z.string().default(""),
  subject: z.string().min(1).max(998),
});

const ExplainEmailSchema = z.object({
  email: z.object({
    from: z.string().min(1).max(320),
    subject: z.string().min(1).max(998),
    body: z.string().default(""),
    date: z.string().datetime(),
  }),
  senderHistory: z.object({
    totalEmails: z.number().int().nonnegative(),
    lastContacted: z.string().datetime().nullable(),
    isKnown: z.boolean(),
  }),
  accountContext: z.object({
    inboxCategories: z.array(z.string().min(1).max(50)).max(50),
  }),
});

// ─── Router ──────────────────────────────────────────────────────────────────

const explain = new Hono();

// Helper — convert API errors thrown by ai-engine into JSON 5xx responses.
function aiErrorResponse(
  err: unknown,
):
  | { status: 503; body: { error: { type: string; message: string; code: string } } }
  | { status: 500; body: { error: { type: string; message: string; code: string } } } {
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
      error: {
        type: "ai_error",
        message,
        code: "ai_error",
      },
    },
  };
}

// ─── POST /v1/explain/newsletter ─────────────────────────────────────────────

explain.post(
  "/newsletter",
  requireScope("messages:read"),
  validateBody(NewsletterSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof NewsletterSchema>>(c);

    try {
      const summary: NewsletterSummary = await summarizeNewsletter(
        input.htmlBody,
        input.textBody,
        input.subject,
      );
      return c.json({ data: summary });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

// ─── POST /v1/explain/email ──────────────────────────────────────────────────

explain.post(
  "/email",
  requireScope("messages:read"),
  validateBody(ExplainEmailSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ExplainEmailSchema>>(c);

    const explainerInput: ExplainEmailInput = {
      email: {
        from: input.email.from,
        subject: input.email.subject,
        body: input.email.body,
        date: new Date(input.email.date),
      },
      senderHistory: {
        totalEmails: input.senderHistory.totalEmails,
        lastContacted: input.senderHistory.lastContacted
          ? new Date(input.senderHistory.lastContacted)
          : null,
        isKnown: input.senderHistory.isKnown,
      },
      accountContext: {
        inboxCategories: input.accountContext.inboxCategories,
      },
    };

    try {
      const explanation: EmailExplanation = await explainEmail(explainerInput);
      return c.json({ data: explanation });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

// ─── GET /v1/explain/email/:emailId ──────────────────────────────────────────

explain.get(
  "/email/:emailId",
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

    // Sender history: count of prior emails from the same address in this account.
    const [historyRow] = await db
      .select({
        total: count(),
        latest: max(emails.createdAt),
      })
      .from(emails)
      .where(
        and(
          eq(emails.accountId, auth.accountId),
          eq(emails.fromAddress, record.fromAddress),
          lt(emails.createdAt, record.createdAt),
        ),
      );

    const totalEmails = historyRow?.total ?? 0;
    const lastContacted: Date | null = historyRow?.latest ?? null;

    const explainerInput: ExplainEmailInput = {
      email: {
        from: record.fromAddress,
        subject: record.subject,
        body: record.textBody ?? record.htmlBody ?? "",
        date: record.createdAt,
      },
      senderHistory: {
        totalEmails,
        lastContacted,
        isKnown: (await getScreenerDecisionAsync(auth.accountId, record.fromAddress)) === "allow",
      },
      accountContext: {
        inboxCategories: DEFAULT_CATEGORIES.map((cat) => cat.name),
      },
    };

    try {
      const explanation: EmailExplanation = await explainEmail(explainerInput);
      return c.json({
        data: {
          emailId: record.id,
          explanation,
        },
      });
    } catch (err) {
      const { status, body } = aiErrorResponse(err);
      return c.json(body, status);
    }
  },
);

export { explain };
