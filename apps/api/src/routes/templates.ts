/**
 * Templates Route — Email Template CRUD + Rendering
 *
 * POST   /v1/templates           — Create a template
 * GET    /v1/templates           — List templates (paginated)
 * GET    /v1/templates/:id       — Get a single template
 * PUT    /v1/templates/:id       — Update a template
 * DELETE /v1/templates/:id       — Delete a template
 * POST   /v1/templates/:id/render — Render a template with variables
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, like } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, templates } from "@alecrae/db";
import {
  renderTemplate,
  extractVariables,
  validateVariables,
} from "../lib/template-renderer.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(998).optional(),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const RenderTemplateSchema = z.object({
  variables: z.record(z.unknown()),
});

const ListTemplatesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  name: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const templatesRouter = new Hono();

// POST /v1/templates — Create a template
templatesRouter.post(
  "/",
  requireScope("templates:write"),
  validateBody(CreateTemplateSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateTemplateSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    // Auto-extract variables from the template content
    const allContent = [input.subject, input.htmlBody ?? "", input.textBody ?? ""].join(" ");
    const variables = extractVariables(allContent);

    await db.insert(templates).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      subject: input.subject,
      htmlBody: input.htmlBody ?? null,
      textBody: input.textBody ?? null,
      variables,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          subject: input.subject,
          variables,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/templates — List templates
templatesRouter.get(
  "/",
  requireScope("templates:read"),
  validateQuery(ListTemplatesQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListTemplatesQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(templates.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(templates.createdAt, new Date(query.cursor)));
    }

    if (query.name) {
      conditions.push(like(templates.name, `%${query.name}%`));
    }

    const rows = await db
      .select({
        id: templates.id,
        name: templates.name,
        subject: templates.subject,
        variables: templates.variables,
        createdAt: templates.createdAt,
        updatedAt: templates.updatedAt,
      })
      .from(templates)
      .where(and(...conditions))
      .orderBy(desc(templates.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const lastItem = page[page.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? lastItem.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        name: row.name,
        subject: row.subject,
        variables: row.variables,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/templates/:id — Get a single template
templatesRouter.get(
  "/:id",
  requireScope("templates:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.accountId, auth.accountId)))
      .limit(1);

    if (!template) {
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

    return c.json({
      data: {
        id: template.id,
        name: template.name,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        variables: template.variables,
        metadata: template.metadata,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /v1/templates/:id — Update a template
templatesRouter.put(
  "/:id",
  requireScope("templates:write"),
  validateBody(UpdateTemplateSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateTemplateSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.accountId, auth.accountId)))
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

    const updatedSubject = input.subject ?? existing.subject;
    const updatedHtml = input.htmlBody !== undefined ? input.htmlBody : existing.htmlBody;
    const updatedText = input.textBody !== undefined ? input.textBody : existing.textBody;

    const allContent = [updatedSubject, updatedHtml ?? "", updatedText ?? ""].join(" ");
    const variables = extractVariables(allContent);

    const now = new Date();

    await db
      .update(templates)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.htmlBody !== undefined ? { htmlBody: input.htmlBody } : {}),
        ...(input.textBody !== undefined ? { textBody: input.textBody } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        variables,
        updatedAt: now,
      })
      .where(and(eq(templates.id, id), eq(templates.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        name: input.name ?? existing.name,
        subject: updatedSubject,
        variables,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/templates/:id — Delete a template
templatesRouter.delete(
  "/:id",
  requireScope("templates:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.accountId, auth.accountId)))
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
      .delete(templates)
      .where(and(eq(templates.id, id), eq(templates.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

// POST /v1/templates/:id/render — Render a template with variables
templatesRouter.post(
  "/:id/render",
  requireScope("templates:read"),
  validateBody(RenderTemplateSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof RenderTemplateSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.accountId, auth.accountId)))
      .limit(1);

    if (!template) {
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

    // Validate that all required variables are provided
    const allContent = [
      template.subject,
      template.htmlBody ?? "",
      template.textBody ?? "",
    ].join(" ");

    const missing = validateVariables(allContent, input.variables);
    if (missing.length > 0) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Missing required template variables: ${missing.join(", ")}`,
            code: "missing_variables",
            missing,
          },
        },
        400,
      );
    }

    const renderedSubject = renderTemplate(template.subject, input.variables);
    const renderedHtml = template.htmlBody
      ? renderTemplate(template.htmlBody, input.variables)
      : null;
    const renderedText = template.textBody
      ? renderTemplate(template.textBody, input.variables)
      : null;

    return c.json({
      data: {
        subject: renderedSubject,
        htmlBody: renderedHtml,
        textBody: renderedText,
      },
    });
  },
);

export { templatesRouter };
