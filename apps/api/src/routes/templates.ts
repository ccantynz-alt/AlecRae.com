/**
 * Templates Route — Stored email templates with variable substitution
 *
 * POST   /v1/templates              — Create a template
 * GET    /v1/templates              — List templates (paginated, filterable)
 * GET    /v1/templates/:id          — Get a single template
 * PATCH  /v1/templates/:id          — Update a template
 * DELETE /v1/templates/:id          — Soft-delete (set isActive=false)
 * POST   /v1/templates/:id/preview  — Render with sample variables
 * POST   /v1/templates/:id/send     — Render + send to recipients
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { EmailAddressSchema, PaginationSchema } from "../types.js";
import type { PaginationParams, PaginatedResponse } from "../types.js";
import {
  getDatabase,
  templates,
  emails,
  deliveryResults,
  domains,
  accounts,
} from "@emailed/db";
import { getSendQueue } from "../lib/queue.js";
import {
  renderTemplate,
  extractVariables,
} from "../lib/template-engine.js";
import { indexEmail } from "@emailed/shared";
import { usageEnforcement } from "../middleware/usage.js";
import { getWarmupOrchestrator } from "@emailed/reputation";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateMessageId(domain: string): string {
  const id = generateId();
  return `<${id}@${domain}>`;
}

function domainOf(address: string): string {
  const idx = address.lastIndexOf("@");
  return idx === -1 ? address : address.slice(idx + 1).toLowerCase();
}

const API_BASE_URL = process.env["API_URL"] ?? "http://localhost:3001";

/**
 * Inject open-tracking pixel and rewrite links for click tracking.
 */
function injectTracking(html: string, emailId: string): string {
  const pixel = `<img src="${API_BASE_URL}/t/${emailId}/open.gif" width="1" height="1" alt="" style="display:none" />`;
  const tracked = html.includes("</body>")
    ? html.replace("</body>", `${pixel}</body>`)
    : html + pixel;

  return tracked.replace(
    /<a\s([^>]*?)href=["']([^"']+)["']/gi,
    (_match, prefix: string, url: string) => {
      if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) {
        return `<a ${prefix}href="${url}"`;
      }
      const trackedUrl = `${API_BASE_URL}/t/${emailId}/click?url=${encodeURIComponent(url)}`;
      return `<a ${prefix}href="${trackedUrl}"`;
    },
  );
}

/**
 * Build an RFC 5322 raw message from rendered template output.
 */
function buildRawMessage(
  opts: {
    from: { email: string; name?: string };
    to: { email: string; name?: string }[];
    cc?: { email: string; name?: string }[];
    subject: string;
    html: string | null;
    text: string | null;
    headers?: Record<string, string>;
  },
  messageId: string,
  emailId?: string,
): string {
  const lines: string[] = [];

  const fromStr = opts.from.name
    ? `${opts.from.name} <${opts.from.email}>`
    : opts.from.email;
  lines.push(`From: ${fromStr}`);

  const toStr = opts.to
    .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
    .join(", ");
  lines.push(`To: ${toStr}`);

  if (opts.cc && opts.cc.length > 0) {
    const ccStr = opts.cc
      .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
      .join(", ");
    lines.push(`Cc: ${ccStr}`);
  }

  lines.push(`Subject: ${opts.subject}`);
  lines.push(`Message-ID: ${messageId}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("MIME-Version: 1.0");

  if (emailId) {
    const unsubUrl = `${API_BASE_URL}/t/${emailId}/unsubscribe`;
    lines.push(`List-Unsubscribe: <${unsubUrl}>`);
    lines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }

  if (opts.headers) {
    for (const [key, value] of Object.entries(opts.headers)) {
      const lk = key.toLowerCase();
      if (["from", "to", "cc", "bcc", "subject", "message-id", "date"].includes(lk)) continue;
      lines.push(`${key}: ${value}`);
    }
  }

  const trackedHtml = opts.html && emailId ? injectTracking(opts.html, emailId) : opts.html;

  if (trackedHtml && opts.text) {
    const boundary = `----=_Part_${generateId().slice(0, 16)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(opts.text);
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(trackedHtml);
    lines.push(`--${boundary}--`);
  } else if (trackedHtml) {
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(trackedHtml);
  } else {
    lines.push("Content-Type: text/plain; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(opts.text ?? "");
  }

  return lines.join("\r\n");
}

// ─── Validation schemas ────────────────────────────────────────────────────

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  category: z.string().max(128).optional(),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
}).refine(
  (data) => data.htmlBody !== undefined || data.textBody !== undefined,
  { message: "Either htmlBody or textBody is required" },
);

type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1024).nullable().optional(),
  category: z.string().max(128).nullable().optional(),
  subject: z.string().min(1).max(998).optional(),
  htmlBody: z.string().nullable().optional(),
  textBody: z.string().nullable().optional(),
});

type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

const PreviewTemplateSchema = z.object({
  variables: z.record(z.unknown()).default({}),
});

type PreviewTemplateInput = z.infer<typeof PreviewTemplateSchema>;

const SendFromTemplateSchema = z.object({
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema).min(1).max(50),
  cc: z.array(EmailAddressSchema).max(50).optional(),
  bcc: z.array(EmailAddressSchema).max(50).optional(),
  variables: z.record(z.unknown()).default({}),
  headers: z.record(z.string()).optional(),
  tags: z.array(z.string().max(64)).max(10).optional(),
  scheduledAt: z.string().datetime().optional(),
});

type SendFromTemplateInput = z.infer<typeof SendFromTemplateSchema>;

const ListTemplatesQuery = PaginationSchema.extend({
  category: z.string().optional(),
});

// ─── Route handler ──────────────────────────────────────────────────────────

const templatesRouter = new Hono();

// POST /v1/templates — Create a template
templatesRouter.post(
  "/",
  requireScope("templates:manage"),
  validateBody(CreateTemplateSchema),
  async (c) => {
    const input = getValidatedBody<CreateTemplateInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const now = new Date();

    const id = generateId();

    // Extract variable definitions from template content
    const variables = extractVariables(
      input.subject,
      input.htmlBody ?? null,
      input.textBody ?? null,
    );

    await db.insert(templates).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      subject: input.subject,
      htmlBody: input.htmlBody ?? null,
      textBody: input.textBody ?? null,
      variables,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .limit(1);

    return c.json({ data: formatTemplate(row!) }, 201);
  },
);

// GET /v1/templates — List templates with pagination and category filter
templatesRouter.get(
  "/",
  requireScope("templates:manage"),
  validateQuery(ListTemplatesQuery),
  async (c) => {
    const query = getValidatedQuery<PaginationParams & { category?: string }>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [
      eq(templates.accountId, auth.accountId),
      eq(templates.isActive, true),
    ];

    if (query.category) {
      conditions.push(eq(templates.category, query.category));
    }

    if (query.cursor) {
      conditions.push(lt(templates.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(templates)
      .where(and(...conditions))
      .orderBy(desc(templates.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    const data = page.map(formatTemplate);

    const response: PaginatedResponse<(typeof data)[number]> = {
      data,
      cursor: nextCursor,
      hasMore,
    };

    return c.json(response);
  },
);

// GET /v1/templates/:id — Get a single template with variable definitions
templatesRouter.get(
  "/:id",
  requireScope("templates:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [row] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, id),
          eq(templates.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!row) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Template ${id} not found`,
            code: "template_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: formatTemplate(row) });
  },
);

// PATCH /v1/templates/:id — Update a template
templatesRouter.patch(
  "/:id",
  requireScope("templates:manage"),
  validateBody(UpdateTemplateSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<UpdateTemplateInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Fetch existing template
    const [existing] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, id),
          eq(templates.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Template ${id} not found`,
            code: "template_not_found",
          },
        },
        404,
      );
    }

    // Merge fields
    const updatedSubject = input.subject ?? existing.subject;
    const updatedHtmlBody = input.htmlBody !== undefined ? input.htmlBody : existing.htmlBody;
    const updatedTextBody = input.textBody !== undefined ? input.textBody : existing.textBody;

    // Re-extract variables from updated content
    const variables = extractVariables(
      updatedSubject,
      updatedHtmlBody,
      updatedTextBody,
    );

    const updateSet: Record<string, unknown> = {
      updatedAt: new Date(),
      variables,
      version: sql`${templates.version} + 1`,
    };

    if (input.name !== undefined) updateSet.name = input.name;
    if (input.description !== undefined) updateSet.description = input.description;
    if (input.category !== undefined) updateSet.category = input.category;
    if (input.subject !== undefined) updateSet.subject = input.subject;
    if (input.htmlBody !== undefined) updateSet.htmlBody = input.htmlBody;
    if (input.textBody !== undefined) updateSet.textBody = input.textBody;

    await db
      .update(templates)
      .set(updateSet)
      .where(eq(templates.id, id));

    // Fetch updated row
    const [updated] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .limit(1);

    return c.json({ data: formatTemplate(updated!) });
  },
);

// DELETE /v1/templates/:id — Soft delete (set isActive=false)
templatesRouter.delete(
  "/:id",
  requireScope("templates:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(
        and(
          eq(templates.id, id),
          eq(templates.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Template ${id} not found`,
            code: "template_not_found",
          },
        },
        404,
      );
    }

    await db
      .update(templates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(templates.id, id));

    return c.json({ success: true, id });
  },
);

// POST /v1/templates/:id/preview — Render with sample variables
templatesRouter.post(
  "/:id/preview",
  requireScope("templates:manage"),
  validateBody(PreviewTemplateSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<PreviewTemplateInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [row] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, id),
          eq(templates.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!row) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Template ${id} not found`,
            code: "template_not_found",
          },
        },
        404,
      );
    }

    const result = renderTemplate(
      {
        subject: row.subject,
        htmlBody: row.htmlBody,
        textBody: row.textBody,
        variables: row.variables ?? [],
      },
      input.variables as Record<string, unknown>,
    );

    return c.json({
      data: {
        subject: result.subject,
        html: result.html,
        text: result.text,
        warnings: result.warnings,
      },
    });
  },
);

// POST /v1/templates/:id/send — Render template + send to recipients
templatesRouter.post(
  "/:id/send",
  requireScope("templates:manage"),
  usageEnforcement,
  validateBody(SendFromTemplateSchema),
  async (c) => {
    const templateId = c.req.param("id");
    const input = getValidatedBody<SendFromTemplateInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // 1. Load template
    const [tmpl] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, templateId),
          eq(templates.accountId, auth.accountId),
          eq(templates.isActive, true),
        ),
      )
      .limit(1);

    if (!tmpl) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Template ${templateId} not found or is inactive`,
            code: "template_not_found",
          },
        },
        404,
      );
    }

    // 2. Render the template
    const rendered = renderTemplate(
      {
        subject: tmpl.subject,
        htmlBody: tmpl.htmlBody,
        textBody: tmpl.textBody,
        variables: tmpl.variables ?? [],
      },
      input.variables as Record<string, unknown>,
    );

    // 3. Verify sender domain
    const senderDomain = domainOf(input.from.email);

    const [domainRecord] = await db
      .select({ id: domains.id, dkimSelector: domains.dkimSelector })
      .from(domains)
      .where(and(eq(domains.domain, senderDomain), eq(domains.accountId, auth.accountId)))
      .limit(1);

    if (!domainRecord) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Domain "${senderDomain}" is not verified for this account. Add it via POST /v1/domains first.`,
            code: "domain_not_found",
          },
        },
        422,
      );
    }

    // 4. Check warm-up limits
    const warmupOrchestrator = getWarmupOrchestrator();
    const warmupCheck = await warmupOrchestrator.canSend(domainRecord.id);

    if (!warmupCheck.allowed) {
      return c.json(
        {
          error: {
            type: "rate_limit",
            message: warmupCheck.reason ?? "Domain warm-up sending limit reached",
            code: "warmup_limit_reached",
            retryAfter: warmupCheck.retryAfter?.toISOString() ?? null,
          },
        },
        429,
      );
    }

    // 5. Build raw message, persist, and enqueue — same as messages/send
    const id = generateId();
    const messageId = generateMessageId(senderDomain);
    const now = new Date();

    const rawMessage = buildRawMessage(
      {
        from: { email: input.from.email, ...(input.from.name ? { name: input.from.name } : {}) },
        to: input.to.map((r) => ({ email: r.email, ...(r.name ? { name: r.name } : {}) })),
        ...(input.cc ? { cc: input.cc.map((r) => ({ email: r.email, ...(r.name ? { name: r.name } : {}) })) } : {}),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(input.headers ? { headers: input.headers } : {}),
      },
      messageId,
      id,
    );

    const allRecipients = [
      ...input.to.map((r) => r.email),
      ...(input.cc ?? []).map((r) => r.email),
      ...(input.bcc ?? []).map((r) => r.email),
    ];

    // 6. Persist email record
    await db.insert(emails).values({
      id,
      accountId: auth.accountId,
      domainId: domainRecord.id,
      messageId,
      fromAddress: input.from.email,
      fromName: input.from.name ?? null,
      toAddresses: input.to.map((r) => ({ address: r.email, ...(r.name ? { name: r.name } : {}) })),
      ccAddresses: input.cc
        ? input.cc.map((r) => ({ address: r.email, ...(r.name ? { name: r.name } : {}) }))
        : null,
      bccAddresses: input.bcc
        ? input.bcc.map((r) => ({ address: r.email, ...(r.name ? { name: r.name } : {}) }))
        : null,
      replyToAddress: null,
      replyToName: null,
      subject: rendered.subject,
      textBody: rendered.text ?? null,
      htmlBody: rendered.html ?? null,
      customHeaders: input.headers ?? null,
      status: "queued",
      tags: input.tags ?? [],
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Create delivery results rows
    const deliveryRows = allRecipients.map((recipient) => ({
      id: generateId(),
      emailId: id,
      recipientAddress: recipient,
      status: "queued" as const,
      attemptCount: 0,
    }));

    if (deliveryRows.length > 0) {
      await db.insert(deliveryResults).values(deliveryRows);
    }

    // 8. Enqueue to MTA via BullMQ
    const queue = getSendQueue();

    let delay: number | undefined;
    if (input.scheduledAt) {
      const delayMs = new Date(input.scheduledAt).getTime() - Date.now();
      if (delayMs > 0) {
        delay = delayMs;
      }
    }

    await queue.add(
      id,
      {
        email: {
          id,
          accountId: auth.accountId,
          messageId,
          from: input.from.email,
          to: allRecipients,
          rawMessage,
          priority: 3 as const,
          attempts: 0,
          maxAttempts: 8,
          scheduledAt: input.scheduledAt
            ? new Date(input.scheduledAt)
            : new Date(),
          createdAt: now,
          domain: senderDomain,
          metadata: {
            domainId: domainRecord.id,
            templateId,
            tags: input.tags ?? [],
          },
        },
        addedAt: now.toISOString(),
      },
      {
        priority: 3,
        attempts: 8,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: false,
        ...(delay !== undefined ? { delay } : {}),
      },
    );

    // 9. Record warm-up send (fire-and-forget)
    warmupOrchestrator.recordSend(domainRecord.id).catch(() => {});

    // 10. Index in Meilisearch (fire-and-forget)
    indexEmail({
      id,
      accountId: auth.accountId,
      mailboxId: "sent",
      subject: rendered.subject,
      textBody: rendered.text ?? null,
      fromAddress: input.from.email,
      fromName: input.from.name ?? null,
      toAddresses: input.to.map((r) => ({ address: r.email, ...(r.name ? { name: r.name } : {}) })),
      snippet: (rendered.text ?? rendered.html ?? "").replace(/<[^>]+>/g, " ").slice(0, 200),
      hasAttachments: false,
      status: "queued",
      createdAt: now,
    }).catch((err) => {
      console.warn("[templates/send] Meilisearch indexing failed:", err);
    });

    // 11. Increment usage counter (fire-and-forget)
    db.update(accounts)
      .set({
        emailsSentThisPeriod: sql`${accounts.emailsSentThisPeriod} + 1`,
        updatedAt: now,
      })
      .where(eq(accounts.id, auth.accountId))
      .catch(() => {});

    return c.json(
      {
        id,
        messageId,
        templateId,
        status: "queued" as const,
        renderedSubject: rendered.subject,
        warnings: rendered.warnings,
      },
      202,
    );
  },
);

// ─── Formatting helper ──────────────────────────────────────────────────────

function formatTemplate(row: typeof templates.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    subject: row.subject,
    htmlBody: row.htmlBody,
    textBody: row.textBody,
    variables: row.variables,
    version: row.version,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { templatesRouter };
