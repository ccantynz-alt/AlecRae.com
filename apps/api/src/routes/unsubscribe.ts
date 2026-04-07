/**
 * AI Unsubscribe Routes
 *
 * One-click, AI-driven unsubscribe. The user clicks "Unsubscribe" once and
 * Vienna's agent does the rest:
 *
 *   POST /v1/unsubscribe/extract  — Inspect an email, list every option
 *   POST /v1/unsubscribe/execute  — Run the best option for one email
 *   POST /v1/unsubscribe/bulk     — Run unsubscribes for many emails at once
 *   GET  /v1/unsubscribe/history  — Recent unsubscribe attempts + status
 */

import { Hono } from "hono";
import { z } from "zod";
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
} from "@emailed/ai-engine/unsubscribe";
import { getSendQueue } from "../lib/queue.js";

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

// ─── History store (in-memory; production: Postgres) ───────────────────────

export interface UnsubscribeHistoryEntry {
  id: string;
  accountId: string;
  emailId: string;
  from: string;
  method: "one_click_post" | "http" | "mailto" | "none";
  target: string;
  status: "success" | "failed" | "no_option";
  startedAt: string;
  finishedAt: string;
  steps?: string[];
  finalUrl?: string;
  confirmationText?: string;
  error?: string;
}

const history = new Map<string, UnsubscribeHistoryEntry[]>();

function recordHistory(accountId: string, entry: UnsubscribeHistoryEntry): void {
  const list = history.get(accountId) ?? [];
  list.unshift(entry);
  // Keep last 200 per account.
  history.set(accountId, list.slice(0, 200));
}

// ─── Execution helpers ─────────────────────────────────────────────────────

async function executeOption(
  option: UnsubscribeOption,
  userEmail: string | undefined,
): Promise<{
  status: "success" | "failed";
  error?: string;
  finalUrl?: string;
  steps?: string[];
  confirmationText?: string;
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
  const result = await runUnsubscribeFlow(option.target, { userEmail });
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
    const startedAt = new Date().toISOString();

    let chosen: UnsubscribeOption | null;
    if (input.option) {
      // Re-extract so we have the full option metadata if possible.
      const all = await extractUnsubscribeOptions(toExtractInput(input.email));
      chosen =
        all.find(
          (o) => o.method === input.option!.method && o.target === input.option!.target,
        ) ?? {
          method: input.option.method,
          target: input.option.target,
          source: "list_unsubscribe_header",
          priority: 99,
          confidence: 0.5,
        };
    } else {
      chosen = await pickBestUnsubscribeOption(toExtractInput(input.email));
    }

    if (!chosen) {
      const entry: UnsubscribeHistoryEntry = {
        id: `unsub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        accountId: auth.accountId,
        emailId: input.email.emailId,
        from: input.email.from,
        method: "none",
        target: "",
        status: "no_option",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: "No unsubscribe option found in this email",
      };
      recordHistory(auth.accountId, entry);
      return c.json({ data: entry }, 200);
    }

    const result = await executeOption(chosen, input.userEmail);

    const entry: UnsubscribeHistoryEntry = {
      id: `unsub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountId: auth.accountId,
      emailId: input.email.emailId,
      from: input.email.from,
      method: chosen.method,
      target: chosen.target,
      status: result.status,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...(result.steps ? { steps: result.steps } : {}),
      ...(result.finalUrl ? { finalUrl: result.finalUrl } : {}),
      ...(result.confirmationText ? { confirmationText: result.confirmationText } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
    recordHistory(auth.accountId, entry);
    return c.json({ data: entry });
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
        const startedAt = new Date().toISOString();
        const best = await pickBestUnsubscribeOption(toExtractInput(email));
        if (!best) {
          const entry: UnsubscribeHistoryEntry = {
            id: `unsub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            accountId: auth.accountId,
            emailId: email.emailId,
            from: email.from,
            method: "none",
            target: "",
            status: "no_option",
            startedAt,
            finishedAt: new Date().toISOString(),
            error: "No unsubscribe option found",
          };
          recordHistory(auth.accountId, entry);
          return entry;
        }
        const r = await executeOption(best, input.userEmail);
        const entry: UnsubscribeHistoryEntry = {
          id: `unsub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          accountId: auth.accountId,
          emailId: email.emailId,
          from: email.from,
          method: best.method,
          target: best.target,
          status: r.status,
          startedAt,
          finishedAt: new Date().toISOString(),
          ...(r.steps ? { steps: r.steps } : {}),
          ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
          ...(r.confirmationText ? { confirmationText: r.confirmationText } : {}),
          ...(r.error ? { error: r.error } : {}),
        };
        recordHistory(auth.accountId, entry);
        return entry;
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
  (c) => {
    const auth = c.get("auth");
    const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);
    const list = (history.get(auth.accountId) ?? []).slice(0, limit);
    return c.json({ data: list });
  },
);

export { unsubscribe };
