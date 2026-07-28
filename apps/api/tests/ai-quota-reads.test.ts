/**
 * Regression test: AI quota was charged for reads that make no AI call.
 *
 * `requireAiQuota` is mounted on path WILDCARDS (`/v1/ai/categorize/*`,
 * `/v1/sentiment/*`, `/v1/agent/*`, ...), which sweep in every endpoint
 * beneath them — including plain database reads. On /v1/ai/categorize alone,
 * 10 of 12 endpoints charged quota while only 2 call Claude: listing your
 * smart rules or opening the stats tab drew down the monthly allowance.
 * Enough of those and a user is locked out of AI they are paying for without
 * ever having used it.
 *
 * The fix keys on the HTTP method rather than a path list, because a new read
 * endpoint added under an existing wildcard should inherit the right behaviour
 * instead of quietly inheriting the bug. Verified before relying on it: no GET
 * endpoint in apps/api/src/routes makes an AI call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

let checkCalls = 0;
let incrementCalls = 0;
let allowed = true;

vi.mock("../src/lib/ai-quota.js", () => ({
  checkAiQuota: vi.fn(async () => {
    checkCalls++;
    return {
      allowed,
      enforced: true,
      plan: "free",
      limit: 100,
      used: allowed ? 1 : 100,
      resetsAt: "2026-09-01T00:00:00.000Z",
    };
  }),
  incrementAiQuota: vi.fn(async () => {
    incrementCalls++;
  }),
}));

async function buildApp(): Promise<Hono> {
  const { requireAiQuota } = await import("../src/middleware/ai-quota.js");
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", { accountId: "acct_1", userId: "user_1" });
    await next();
  });
  app.use("/x/*", requireAiQuota);
  app.get("/x/list", (c) => c.json({ ok: true }));
  app.post("/x/analyze", (c) => c.json({ ok: true }));
  return app;
}

describe("requireAiQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkCalls = 0;
    incrementCalls = 0;
    allowed = true;
    process.env["DATABASE_URL"] = "postgres://test";
  });

  it("does not check or charge quota for a GET", async () => {
    const app = await buildApp();
    const res = await app.request("/x/list");

    expect(res.status).toBe(200);
    expect(checkCalls).toBe(0);
    expect(incrementCalls).toBe(0);
  });

  it("still checks and charges quota for a POST", async () => {
    const app = await buildApp();
    const res = await app.request("/x/analyze", { method: "POST" });

    expect(res.status).toBe(200);
    expect(checkCalls).toBe(1);
    expect(incrementCalls).toBe(1);
  });

  it("blocks a POST once the quota is exhausted", async () => {
    allowed = false;
    const app = await buildApp();
    const res = await app.request("/x/analyze", { method: "POST" });

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ai_quota_exceeded");
  });

  it("serves a GET even when the quota is exhausted", async () => {
    // A user who has spent their AI allowance must still be able to READ
    // what they already produced — locking them out of their own data would
    // be a worse failure than the over-charging this fixes.
    allowed = false;
    const app = await buildApp();
    const res = await app.request("/x/list");

    expect(res.status).toBe(200);
  });
});
