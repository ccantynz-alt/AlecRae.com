/**
 * Issue #166 — POST /v1/workflows/:id/run recorded fabricated executions.
 *
 * The old run loop incremented actionsExecuted once per action while
 * executing NOTHING, then persisted the run as status "success". A user's
 * run history said 3/3 actions succeeded when zero work happened — the same
 * fabricated-success class as #141/#163.
 *
 * Now: the run row is recorded honestly (status "skipped" — a real
 * workflow_run_status enum value — actionsExecuted 0) and the response says
 * in plain words that action execution is not implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let selectResults: unknown[][] = [];
let selectCall = 0;
let insertedRuns: Record<string, unknown>[] = [];
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
  insert: vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      insertedRuns.push(values);
      return {
        returning: vi.fn(() =>
          Promise.resolve([{ ...values, createdAt: new Date() }]),
        ),
      };
    }),
  })),
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

async function run(id: string): Promise<Response> {
  const { workflowsRouter } = await import("../src/routes/workflows.js");
  const app = new Hono();
  app.route("/v1/workflows", workflowsRouter);
  return app.request(`/v1/workflows/${id}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
  insertedRuns = [];
  updates = [];
});

describe("POST /v1/workflows/:id/run", () => {
  it("still 404s for a workflow the caller does not own — and records nothing", async () => {
    selectResults = [[]];
    const res = await run("wf_missing");
    expect(res.status).toBe(404);
    expect(insertedRuns).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("records the run as skipped with zero actions executed — never a fabricated success", async () => {
    selectResults = [
      [
        {
          id: "wf_1",
          accountId: ACCOUNT_ID,
          name: "Archive newsletters",
          actions: [
            { type: "label", config: {} },
            { type: "archive", config: {} },
            { type: "notify", config: {} },
          ],
        },
      ],
    ];

    const res = await run("wf_1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        actionsExecuted: number;
        totalActions: number;
        notice: string;
        run: { status: string; actionsExecuted: number };
      };
    };

    // The response tells the truth…
    expect(body.data.actionsExecuted).toBe(0);
    expect(body.data.totalActions).toBe(3);
    expect(body.data.notice).toContain("not implemented");
    expect(body.data.run.status).toBe("skipped");

    // …and so does the persisted run row.
    expect(insertedRuns).toHaveLength(1);
    expect(insertedRuns[0]).toMatchObject({
      workflowId: "wf_1",
      status: "skipped",
      actionsExecuted: 0,
      error: null,
    });

    // The run counter still moves — a skipped run genuinely happened.
    expect(updates).toHaveLength(1);
  });
});
