/**
 * A/B Tests Route — Email A/B Testing: send variants, track performance
 *
 * POST   /v1/ab-tests            — Create an A/B test
 * GET    /v1/ab-tests            — List tests (paginated)
 * GET    /v1/ab-tests/:id        — Get test with results
 * POST   /v1/ab-tests/:id/start  — Start the test
 * POST   /v1/ab-tests/:id/complete — Mark test complete, declare winner
 * DELETE /v1/ab-tests/:id        — Delete test (only if draft)
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
import { getDatabase, abTests } from "@alecrae/db";
import type { ABTestVariant, ABTestResults } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const VariantSchema = z.object({
  subject: z.string().min(1).max(998).optional(),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  percentage: z.number().min(0).max(100),
});

const CreateABTestSchema = z.object({
  name: z.string().min(1).max(255),
  variants: z.array(VariantSchema).min(2).max(10),
  winnerMetric: z
    .enum(["open_rate", "click_rate", "reply_rate"])
    .optional()
    .default("open_rate"),
});

const CompleteABTestSchema = z.object({
  winnerId: z.string().optional(),
});

const ListABTestsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Standard normal CDF Φ(z), via the Abramowitz–Stegun 7.1.26 erf
 * approximation (max abs error ≈ 1.5e-7 — far below anything that matters
 * for declaring an A/B winner). No dependencies.
 */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  const phi = 0.5 * (1 + erf);
  return z >= 0 ? phi : 1 - phi;
}

/**
 * One-sided pooled two-proportion z-test: the probability that `winner`'s
 * underlying rate genuinely exceeds `runnerUp`'s, given the observed counts.
 *
 * Returns null when no significance can be computed — a missing side, zero
 * sends, or zero pooled variance (0% or 100% everywhere). Callers must treat
 * null as "no confidence value", never substitute a constant: the previous
 * implementation stored a flat 0.95 for every completed test regardless of
 * data (issue #166), which made the number a decoration, not a measurement.
 */
export function twoProportionConfidence(
  winner: { successes: number; trials: number },
  runnerUp: { successes: number; trials: number },
): number | null {
  if (winner.trials <= 0 || runnerUp.trials <= 0) return null;
  const p1 = winner.successes / winner.trials;
  const p2 = runnerUp.successes / runnerUp.trials;
  const pooled =
    (winner.successes + runnerUp.successes) / (winner.trials + runnerUp.trials);
  const se = Math.sqrt(
    pooled * (1 - pooled) * (1 / winner.trials + 1 / runnerUp.trials),
  );
  if (se === 0 || Number.isNaN(se)) return null;
  const z = (p1 - p2) / se;
  return Math.round(normalCdf(z) * 1000) / 1000;
}

/** Which per-variant success count backs each winner metric. */
function metricSuccesses(
  metric: string,
  stats: { opened: number; clicked: number; replied: number },
): number {
  if (metric === "click_rate") return stats.clicked;
  if (metric === "reply_rate") return stats.replied;
  return stats.opened;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const abTestsRouter = new Hono();

// POST /v1/ab-tests — Create an A/B test
abTestsRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateABTestSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateABTestSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Validate that variant percentages sum to 100
    const totalPercentage = input.variants.reduce(
      (sum, v) => sum + v.percentage,
      0,
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Variant percentages must sum to 100, got ${totalPercentage}`,
            code: "invalid_percentages",
          },
        },
        400,
      );
    }

    const id = generateId();
    const now = new Date();

    const variants: ABTestVariant[] = input.variants.map((v) => ({
      id: generateId(),
      ...(v.subject !== undefined ? { subject: v.subject } : {}),
      ...(v.htmlBody !== undefined ? { htmlBody: v.htmlBody } : {}),
      ...(v.textBody !== undefined ? { textBody: v.textBody } : {}),
      percentage: v.percentage,
    }));

    await db.insert(abTests).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      status: "draft",
      variants,
      winnerMetric: input.winnerMetric,
      recipientCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          status: "draft",
          variants,
          winnerMetric: input.winnerMetric,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/ab-tests — List tests (paginated)
abTestsRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListABTestsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListABTestsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(abTests.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(abTests.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: abTests.id,
        name: abTests.name,
        status: abTests.status,
        variants: abTests.variants,
        recipientCount: abTests.recipientCount,
        winnerMetric: abTests.winnerMetric,
        startedAt: abTests.startedAt,
        completedAt: abTests.completedAt,
        createdAt: abTests.createdAt,
        updatedAt: abTests.updatedAt,
      })
      .from(abTests)
      .where(and(...conditions))
      .orderBy(desc(abTests.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]?.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        variants: row.variants,
        recipientCount: row.recipientCount,
        winnerMetric: row.winnerMetric,
        startedAt: row.startedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/ab-tests/:id — Get test with results
abTestsRouter.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [test] = await db
      .select()
      .from(abTests)
      .where(and(eq(abTests.id, id), eq(abTests.accountId, auth.accountId)))
      .limit(1);

    if (!test) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `A/B test ${id} not found`,
            code: "ab_test_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: test.id,
        name: test.name,
        status: test.status,
        variants: test.variants,
        recipientCount: test.recipientCount,
        winnerMetric: test.winnerMetric,
        autoSelectWinner: test.autoSelectWinner,
        results: test.results,
        startedAt: test.startedAt?.toISOString() ?? null,
        completedAt: test.completedAt?.toISOString() ?? null,
        createdAt: test.createdAt.toISOString(),
        updatedAt: test.updatedAt.toISOString(),
      },
    });
  },
);

// POST /v1/ab-tests/:id/start — Start the test
abTestsRouter.post(
  "/:id/start",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [test] = await db
      .select()
      .from(abTests)
      .where(and(eq(abTests.id, id), eq(abTests.accountId, auth.accountId)))
      .limit(1);

    if (!test) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `A/B test ${id} not found`,
            code: "ab_test_not_found",
          },
        },
        404,
      );
    }

    if (test.status !== "draft") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `A/B test is in "${test.status}" state, can only start from "draft"`,
            code: "ab_test_not_draft",
          },
        },
        409,
      );
    }

    const now = new Date();

    const initialResults: ABTestResults = {
      totalSent: 0,
      variants: Object.fromEntries(
        test.variants.map((v: ABTestVariant) => [
          v.id,
          { sent: 0, opened: 0, clicked: 0, replied: 0, openRate: 0, clickRate: 0 },
        ]),
      ),
    };

    await db
      .update(abTests)
      .set({
        status: "running",
        startedAt: now,
        results: initialResults,
        updatedAt: now,
      })
      .where(and(eq(abTests.id, id), eq(abTests.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        status: "running",
        startedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/ab-tests/:id/complete — Mark test complete, declare winner
abTestsRouter.post(
  "/:id/complete",
  requireScope("messages:write"),
  validateBody(CompleteABTestSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof CompleteABTestSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [test] = await db
      .select()
      .from(abTests)
      .where(and(eq(abTests.id, id), eq(abTests.accountId, auth.accountId)))
      .limit(1);

    if (!test) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `A/B test ${id} not found`,
            code: "ab_test_not_found",
          },
        },
        404,
      );
    }

    if (test.status !== "running") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `A/B test is in "${test.status}" state, can only complete from "running"`,
            code: "ab_test_not_running",
          },
        },
        409,
      );
    }

    const now = new Date();

    // Determine the winner: explicit winnerId from input, or auto-select by
    // the winner metric's observed rate (successes/sent, from real counts).
    let winnerId = input.winnerId;
    let confidence: number | null = null;

    if (!winnerId && test.results) {
      const results = test.results as ABTestResults;
      const ranked = Object.entries(results.variants)
        .map(([variantId, stats]) => ({
          variantId,
          successes: metricSuccesses(test.winnerMetric, stats),
          trials: stats.sent,
        }))
        .filter((v) => v.trials > 0)
        .sort((a, b) => b.successes / b.trials - a.successes / a.trials);

      const best = ranked[0];
      const runnerUp = ranked[1];
      if (best) {
        winnerId = best.variantId;
        // A real one-sided two-proportion z-test against the runner-up — or
        // no confidence value at all. The old code stored a constant 0.95
        // here with no significance test behind it (issue #166).
        if (runnerUp) {
          confidence = twoProportionConfidence(best, runnerUp);
        }
      }
    }
    // A manually-decreed winner (input.winnerId) is the user's decision, not a
    // statistical result — no confidence value is attached to it.

    const updatedResults: ABTestResults = {
      ...(test.results as ABTestResults | null) ?? {
        totalSent: 0,
        variants: {},
      },
      ...(winnerId !== undefined ? { winner: winnerId } : {}),
      ...(confidence !== null ? { confidence } : {}),
    };

    await db
      .update(abTests)
      .set({
        status: "completed",
        completedAt: now,
        results: updatedResults,
        updatedAt: now,
      })
      .where(and(eq(abTests.id, id), eq(abTests.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        status: "completed",
        winner: winnerId ?? null,
        // Null when no significance test could be run (manual winner, a
        // single variant with sends, or degenerate counts) — never a
        // made-up constant.
        confidence,
        completedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/ab-tests/:id — Delete test (only if draft)
abTestsRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [test] = await db
      .select({ id: abTests.id, status: abTests.status })
      .from(abTests)
      .where(and(eq(abTests.id, id), eq(abTests.accountId, auth.accountId)))
      .limit(1);

    if (!test) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `A/B test ${id} not found`,
            code: "ab_test_not_found",
          },
        },
        404,
      );
    }

    if (test.status !== "draft") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Cannot delete A/B test in "${test.status}" state, must be "draft"`,
            code: "ab_test_not_draft",
          },
        },
        409,
      );
    }

    await db
      .delete(abTests)
      .where(and(eq(abTests.id, id), eq(abTests.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

export { abTestsRouter };
