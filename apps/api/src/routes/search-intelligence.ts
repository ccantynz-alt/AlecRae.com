/**
 * Search Intelligence Route — Advanced Search & Smart Suggestions
 *
 * GET    /v1/search-intelligence/history                  — List search history
 * DELETE /v1/search-intelligence/history                  — Clear search history
 * POST   /v1/search-intelligence/bookmarks                — Create search bookmark
 * GET    /v1/search-intelligence/bookmarks                — List search bookmarks
 * PUT    /v1/search-intelligence/bookmarks/:id            — Update bookmark
 * DELETE /v1/search-intelligence/bookmarks/:id            — Delete bookmark
 * POST   /v1/search-intelligence/bookmarks/:id/check      — Check for new results
 * GET    /v1/search-intelligence/suggestions              — Get smart suggestions
 * POST   /v1/search-intelligence/suggestions/generate     — Generate AI suggestions
 * GET    /v1/search-intelligence/trending                 — Get trending search terms
 * GET    /v1/search-intelligence/related/:emailId         — Get related emails
 * POST   /v1/search-intelligence/natural-language         — Parse NL query
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
import {
  getDatabase,
  searchHistory,
  searchBookmarks,
  searchSuggestions,
} from "@alecrae/db";
import type { SearchBookmarkFilters } from "@alecrae/db";
import type { SQL } from "drizzle-orm";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SearchBookmarkFiltersSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  dateAfter: z.string().optional(),
  dateBefore: z.string().optional(),
  hasAttachment: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
  folder: z.string().optional(),
});

const ListHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  searchType: z.enum(["keyword", "natural_language", "semantic"]).optional(),
});

const CreateBookmarkSchema = z.object({
  name: z.string().min(1).max(255),
  query: z.string().min(1),
  searchType: z.enum(["keyword", "natural_language", "semantic"]).optional(),
  filters: SearchBookmarkFiltersSchema.optional(),
  notifyOnNew: z.boolean().optional(),
});

const UpdateBookmarkSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  query: z.string().min(1).optional(),
  searchType: z.enum(["keyword", "natural_language", "semantic"]).optional(),
  filters: SearchBookmarkFiltersSchema.optional(),
  notifyOnNew: z.boolean().optional(),
});

const ListBookmarksQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const ListSuggestionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  category: z
    .enum(["recent", "frequent", "trending", "ai_recommended"])
    .optional(),
});

const NaturalLanguageQuerySchema = z.object({
  query: z.string().min(1).max(1000),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const searchIntelligenceRouter = new Hono();

// ---------------------------------------------------------------------------
// GET /history — List search history (cursor pagination, filter by searchType)
// ---------------------------------------------------------------------------
searchIntelligenceRouter.get(
  "/history",
  requireScope("messages:read"),
  validateQuery(ListHistoryQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListHistoryQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions: SQL[] = [eq(searchHistory.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(searchHistory.createdAt, new Date(query.cursor)));
    }

    if (query.searchType) {
      conditions.push(eq(searchHistory.searchType, query.searchType));
    }

    const rows = await db
      .select({
        id: searchHistory.id,
        query: searchHistory.query,
        resultCount: searchHistory.resultCount,
        clickedResults: searchHistory.clickedResults,
        searchType: searchHistory.searchType,
        createdAt: searchHistory.createdAt,
      })
      .from(searchHistory)
      .where(and(...conditions))
      .orderBy(desc(searchHistory.createdAt))
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
        query: row.query,
        resultCount: row.resultCount,
        clickedResults: row.clickedResults,
        searchType: row.searchType,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ---------------------------------------------------------------------------
// DELETE /history — Clear search history
// ---------------------------------------------------------------------------
searchIntelligenceRouter.delete(
  "/history",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    await db
      .delete(searchHistory)
      .where(eq(searchHistory.accountId, auth.accountId));

    return c.json({ deleted: true });
  },
);

// ---------------------------------------------------------------------------
// POST /bookmarks — Create search bookmark
// ---------------------------------------------------------------------------
searchIntelligenceRouter.post(
  "/bookmarks",
  requireScope("messages:write"),
  validateBody(CreateBookmarkSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateBookmarkSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(searchBookmarks).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      query: input.query,
      searchType: input.searchType ?? "keyword",
      filters: (input.filters ?? {}) as SearchBookmarkFilters,
      notifyOnNew: input.notifyOnNew ?? false,
      lastCheckedAt: null,
      newResultsSinceLastCheck: 0,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          query: input.query,
          searchType: input.searchType ?? "keyword",
          filters: input.filters ?? {},
          notifyOnNew: input.notifyOnNew ?? false,
          lastCheckedAt: null,
          newResultsSinceLastCheck: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// ---------------------------------------------------------------------------
// GET /bookmarks — List search bookmarks
// ---------------------------------------------------------------------------
searchIntelligenceRouter.get(
  "/bookmarks",
  requireScope("messages:read"),
  validateQuery(ListBookmarksQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListBookmarksQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions: SQL[] = [
      eq(searchBookmarks.accountId, auth.accountId),
    ];

    if (query.cursor) {
      conditions.push(lt(searchBookmarks.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: searchBookmarks.id,
        name: searchBookmarks.name,
        query: searchBookmarks.query,
        searchType: searchBookmarks.searchType,
        filters: searchBookmarks.filters,
        notifyOnNew: searchBookmarks.notifyOnNew,
        lastCheckedAt: searchBookmarks.lastCheckedAt,
        newResultsSinceLastCheck: searchBookmarks.newResultsSinceLastCheck,
        createdAt: searchBookmarks.createdAt,
        updatedAt: searchBookmarks.updatedAt,
      })
      .from(searchBookmarks)
      .where(and(...conditions))
      .orderBy(desc(searchBookmarks.createdAt))
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
        query: row.query,
        searchType: row.searchType,
        filters: row.filters,
        notifyOnNew: row.notifyOnNew,
        lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
        newResultsSinceLastCheck: row.newResultsSinceLastCheck,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ---------------------------------------------------------------------------
// PUT /bookmarks/:id — Update bookmark
// ---------------------------------------------------------------------------
searchIntelligenceRouter.put(
  "/bookmarks/:id",
  requireScope("messages:write"),
  validateBody(UpdateBookmarkSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateBookmarkSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: searchBookmarks.id })
      .from(searchBookmarks)
      .where(
        and(
          eq(searchBookmarks.id, id),
          eq(searchBookmarks.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Search bookmark ${id} not found`,
            code: "search_bookmark_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(searchBookmarks)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.query !== undefined ? { query: input.query } : {}),
        ...(input.searchType !== undefined
          ? { searchType: input.searchType }
          : {}),
        ...(input.filters !== undefined
          ? { filters: input.filters as SearchBookmarkFilters }
          : {}),
        ...(input.notifyOnNew !== undefined
          ? { notifyOnNew: input.notifyOnNew }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(searchBookmarks.id, id),
          eq(searchBookmarks.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// ---------------------------------------------------------------------------
// DELETE /bookmarks/:id — Delete bookmark
// ---------------------------------------------------------------------------
searchIntelligenceRouter.delete(
  "/bookmarks/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: searchBookmarks.id })
      .from(searchBookmarks)
      .where(
        and(
          eq(searchBookmarks.id, id),
          eq(searchBookmarks.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Search bookmark ${id} not found`,
            code: "search_bookmark_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(searchBookmarks)
      .where(
        and(
          eq(searchBookmarks.id, id),
          eq(searchBookmarks.accountId, auth.accountId),
        ),
      );

    return c.json({ deleted: true, id });
  },
);

// ---------------------------------------------------------------------------
// POST /bookmarks/:id/check — Check for new results since last check
// ---------------------------------------------------------------------------
searchIntelligenceRouter.post(
  "/bookmarks/:id/check",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [bookmark] = await db
      .select()
      .from(searchBookmarks)
      .where(
        and(
          eq(searchBookmarks.id, id),
          eq(searchBookmarks.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!bookmark) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Search bookmark ${id} not found`,
            code: "search_bookmark_not_found",
          },
        },
        404,
      );
    }

    // Placeholder: In production, this would run the saved search query
    // against the email index and compare against lastCheckedAt
    const newResults = 0;
    const now = new Date();

    await db
      .update(searchBookmarks)
      .set({
        lastCheckedAt: now,
        newResultsSinceLastCheck: newResults,
        updatedAt: now,
      })
      .where(
        and(
          eq(searchBookmarks.id, id),
          eq(searchBookmarks.accountId, auth.accountId),
        ),
      );

    return c.json({
      data: {
        id,
        newResults,
        lastCheckedAt: now.toISOString(),
      },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /suggestions — Get smart search suggestions (recent + frequent + AI)
// ---------------------------------------------------------------------------
searchIntelligenceRouter.get(
  "/suggestions",
  requireScope("messages:read"),
  validateQuery(ListSuggestionsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListSuggestionsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions: SQL[] = [
      eq(searchSuggestions.accountId, auth.accountId),
    ];

    if (query.category) {
      conditions.push(eq(searchSuggestions.category, query.category));
    }

    const rows = await db
      .select({
        id: searchSuggestions.id,
        suggestion: searchSuggestions.suggestion,
        reason: searchSuggestions.reason,
        category: searchSuggestions.category,
        relevanceScore: searchSuggestions.relevanceScore,
        createdAt: searchSuggestions.createdAt,
      })
      .from(searchSuggestions)
      .where(and(...conditions))
      .orderBy(desc(searchSuggestions.relevanceScore))
      .limit(query.limit);

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        suggestion: row.suggestion,
        reason: row.reason,
        category: row.category,
        relevanceScore: row.relevanceScore,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);

// ---------------------------------------------------------------------------
// POST /suggestions/generate — Generate AI search suggestions
// ---------------------------------------------------------------------------
searchIntelligenceRouter.post(
  "/suggestions/generate",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");

    // Placeholder: In production, this would:
    // 1. Fetch recent search history
    // 2. Analyze frequent contacts and email patterns
    // 3. Use Claude Haiku to generate contextual search suggestions
    // 4. Persist them to the searchSuggestions table

    const placeholderSuggestions = [
      {
        id: generateId(),
        suggestion: "unread from last week",
        reason: "You have unread emails from last week",
        category: "ai_recommended" as const,
        relevanceScore: 0.95,
        createdAt: new Date().toISOString(),
      },
      {
        id: generateId(),
        suggestion: "emails with attachments",
        reason: "Frequently searched pattern",
        category: "frequent" as const,
        relevanceScore: 0.85,
        createdAt: new Date().toISOString(),
      },
    ];

    return c.json({
      data: placeholderSuggestions,
      generated: true,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /trending — Get trending search terms across account
// ---------------------------------------------------------------------------
searchIntelligenceRouter.get(
  "/trending",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");

    // Placeholder: In production, this would aggregate search history
    // across the account to find trending search terms over the last 7 days
    const placeholderTrending = [
      { term: "invoice", count: 42, trend: "up" as const },
      { term: "meeting notes", count: 28, trend: "stable" as const },
      { term: "quarterly report", count: 15, trend: "up" as const },
    ];

    return c.json({
      data: placeholderTrending,
      accountId: auth.accountId,
      period: "7d",
    });
  },
);

// ---------------------------------------------------------------------------
// GET /related/:emailId — Get related emails by AI similarity
// ---------------------------------------------------------------------------
searchIntelligenceRouter.get(
  "/related/:emailId",
  requireScope("messages:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");

    // Placeholder: In production, this would:
    // 1. Fetch the email's embedding vector
    // 2. Run a cosine similarity search against other embeddings
    // 3. Return the top-N most similar emails
    const placeholderRelated: Array<{
      emailId: string;
      similarity: number;
      reason: string;
    }> = [];

    return c.json({
      data: placeholderRelated,
      sourceEmailId: emailId,
      accountId: auth.accountId,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /natural-language — Parse natural language query into structured search
// ---------------------------------------------------------------------------
searchIntelligenceRouter.post(
  "/natural-language",
  requireScope("messages:read"),
  validateBody(NaturalLanguageQuerySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof NaturalLanguageQuerySchema>>(
      c,
    );
    const auth = c.get("auth");

    // Placeholder: In production, this would:
    // 1. Send the natural language query to Claude Haiku
    // 2. Parse the response into structured search filters
    // 3. Return both the structured query and the original text
    const placeholderParsed = {
      originalQuery: input.query,
      structured: {
        keywords: [] as string[],
        from: null as string | null,
        to: null as string | null,
        dateAfter: null as string | null,
        dateBefore: null as string | null,
        hasAttachment: null as boolean | null,
        labels: [] as string[],
        folder: null as string | null,
      },
      confidence: 0.0,
      suggestion: "Natural language parsing will be powered by Claude Haiku",
    };

    return c.json({
      data: placeholderParsed,
      accountId: auth.accountId,
    });
  },
);

export { searchIntelligenceRouter };
