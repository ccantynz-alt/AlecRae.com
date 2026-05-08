/**
 * Flywheel signal ingestion + metric retrieval routes (F4).
 *
 * POST /v1/flywheel/signal   — record one or many AI signals (compose,
 *                              triage, smart_reply, voice_profile,
 *                              phishing, search, inbox_agent, voice_clone)
 * GET  /v1/flywheel/metrics  — per-account aggregate snapshot (last 12 weeks)
 * GET  /v1/flywheel/me       — per-user "Your AlecRae" stats
 * GET  /v1/flywheel/global   — admin-only cross-account snapshot
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, flywheelSignals } from "@alecrae/db";
import {
  SignalPayloadSchema,
  aggregateSnapshot,
  aggregateUserStats,
  type RawSignal,
  type SignalPayload,
} from "@alecrae/flywheel";

// ─── Schemas ───────────────────────────────────────────────────────────────

const SignalIngestSchema = z.object({
  signals: z
    .array(
      z.object({
        payload: SignalPayloadSchema,
        capturedAtIso: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(100),
});

type SignalIngestInput = z.infer<typeof SignalIngestSchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────

const WINDOW_DAYS = 12 * 7;

function rowsToRaw(
  rows: ReadonlyArray<{
    id: string;
    userId: string | null;
    payload: unknown;
    capturedAt: Date;
  }>,
): RawSignal[] {
  const out: RawSignal[] = [];
  for (const r of rows) {
    const parsed = SignalPayloadSchema.safeParse(r.payload);
    if (!parsed.success) continue;
    out.push({
      id: r.id,
      userId: r.userId,
      capturedAtIso: r.capturedAt.toISOString(),
      payload: parsed.data as SignalPayload,
    });
  }
  return out;
}

// ─── Router ────────────────────────────────────────────────────────────────

const flywheel = new Hono();

// POST /signal — ingest
flywheel.post(
  "/signal",
  requireScope("flywheel:write"),
  validateBody(SignalIngestSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<SignalIngestInput>(c);
    const db = getDatabase();

    const rows = body.signals.map((s) => ({
      accountId: auth.accountId,
      userId: auth.userId ?? null,
      category: s.payload.category,
      event: s.payload.event,
      payload: s.payload,
      capturedAt: s.capturedAtIso ? new Date(s.capturedAtIso) : new Date(),
    }));

    await db.insert(flywheelSignals).values(rows);
    return c.json({ ok: true, recorded: rows.length });
  },
);

// GET /metrics — per-account snapshot
flywheel.get("/metrics", requireScope("flywheel:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const rows = await db
    .select({
      id: flywheelSignals.id,
      userId: flywheelSignals.userId,
      payload: flywheelSignals.payload,
      capturedAt: flywheelSignals.capturedAt,
    })
    .from(flywheelSignals)
    .where(
      and(
        eq(flywheelSignals.accountId, auth.accountId),
        gte(flywheelSignals.capturedAt, cutoff),
      ),
    );

  const snapshot = aggregateSnapshot(rowsToRaw(rows), {
    now: new Date(),
    windowDays: WINDOW_DAYS,
  });
  return c.json(snapshot);
});

// GET /me — per-user view
flywheel.get("/me", requireScope("flywheel:read"), async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json(
      { error: { type: "auth", message: "User context required", code: "no_user" } },
      400,
    );
  }
  const db = getDatabase();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const rows = await db
    .select({
      id: flywheelSignals.id,
      userId: flywheelSignals.userId,
      payload: flywheelSignals.payload,
      capturedAt: flywheelSignals.capturedAt,
    })
    .from(flywheelSignals)
    .where(
      and(
        eq(flywheelSignals.userId, auth.userId),
        gte(flywheelSignals.capturedAt, cutoff),
      ),
    );

  const stats = aggregateUserStats(rowsToRaw(rows), {
    now: new Date(),
    userId: auth.userId,
  });
  return c.json(stats);
});

// GET /global — admin-only cross-account snapshot
flywheel.get("/global", requireScope("admin:read"), async (c) => {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const rows = await db
    .select({
      id: flywheelSignals.id,
      userId: flywheelSignals.userId,
      payload: flywheelSignals.payload,
      capturedAt: flywheelSignals.capturedAt,
    })
    .from(flywheelSignals)
    .where(gte(flywheelSignals.capturedAt, cutoff));

  const snapshot = aggregateSnapshot(rowsToRaw(rows), {
    now: new Date(),
    windowDays: WINDOW_DAYS,
  });
  return c.json(snapshot);
});

export { flywheel };
