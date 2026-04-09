/**
 * Email-as-Database Route (B2) — SQL over Inbox
 *
 * Lets users treat their inbox as a queryable dataset using natural language
 * or SQL-like syntax. All queries are translated through the AI engine --
 * NO raw SQL from user input ever reaches the database.
 *
 * POST   /v1/query          — Execute a query
 * POST   /v1/query/explain   — Explain what a query would do without executing
 * GET    /v1/query/history   — Recent query history
 * GET    /v1/query/saved     — Saved/bookmarked queries
 * POST   /v1/query/save      — Save a query
 * DELETE /v1/query/saved/:id — Delete a saved query
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, like, notLike, gt, gte, lt, lte, ne, inArray, notInArray, isNull, isNotNull, asc, count as drizzleCount, avg as drizzleAvg, sum as drizzleSum } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  validateParams,
  getValidatedBody,
  getValidatedQuery,
  getValidatedParams,
} from "../middleware/validator.js";
import {
  getDatabase,
  emails,
  attachments,
  savedQueries,
  queryHistory,
} from "@emailed/db";
import {
  translateQuery,
  explainQuery,
  resultsToCsv,
  type ParsedEmailQuery,
  type QueryResult,
  type QueryCondition,
  type QueryableField,
} from "@emailed/ai-engine/query/email-sql";

// ─── Zod Schemas ──────────────────────────────────────────────────────────

const ExecuteQuerySchema = z.object({
  /** The query string (natural language or SQL-like). */
  query: z.string().min(1).max(2000),
  /** Whether the input is natural language or SQL-like. */
  queryType: z.enum(["natural", "sql"]).default("natural"),
  /** Maximum results to return. */
  limit: z.number().int().min(1).max(1000).optional(),
  /** Pagination offset. */
  offset: z.number().int().min(0).optional(),
  /** Export format (json or csv). */
  format: z.enum(["json", "csv"]).default("json"),
});

type ExecuteQueryInput = z.infer<typeof ExecuteQuerySchema>;

const ExplainQuerySchema = z.object({
  /** The query string to explain. */
  query: z.string().min(1).max(2000),
  /** Whether the input is natural language or SQL-like. */
  queryType: z.enum(["natural", "sql"]).default("natural"),
});

type ExplainQueryInput = z.infer<typeof ExplainQuerySchema>;

const SaveQuerySchema = z.object({
  /** User-given name for this saved query. */
  name: z.string().min(1).max(200),
  /** The query text. */
  queryText: z.string().min(1).max(2000),
  /** Whether it's natural language or SQL-like. */
  queryType: z.enum(["natural", "sql"]).default("natural"),
});

type SaveQueryInput = z.infer<typeof SaveQuerySchema>;

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

const SavedQueryParamsSchema = z.object({
  id: z.string().min(1),
});

type SavedQueryParams = z.infer<typeof SavedQueryParamsSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a Drizzle WHERE clause from parsed conditions.
 * SECURITY: All conditions are scoped to the user's accountId.
 */
function buildWhereClause(
  accountId: string,
  conditions: readonly QueryCondition[],
  logicalOp: "and" | "or" | "not",
): ReturnType<typeof and> {
  const accountScope = eq(emails.accountId, accountId);

  if (conditions.length === 0) {
    return accountScope;
  }

  const drizzleConditions = conditions.map((cond) => {
    const column = getColumn(cond.field);
    if (!column) return undefined;

    switch (cond.operator) {
      case "eq":
        return eq(column, cond.value as string);
      case "neq":
        return ne(column, cond.value as string);
      case "gt":
        return gt(column, cond.value as string);
      case "gte":
        return gte(column, cond.value as string);
      case "lt":
        return lt(column, cond.value as string);
      case "lte":
        return lte(column, cond.value as string);
      case "like":
        return like(column, cond.value as string);
      case "notLike":
        return notLike(column, cond.value as string);
      case "in":
        return inArray(column, cond.value as string[]);
      case "notIn":
        return notInArray(column, cond.value as string[]);
      case "isNull":
        return isNull(column);
      case "isNotNull":
        return isNotNull(column);
      default:
        return undefined;
    }
  }).filter((c): c is NonNullable<typeof c> => c !== undefined);

  // Always scope to accountId
  return and(accountScope, ...drizzleConditions);
}

/**
 * Map a QueryableField to the Drizzle column reference.
 * Computed fields get special treatment.
 */
function getColumn(field: QueryableField): ReturnType<typeof sql> | typeof emails.fromAddress | typeof emails.subject | typeof emails.createdAt | typeof emails.status | typeof emails.tags | undefined {
  switch (field) {
    case "from":
      return emails.fromAddress;
    case "to":
      // toAddresses is jsonb -- we use sql for querying inside it
      return sql`${emails.toAddresses}::text`;
    case "subject":
      return emails.subject;
    case "date":
      return emails.createdAt;
    case "status":
      return emails.status;
    case "labels":
      return sql`${emails.tags}::text`;
    case "domain":
      // Extract domain from fromAddress
      return sql`split_part(${emails.fromAddress}, '@', 2)`;
    case "hasAttachment":
      // Boolean condition -- handled specially in conditions
      return sql`(SELECT count(*) FROM attachments WHERE attachments.email_id = emails.id) > 0`;
    case "isRead":
      // Approximation using status — "delivered" or "sent" are considered "read"
      return emails.status;
    case "size":
      return sql`length(coalesce(${emails.textBody}, '')) + length(coalesce(${emails.htmlBody}, ''))`;
    case "threadLength":
      return sql`(SELECT count(*) FROM emails e2 WHERE e2.message_id = ${emails.messageId})`;
    default:
      return undefined;
  }
}

/**
 * Build select columns for a query.
 */
function buildSelectColumns(fields: readonly QueryableField[]): Record<string, ReturnType<typeof sql> | typeof emails.fromAddress | typeof emails.subject | typeof emails.createdAt | typeof emails.status | typeof emails.tags | typeof emails.id> {
  const columns: Record<string, unknown> = {
    id: emails.id,
  };

  for (const field of fields) {
    switch (field) {
      case "from":
        columns["from"] = emails.fromAddress;
        break;
      case "to":
        columns["to"] = emails.toAddresses;
        break;
      case "subject":
        columns["subject"] = emails.subject;
        break;
      case "date":
        columns["date"] = emails.createdAt;
        break;
      case "status":
        columns["status"] = emails.status;
        break;
      case "labels":
        columns["labels"] = emails.tags;
        break;
      case "domain":
        columns["domain"] = sql<string>`split_part(${emails.fromAddress}, '@', 2)`;
        break;
      case "hasAttachment":
        columns["hasAttachment"] = sql<boolean>`EXISTS(SELECT 1 FROM attachments WHERE attachments.email_id = emails.id)`;
        break;
      case "isRead":
        columns["isRead"] = sql<boolean>`${emails.status} IN ('delivered', 'sent')`;
        break;
      case "size":
        columns["size"] = sql<number>`length(coalesce(${emails.textBody}, '')) + length(coalesce(${emails.htmlBody}, ''))`;
        break;
      case "threadLength":
        columns["threadLength"] = sql<number>`(SELECT count(*) FROM emails e2 WHERE e2.in_reply_to = ${emails.messageId} OR e2.id = ${emails.id})`;
        break;
    }
  }

  return columns as Record<string, typeof emails.id>;
}

/**
 * Build ORDER BY from parsed orderBy clauses.
 */
function buildOrderBy(orderByArr: ParsedEmailQuery["orderBy"]): Array<ReturnType<typeof asc>> {
  return orderByArr.map((o) => {
    const dirFn = o.direction === "asc" ? asc : desc;

    switch (o.field) {
      case "date":
        return dirFn(emails.createdAt);
      case "size":
        return dirFn(sql`length(coalesce(${emails.textBody}, '')) + length(coalesce(${emails.htmlBody}, ''))`);
      case "threadLength":
        return dirFn(sql`(SELECT count(*) FROM emails e2 WHERE e2.in_reply_to = ${emails.messageId} OR e2.id = ${emails.id})`);
      default:
        return dirFn(emails.createdAt);
    }
  });
}

// ─── Route ────────────────────────────────────────────────────────────────

const emailQuery = new Hono();

// ─── POST /v1/query — Execute a query ─────────────────────────────────────

emailQuery.post(
  "/",
  requireScope("messages:read"),
  validateBody(ExecuteQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<ExecuteQueryInput>(c);
    const startMs = Date.now();

    let parsedQuery: ParsedEmailQuery;
    try {
      parsedQuery = await translateQuery(body.query, {
        maxLimit: body.limit ?? undefined,
      });
    } catch (err) {
      return c.json(
        {
          error: {
            type: "query_error",
            message: err instanceof Error ? err.message : "Failed to parse query",
            code: "query_parse_failed",
          },
        },
        422,
      );
    }

    // Override limit/offset from body if provided
    if (body.limit !== undefined) {
      parsedQuery = { ...parsedQuery, limit: body.limit };
    }
    if (body.offset !== undefined) {
      parsedQuery = { ...parsedQuery, offset: body.offset };
    }

    const db = getDatabase();

    try {
      let result: QueryResult;

      if (parsedQuery.type === "aggregate" && parsedQuery.aggregation) {
        // Aggregation query
        const whereClause = buildWhereClause(
          auth.accountId,
          parsedQuery.conditions,
          parsedQuery.logicalOperator,
        );

        let aggFn: ReturnType<typeof drizzleCount>;
        switch (parsedQuery.aggregation.function) {
          case "count":
            aggFn = drizzleCount();
            break;
          case "avg":
            aggFn = drizzleAvg(sql`length(coalesce(${emails.textBody}, '')) + length(coalesce(${emails.htmlBody}, ''))`) as unknown as ReturnType<typeof drizzleCount>;
            break;
          case "sum":
            aggFn = drizzleSum(sql`length(coalesce(${emails.textBody}, '')) + length(coalesce(${emails.htmlBody}, ''))`) as unknown as ReturnType<typeof drizzleCount>;
            break;
        }

        if (parsedQuery.groupBy) {
          let groupCol: ReturnType<typeof sql>;
          let groupLabel: string;

          switch (parsedQuery.groupBy) {
            case "senderDomain":
              groupCol = sql<string>`split_part(${emails.fromAddress}, '@', 2)`;
              groupLabel = "domain";
              break;
            case "label":
              groupCol = sql<string>`unnest(${emails.tags}::text[])`;
              groupLabel = "label";
              break;
            case "day":
              groupCol = sql<string>`to_char(${emails.createdAt}, 'YYYY-MM-DD')`;
              groupLabel = "day";
              break;
            case "week":
              groupCol = sql<string>`to_char(date_trunc('week', ${emails.createdAt}), 'YYYY-MM-DD')`;
              groupLabel = "week";
              break;
            case "month":
              groupCol = sql<string>`to_char(${emails.createdAt}, 'YYYY-MM')`;
              groupLabel = "month";
              break;
            case "year":
              groupCol = sql<string>`to_char(${emails.createdAt}, 'YYYY')`;
              groupLabel = "year";
              break;
          }

          const rows = await db
            .select({
              group: groupCol,
              value: aggFn,
            })
            .from(emails)
            .where(whereClause)
            .groupBy(groupCol)
            .orderBy(desc(aggFn))
            .limit(parsedQuery.limit);

          result = {
            columns: [groupLabel, parsedQuery.aggregation.function],
            rows: rows.map((r) => ({
              [groupLabel]: r.group,
              [parsedQuery.aggregation!.function]: Number(r.value),
            })),
            rowCount: rows.length,
            executionTimeMs: Date.now() - startMs,
            query: parsedQuery,
          };
        } else {
          const [row] = await db
            .select({ value: aggFn })
            .from(emails)
            .where(whereClause);

          result = {
            columns: [parsedQuery.aggregation.function],
            rows: [{ [parsedQuery.aggregation.function]: Number(row?.value ?? 0) }],
            rowCount: 1,
            executionTimeMs: Date.now() - startMs,
            query: parsedQuery,
          };
        }
      } else {
        // SELECT query
        const selectColumns = buildSelectColumns(parsedQuery.fields);
        const whereClause = buildWhereClause(
          auth.accountId,
          parsedQuery.conditions,
          parsedQuery.logicalOperator,
        );
        const orderBy = buildOrderBy(parsedQuery.orderBy);

        const rows = await db
          .select(selectColumns)
          .from(emails)
          .where(whereClause)
          .orderBy(...orderBy)
          .limit(parsedQuery.limit)
          .offset(parsedQuery.offset);

        result = {
          columns: ["id", ...parsedQuery.fields],
          rows: rows as unknown as Record<string, unknown>[],
          rowCount: rows.length,
          executionTimeMs: Date.now() - startMs,
          query: parsedQuery,
        };
      }

      // Record in query history
      await db.insert(queryHistory).values({
        id: generateId("qh"),
        accountId: auth.accountId,
        queryText: body.query,
        queryType: body.queryType,
        parsedQuery: parsedQuery as unknown as Record<string, unknown>,
        resultCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
      }).catch(() => {
        // Non-critical — don't fail the query if history insert fails
      });

      // Return CSV if requested
      if (body.format === "csv") {
        const csv = resultsToCsv(result);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="query-results.csv"',
          },
        });
      }

      return c.json({
        data: {
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
          query: {
            original: body.query,
            parsed: parsedQuery,
          },
        },
      });
    } catch (err) {
      return c.json(
        {
          error: {
            type: "query_error",
            message: err instanceof Error ? err.message : "Query execution failed",
            code: "query_execution_failed",
          },
        },
        500,
      );
    }
  },
);

// ─── POST /v1/query/explain — Explain a query ────────────────────────────

emailQuery.post(
  "/explain",
  requireScope("messages:read"),
  validateBody(ExplainQuerySchema),
  async (c) => {
    const body = getValidatedBody<ExplainQueryInput>(c);

    try {
      const explanation = await explainQuery(body.query);

      return c.json({
        data: {
          description: explanation.description,
          parsedQuery: explanation.parsedQuery,
          estimatedScope: explanation.estimatedScope,
          warnings: explanation.warnings,
        },
      });
    } catch (err) {
      return c.json(
        {
          error: {
            type: "query_error",
            message: err instanceof Error ? err.message : "Failed to explain query",
            code: "query_explain_failed",
          },
        },
        422,
      );
    }
  },
);

// ─── GET /v1/query/history — Recent query history ─────────────────────────

emailQuery.get(
  "/history",
  requireScope("messages:read"),
  validateQuery(HistoryQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const query = getValidatedQuery<HistoryQuery>(c);
    const db = getDatabase();

    const rows = await db
      .select()
      .from(queryHistory)
      .where(eq(queryHistory.accountId, auth.accountId))
      .orderBy(desc(queryHistory.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return c.json({
      data: {
        entries: rows.map((row) => ({
          id: row.id,
          queryText: row.queryText,
          queryType: row.queryType,
          resultCount: row.resultCount,
          executionTimeMs: row.executionTimeMs,
          createdAt: row.createdAt.toISOString(),
        })),
        total: rows.length,
      },
    });
  },
);

// ─── GET /v1/query/saved — Saved queries ─────────────────────────────────

emailQuery.get(
  "/saved",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(savedQueries)
      .where(eq(savedQueries.accountId, auth.accountId))
      .orderBy(desc(savedQueries.updatedAt));

    return c.json({
      data: {
        queries: rows.map((row) => ({
          id: row.id,
          name: row.name,
          queryText: row.queryText,
          queryType: row.queryType,
          lastRunAt: row.lastRunAt?.toISOString() ?? null,
          runCount: row.runCount,
          createdAt: row.createdAt.toISOString(),
        })),
        total: rows.length,
      },
    });
  },
);

// ─── POST /v1/query/save — Save a query ──────────────────────────────────

emailQuery.post(
  "/save",
  requireScope("messages:read"),
  validateBody(SaveQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<SaveQueryInput>(c);
    const db = getDatabase();

    // Translate the query to validate it and cache the parsed form
    let parsedQuery: ParsedEmailQuery | null = null;
    try {
      parsedQuery = await translateQuery(body.queryText);
    } catch {
      // Not critical — save the query even if it can't be parsed now
    }

    const id = generateId("sq");

    await db.insert(savedQueries).values({
      id,
      accountId: auth.accountId,
      name: body.name,
      queryText: body.queryText,
      queryType: body.queryType,
      parsedQuery: parsedQuery as unknown as Record<string, unknown>,
    });

    return c.json(
      {
        data: {
          id,
          name: body.name,
          queryText: body.queryText,
          queryType: body.queryType,
          createdAt: new Date().toISOString(),
        },
      },
      201,
    );
  },
);

// ─── DELETE /v1/query/saved/:id — Delete a saved query ───────────────────

emailQuery.delete(
  "/saved/:id",
  requireScope("messages:read"),
  validateParams(SavedQueryParamsSchema),
  async (c) => {
    const auth = c.get("auth");
    const params = getValidatedParams<SavedQueryParams>(c);
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(savedQueries)
      .where(
        and(
          eq(savedQueries.id, params.id),
          eq(savedQueries.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Saved query not found",
            code: "query_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(savedQueries)
      .where(eq(savedQueries.id, params.id));

    return c.json({ data: { deleted: true, id: params.id } });
  },
);

export { emailQuery };
