/**
 * Regression test for the Translation Center's broken contract.
 *
 * Three independent breaks shipped together on this journey:
 *   1. GET /v1/translate/history did not exist — the page called it on every
 *      load, so the history panel and the "translated this month" stat always
 *      errored. This suite covers the new endpoint.
 *   2. POST /v1/translate was sent `sourceLang`/`targetLang` while its Zod
 *      schema requires `sourceLanguage`/`targetLanguage` — every translate
 *      422'd. Covered here so the field names can't drift back.
 *   3. The page read `translatedText` from a response that returns `translated`,
 *      and ignored `wasTranslated`, so an unavailable AI provider would have
 *      rendered the untranslated original as a successful translation. The
 *      response contract is pinned below.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";
const OTHER_ACCOUNT = "acct_2";

interface TranslationRow {
  accountId: string;
  id: string;
  emailId: string;
  sourceLanguage: string;
  sourceLanguageName: string;
  targetLanguage: string;
  targetLanguageName: string;
  originalContent: { subject: string; body: string };
  autoTranslated: boolean;
  createdAt: Date;
}

let rows: TranslationRow[] = [];
/** Captures the accountId the route scoped its query to. */
let scopedTo: string | null = null;
let appliedLimit: number | null = null;

const mockDb = {
  select: vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn((cond: unknown) => {
        // drizzle's eq() is captured by the mock below as { __accountId }.
        scopedTo = (cond as { __accountId?: string })?.__accountId ?? null;
        return chain;
      }),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((n: number) => {
        appliedLimit = n;
        return Promise.resolve(rows.filter((r) => r.accountId === scopedTo).slice(0, n));
      }),
    };
    return chain;
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("drizzle-orm");
  return {
    ...actual,
    // Tag the eq() used for account scoping so the mock chain can assert on it.
    eq: (col: unknown, val: unknown) => ({ __accountId: val, col }),
    desc: (col: unknown) => col,
  };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

function row(over: Partial<TranslationRow> = {}): TranslationRow {
  return {
    accountId: ACCOUNT_ID,
    id: "trl_1",
    emailId: "em_1",
    sourceLanguage: "es",
    sourceLanguageName: "Spanish",
    targetLanguage: "en",
    targetLanguageName: "English",
    originalContent: { subject: "Hola equipo", body: "Buenos dias a todos" },
    autoTranslated: false,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    ...over,
  };
}

describe("GET /v1/translate/history", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    rows = [];
    scopedTo = null;
    appliedLimit = null;

    const mod = await import("../src/routes/translate.js");
    app = new Hono();
    app.route("/v1/translate", mod.default ?? mod.translate);
  });

  it("returns the caller's translations with both language codes and names", async () => {
    rows = [row()];

    const res = await app.request("/v1/translate/history");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Record<string, unknown>[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "trl_1",
      emailId: "em_1",
      sourceLanguage: "es",
      sourceLanguageName: "Spanish",
      targetLanguage: "en",
      targetLanguageName: "English",
      autoTranslated: false,
    });
    // The page renders names but falls back to codes — both must be present.
    expect(body.data[0]!["snippet"]).toBe("Hola equipo");
    expect(body.data[0]!["createdAt"]).toBe("2026-07-20T10:00:00.000Z");
  });

  it("scopes the query to the caller's account", async () => {
    rows = [row(), row({ id: "trl_other", accountId: OTHER_ACCOUNT })];

    const res = await app.request("/v1/translate/history");
    const body = (await res.json()) as { data: { id: string }[] };

    expect(scopedTo).toBe(ACCOUNT_ID);
    expect(body.data.map((d) => d.id)).toEqual(["trl_1"]);
  });

  it("counts words from the original content, not the translation", async () => {
    rows = [row({ originalContent: { subject: "Hola", body: "uno dos tres" } })];

    const res = await app.request("/v1/translate/history");
    const body = (await res.json()) as { data: { wordCount: number }[] };

    expect(body.data[0]!.wordCount).toBe(4); // "Hola" + 3 body words
  });

  it("defaults to a bounded page size and rejects an out-of-range limit", async () => {
    rows = [row()];

    await app.request("/v1/translate/history");
    expect(appliedLimit).toBe(25);

    const bad = await app.request("/v1/translate/history?limit=5000");
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_query");
  });

  it("honours an explicit in-range limit", async () => {
    rows = [row(), row({ id: "trl_2" }), row({ id: "trl_3" })];

    const res = await app.request("/v1/translate/history?limit=2");
    const body = (await res.json()) as { data: unknown[] };

    expect(appliedLimit).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  it("tolerates a row with empty original content", async () => {
    rows = [row({ originalContent: { subject: "", body: "" } })];

    const res = await app.request("/v1/translate/history");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { snippet: string; wordCount: number }[] };
    expect(body.data[0]!.snippet).toBe("");
    expect(body.data[0]!.wordCount).toBe(0);
  });
});
