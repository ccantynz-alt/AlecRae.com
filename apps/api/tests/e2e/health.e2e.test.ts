/**
 * E2E Tests — Health Endpoints
 *
 * GET /health          — Simple liveness probe (no auth)
 * GET /v1/health       — Deep health check with dependency status (no auth)
 */

import { describe, it, expect } from "vitest";
import { apiRequest, jsonBody, BASE_URL } from "./helpers.js";

describe("Health endpoints", () => {
  // ─── GET /health ──────────────────────────────────────────────────────────

  describe("GET /health", () => {
    it("should return 200 with service info", async () => {
      const res = await apiRequest("GET", "/health");

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        status: string;
        service: string;
        version: string;
        timestamp: string;
      }>(res);

      expect(body.status).toBe("ok");
      expect(body.service).toBe("alecrae-api");
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
      // timestamp should be a valid ISO date
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });

    it("should not require authentication", async () => {
      // No API key, no auth header — should still work
      const res = await apiRequest("GET", "/health");
      expect(res.status).toBe(200);
    });
  });

  // ─── GET /v1/health (deep check) ─────────────────────────────────────────

  describe("GET /v1/health", () => {
    it("should return service health with dependency statuses", async () => {
      const res = await apiRequest("GET", "/v1/health");

      // Should be 200 (ok/degraded) or 503 (all down) — never 401/404
      expect([200, 503]).toContain(res.status);

      const body = await jsonBody<{
        status: string;
        version: string;
        uptime: number;
        timestamp: string;
        services: {
          database: { status: string; latencyMs?: number; error?: string };
          redis: { status: string; latencyMs?: number; error?: string };
          mta: { status: string; latencyMs?: number; error?: string };
        };
      }>(res);

      // Top-level fields
      expect(["ok", "degraded", "down"]).toContain(body.status);
      expect(body.version).toBeDefined();
      expect(typeof body.uptime).toBe("number");
      expect(body.timestamp).toBeDefined();

      // Services block must exist with the expected keys
      expect(body.services).toBeDefined();
      expect(body.services.database).toBeDefined();
      expect(body.services.redis).toBeDefined();
      expect(body.services.mta).toBeDefined();

      // Each service should have at least a status field
      for (const svc of Object.values(body.services)) {
        expect(["ok", "degraded", "down"]).toContain(svc.status);
      }
    });

    it("should not require authentication", async () => {
      const res = await apiRequest("GET", "/v1/health");
      expect([200, 503]).toContain(res.status);
    });

    it("should include latency measurements for healthy services", async () => {
      const res = await apiRequest("GET", "/v1/health");
      const body = await jsonBody<{
        services: Record<string, { status: string; latencyMs?: number }>;
      }>(res);

      for (const svc of Object.values(body.services)) {
        if (svc.status === "ok") {
          expect(typeof svc.latencyMs).toBe("number");
          expect(svc.latencyMs).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});
