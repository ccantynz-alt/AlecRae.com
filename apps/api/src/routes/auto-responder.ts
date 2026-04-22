/**
 * Auto-Responder Route — AI-powered OOO / Vacation Mode
 *
 * GET    /v1/auto-responder            — Get current auto-responder config
 * PUT    /v1/auto-responder            — Create or update auto-responder
 * POST   /v1/auto-responder/activate   — Activate auto-responder
 * POST   /v1/auto-responder/deactivate — Deactivate auto-responder
 * GET    /v1/auto-responder/log        — Get auto-responder send log (paginated)
 * POST   /v1/auto-responder/preview    — Preview how AI would respond to a sample email
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, autoResponders, autoResponderLog } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AutoResponderScheduleSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  timezone: z.string().min(1),
});

const AutoResponderRulesSchema = z.object({
  respondToContacts: z.boolean(),
  respondToUnknown: z.boolean(),
  excludeDomains: z.array(z.string()).optional(),
  excludeLabels: z.array(z.string()).optional(),
  maxResponsesPerSender: z.number().int().min(1).max(100).optional(),
  aiSmartReply: z.boolean(),
});

const UpsertAutoResponderSchema = z.object({
  mode: z.enum(["off", "vacation", "busy", "custom"]),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  schedule: AutoResponderScheduleSchema.optional(),
  rules: AutoResponderRulesSchema.optional(),
});

const LogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const PreviewSchema = z.object({
  senderEmail: z.string().email(),
  senderName: z.string().optional(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const autoResponderRouter = new Hono();

// GET / — Get current auto-responder config
autoResponderRouter.get(
  "/",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [config] = await db
      .select()
      .from(autoResponders)
      .where(eq(autoResponders.accountId, auth.accountId))
      .limit(1);

    if (!config) {
      return c.json({
        data: null,
      });
    }

    return c.json({
      data: {
        id: config.id,
        mode: config.mode,
        subject: config.subject,
        htmlBody: config.htmlBody,
        textBody: config.textBody,
        isActive: config.isActive,
        schedule: config.schedule,
        rules: config.rules,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  },
);

// PUT / — Create or update auto-responder
autoResponderRouter.put(
  "/",
  requireScope("account:manage"),
  validateBody(UpsertAutoResponderSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof UpsertAutoResponderSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();

    // Check if an auto-responder already exists for this account
    const [existing] = await db
      .select({ id: autoResponders.id })
      .from(autoResponders)
      .where(eq(autoResponders.accountId, auth.accountId))
      .limit(1);

    if (existing) {
      // Update existing
      await db
        .update(autoResponders)
        .set({
          mode: input.mode,
          subject: input.subject,
          htmlBody: input.htmlBody ?? "",
          textBody: input.textBody ?? "",
          schedule: input.schedule ?? null,
          ...(input.rules !== undefined ? { rules: input.rules } : {}),
          updatedAt: now,
        })
        .where(eq(autoResponders.id, existing.id));

      return c.json({
        data: {
          id: existing.id,
          mode: input.mode,
          subject: input.subject,
          updatedAt: now.toISOString(),
        },
      });
    }

    // Create new
    const id = generateId();

    await db.insert(autoResponders).values({
      id,
      accountId: auth.accountId,
      mode: input.mode,
      subject: input.subject,
      htmlBody: input.htmlBody ?? "",
      textBody: input.textBody ?? "",
      isActive: false,
      schedule: input.schedule ?? null,
      rules: input.rules ?? {
        respondToContacts: true,
        respondToUnknown: false,
        maxResponsesPerSender: 1,
        aiSmartReply: false,
      },
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          mode: input.mode,
          subject: input.subject,
          isActive: false,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// POST /activate — Activate auto-responder
autoResponderRouter.post(
  "/activate",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [config] = await db
      .select({ id: autoResponders.id, isActive: autoResponders.isActive })
      .from(autoResponders)
      .where(eq(autoResponders.accountId, auth.accountId))
      .limit(1);

    if (!config) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No auto-responder configured. Create one first via PUT /v1/auto-responder.",
            code: "auto_responder_not_found",
          },
        },
        404,
      );
    }

    if (config.isActive) {
      return c.json({
        data: { id: config.id, isActive: true, message: "Auto-responder is already active" },
      });
    }

    const now = new Date();

    await db
      .update(autoResponders)
      .set({ isActive: true, updatedAt: now })
      .where(eq(autoResponders.id, config.id));

    return c.json({
      data: { id: config.id, isActive: true, activatedAt: now.toISOString() },
    });
  },
);

// POST /deactivate — Deactivate auto-responder
autoResponderRouter.post(
  "/deactivate",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [config] = await db
      .select({ id: autoResponders.id, isActive: autoResponders.isActive })
      .from(autoResponders)
      .where(eq(autoResponders.accountId, auth.accountId))
      .limit(1);

    if (!config) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No auto-responder configured. Create one first via PUT /v1/auto-responder.",
            code: "auto_responder_not_found",
          },
        },
        404,
      );
    }

    if (!config.isActive) {
      return c.json({
        data: { id: config.id, isActive: false, message: "Auto-responder is already inactive" },
      });
    }

    const now = new Date();

    await db
      .update(autoResponders)
      .set({ isActive: false, updatedAt: now })
      .where(eq(autoResponders.id, config.id));

    return c.json({
      data: { id: config.id, isActive: false, deactivatedAt: now.toISOString() },
    });
  },
);

// GET /log — Get auto-responder send log (paginated)
autoResponderRouter.get(
  "/log",
  requireScope("account:manage"),
  validateQuery(LogQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof LogQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // First, get the auto-responder for this account
    const [config] = await db
      .select({ id: autoResponders.id })
      .from(autoResponders)
      .where(eq(autoResponders.accountId, auth.accountId))
      .limit(1);

    if (!config) {
      return c.json({ data: [], cursor: null, hasMore: false });
    }

    const conditions = [eq(autoResponderLog.autoResponderId, config.id)];

    if (query.cursor) {
      conditions.push(lt(autoResponderLog.sentAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: autoResponderLog.id,
        recipientEmail: autoResponderLog.recipientEmail,
        emailId: autoResponderLog.emailId,
        sentAt: autoResponderLog.sentAt,
      })
      .from(autoResponderLog)
      .where(and(...conditions))
      .orderBy(desc(autoResponderLog.sentAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.sentAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        recipientEmail: row.recipientEmail,
        emailId: row.emailId,
        sentAt: row.sentAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// POST /preview — Preview how AI would respond to a sample email
autoResponderRouter.post(
  "/preview",
  requireScope("account:manage"),
  validateBody(PreviewSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof PreviewSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Load the current auto-responder config
    const [config] = await db
      .select()
      .from(autoResponders)
      .where(eq(autoResponders.accountId, auth.accountId))
      .limit(1);

    if (!config) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No auto-responder configured. Create one first via PUT /v1/auto-responder.",
            code: "auto_responder_not_found",
          },
        },
        404,
      );
    }

    // Templated response for now — real AI integration comes later
    const senderDisplay = input.senderName
      ? `${input.senderName} (${input.senderEmail})`
      : input.senderEmail;

    const previewSubject = `Re: ${input.subject}`;
    const previewTextBody = [
      `Hi ${input.senderName ?? "there"},`,
      "",
      config.textBody || "Thank you for your email. I am currently out of the office and will respond when I return.",
      "",
      `This is an automatic reply to your message "${input.subject}".`,
      "",
      "Best regards",
    ].join("\n");

    const previewHtmlBody = [
      `<p>Hi ${input.senderName ?? "there"},</p>`,
      `<p>${config.htmlBody || config.textBody || "Thank you for your email. I am currently out of the office and will respond when I return."}</p>`,
      `<p><em>This is an automatic reply to your message &ldquo;${input.subject}&rdquo;.</em></p>`,
      "<p>Best regards</p>",
    ].join("\n");

    return c.json({
      data: {
        preview: {
          to: senderDisplay,
          subject: previewSubject,
          htmlBody: previewHtmlBody,
          textBody: previewTextBody,
        },
        aiGenerated: false,
        note: "This is a templated preview. AI-generated smart replies will be available when the AI integration is enabled.",
      },
    });
  },
);

export { autoResponderRouter };
