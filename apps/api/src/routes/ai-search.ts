/**
 * AI Search Route — Natural Language Email Search
 *
 * "Find that PDF Sarah sent about the Q3 budget last month"
 * → Parses intent → Constructs query → Returns results
 *
 * POST /v1/search/ai     — Natural language search
 * POST /v1/search/smart  — Smart filters (date ranges, has:attachment, etc.)
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { searchEmails } from "@emailed/shared";

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

// ─── Schemas ─────────────────────────────────────────────────────────────────

const AISearchSchema = z.object({
  query: z.string().min(1).max(500),
  accountId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const SmartFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  hasAttachment: z.boolean().optional(),
  attachmentType: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  isUnread: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  label: z.string().optional(),
  folder: z.string().optional(),
  minSize: z.number().optional(),
  text: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ─── AI Query Parser ─────────────────────────────────────────────────────────

interface ParsedQuery {
  keywords: string[];
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  attachmentType?: string;
  dateFrom?: string;
  dateTo?: string;
  isUnread?: boolean;
  isStarred?: boolean;
  folder?: string;
}

async function parseNaturalLanguageQuery(query: string): Promise<ParsedQuery> {
  if (!ANTHROPIC_API_KEY) {
    return { keywords: query.split(/\s+/) };
  }

  const prompt = `Parse this email search query into structured filters. Return ONLY valid JSON.

Query: "${query}"

Return JSON with these optional fields:
{
  "keywords": ["search", "terms"],
  "from": "sender email or name",
  "to": "recipient email or name",
  "subject": "subject text",
  "hasAttachment": true/false,
  "attachmentType": "pdf/doc/image/spreadsheet",
  "dateFrom": "YYYY-MM-DD",
  "dateTo": "YYYY-MM-DD",
  "isUnread": true/false,
  "isStarred": true/false,
  "folder": "inbox/sent/trash/drafts"
}

For relative dates: "last week" = 7 days ago, "last month" = 30 days ago, "yesterday" = 1 day ago. Today is ${new Date().toISOString().split("T")[0]}.
Only include fields that are mentioned or implied in the query. Return ONLY the JSON object.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return { keywords: query.split(/\s+/) };

    const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { keywords: query.split(/\s+/) };

    return JSON.parse(jsonMatch[0]) as ParsedQuery;
  } catch {
    return { keywords: query.split(/\s+/) };
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const aiSearch = new Hono();

// POST /v1/search/ai — Natural language search
aiSearch.post(
  "/ai",
  requireScope("messages:read"),
  validateBody(AISearchSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AISearchSchema>>(c);
    const auth = c.get("auth");

    const parsed = await parseNaturalLanguageQuery(input.query);

    // Build Meilisearch query from parsed intent
    const searchTerms = [
      ...(parsed.keywords ?? []),
      parsed.from ? `from:${parsed.from}` : "",
      parsed.subject ?? "",
    ].filter(Boolean).join(" ");

    try {
      const results = await searchEmails(auth.accountId, searchTerms, {
        limit: input.limit,
      });

      return c.json({
        data: {
          query: input.query,
          parsedFilters: parsed,
          results: results.hits.map((hit) => ({
            id: hit.id,
            subject: hit.subject,
            from: { email: hit.fromAddress, name: hit.fromName },
            snippet: hit.snippet,
            date: new Date((hit.createdAt as number) * 1000).toISOString(),
          })),
          totalHits: results.totalHits,
          processingTimeMs: results.processingTimeMs,
        },
      });
    } catch {
      return c.json({
        data: {
          query: input.query,
          parsedFilters: parsed,
          results: [],
          totalHits: 0,
          processingTimeMs: 0,
          message: "Search service unavailable. Try again later.",
        },
      });
    }
  },
);

// POST /v1/search/smart — Structured smart filters
aiSearch.post(
  "/smart",
  requireScope("messages:read"),
  validateBody(SmartFilterSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SmartFilterSchema>>(c);
    const auth = c.get("auth");

    const searchParts: string[] = [];
    if (input.from) searchParts.push(input.from);
    if (input.to) searchParts.push(input.to);
    if (input.subject) searchParts.push(input.subject);
    if (input.text) searchParts.push(input.text);

    const searchTerms = searchParts.join(" ") || "*";

    try {
      const results = await searchEmails(auth.accountId, searchTerms, {
        limit: input.limit,
      });

      return c.json({
        data: {
          filters: input,
          results: results.hits.map((hit) => ({
            id: hit.id,
            subject: hit.subject,
            from: { email: hit.fromAddress, name: hit.fromName },
            snippet: hit.snippet,
            date: new Date((hit.createdAt as number) * 1000).toISOString(),
          })),
          totalHits: results.totalHits,
        },
      });
    } catch {
      return c.json({
        data: { filters: input, results: [], totalHits: 0 },
      });
    }
  },
);

export { aiSearch };
