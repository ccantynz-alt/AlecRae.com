/**
 * Signatures Route — Multiple signatures per account, auto-switch by context
 *
 * POST   /v1/signatures             — Create a signature
 * GET    /v1/signatures             — List signatures for account
 * GET    /v1/signatures/:id         — Get a single signature
 * PUT    /v1/signatures/:id         — Update a signature
 * DELETE /v1/signatures/:id         — Delete a signature
 * POST   /v1/signatures/:id/default — Set as default signature
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, asc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, signatures } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SignatureContextSchema = z.object({
  accountEmails: z.array(z.string().email()).optional(),
  recipientDomains: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
});

const CreateSignatureSchema = z.object({
  name: z.string().min(1).max(255),
  htmlContent: z.string().min(1),
  textContent: z.string().min(1),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  context: SignatureContextSchema.optional(),
});

const UpdateSignatureSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  htmlContent: z.string().min(1).optional(),
  textContent: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  context: SignatureContextSchema.optional(),
});

const ListSignaturesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const signaturesRouter = new Hono();

// POST /v1/signatures — Create a signature
signaturesRouter.post(
  "/",
  requireScope("account:manage"),
  validateBody(CreateSignatureSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateSignatureSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    // If this signature is being set as default, clear existing defaults
    if (input.isDefault) {
      await db
        .update(signatures)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(signatures.accountId, auth.accountId),
            eq(signatures.isDefault, true),
          ),
        );
    }

    await db.insert(signatures).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
      isDefault: input.isDefault ?? false,
      sortOrder: input.sortOrder ?? 0,
      context: input.context ?? {},
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          htmlContent: input.htmlContent,
          textContent: input.textContent,
          isDefault: input.isDefault ?? false,
          sortOrder: input.sortOrder ?? 0,
          context: input.context ?? {},
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/signatures — List signatures for account
signaturesRouter.get(
  "/",
  requireScope("account:manage"),
  validateQuery(ListSignaturesQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListSignaturesQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(signatures.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(signatures.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: signatures.id,
        name: signatures.name,
        htmlContent: signatures.htmlContent,
        textContent: signatures.textContent,
        isDefault: signatures.isDefault,
        sortOrder: signatures.sortOrder,
        context: signatures.context,
        createdAt: signatures.createdAt,
        updatedAt: signatures.updatedAt,
      })
      .from(signatures)
      .where(and(...conditions))
      .orderBy(asc(signatures.sortOrder), desc(signatures.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        name: row.name,
        htmlContent: row.htmlContent,
        textContent: row.textContent,
        isDefault: row.isDefault,
        sortOrder: row.sortOrder,
        context: row.context,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/signatures/:id — Get a single signature
signaturesRouter.get(
  "/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [signature] = await db
      .select()
      .from(signatures)
      .where(
        and(eq(signatures.id, id), eq(signatures.accountId, auth.accountId)),
      )
      .limit(1);

    if (!signature) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Signature ${id} not found`,
            code: "signature_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: signature.id,
        name: signature.name,
        htmlContent: signature.htmlContent,
        textContent: signature.textContent,
        isDefault: signature.isDefault,
        sortOrder: signature.sortOrder,
        context: signature.context,
        createdAt: signature.createdAt.toISOString(),
        updatedAt: signature.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /v1/signatures/:id — Update a signature
signaturesRouter.put(
  "/:id",
  requireScope("account:manage"),
  validateBody(UpdateSignatureSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateSignatureSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(signatures)
      .where(
        and(eq(signatures.id, id), eq(signatures.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Signature ${id} not found`,
            code: "signature_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    // If setting this signature as default, clear other defaults first
    if (input.isDefault === true) {
      await db
        .update(signatures)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(signatures.accountId, auth.accountId),
            eq(signatures.isDefault, true),
          ),
        );
    }

    await db
      .update(signatures)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.htmlContent !== undefined
          ? { htmlContent: input.htmlContent }
          : {}),
        ...(input.textContent !== undefined
          ? { textContent: input.textContent }
          : {}),
        ...(input.isDefault !== undefined
          ? { isDefault: input.isDefault }
          : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        ...(input.context !== undefined ? { context: input.context } : {}),
        updatedAt: now,
      })
      .where(
        and(eq(signatures.id, id), eq(signatures.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        name: input.name ?? existing.name,
        htmlContent: input.htmlContent ?? existing.htmlContent,
        textContent: input.textContent ?? existing.textContent,
        isDefault: input.isDefault ?? existing.isDefault,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        context: input.context ?? existing.context,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/signatures/:id — Delete a signature
signaturesRouter.delete(
  "/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: signatures.id })
      .from(signatures)
      .where(
        and(eq(signatures.id, id), eq(signatures.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Signature ${id} not found`,
            code: "signature_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(signatures)
      .where(
        and(eq(signatures.id, id), eq(signatures.accountId, auth.accountId)),
      );

    return c.json({ deleted: true, id });
  },
);

// POST /v1/signatures/:id/default — Set as default signature
signaturesRouter.post(
  "/:id/default",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: signatures.id })
      .from(signatures)
      .where(
        and(eq(signatures.id, id), eq(signatures.accountId, auth.accountId)),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Signature ${id} not found`,
            code: "signature_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    // Clear all existing defaults for this account
    await db
      .update(signatures)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(signatures.accountId, auth.accountId),
          eq(signatures.isDefault, true),
        ),
      );

    // Set the target signature as default
    await db
      .update(signatures)
      .set({ isDefault: true, updatedAt: now })
      .where(
        and(eq(signatures.id, id), eq(signatures.accountId, auth.accountId)),
      );

    return c.json({
      data: {
        id,
        isDefault: true,
        updatedAt: now.toISOString(),
      },
    });
  },
);

export { signaturesRouter };
