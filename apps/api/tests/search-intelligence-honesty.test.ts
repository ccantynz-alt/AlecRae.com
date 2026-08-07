/**
 * Issue #166 — search-intelligence fabricated-output batch.
 *
 * GET /trending returned three HARDCODED terms with invented counts
 * (invoice: 42, "meeting notes": 28, "quarterly report": 15) stamped with the
 * caller's accountId; POST /suggestions/generate returned two canned
 * suggestions with invented relevanceScores presented as AI output; and
 * /related + /natural-language returned 200-with-empty as if the feature had
 * run and found nothing.
 *
 * Now: trending and generate are real aggregations over the account's own
 * search_history (which ai-search.ts genuinely records — issue #74f), and the
 * two unimplemented endpoints answer an honest 501. Tests cover both
 * directions: the honest failure AND that the real aggregation actually
 * aggregates.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let selectResults: unknown[][] = [];
let selectCall = 0;
let inserted: Record<string, unknown>[][] = [];
let deleteCount = 0;

function chain(result: () => unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "groupBy", "orderBy", "limit"]) {
    c[m] = vi.fn(() => c);
  }
  c["then"] = (resolve: (v: unknown) => unknown) => resolve(result());
  return c;
}

const mockDb = {
  select: vi.fn(() => {
    const idx = selectCall++;
    return chain(() => selectResults[idx] ?? []);
  }),
  delete: vi.fn(() => {
    deleteCount++;
    const c: Record<string, unknown> = {};
    c["where"] = vi.fn(() => Promise.resolve(undefined));
    return c;
  }),
  insert: vi.fn(() => ({
    values: vi.fn((rows: Record<string, unknown>[]) => {
      inserted.push(rows);
      return Promise.resolve(undefined);
    }),
  })),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

async function request(path: string, init?: RequestInit): Promise<Response> {
  const { searchIntelligenceRouter } = await import(
    "../src/routes/search-intelligence.js"
  );
  const app = new Hono();
  app.route("/v1/search-intelligence", searchIntelligenceRouter);
  return app.request(`/v1/search-intelligence${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
  inserted = [];
  deleteCount = 0;
});

describe("GET /trending", () => {
  it("aggregates real search history rather than returning canned terms", async () => {
    selectResults = [
      [
        { term: "invoice reminder", recent: 5, prior: 2 },
        { term: "flight booking", recent: 3, prior: 3 },
        { term: "old topic", recent: 2, prior: 7 },
      ],
    ];

    const res = await request("/trending");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { term: string; count: number; trend: string }[];
    };

    expect(body.data).toEqual([
      { term: "invoice reminder", count: 5, trend: "up" },
      { term: "flight booking", count: 3, trend: "stable" },
      { term: "old topic", count: 2, trend: "down" },
    ]);
  });

  it("returns an empty list for an account with no search history — never sample data", async () => {
    selectResults = [[]];
    const res = await request("/trending");
    const body = (await res.json()) as { data: unknown[] };
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    // The old hardcoded payload must be gone in every particular.
    const text = JSON.stringify(body);
    expect(text).not.toContain("quarterly report");
    expect(text).not.toContain("meeting notes");
  });

  it("drops terms with no searches in the recent window", async () => {
    selectResults = [[{ term: "stale", recent: 0, prior: 4 }]];
    const res = await request("/trending");
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});

describe("POST /suggestions/generate", () => {
  it("derives suggestions from real history frequency and persists them", async () => {
    selectResults = [
      [
        { term: "budget", total: 4 },
        { term: "roadmap", total: 2 },
      ],
    ];

    const res = await request("/suggestions/generate", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { suggestion: string; relevanceScore: number; reason: string; category: string }[];
      generated: boolean;
    };

    expect(body.generated).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      suggestion: "budget",
      category: "frequent",
      relevanceScore: 1,
    });
    expect(body.data[1]).toMatchObject({
      suggestion: "roadmap",
      relevanceScore: 0.5,
    });
    // The reason states the real derivation, not an AI claim.
    expect(body.data[0]?.reason).toContain("Searched 4 times");

    // Old frequency-derived suggestions replaced, new ones persisted.
    expect(deleteCount).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toHaveLength(2);
    expect(inserted[0]?.[0]).toMatchObject({
      accountId: ACCOUNT_ID,
      suggestion: "budget",
      category: "frequent",
    });
  });

  it("says plainly when there is no history — persists nothing, invents nothing", async () => {
    selectResults = [[]];
    const res = await request("/suggestions/generate", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; note?: string };
    expect(body.data).toEqual([]);
    expect(body.note).toContain("No search history");
    expect(inserted).toHaveLength(0);
    expect(deleteCount).toBe(0);
    // The two old canned suggestions must never come back.
    expect(JSON.stringify(body)).not.toContain("unread from last week");
  });
});

describe("unimplemented endpoints answer 501, not empty success", () => {
  it("GET /related/:emailId", async () => {
    const res = await request("/related/some-email-id");
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("related_search_unavailable");
  });

  it("POST /natural-language", async () => {
    const res = await request("/natural-language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "emails from bob last week" }),
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("natural_language_parse_unavailable");
  });
});
