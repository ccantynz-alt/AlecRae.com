/**
 * Issue #166 — context-intelligence attributed invented per-item confidence
 * (0.85 / 0.95 / 0.80) to Claude's extraction. The extraction is REAL
 * (Claude Sonnet via extractEmailContext) — the extractor just returns no
 * per-item score, so those constants were fabrications persisted as model
 * output.
 *
 * Now: rows store 0 (the #99 "no computed score" convention — the columns
 * are NOT NULL and altering them is a migration), and responses omit the
 * confidence field entirely. The extraction itself must keep working.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let inserted: Record<string, unknown>[] = [];

const mockDb = {
  insert: vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      inserted.push(values);
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

vi.mock("@alecrae/ai-engine/intelligence/context-extractor", () => ({
  extractEmailContext: vi.fn(async () => ({
    actionItems: [
      { description: "Send the deck to finance", assignedTo: "bob@x.com", priority: "high" },
    ],
    deadlines: [
      { description: "Contract signature", dueDate: "2026-09-01", isUrgent: true },
    ],
    promises: [{ description: "I will review by Friday", direction: "made" }],
    hasPendingItems: true,
  })),
}));

async function extract(): Promise<Response> {
  const { contextIntelligenceRouter } = await import(
    "../src/routes/context-intelligence.js"
  );
  const app = new Hono();
  app.route("/v1/context", contextIntelligenceRouter);
  return app.request("/v1/context/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      emailId: "em_1",
      content: "Please send the deck. I will review by Friday.",
      participants: ["me@x.com", "bob@x.com"],
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
});

describe("POST /v1/context/extract", () => {
  it("persists confidence 0 (no computed score) instead of invented constants", async () => {
    const res = await extract();
    expect(res.status).toBe(201);

    // One insert each for the action item, deadline, and promise.
    expect(inserted).toHaveLength(3);
    for (const row of inserted) {
      expect(row["confidence"]).toBe(0);
    }
    // The specific invented constants must be gone.
    const all = JSON.stringify(inserted);
    expect(all).not.toContain("0.85");
    expect(all).not.toContain("0.95");
    expect(all).not.toContain("0.8");
  });

  it("keeps the real extraction in the response, minus the fabricated per-item confidence", async () => {
    const res = await extract();
    const body = (await res.json()) as {
      data: {
        actionItems: Record<string, unknown>[];
        deadlines: Record<string, unknown>[];
        promises: Record<string, unknown>[];
      };
    };

    // Real content survives…
    expect(body.data.actionItems[0]).toMatchObject({
      actionText: "Send the deck to finance",
      priority: "high",
    });
    expect(body.data.deadlines[0]).toMatchObject({
      description: "Contract signature",
      isUrgent: true,
    });
    expect(body.data.promises[0]).toMatchObject({
      promiseText: "I will review by Friday",
    });

    // …but no item claims a confidence nobody computed.
    for (const items of [body.data.actionItems, body.data.deadlines, body.data.promises]) {
      for (const item of items) {
        expect(item).not.toHaveProperty("confidence");
      }
    }
  });
});
