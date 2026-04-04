/**
 * Warm-up Routes — Domain IP/Sending Warm-up Management
 *
 * POST   /v1/domains/:id/warmup/start   — Start warm-up with selected schedule
 * GET    /v1/domains/:id/warmup/status   — Get warm-up progress
 * POST   /v1/domains/:id/warmup/pause    — Pause warm-up
 * POST   /v1/domains/:id/warmup/resume   — Resume warm-up
 * POST   /v1/domains/:id/warmup/cancel   — Cancel warm-up
 * GET    /v1/domains/:id/warmup/report   — Get warm-up health report
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getWarmupOrchestrator,
  type WarmupScheduleType,
} from "@emailed/reputation";
import { getWarmupMonitor } from "@emailed/reputation";

// ─── Schemas ───────────────────────────────────────────────────────────────

const StartWarmupSchema = z.object({
  schedule: z.enum(["conservative", "moderate", "aggressive"]).default("conservative"),
});

type StartWarmupInput = z.infer<typeof StartWarmupSchema>;

// ─── Route handler ─────────────────────────────────────────────────────────

const warmup = new Hono();

// POST /start — Start warm-up for a domain
warmup.post(
  "/start",
  requireScope("domains:manage"),
  validateBody(StartWarmupSchema),
  async (c) => {
    const domainId = c.req.param("id");
    const input = getValidatedBody<StartWarmupInput>(c);
    const auth = c.get("auth");

    const orchestrator = getWarmupOrchestrator();
    const result = await orchestrator.startWarmup(
      domainId,
      auth.accountId,
      input.schedule as WarmupScheduleType,
    );

    if (!result.ok) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: result.error,
            code: "warmup_start_failed",
          },
        },
        422,
      );
    }

    return c.json(
      {
        data: result.value,
        message: `Warm-up started with ${input.schedule} schedule. Daily sending limits will gradually increase.`,
      },
      201,
    );
  },
);

// GET /status — Get warm-up status
warmup.get(
  "/status",
  requireScope("domains:manage"),
  async (c) => {
    const domainId = c.req.param("id");

    const orchestrator = getWarmupOrchestrator();
    const result = await orchestrator.checkWarmupStatus(domainId);

    if (!result.ok) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: result.error,
            code: "warmup_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: result.value });
  },
);

// POST /pause — Pause warm-up
warmup.post(
  "/pause",
  requireScope("domains:manage"),
  async (c) => {
    const domainId = c.req.param("id");

    const orchestrator = getWarmupOrchestrator();
    const result = await orchestrator.pauseWarmup(domainId);

    if (!result.ok) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: result.error,
            code: "warmup_pause_failed",
          },
        },
        422,
      );
    }

    return c.json({
      data: result.value,
      message: "Warm-up paused. No emails will be sent during warm-up pause. Use POST .../resume to continue.",
    });
  },
);

// POST /resume — Resume warm-up
warmup.post(
  "/resume",
  requireScope("domains:manage"),
  async (c) => {
    const domainId = c.req.param("id");

    const orchestrator = getWarmupOrchestrator();
    const result = await orchestrator.resumeWarmup(domainId);

    if (!result.ok) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: result.error,
            code: "warmup_resume_failed",
          },
        },
        422,
      );
    }

    return c.json({
      data: result.value,
      message: "Warm-up resumed. Sending limits will continue from the current schedule position.",
    });
  },
);

// POST /cancel — Cancel warm-up
warmup.post(
  "/cancel",
  requireScope("domains:manage"),
  async (c) => {
    const domainId = c.req.param("id");

    const orchestrator = getWarmupOrchestrator();
    const result = await orchestrator.cancelWarmup(domainId);

    if (!result.ok) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: result.error,
            code: "warmup_cancel_failed",
          },
        },
        422,
      );
    }

    return c.json({
      data: result.value,
      message: "Warm-up cancelled. Domain sending limits are no longer restricted by warm-up.",
    });
  },
);

// GET /report — Get warm-up health report
warmup.get(
  "/report",
  requireScope("domains:manage"),
  async (c) => {
    const domainId = c.req.param("id");

    const monitor = getWarmupMonitor();
    const report = await monitor.generateReport(domainId);

    if (!report) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No active warm-up session or domain not found",
            code: "warmup_report_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: report });
  },
);

export { warmup };
