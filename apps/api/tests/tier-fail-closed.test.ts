/**
 * Regression tests: plan-tier resolution must fail CLOSED.
 *
 * middleware/auth.ts's `normaliseTier()` defaulted unknown/missing values to
 * "starter" — a PAID tier. Three concrete consequences:
 *
 *  1. A bearer token with no `tier` claim resolved to "starter", so
 *     middleware/plan-gate.ts's `requirePlan("personal")` (which maps to the
 *     DB's "starter") let a free account straight through.
 *  2. `resolveApiKeyFromDb()` escalated further: if the accounts lookup THREW,
 *     a production API key was handed `tier: "pro"` — a transient Postgres blip
 *     unlocked every Pro-gated, Claude-backed endpoint with no spend ceiling.
 *     That is the exact inverse of what plan-gate.ts exists to prevent.
 *  3. lib/jwt.ts's refresh path defaulted to "starter" while every login/
 *     register/OAuth path in routes/auth.ts already defaulted to "free", so a
 *     user's tier could silently CHANGE — upward — just by refreshing a token.
 *
 * These assert the fail-closed contract at the tier→plan-gate boundary.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { requirePlan } from "../src/middleware/plan-gate.js";
import type { PlanTier } from "../src/types.js";

/**
 * Mount a route behind `requirePlan(featureTier)` with `auth.tier` pre-set, so
 * the gate's own decision is what's under test.
 */
function appWithTier(tier: unknown, featureTier: string): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth" as never, { accountId: "acct_1", keyId: "k_1", tier, scopes: [] } as never);
    await next();
  });
  app.get("/gated", requirePlan(featureTier), (c) => c.json({ ok: true }));
  return app;
}

describe("plan-gate — a free tier is refused paid features", () => {
  it("blocks 'free' from a personal-tier feature", async () => {
    const res = await appWithTier("free", "personal").request("/gated");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; currentTier: string } };
    expect(body.error.code).toBe("plan_upgrade_required");
    expect(body.error.currentTier).toBe("free");
  });

  it("blocks 'free' from a pro-tier feature", async () => {
    const res = await appWithTier("free", "pro").request("/gated");
    expect(res.status).toBe(403);
  });

  it("blocks 'starter' from a pro-tier feature", async () => {
    const res = await appWithTier("starter", "pro").request("/gated");
    expect(res.status).toBe(403);
  });

  it("allows 'pro' through a pro-tier feature", async () => {
    const res = await appWithTier("pro", "pro").request("/gated");
    expect(res.status).toBe(200);
  });

  it("allows 'enterprise' through a pro-tier feature", async () => {
    const res = await appWithTier("enterprise", "pro").request("/gated");
    expect(res.status).toBe(200);
  });

  it("normalises the DB's 'professional' spelling to pass a pro gate", async () => {
    // The DB enum spells it "professional"; the API type is "pro". auth.ts's
    // normaliseTier() bridges them — if that ever regresses, a paying Pro
    // customer gets 403'd on all 60 Pro-gated mounts.
    const { normaliseTierForTest } = await import("../src/middleware/auth.js");
    expect(normaliseTierForTest("professional")).toBe("pro");

    const res = await appWithTier(normaliseTierForTest("professional"), "pro").request("/gated");
    expect(res.status).toBe(200);
  });
});

describe("normaliseTier — unknown input resolves to free, never a paid tier", () => {
  let normaliseTier: (t: string | null | undefined) => PlanTier;

  beforeEach(async () => {
    vi.resetModules();
    ({ normaliseTierForTest: normaliseTier } = await import("../src/middleware/auth.js"));
  });

  it("maps every real DB enum value correctly", () => {
    expect(normaliseTier("free")).toBe("free");
    expect(normaliseTier("starter")).toBe("starter");
    expect(normaliseTier("professional")).toBe("pro");
    expect(normaliseTier("pro")).toBe("pro");
    expect(normaliseTier("enterprise")).toBe("enterprise");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["an unknown tier name", "platinum"],
    ["a legacy pricing-table name with no billing", "business_plus"],
  ])("resolves %s to 'free', not a paid tier", (_label, input) => {
    const resolved = normaliseTier(input as string | null | undefined);
    expect(resolved).toBe("free");
    // The load-bearing assertion: never silently paid.
    expect(["starter", "pro", "enterprise"]).not.toContain(resolved);
  });

  it("an unresolvable tier cannot reach a personal-tier feature", async () => {
    // End-to-end version of the bug: a token with no `tier` claim used to
    // arrive as "starter" and sail through requirePlan("personal").
    const res = await appWithTier(normaliseTier(undefined), "personal").request("/gated");
    expect(res.status).toBe(403);
  });
});
