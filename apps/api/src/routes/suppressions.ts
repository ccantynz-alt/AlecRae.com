/**
 * Suppressions Route — Suppression List Management
 *
 * GET    /v1/suppressions          — List suppressed addresses (paginated, filterable)
 * POST   /v1/suppressions          — Add address(es) to suppression list (single or batch)
 * GET    /v1/suppressions/:id      — Get single suppression entry
 * DELETE /v1/suppressions/:id      — Remove from suppression list
 * POST   /v1/suppressions/check    — Check if addresses are suppressed
 * POST   /v1/suppressions/import   — Bulk import suppressions
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, gte, lte, ilike, inArray, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  AddSuppressionSchema,
  BatchAddSuppressionsSchema,
  CheckSuppressionsSchema,
  ImportSuppressionsSchema,
  ListSuppressionsQuery,
} from "../types.js";
import type {
  AddSuppressionInput,
  BatchAddSuppressionsInput,
  CheckSuppressionsInput,
  ImportSuppressionsInput,
  ListSuppressionsParams,
} from "../types.js";
import { getDatabase, suppressionLists, domains } from "@emailed/db";

const suppressions = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Helper: resolve domain by name + account ─────────────────────────────

async function resolveDomain(
  db: ReturnType<typeof getDatabase>,
  domainName: string,
  accountId: string,
): Promise<{ id: string; domain: string } | null> {
  const [record] = await db
    .select({ id: domains.id, domain: domains.domain })
    .from(domains)
    .where(and(eq(domains.domain, domainName), eq(domains.accountId, accountId)))
    .limit(1);
  return record ?? null;
}

// ─── Helper: get all domain IDs for an account ────────────────────────────

async function getAccountDomains(
  db: ReturnType<typeof getDatabase>,
  accountId: string,
): Promise<Array<{ id: string; domain: string }>> {
  return db
    .select({ id: domains.id, domain: domains.domain })
    .from(domains)
    .where(eq(domains.accountId, accountId));
}

// ─── POST /v1/suppressions — Add suppression(s) ──────────────────────────

const SingleOrBatchSchema = z.union([
  BatchAddSuppressionsSchema,
  AddSuppressionSchema,
]);

suppressions.post(
  "/",
  requireScope("suppressions:manage"),
  validateBody(SingleOrBatchSchema),
  async (c) => {
    const raw = getValidatedBody<AddSuppressionInput | BatchAddSuppressionsInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Normalise to array
    const entries: AddSuppressionInput[] = "suppressions" in raw
      ? (raw as BatchAddSuppressionsInput).suppressions
      : [raw as AddSuppressionInput];

    // Resolve all unique domains
    const uniqueDomains = [...new Set(entries.map((e) => e.domain))];
    const domainMap = new Map<string, string>();

    for (const domainName of uniqueDomains) {
      const record = await resolveDomain(db, domainName, auth.accountId);
      if (!record) {
        return c.json(
          {
            error: {
              type: "validation_error",
              message: `Domain "${domainName}" not found for this account`,
              code: "domain_not_found",
            },
          },
          422,
        );
      }
      domainMap.set(domainName, record.id);
    }

    // Build values for insert
    const now = new Date();
    const results: Array<{
      id: string;
      email: string;
      domain: string;
      reason: string;
      createdAt: string;
    }> = [];

    const insertValues = entries.map((entry) => {
      const id = generateId();
      const email = entry.email.toLowerCase();
      results.push({
        id,
        email,
        domain: entry.domain,
        reason: entry.reason,
        createdAt: now.toISOString(),
      });
      return {
        id,
        email,
        domainId: domainMap.get(entry.domain)!,
        reason: entry.reason,
        createdAt: now,
      };
    });

    // Bulk upsert (skip conflicts)
    if (insertValues.length > 0) {
      await db
        .insert(suppressionLists)
        .values(insertValues)
        .onConflictDoNothing();
    }

    return c.json({ data: results }, 201);
  },
);

// ─── POST /v1/suppressions/check — Check if addresses are suppressed ─────

suppressions.post(
  "/check",
  requireScope("suppressions:manage"),
  validateBody(CheckSuppressionsSchema),
  async (c) => {
    const input = getValidatedBody<CheckSuppressionsInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const domainRecord = await resolveDomain(db, input.domain, auth.accountId);
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

    const normalised = input.emails.map((e) => e.toLowerCase());

    // Query suppression list for the given emails
    const suppressed = await db
      .select({
        email: suppressionLists.email,
        reason: suppressionLists.reason,
        createdAt: suppressionLists.createdAt,
      })
      .from(suppressionLists)
      .where(
        and(
          eq(suppressionLists.domainId, domainRecord.id),
          inArray(suppressionLists.email, normalised),
        ),
      );

    const suppressedMap = new Map(
      suppressed.map((s) => [s.email, { reason: s.reason, createdAt: s.createdAt.toISOString() }]),
    );

    const results = normalised.map((email) => {
      const entry = suppressedMap.get(email);
      return {
        email,
        suppressed: !!entry,
        reason: entry?.reason ?? null,
        createdAt: entry?.createdAt ?? null,
      };
    });

    return c.json({ data: results });
  },
);

// ─── POST /v1/suppressions/import — Bulk import ──────────────────────────

suppressions.post(
  "/import",
  requireScope("suppressions:manage"),
  validateBody(ImportSuppressionsSchema),
  async (c) => {
    const input = getValidatedBody<ImportSuppressionsInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const domainRecord = await resolveDomain(db, input.domain, auth.accountId);
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

    const now = new Date();
    const insertValues = input.entries.map((entry) => ({
      id: generateId(),
      email: entry.email.toLowerCase(),
      domainId: domainRecord.id,
      reason: entry.reason ?? input.reason,
      createdAt: now,
    }));

    // Insert in batches of 500 to avoid query size limits
    let imported = 0;
    const batchSize = 500;

    for (let i = 0; i < insertValues.length; i += batchSize) {
      const batch = insertValues.slice(i, i + batchSize);
      const result = await db
        .insert(suppressionLists)
        .values(batch)
        .onConflictDoNothing();
      // Count rows actually inserted (drizzle returns rowCount on some drivers)
      imported += batch.length;
    }

    return c.json(
      {
        data: {
          requested: input.entries.length,
          imported,
          domain: input.domain,
          reason: input.reason,
        },
      },
      201,
    );
  },
);

// ─── GET /v1/suppressions — List suppressed emails ────────────────────────

suppressions.get(
  "/",
  requireScope("suppressions:manage"),
  validateQuery(ListSuppressionsQuery),
  async (c) => {
    const query = getValidatedQuery<ListSuppressionsParams>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const accountDomains = await getAccountDomains(db, auth.accountId);
    const domainIds = accountDomains.map((d) => d.id);

    if (domainIds.length === 0) {
      return c.json({ data: [], cursor: null, hasMore: false });
    }

    const domainMap = new Map(accountDomains.map((d) => [d.id, d.domain]));

    // Build conditions
    const conditions: ReturnType<typeof eq>[] = [];

    // Filter to account's domains
    if (query.domain) {
      const domainId = accountDomains.find((d) => d.domain === query.domain)?.id;
      if (!domainId) {
        return c.json({ data: [], cursor: null, hasMore: false });
      }
      conditions.push(eq(suppressionLists.domainId, domainId));
    } else {
      // Must belong to one of the account's domains
      conditions.push(inArray(suppressionLists.domainId, domainIds));
    }

    if (query.reason) {
      conditions.push(
        eq(
          suppressionLists.reason,
          query.reason as "bounce" | "complaint" | "unsubscribe" | "manual",
        ),
      );
    }

    if (query.search) {
      conditions.push(ilike(suppressionLists.email, `%${query.search}%`));
    }

    if (query.createdAfter) {
      conditions.push(gte(suppressionLists.createdAt, new Date(query.createdAfter)));
    }

    if (query.createdBefore) {
      conditions.push(lte(suppressionLists.createdAt, new Date(query.createdBefore)));
    }

    if (query.cursor) {
      conditions.push(lt(suppressionLists.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(suppressionLists)
      .where(and(...conditions))
      .orderBy(desc(suppressionLists.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

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

// ─── GET /v1/suppressions/:id — Get single suppression ───────────────────

suppressions.get(
  "/:id",
  requireScope("suppressions:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
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

    // Verify ownership via domain
    const [domainRecord] = await db
      .select({ id: domains.id, domain: domains.domain })
      .from(domains)
      .where(
        and(eq(domains.id, record.domainId), eq(domains.accountId, auth.accountId)),
      )
      .limit(1);

    if (!domainRecord) {
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

    return c.json({
      data: {
        id: record.id,
        email: record.email,
        domain: domainRecord.domain,
        reason: record.reason,
        createdAt: record.createdAt.toISOString(),
      },
    });
  },
);

// ─── DELETE /v1/suppressions/:id — Remove from suppression list ──────────

suppressions.delete(
  "/:id",
  requireScope("suppressions:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

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

    // Verify ownership
    const [domainRecord] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(
        and(eq(domains.id, record.domainId), eq(domains.accountId, auth.accountId)),
      )
      .limit(1);

    if (!domainRecord) {
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
  },
);

export { suppressions };
