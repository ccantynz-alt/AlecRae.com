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
import { PaginationSchema } from "../types.js";
import type { PaginationParams } from "../types.js";
import { getDatabase, suppressionLists, domains } from "@alecrae/db";

const suppressions = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const AddSuppressionSchema = z.object({
  email: z.string().email(),
  domain: z.string().min(1),
  reason: z.enum(["bounce", "complaint", "unsubscribe", "manual"]).default("manual"),
});

const ListSuppressionsQuery = PaginationSchema.extend({
  domain: z.string().optional(),
  reason: z.enum(["bounce", "complaint", "unsubscribe", "manual"]).optional(),
});

// POST /v1/suppressions — Add an email to the suppression list
suppressions.post(
  "/",
  requireScope("messages:send"),
  validateBody(AddSuppressionSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AddSuppressionSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify domain belongs to this account
    const [domainRecord] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.domain, input.domain), eq(domains.accountId, auth.accountId)))
      .limit(1);

    if (!domainRecord) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Domain "${input.domain}" not found for this account`,
            code: "domain_not_found",
          },
        },
        422,
      );
    }

    const id = generateId();

    // Upsert: if already suppressed, just return existing
    await db
      .insert(suppressionLists)
      .values({
        id,
        email: input.email.toLowerCase(),
        domainId: domainRecord.id,
        reason: input.reason,
      })
      .onConflictDoNothing();

    return c.json(
      {
        data: {
          id,
          email: input.email.toLowerCase(),
          domain: input.domain,
          reason: input.reason,
          createdAt: new Date().toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/suppressions — List suppressed emails
suppressions.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListSuppressionsQuery),
  async (c) => {
    const query = getValidatedQuery<
      PaginationParams & { domain?: string; reason?: string }
    >(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Get all domain IDs for this account
    const accountDomains = await db
      .select({ id: domains.id, domain: domains.domain })
      .from(domains)
      .where(eq(domains.accountId, auth.accountId));

    const domainIds = accountDomains.map((d) => d.id);
    if (domainIds.length === 0) {
      return c.json({ data: [], cursor: null, hasMore: false });
    }

    // Build query — simplified for the common case
    const rows = await db
      .select()
      .from(suppressionLists)
      .where(
        and(
          ...[
            // Filter to account's domains
            ...(query.domain
              ? [
                  eq(
                    suppressionLists.domainId,
                    accountDomains.find((d) => d.domain === query.domain)?.id ??
                      "",
                  ),
                ]
              : []),
            ...(query.reason
              ? [
                  eq(
                    suppressionLists.reason,
                    query.reason as
                      | "bounce"
                      | "complaint"
                      | "unsubscribe"
                      | "manual",
                  ),
                ]
              : []),
            ...(query.cursor
              ? [lt(suppressionLists.createdAt, new Date(query.cursor))]
              : []),
          ],
        ),
      )
      .orderBy(desc(suppressionLists.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const lastItem = page[page.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? lastItem.createdAt.toISOString()
        : null;

    const domainMap = new Map(accountDomains.map((d) => [d.id, d.domain]));

    return c.json({
      data: page.map((r) => ({
        id: r.id,
        email: r.email,
        domain: domainMap.get(r.domainId) ?? r.domainId,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// DELETE /v1/suppressions/:id — Remove from suppression list
suppressions.delete("/:id", requireScope("messages:send"), async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  const db = getDatabase();

  // Verify the suppression belongs to one of this account's domains
  const [record] = await db
    .select({
      id: suppressionLists.id,
      domainId: suppressionLists.domainId,
    })
    .from(suppressionLists)
    .where(eq(suppressionLists.id, id))
    .limit(1);

  if (!record) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: `Suppression ${id} not found`,
          code: "suppression_not_found",
        },
      },
      404,
    );
  }

  // Verify domain ownership
  const [domain] = await db
    .select({ id: domains.id })
    .from(domains)
    .where(
      and(eq(domains.id, record.domainId), eq(domains.accountId, auth.accountId)),
    )
    .limit(1);

  if (!domain) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: `Suppression ${id} not found`,
          code: "suppression_not_found",
        },
      },
      404,
    );
  }

  await db.delete(suppressionLists).where(eq(suppressionLists.id, id));
  return c.json({ deleted: true, id });
});

export { suppressions };
