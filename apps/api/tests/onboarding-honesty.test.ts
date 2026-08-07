/**
 * Issue #166 — onboarding fabricated background work.
 *
 * POST /sync-contacts reported status "syncing" and promised a background
 * import that does not exist, AND marked the sync_contacts step complete —
 * making the fake sync unretryable. POST /import-settings "imported" a
 * canned list of default provider labels/filters/signatures that were never
 * fetched from anywhere nor persisted, and marked its step complete too.
 *
 * Now both answer an honest 501, mark NOTHING complete (POST /step/:step
 * exists for deliberate skipping), and the onboarding-record 404 still comes
 * first so it means what it meant. POST /retrain on ai-categorization is the
 * same class: it claimed "queued" with no job — covered here too.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let selectResults: unknown[][] = [];
let selectCall = 0;
let updates: Record<string, unknown>[] = [];

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
  update: vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return { where: vi.fn(() => Promise.resolve(undefined)) };
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

const record = {
  accountId: ACCOUNT_ID,
  importedFrom: null,
  completedSteps: ["connect_account"],
  currentStep: "import_settings",
  preferences: {},
};

async function onboardingRequest(path: string, body: unknown): Promise<Response> {
  const { onboardingRouter } = await import("../src/routes/onboarding.js");
  const app = new Hono();
  app.route("/v1/onboarding", onboardingRouter);
  return app.request(`/v1/onboarding${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
  updates = [];
});

describe("POST /v1/onboarding/sync-contacts", () => {
  it("404s when onboarding has not started — ownership/state check comes first", async () => {
    selectResults = [[]];
    const res = await onboardingRequest("/sync-contacts", {
      provider: "gmail",
      maxContacts: 100,
    });
    expect(res.status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  it("answers 501 and does NOT mark the step complete — the step stays retryable", async () => {
    selectResults = [[record]];
    const res = await onboardingRequest("/sync-contacts", {
      provider: "gmail",
      maxContacts: 100,
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("contact_sync_unavailable");
    expect(body.error.message).toContain("no sync was started");
    // The old handler wrote completedSteps here. Nothing may be written now.
    expect(updates).toHaveLength(0);
    // And no fabricated "syncing" status anywhere.
    expect(JSON.stringify(body)).not.toContain("syncing");
  });
});

describe("POST /v1/onboarding/import-settings", () => {
  it("answers 501, imports nothing, and does not mark the step complete", async () => {
    selectResults = [[record]];
    const res = await onboardingRequest("/import-settings", {
      provider: "outlook",
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("settings_import_unavailable");
    expect(updates).toHaveLength(0);
    // The canned "imported" payload is gone.
    expect(JSON.stringify(body)).not.toContain("labelsCount");
  });
});

describe("POST /v1/ai-categorization/retrain", () => {
  it("answers 501 instead of claiming a job was queued", async () => {
    const { aiCategorizationRouter } = await import(
      "../src/routes/ai-categorization.js"
    );
    const app = new Hono();
    app.route("/v1/ai-categorization", aiCategorizationRouter);
    const res = await app.request("/v1/ai-categorization/retrain", {
      method: "POST",
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("retraining_unavailable");
    expect(body.error.message).toContain("nothing was queued");
    // The fabricated success payload is gone in every particular.
    expect(JSON.stringify(body)).not.toContain('"status":"queued"');
    expect(JSON.stringify(body)).not.toContain("estimatedDuration");
  });
});
