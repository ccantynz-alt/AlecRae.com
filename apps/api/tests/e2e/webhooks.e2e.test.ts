/**
 * E2E Tests — Webhooks API
 *
 * POST   /v1/webhooks              — Create a webhook endpoint
 * GET    /v1/webhooks              — List webhooks
 * GET    /v1/webhooks/:id          — Get webhook details
 * PATCH  /v1/webhooks/:id          — Update a webhook
 * DELETE /v1/webhooks/:id          — Delete a webhook
 * POST   /v1/webhooks/:id/test     — Send a test event
 * GET    /v1/webhooks/:id/deliveries — List delivery attempts
 */

import { describe, it, expect } from "vitest";
import {
  authRequest,
  apiRequest,
  jsonBody,
  TEST_WEBHOOK,
  uniqueId,
} from "./helpers.js";
import type { ApiError } from "./helpers.js";

describe("Webhooks API", () => {
  /**
   * Helper: create a webhook and return its id.
   */
  async function createWebhook(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; status: number }> {
    const payload = {
      ...TEST_WEBHOOK,
      url: `https://webhook-${uniqueId()}.e2e-test.example.com/events`,
      ...overrides,
    };

    const res = await authRequest("POST", "/v1/webhooks", { body: payload });
    const body = await jsonBody<{ data: { id: string } }>(res);
    return { id: body.data?.id ?? "", status: res.status };
  }

  // ─── POST /v1/webhooks ───────────────────────────────────────────────────

  describe("POST /v1/webhooks", () => {
    it("should create a webhook and return 201", async () => {
      const url = `https://webhook-${uniqueId()}.e2e-test.example.com/events`;
      const res = await authRequest("POST", "/v1/webhooks", {
        body: {
          ...TEST_WEBHOOK,
          url,
        },
      });

      expect(res.status).toBe(201);

      const body = await jsonBody<{
        data: {
          id: string;
          url: string;
          events: string[];
          secret: string;
          description: string | null;
          active: boolean;
          createdAt: string;
          updatedAt: string;
        };
      }>(res);

      expect(body.data.id).toBeDefined();
      expect(body.data.url).toBe(url);
      expect(body.data.events).toEqual(
        expect.arrayContaining(["delivered", "bounced"]),
      );
      // Secret should be masked in response
      expect(body.data.secret).toContain("••••");
      expect(body.data.active).toBe(true);
      expect(body.data.description).toBe(TEST_WEBHOOK.description);
      expect(body.data.createdAt).toBeDefined();
    });

    it("should reject a webhook with an invalid URL", async () => {
      const res = await authRequest("POST", "/v1/webhooks", {
        body: {
          ...TEST_WEBHOOK,
          url: "not-a-url",
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject a webhook with no events", async () => {
      const res = await authRequest("POST", "/v1/webhooks", {
        body: {
          url: "https://example.com/hook",
          events: [],
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject a webhook with invalid event types", async () => {
      const res = await authRequest("POST", "/v1/webhooks", {
        body: {
          url: "https://example.com/hook",
          events: ["invalid_event"],
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("POST", "/v1/webhooks", {
        body: TEST_WEBHOOK,
      });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/webhooks ────────────────────────────────────────────────────

  describe("GET /v1/webhooks", () => {
    it("should return a list of webhooks", async () => {
      const res = await authRequest("GET", "/v1/webhooks");

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          url: string;
          events: string[];
          secret: string;
          active: boolean;
          createdAt: string;
        }[];
      }>(res);

      expect(Array.isArray(body.data)).toBe(true);

      // All secrets should be masked
      for (const wh of body.data) {
        expect(wh.secret).toContain("••••");
      }
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/webhooks");
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/webhooks/:id ────────────────────────────────────────────────

  describe("GET /v1/webhooks/:id", () => {
    it("should return webhook details", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const res = await authRequest("GET", `/v1/webhooks/${id}`);

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          url: string;
          events: string[];
          secret: string;
          description: string | null;
          active: boolean;
          createdAt: string;
          updatedAt: string;
        };
      }>(res);

      expect(body.data.id).toBe(id);
      expect(body.data.url).toBeDefined();
      expect(body.data.events).toBeDefined();
      expect(body.data.secret).toContain("••••");
    });

    it("should return 404 for a non-existent webhook", async () => {
      const res = await authRequest(
        "GET",
        "/v1/webhooks/nonexistent_webhook_id",
      );

      expect(res.status).toBe(404);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.code).toBe("webhook_not_found");
    });
  });

  // ─── PATCH /v1/webhooks/:id ──────────────────────────────────────────────

  describe("PATCH /v1/webhooks/:id", () => {
    it("should update a webhook URL", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const newUrl = `https://updated-${uniqueId()}.example.com/events`;
      const res = await authRequest("PATCH", `/v1/webhooks/${id}`, {
        body: { url: newUrl },
      });

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: { id: string; url: string };
      }>(res);

      expect(body.data.id).toBe(id);
      expect(body.data.url).toBe(newUrl);
    });

    it("should update webhook events", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const res = await authRequest("PATCH", `/v1/webhooks/${id}`, {
        body: { events: ["opened", "clicked"] },
      });

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: { events: string[] };
      }>(res);

      expect(body.data.events).toEqual(
        expect.arrayContaining(["opened", "clicked"]),
      );
    });

    it("should toggle webhook active status", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const res = await authRequest("PATCH", `/v1/webhooks/${id}`, {
        body: { active: false },
      });

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: { active: boolean };
      }>(res);

      expect(body.data.active).toBe(false);
    });

    it("should return 404 for a non-existent webhook", async () => {
      const res = await authRequest(
        "PATCH",
        "/v1/webhooks/nonexistent_webhook_id",
        { body: { active: false } },
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /v1/webhooks/:id ─────────────────────────────────────────────

  describe("DELETE /v1/webhooks/:id", () => {
    it("should delete a webhook", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const res = await authRequest("DELETE", `/v1/webhooks/${id}`);

      expect(res.status).toBe(200);
      const body = await jsonBody<{ deleted: boolean; id: string }>(res);
      expect(body.deleted).toBe(true);
      expect(body.id).toBe(id);

      // Verify the webhook is gone
      const getRes = await authRequest("GET", `/v1/webhooks/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("should return 404 when deleting a non-existent webhook", async () => {
      const res = await authRequest(
        "DELETE",
        "/v1/webhooks/nonexistent_webhook_id",
      );

      expect(res.status).toBe(404);
    });

    it("should be idempotent — second delete returns 404", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      await authRequest("DELETE", `/v1/webhooks/${id}`);
      const res = await authRequest("DELETE", `/v1/webhooks/${id}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /v1/webhooks/:id/test ──────────────────────────────────────────

  describe("POST /v1/webhooks/:id/test", () => {
    it("should send a test event via the webhook pipeline", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const res = await authRequest("POST", `/v1/webhooks/${id}/test`);

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          success: boolean;
          eventId: string;
          eventType: string;
          message: string;
        };
      }>(res);

      expect(body.data.success).toBe(true);
      expect(body.data.eventId).toBeDefined();
      expect(body.data.eventType).toBeDefined();
      expect(body.data.message).toContain("enqueued");
    });

    it("should return 404 for a non-existent webhook", async () => {
      const res = await authRequest(
        "POST",
        "/v1/webhooks/nonexistent_webhook_id/test",
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /v1/webhooks/:id/deliveries ─────────────────────────────────────

  describe("GET /v1/webhooks/:id/deliveries", () => {
    it("should return delivery attempts for a webhook", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const res = await authRequest(
        "GET",
        `/v1/webhooks/${id}/deliveries`,
      );

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          eventId: string;
          statusCode: number | null;
          success: boolean;
          attemptCount: number;
          createdAt: string;
        }[];
        limit: number;
        offset: number;
      }>(res);

      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.limit).toBe("number");
      expect(typeof body.offset).toBe("number");
    });

    it("should respect limit and offset parameters", async () => {
      const { id, status } = await createWebhook();
      if (status !== 201) return;

      const res = await authRequest(
        "GET",
        `/v1/webhooks/${id}/deliveries`,
        { query: { limit: "5", offset: "0" } },
      );

      expect(res.status).toBe(200);
      const body = await jsonBody<{ data: unknown[]; limit: number }>(res);
      expect(body.data.length).toBeLessThanOrEqual(5);
    });

    it("should return 404 for a non-existent webhook", async () => {
      const res = await authRequest(
        "GET",
        "/v1/webhooks/nonexistent_webhook_id/deliveries",
      );

      expect(res.status).toBe(404);
    });
  });
});
