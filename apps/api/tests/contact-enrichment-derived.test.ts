/**
 * Issue #166 — contact "enrichment" was a title-cased echo of the email
 * address presented as AI with invented confidence scores (0.5 / 0.2) and
 * source: "ai".
 *
 * The derivation itself is deterministic, honest and mildly useful, so it
 * stays — labelled as what it is: source "derived_from_address", confidence 0
 * (no measured score exists, per the #99 convention).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let selectResults: unknown[][] = [];
let selectCall = 0;
let inserted: Record<string, unknown>[] = [];

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
  insert: vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      inserted.push(values);
      return Promise.resolve(undefined);
    }),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
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

async function enrich(contactId: string): Promise<Response> {
  const { contactEnrichmentRouter } = await import(
    "../src/routes/contact-enrichment.js"
  );
  const app = new Hono();
  app.route("/v1/contacts", contactEnrichmentRouter);
  return app.request(`/v1/contacts/${contactId}/enrich`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
  inserted = [];
});

describe("POST /v1/contacts/:contactId/enrich", () => {
  it("still 404s for a contact the caller does not own", async () => {
    selectResults = [[]];
    const res = await enrich("someone-elses-contact");
    expect(res.status).toBe(404);
    expect(inserted).toHaveLength(0);
  });

  it("keeps the honest derivation (name + company from a corporate address) with honest labels", async () => {
    selectResults = [
      [{ id: "c1", email: "john.doe@acme.com" }], // contact lookup
      [], // no existing enrichment → insert path
    ];

    const res = await enrich("c1");
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        data: { fullName?: string; company?: string };
        confidence: number;
        source: string;
      };
    };

    // Real, useful derivation kept.
    expect(body.data.data.fullName).toBe("John Doe");
    expect(body.data.data.company).toBe("Acme");

    // Honest labelling: not "ai", not a made-up probability.
    expect(body.data.source).toBe("derived_from_address");
    expect(body.data.confidence).toBe(0);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      source: "derived_from_address",
      confidence: 0,
    });
  });

  it("derives no company for a free-provider address", async () => {
    selectResults = [[{ id: "c2", email: "jane_smith@gmail.com" }], []];
    const res = await enrich("c2");
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { data: { fullName?: string; company?: string } };
    };
    expect(body.data.data.fullName).toBe("Jane Smith");
    expect(body.data.data.company).toBeUndefined();
  });
});
