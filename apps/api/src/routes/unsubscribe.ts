/**
 * AI Unsubscribe Agent Routes
 *
 * One-click, AI-driven unsubscribe. The user clicks "Unsubscribe" once and
 * AlecRae's agent does the rest:
 *
 *   POST /v1/unsubscribe/extract  — Inspect an email, list every option
 *   POST /v1/unsubscribe/execute  — Run the best option for one email
 *   POST /v1/unsubscribe/bulk     — Run unsubscribes for many emails at once
 *   GET  /v1/unsubscribe/history  — Recent unsubscribe attempts + status
 *
 * Per-email convenience endpoint (mounted separately on emails router):
 *   POST /v1/emails/:id/unsubscribe — One-click unsubscribe for a specific email
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  extractUnsubscribeOptions,
  pickBestUnsubscribeOption,
  runUnsubscribeFlow,
  sendUnsubscribeMailto,
  sendOneClickUnsubscribe,
  type UnsubscribeOption,
  type ExtractEmailInput,
} from "@alecrae/ai-engine/unsubscribe";
import { getSendQueue } from "../lib/queue.js";
import { getDatabase, unsubscribeHistory, emails } from "@alecrae/db";

// ─── Schemas ────────────────────────────────────────────────────────────────

const EmailContentSchema = z.object({
  emailId: z.string().min(1),
  from: z.string().min(1),
  subject: z.string().default(""),
  headers: z.record(z.string()).default({}),
  htmlBody: z.string().default(""),
  textBody: z.string().default(""),
});

const ExtractSchema = z.object({
  email: EmailContentSchema,
});

const ExecuteSchema = z.object({
  email: EmailContentSchema,
  /** If omitted, the API picks the best option automatically. */
  option: z
    .object({
      method: z.enum(["one_click_post", "http", "mailto"]),
      target: z.string().min(1),
    })
    .optional(),
  /** Optional override email to fill into web forms. */
  userEmail: z.string().email().optional(),
});

const BulkSchema = z.object({
  emails: z.array(EmailContentSchema).min(1).max(50),
  userEmail: z.string().email().optional(),
});

const PerEmailUnsubscribeSchema = z.object({
  /** Optional override email to fill into web forms. */
  userEmail: z.string().email().optional(),
  /** If specified, force a particular unsubscribe method + target. */
  option: z
    .object({
      method: z.enum(["one_click_post", "http", "mailto"]),
      target: z.string().min(1),
    })
    .optional(),
});

// ─── ID generation ────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `unsub_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ─── DB persistence helpers ──────────────────────────────────────────────

interface HistoryInsert {
  accountId: string;
  emailId: string;
  fromAddress: string;
  method: "one_click_post" | "http" | "mailto" | "none";
  target: string;
  status: "pending" | "success" | "failed" | "no_option";
  confidence?: number | undefined;
  source?: string | undefined;
  steps?: string[] | undefined;
  finalUrl?: string | undefined;
  confirmationText?: string | undefined;
  error?: string | undefined;
  startedAt: Date;
  finishedAt?: Date | undefined;
}

async function recordHistory(entry: HistoryInsert): Promise<string> {
  const db = getDatabase();
  const id = generateId();
  await db.insert(unsubscribeHistory).values({
    id,
    accountId: entry.accountId,
    emailId: entry.emailId,
    fromAddress: entry.fromAddress,
    method: entry.method,
    target: entry.target,
    status: entry.status,
    confidence: entry.confidence ?? null,
    source: entry.source ?? null,
    steps: entry.steps ?? null,
    finalUrl: entry.finalUrl ?? null,
    confirmationText: entry.confirmationText ?? null,
    error: entry.error ?? null,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt ?? null,
  });
  return id;
}

// ─── Execution helpers ─────────────────────────────────────────────────────

async function executeOption(
  option: UnsubscribeOption,
  userEmail: string | undefined,
): Promise<{
  status: "success" | "failed";
  error?: string | undefined;
  finalUrl?: string | undefined;
  steps?: string[] | undefined;
  confirmationText?: string | undefined;
}> {
  if (option.method === "one_click_post") {
    const result = await sendOneClickUnsubscribe(option.target);
    return {
      status: result.success ? "success" : "failed",
      finalUrl: result.finalUrl,
      ...(result.error ? { error: result.error } : {}),
      steps: [`POST ${option.target} → HTTP ${result.status}`],
    };
  }

  if (option.method === "mailto") {
    const result = await sendUnsubscribeMailto(option.target, async (msg) => {
      const queue = getSendQueue();
      await queue.add("send", {
        from: userEmail ?? "",
        to: msg.to,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        text: msg.body,
        kind: "unsubscribe",
      });
    });
    return {
      status: result.success ? "success" : "failed",
      ...(result.error ? { error: result.error } : {}),
      steps: [`mailto ${result.parsed.to.join(",")} subject="${result.parsed.subject}"`],
    };
  }

  // http — drive the browser agent.
  const opts = userEmail !== undefined ? { userEmail } : {};
  const result = await runUnsubscribeFlow(option.target, opts);
  return {
    status: result.success ? "success" : "failed",
    finalUrl: result.finalUrl,
    steps: result.steps,
    ...(result.confirmationText ? { confirmationText: result.confirmationText } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

function toExtractInput(email: z.infer<typeof EmailContentSchema>): ExtractEmailInput {
  return {
    headers: email.headers,
    htmlBody: email.htmlBody,
    textBody: email.textBody,
  };
}

// ─── Router ────────────────────────────────────────────────────────────────

const unsubscribe = new Hono();

// POST /v1/unsubscribe/extract
unsubscribe.post(
  "/extract",
  requireScope("inbox:read"),
  validateBody(ExtractSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ExtractSchema>>(c);
    const options = await extractUnsubscribeOptions(toExtractInput(input.email));
    return c.json({
      data: {
        emailId: input.email.emailId,
        from: input.email.from,
        options,
        best: options[0] ?? null,
      },
    });
  },
);

// POST /v1/unsubscribe/execute
unsubscribe.post(
  "/execute",
  requireScope("inbox:write"),
  validateBody(ExecuteSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ExecuteSchema>>(c);
    const auth = c.get("auth");
    const startedAt = new Date();

    let chosen: UnsubscribeOption | null;
    if (input.option) {
      const { method: optMethod, target: optTarget } = input.option;
      // Re-extract so we have the full option metadata if possible.
      const all = await extractUnsubscribeOptions(toExtractInput(input.email));
      chosen =
        all.find(
          (o) => o.method === optMethod && o.target === optTarget,
        ) ?? {
          method: optMethod,
          target: optTarget,
          source: "list_unsubscribe_header",
          priority: 99,
          confidence: 0.5,
        };
    } else {
      chosen = await pickBestUnsubscribeOption(toExtractInput(input.email));
    }

    if (!chosen) {
      const id = await recordHistory({
        accountId: auth.accountId,
        emailId: input.email.emailId,
        fromAddress: input.email.from,
        method: "none",
        target: "",
        status: "no_option",
        error: "No unsubscribe option found in this email",
        startedAt,
        finishedAt: new Date(),
      });
      return c.json({
        data: {
          id,
          emailId: input.email.emailId,
          from: input.email.from,
          method: "none" as const,
          status: "no_option" as const,
          error: "No unsubscribe option found in this email",
        },
      }, 200);
    }

    const result = await executeOption(chosen, input.userEmail);

    const id = await recordHistory({
      accountId: auth.accountId,
      emailId: input.email.emailId,
      fromAddress: input.email.from,
      method: chosen.method,
      target: chosen.target,
      status: result.status,
      confidence: chosen.confidence,
      source: chosen.source,
      steps: result.steps,
      finalUrl: result.finalUrl,
      confirmationText: result.confirmationText,
      error: result.error,
      startedAt,
      finishedAt: new Date(),
    });

    return c.json({
      data: {
        id,
        emailId: input.email.emailId,
        from: input.email.from,
        method: chosen.method,
        target: chosen.target,
        status: result.status,
        confidence: chosen.confidence,
        source: chosen.source,
        steps: result.steps,
        finalUrl: result.finalUrl,
        confirmationText: result.confirmationText,
        error: result.error,
      },
    });
  },
);

// POST /v1/unsubscribe/bulk
unsubscribe.post(
  "/bulk",
  requireScope("inbox:write"),
  validateBody(BulkSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof BulkSchema>>(c);
    const auth = c.get("auth");

    const results = await Promise.all(
      input.emails.map(async (email) => {
        const startedAt = new Date();
        const best = await pickBestUnsubscribeOption(toExtractInput(email));
        if (!best) {
          const id = await recordHistory({
            accountId: auth.accountId,
            emailId: email.emailId,
            fromAddress: email.from,
            method: "none",
            target: "",
            status: "no_option",
            error: "No unsubscribe option found",
            startedAt,
            finishedAt: new Date(),
          });
          return {
            id,
            emailId: email.emailId,
            from: email.from,
            method: "none" as const,
            status: "no_option" as const,
            error: "No unsubscribe option found",
          };
        }
        const r = await executeOption(best, input.userEmail);
        const id = await recordHistory({
          accountId: auth.accountId,
          emailId: email.emailId,
          fromAddress: email.from,
          method: best.method,
          target: best.target,
          status: r.status,
          confidence: best.confidence,
          source: best.source,
          steps: r.steps,
          finalUrl: r.finalUrl,
          confirmationText: r.confirmationText,
          error: r.error,
          startedAt,
          finishedAt: new Date(),
        });
        return {
          id,
          emailId: email.emailId,
          from: email.from,
          method: best.method,
          target: best.target,
          status: r.status,
          confidence: best.confidence,
          steps: r.steps,
          finalUrl: r.finalUrl,
          confirmationText: r.confirmationText,
          error: r.error,
        };
      }),
    );

    const summary = {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      noOption: results.filter((r) => r.status === "no_option").length,
    };

    return c.json({ data: { summary, results } });
  },
);

// GET /v1/unsubscribe/history
unsubscribe.get(
  "/history",
  requireScope("inbox:read"),
  async (c) => {
    const auth = c.get("auth");
    const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);
    const db = getDatabase();

    const rows = await db
      .select()
      .from(unsubscribeHistory)
      .where(eq(unsubscribeHistory.accountId, auth.accountId))
      .orderBy(desc(unsubscribeHistory.createdAt))
      .limit(limit);

    return c.json({ data: rows });
  },
);

// ─── Per-email unsubscribe router (mounted at /v1/emails) ──────────────────

const emailUnsubscribe = new Hono();

/**
 * POST /v1/emails/:id/unsubscribe
 *
 * One-click unsubscribe for a specific email. Looks up the email in the DB,
 * extracts unsubscribe options from headers + body, picks the best one, and
 * executes it automatically.
 */
emailUnsubscribe.post(
  "/:id/unsubscribe",
  requireScope("inbox:write"),
  validateBody(PerEmailUnsubscribeSchema),
  async (c) => {
    const emailId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof PerEmailUnsubscribeSchema>>(c);
    const auth = c.get("auth");
    const startedAt = new Date();

    // Look up the email in DB.
    const db = getDatabase();
    const rows = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    const emailRow = rows[0];
    if (!emailRow) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Email ${emailId} not found`,
            code: "email_not_found",
          },
        },
        404,
      );
    }

    // Build the extraction input from stored email data.
    const customHeaders = (emailRow.customHeaders ?? {}) as Record<string, string>;
    const extractInput: ExtractEmailInput = {
      headers: customHeaders,
      htmlBody: emailRow.htmlBody ?? "",
      textBody: emailRow.textBody ?? "",
    };

    // Pick the best option (or use the caller-specified one).
    let chosen: UnsubscribeOption | null;
    if (input.option) {
      const { method: optMethod, target: optTarget } = input.option;
      const all = await extractUnsubscribeOptions(extractInput);
      chosen =
        all.find(
          (o) => o.method === optMethod && o.target === optTarget,
        ) ?? {
          method: optMethod,
          target: optTarget,
          source: "list_unsubscribe_header",
          priority: 99,
          confidence: 0.5,
        };
    } else {
      chosen = await pickBestUnsubscribeOption(extractInput);
    }

    if (!chosen) {
      // Check if there are any body links we can try via AI extraction.
      const allOptions = await extractUnsubscribeOptions(extractInput);
      if (allOptions.length === 0) {
        const id = await recordHistory({
          accountId: auth.accountId,
          emailId,
          fromAddress: emailRow.fromAddress,
          method: "none",
          target: "",
          status: "no_option",
          error: "No unsubscribe option found in this email. The email may not contain List-Unsubscribe headers or unsubscribe links.",
          startedAt,
          finishedAt: new Date(),
        });
        return c.json({
          data: {
            id,
            emailId,
            from: emailRow.fromAddress,
            method: "none" as const,
            status: "no_option" as const,
            error: "No unsubscribe option found in this email",
          },
        });
      }
      const firstOption = allOptions[0];
      if (!firstOption) {
        return c.json(
          {
            error: {
              type: "internal_error",
              message: "Failed to select unsubscribe option",
              code: "option_selection_failed",
            },
          },
          500,
        );
      }
      chosen = firstOption;
    }

    // Execute the unsubscribe.
    const result = await executeOption(chosen, input.userEmail);

    const id = await recordHistory({
      accountId: auth.accountId,
      emailId,
      fromAddress: emailRow.fromAddress,
      method: chosen.method,
      target: chosen.target,
      status: result.status,
      confidence: chosen.confidence,
      source: chosen.source,
      steps: result.steps,
      finalUrl: result.finalUrl,
      confirmationText: result.confirmationText,
      error: result.error,
      startedAt,
      finishedAt: new Date(),
    });

    return c.json({
      data: {
        id,
        emailId,
        from: emailRow.fromAddress,
        subject: emailRow.subject,
        method: chosen.method,
        target: chosen.target,
        status: result.status,
        confidence: chosen.confidence,
        source: chosen.source,
        steps: result.steps,
        finalUrl: result.finalUrl,
        confirmationText: result.confirmationText,
        error: result.error,
      },
    });
  },
);

/**
 * GET /v1/emails/:id/unsubscribe/options
 *
 * Inspect an email and return all available unsubscribe options without
 * executing any of them.
 */
emailUnsubscribe.get(
  "/:id/unsubscribe/options",
  requireScope("inbox:read"),
  async (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");

    const db = getDatabase();
    const rows = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.accountId, auth.accountId)))
      .limit(1);

    const emailRow = rows[0];
    if (!emailRow) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Email ${emailId} not found`,
            code: "email_not_found",
          },
        },
        404,
      );
    }

    const customHeaders = (emailRow.customHeaders ?? {}) as Record<string, string>;
    const extractInput: ExtractEmailInput = {
      headers: customHeaders,
      htmlBody: emailRow.htmlBody ?? "",
      textBody: emailRow.textBody ?? "",
    };

    const options = await extractUnsubscribeOptions(extractInput);

    return c.json({
      data: {
        emailId,
        from: emailRow.fromAddress,
        subject: emailRow.subject,
        options,
        best: options[0] ?? null,
        hasUnsubscribe: options.length > 0,
      },
    });
  },
);

/**
 * GET /v1/emails/:id/unsubscribe/status
 *
 * Check the status of a previous unsubscribe attempt for this email.
 */
emailUnsubscribe.get(
  "/:id/unsubscribe/status",
  requireScope("inbox:read"),
  async (c) => {
    const emailId = c.req.param("id");
    const auth = c.get("auth");

    const db = getDatabase();
    const rows = await db
      .select()
      .from(unsubscribeHistory)
      .where(
        and(
          eq(unsubscribeHistory.emailId, emailId),
          eq(unsubscribeHistory.accountId, auth.accountId),
        ),
      )
      .orderBy(desc(unsubscribeHistory.createdAt))
      .limit(1);

    const record = rows[0];
    if (!record) {
      return c.json({
        data: {
          emailId,
          hasAttempt: false,
          status: null,
        },
      });
    }

    return c.json({
      data: {
        ...record,
        hasAttempt: true,
      },
    });
  },
);

export { unsubscribe, emailUnsubscribe };
