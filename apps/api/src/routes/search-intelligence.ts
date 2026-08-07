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
 * POST   /v1/search-intelligence/suggestions/generate     — Generate suggestions from search history
 * GET    /v1/search-intelligence/trending                 — Trending terms from real search history
 * GET    /v1/search-intelligence/related/:emailId         — 501 (no similarity index exists)
 * POST   /v1/search-intelligence/natural-language         — 501 (no NL parser wired here)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, gte, sql } from "drizzle-orm";
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
        ? (page[page.length - 1]?.createdAt.toISOString() ?? null)
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
        ? (page[page.length - 1]?.createdAt.toISOString() ?? null)
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
// POST /suggestions/generate — Generate search suggestions from real history
// ---------------------------------------------------------------------------
// This used to return two canned suggestions with invented relevanceScores
// (0.95/0.85) presented as AI output (issue #166, same fabricated-output class
// as #84/#141/#163). The account's real search history exists (ai-search.ts
// records it, issue #74f), so suggestions are now derived from it: the most
// frequent queries of the last 30 days, with relevanceScore as the query's
// share of the most-frequent one — a derived number, not an invented one.
// No AI is involved and nothing claims otherwise.
searchIntelligenceRouter.post(
  "/suggestions/generate",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const frequent = await db
      .select({
        term: sql<string>`lower(${searchHistory.query})`,
        total: sql<number>`count(*)::int`,
      })
      .from(searchHistory)
      .where(
        and(
          eq(searchHistory.accountId, auth.accountId),
          gte(searchHistory.createdAt, windowStart),
        ),
      )
      .groupBy(sql`lower(${searchHistory.query})`)
      .orderBy(desc(sql`count(*)`))
      .limit(8);

    if (frequent.length === 0) {
      return c.json({
        data: [],
        generated: true,
        note: "No search history in the last 30 days — suggestions are generated from your own searches.",
      });
    }

    // Regenerate rather than accumulate: replace this account's previous
    // frequency-derived suggestions so re-running doesn't duplicate them.
    await db
      .delete(searchSuggestions)
      .where(
        and(
          eq(searchSuggestions.accountId, auth.accountId),
          eq(searchSuggestions.category, "frequent"),
        ),
      );

    const maxCount = frequent[0]?.total ?? 1;
    const now = new Date();
    const generated = frequent.map((row) => ({
      id: generateId(),
      accountId: auth.accountId,
      suggestion: row.term,
      reason: `Searched ${row.total} time${row.total === 1 ? "" : "s"} in the last 30 days`,
      category: "frequent" as const,
      relevanceScore: row.total / maxCount,
      createdAt: now,
    }));

    await db.insert(searchSuggestions).values(generated);

    return c.json({
      data: generated.map((s) => ({
        id: s.id,
        suggestion: s.suggestion,
        reason: s.reason,
        category: s.category,
        relevanceScore: s.relevanceScore,
        createdAt: s.createdAt.toISOString(),
      })),
      generated: true,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /trending — Trending search terms, aggregated from real search history
// ---------------------------------------------------------------------------
// This used to return three hardcoded terms with invented counts (invoice: 42,
// "meeting notes": 28, "quarterly report": 15) stamped with the caller's
// accountId (issue #166). Now a real aggregation: terms searched in the last
// 7 days, with the trend derived by comparing against the 7 days before that.
searchIntelligenceRouter.get(
  "/trending",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const now = Date.now();
    const windowStart = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const midpoint = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Built once and reused so SELECT and ORDER BY render identically —
    // the issue #75(c) lesson about duplicated bound-param expressions.
    const recentCount = sql<number>`count(*) filter (where ${searchHistory.createdAt} >= ${midpoint})`;
    const priorCount = sql<number>`count(*) filter (where ${searchHistory.createdAt} < ${midpoint})`;

    const rows = await db
      .select({
        term: sql<string>`lower(${searchHistory.query})`,
        recent: sql<number>`${recentCount}::int`,
        prior: sql<number>`${priorCount}::int`,
      })
      .from(searchHistory)
      .where(
        and(
          eq(searchHistory.accountId, auth.accountId),
          gte(searchHistory.createdAt, windowStart),
        ),
      )
      .groupBy(sql`lower(${searchHistory.query})`)
      .orderBy(desc(recentCount))
      .limit(10);

    const trending = rows
      .filter((row) => row.recent > 0)
      .map((row) => ({
        term: row.term,
        count: row.recent,
        trend:
          row.recent > row.prior
            ? ("up" as const)
            : row.recent < row.prior
              ? ("down" as const)
              : ("stable" as const),
      }));

    return c.json({
      data: trending,
      accountId: auth.accountId,
      period: "7d",
    });
  },
);

// ---------------------------------------------------------------------------
// GET /related/:emailId — Related emails by similarity — NOT IMPLEMENTED
// ---------------------------------------------------------------------------
// Previously returned 200 with an empty array, indistinguishable from "the
// feature ran and found nothing related". Nothing computes email similarity
// today, so the honest answer is 501, not an empty success (issue #166; same
// principle as #84/#141). No per-id lookup happens, so the response reveals
// nothing about whether an email id exists.
searchIntelligenceRouter.get(
  "/related/:emailId",
  requireScope("messages:read"),
  (c) => {
    return c.json(
      {
        error: {
          type: "not_implemented",
          message:
            "Related-email similarity search is not available yet — no similarity index exists, and no search was performed.",
          code: "related_search_unavailable",
        },
      },
      501,
    );
  },
);

// ---------------------------------------------------------------------------
// POST /natural-language — Parse NL query into structured search — NOT IMPLEMENTED
// ---------------------------------------------------------------------------
// Previously returned 200 with an all-null "parsed" structure as if parsing
// had run. Nothing parses natural-language queries on this route today.
searchIntelligenceRouter.post(
  "/natural-language",
  requireScope("messages:read"),
  validateBody(NaturalLanguageQuerySchema),
  (c) => {
    return c.json(
      {
        error: {
          type: "not_implemented",
          message:
            "Natural-language query parsing is not available yet — the query was not parsed. Use POST /v1/search/ai for AI search.",
          code: "natural_language_parse_unavailable",
        },
      },
      501,
    );
  },
);

export { searchIntelligenceRouter };
