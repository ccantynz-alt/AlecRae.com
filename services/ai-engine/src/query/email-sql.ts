/**
 * Email-as-Database — SQL-over-Inbox Query Engine (B2)
 *
 * Translates natural language or SQL-like syntax into safe Drizzle queries
 * against the emails table. Uses Claude Haiku for NL-to-structured-query
 * translation. NEVER executes raw user SQL -- all queries pass through the
 * AI translation layer that produces a safe, validated intermediate
 * representation which is then mapped to Drizzle ORM calls.
 *
 * Supported operations:
 *   SELECT fields FROM emails WHERE ... ORDER BY ... LIMIT ... OFFSET ...
 *   COUNT / AVG / SUM aggregations
 *   GROUP BY (sender domain, label, date bucket)
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ─── Types ─────────────────────────────────────────────────────────────────

/** Queryable fields exposed to users. */
export const QUERYABLE_FIELDS = [
  "from",
  "to",
  "subject",
  "date",
  "hasAttachment",
  "labels",
  "isRead",
  "size",
  "threadLength",
  "status",
  "domain",
] as const;

export type QueryableField = (typeof QUERYABLE_FIELDS)[number];

export const SORTABLE_FIELDS = ["date", "size", "threadLength"] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

export type SortDirection = "asc" | "desc";

export type ComparisonOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "notLike"
  | "in"
  | "notIn"
  | "isNull"
  | "isNotNull";

export type LogicalOperator = "and" | "or" | "not";

export type AggregationFunction = "count" | "avg" | "sum";

export type GroupByBucket = "senderDomain" | "label" | "day" | "week" | "month" | "year";

/** Validated intermediate representation of a parsed query. */
export interface ParsedEmailQuery {
  readonly type: "select" | "aggregate";
  readonly fields: readonly QueryableField[];
  readonly conditions: readonly QueryCondition[];
  readonly logicalOperator: LogicalOperator;
  readonly orderBy: readonly OrderByClause[];
  readonly limit: number;
  readonly offset: number;
  /** Only for type === "aggregate" */
  readonly aggregation?: AggregationClause;
  readonly groupBy?: GroupByBucket;
}

export interface QueryCondition {
  readonly field: QueryableField;
  readonly operator: ComparisonOperator;
  readonly value: string | number | boolean | readonly string[] | null;
}

export interface OrderByClause {
  readonly field: SortableField;
  readonly direction: SortDirection;
}

export interface AggregationClause {
  readonly function: AggregationFunction;
  readonly field: QueryableField | "*";
}

export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
  readonly executionTimeMs: number;
  readonly query: ParsedEmailQuery;
}

export interface QueryExplanation {
  readonly description: string;
  readonly parsedQuery: ParsedEmailQuery;
  readonly estimatedScope: string;
  readonly warnings: readonly string[];
}

// ─── Zod validation for the parsed query structure ────────────────────────

const QueryConditionSchema = z.object({
  field: z.enum(QUERYABLE_FIELDS),
  operator: z.enum([
    "eq", "neq", "gt", "gte", "lt", "lte",
    "like", "notLike", "in", "notIn", "isNull", "isNotNull",
  ] as const),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.null(),
  ]),
});

const OrderBySchema = z.object({
  field: z.enum(SORTABLE_FIELDS),
  direction: z.enum(["asc", "desc"]),
});

const AggregationSchema = z.object({
  function: z.enum(["count", "avg", "sum"]),
  field: z.union([z.enum(QUERYABLE_FIELDS), z.literal("*")]),
});

export const ParsedEmailQuerySchema = z.object({
  type: z.enum(["select", "aggregate"]),
  fields: z.array(z.enum(QUERYABLE_FIELDS)).min(1),
  conditions: z.array(QueryConditionSchema).default([]),
  logicalOperator: z.enum(["and", "or", "not"]).default("and"),
  orderBy: z.array(OrderBySchema).default([]),
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  aggregation: AggregationSchema.optional(),
  groupBy: z.enum(["senderDomain", "label", "day", "week", "month", "year"]).optional(),
});

// ─── Configuration ─────────────────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-4-5";
const MAX_QUERY_LIMIT = 1000;
const DEFAULT_LIMIT = 50;

// ─── Singleton Anthropic client ────────────────────────────────────────────

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — email query engine is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── System prompt for AI translation ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a query translator for an email database. You translate natural language or SQL-like queries into a structured JSON format.

The email database has these queryable fields:
- from: sender email address (string)
- to: recipient email address (string)
- subject: email subject line (string)
- date: email date (ISO 8601 string, use for comparisons)
- hasAttachment: whether email has attachments (boolean)
- labels: email labels/tags (string array)
- isRead: whether email has been read (boolean)
- size: email size in bytes (number)
- threadLength: number of emails in the thread (number)
- status: email status — one of: queued, processing, sent, delivered, bounced, deferred, dropped, failed, complained
- domain: sender domain extracted from the from field (string)

Supported comparison operators:
- eq (equals), neq (not equals)
- gt (greater than), gte (greater than or equal)
- lt (less than), lte (less than or equal)
- like (pattern match with %), notLike
- in (value in list), notIn
- isNull, isNotNull

Supported aggregations: count, avg, sum
Supported groupBy: senderDomain, label, day, week, month, year
Supported orderBy fields: date, size, threadLength
Supported orderBy directions: asc, desc

Output ONLY valid JSON matching this TypeScript interface:
{
  type: "select" | "aggregate",
  fields: string[],           // from the queryable fields list
  conditions: Array<{
    field: string,
    operator: string,
    value: string | number | boolean | string[] | null
  }>,
  logicalOperator: "and" | "or" | "not",
  orderBy: Array<{ field: string, direction: "asc" | "desc" }>,
  limit: number,              // 1-1000, default 50
  offset: number,             // default 0
  aggregation?: { function: "count" | "avg" | "sum", field: string },
  groupBy?: "senderDomain" | "label" | "day" | "week" | "month" | "year"
}

Rules:
- For "select" queries, fields should list the columns to return
- For "aggregate" queries, include the aggregation object
- When groupBy is used, the type must be "aggregate"
- Date comparisons use ISO 8601 format (e.g. "2024-01-01T00:00:00Z")
- For relative dates like "this month", "last week", "today", calculate from the current date provided
- The "like" operator uses % as wildcard (e.g. "%@stripe.com" for domain match)
- Default to ordering by date descending unless specified otherwise
- Default limit is 50 unless specified
- Output ONLY the JSON object, no markdown, no explanation`;

// ─── Core translation function ─────────────────────────────────────────────

/**
 * Translate a natural language or SQL-like query string into a validated
 * ParsedEmailQuery. The AI never sees actual user data — only the query
 * structure is generated.
 */
export async function translateQuery(
  queryText: string,
  options?: {
    currentDate?: string;
    maxLimit?: number;
  },
): Promise<ParsedEmailQuery> {
  const currentDate = options?.currentDate ?? new Date().toISOString();
  const maxLimit = options?.maxLimit ?? MAX_QUERY_LIMIT;

  const client = getClient();

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Current date: ${currentDate}\n\nTranslate this query:\n${queryText}`,
      },
    ],
  });

  // Extract text content from response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI returned no text response for query translation");
  }

  const rawText = textBlock.text.trim();

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Parse and validate
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `AI returned invalid JSON for query translation: ${jsonText.slice(0, 200)}`,
    );
  }

  const validated = ParsedEmailQuerySchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `AI returned invalid query structure: ${validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }

  // Enforce max limit
  const result = validated.data;
  return {
    ...result,
    limit: Math.min(result.limit, maxLimit),
  } as ParsedEmailQuery;
}

/**
 * Explain what a query would do without executing it.
 */
export async function explainQuery(
  queryText: string,
  options?: {
    currentDate?: string;
  },
): Promise<QueryExplanation> {
  const parsedQuery = await translateQuery(queryText, options);
  const warnings: string[] = [];

  if (parsedQuery.limit > 500) {
    warnings.push("Large result set requested — query may be slow");
  }

  if (parsedQuery.conditions.length === 0) {
    warnings.push("No conditions specified — this will scan all emails");
  }

  // Build human-readable description
  const description = buildDescription(parsedQuery);
  const estimatedScope = buildScopeEstimate(parsedQuery);

  return {
    description,
    parsedQuery,
    estimatedScope,
    warnings,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildDescription(query: ParsedEmailQuery): string {
  const parts: string[] = [];

  if (query.type === "aggregate" && query.aggregation) {
    parts.push(
      `${query.aggregation.function.toUpperCase()}(${query.aggregation.field})`,
    );
  } else {
    parts.push(`SELECT ${query.fields.join(", ")}`);
  }

  parts.push("FROM emails");

  if (query.conditions.length > 0) {
    const condDescriptions = query.conditions.map((c) => {
      const val = Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value);
      return `${c.field} ${c.operator} ${val}`;
    });
    parts.push(
      `WHERE ${condDescriptions.join(` ${query.logicalOperator.toUpperCase()} `)}`,
    );
  }

  if (query.groupBy) {
    parts.push(`GROUP BY ${query.groupBy}`);
  }

  if (query.orderBy.length > 0) {
    const orderParts = query.orderBy.map(
      (o) => `${o.field} ${o.direction.toUpperCase()}`,
    );
    parts.push(`ORDER BY ${orderParts.join(", ")}`);
  }

  parts.push(`LIMIT ${query.limit}`);
  if (query.offset > 0) {
    parts.push(`OFFSET ${query.offset}`);
  }

  return parts.join(" ");
}

function buildScopeEstimate(query: ParsedEmailQuery): string {
  if (query.conditions.length === 0) {
    return "All emails in your account";
  }

  const scopes: string[] = [];

  for (const cond of query.conditions) {
    switch (cond.field) {
      case "from":
        scopes.push(`from ${String(cond.value)}`);
        break;
      case "to":
        scopes.push(`to ${String(cond.value)}`);
        break;
      case "date":
        scopes.push(`date ${cond.operator} ${String(cond.value)}`);
        break;
      case "hasAttachment":
        scopes.push(cond.value ? "with attachments" : "without attachments");
        break;
      case "isRead":
        scopes.push(cond.value ? "read emails" : "unread emails");
        break;
      case "labels":
        scopes.push(`labeled ${String(cond.value)}`);
        break;
      case "domain":
        scopes.push(`from domain ${String(cond.value)}`);
        break;
      default:
        scopes.push(`${cond.field} ${cond.operator} ${String(cond.value)}`);
    }
  }

  return `Emails matching: ${scopes.join(` ${query.logicalOperator} `)}`;
}

/**
 * Generate CSV string from query results.
 */
export function resultsToCsv(result: QueryResult): string {
  if (result.rows.length === 0) return "";

  const headers = result.columns;
  const lines: string[] = [headers.join(",")];

  for (const row of result.rows) {
    const values = headers.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape CSV values
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

/**
 * Map a ParsedEmailQuery field to the actual Drizzle column reference name.
 * This is used by the API route to build the real query.
 */
export function fieldToColumnName(field: QueryableField): string {
  const mapping: Record<QueryableField, string> = {
    from: "fromAddress",
    to: "toAddresses",
    subject: "subject",
    date: "createdAt",
    hasAttachment: "_computed",
    labels: "tags",
    isRead: "_computed",
    size: "_computed",
    threadLength: "_computed",
    status: "status",
    domain: "_computed",
  };
  return mapping[field];
}

// ─── Exports ───────────────────────────────────────────────────────────────

export {
  SYSTEM_PROMPT as _systemPromptForTesting,
};
