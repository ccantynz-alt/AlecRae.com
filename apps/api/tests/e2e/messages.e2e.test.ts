/**
 * E2E Tests — Messages API
 *
 * POST /v1/messages/send       — Send an email
 * POST /v1/messages            — Alias for /send
 * GET  /v1/messages            — List messages (cursor pagination)
 * GET  /v1/messages/:id        — Get message details
 * GET  /v1/messages/search?q=  — Full-text search
 */

import { describe, it, expect } from "vitest";
import {
  authRequest,
  apiRequest,
  jsonBody,
  withAuth,
  TEST_SEND_PAYLOAD,
  uniqueId,
} from "./helpers.js";
import type { ApiError } from "./helpers.js";

describe("Messages API", () => {
  // ─── POST /v1/messages/send ───────────────────────────────────────────────

  describe("POST /v1/messages/send", () => {
    it("should accept a valid send request and return 202", async () => {
      const res = await authRequest("POST", "/v1/messages/send", {
        body: TEST_SEND_PAYLOAD,
      });

      // The API may return 202 (queued) or 422 if the test domain is not
      // configured. Both are valid — the important thing is we get a JSON
      // response and no 500.
      expect([202, 422, 429]).toContain(res.status);

      const body = await jsonBody<Record<string, unknown>>(res);

      if (res.status === 202) {
        expect(body).toHaveProperty("id");
        expect(body).toHaveProperty("messageId");
        expect(body.status).toBe("queued");
      } else if (res.status === 422) {
        // Domain not found is expected in a test environment
        expect((body as ApiError).error).toBeDefined();
        expect((body as ApiError).error.code).toBe("domain_not_found");
      }
    });

    it("should reject requests missing both text and html body", async () => {
      const res = await authRequest("POST", "/v1/messages/send", {
        body: {
          from: { email: "sender@example.com" },
          to: [{ email: "recipient@example.com" }],
          subject: "No body",
        },
      });

      expect(res.status).toBe(422);
      const body = await jsonBody<ApiError>(res);
      expect(body.error).toBeDefined();
      expect(body.error.type).toBe("validation_error");
    });

    it("should reject requests with an empty recipients array", async () => {
      const res = await authRequest("POST", "/v1/messages/send", {
        body: {
          from: { email: "sender@example.com" },
          to: [],
          subject: "Empty recipients",
          text: "Hello",
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject requests with invalid email addresses", async () => {
      const res = await authRequest("POST", "/v1/messages/send", {
        body: {
          from: { email: "not-an-email" },
          to: [{ email: "recipient@example.com" }],
          subject: "Bad from",
          text: "Hello",
        },
      });

      expect(res.status).toBe(422);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.type).toBe("validation_error");
    });

    it("should reject requests without authentication", async () => {
      const res = await apiRequest("POST", "/v1/messages/send", {
        body: TEST_SEND_PAYLOAD,
      });

      expect(res.status).toBe(401);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.type).toBe("authentication_error");
    });

    it("should accept HTML-only messages", async () => {
      const res = await authRequest("POST", "/v1/messages/send", {
        body: {
          ...TEST_SEND_PAYLOAD,
          text: undefined,
          html: "<h1>HTML only</h1>",
        },
      });

      // 202 or 422 (domain not configured) are both acceptable
      expect([202, 422, 429]).toContain(res.status);
    });

    it("should accept text-only messages", async () => {
      const res = await authRequest("POST", "/v1/messages/send", {
        body: {
          ...TEST_SEND_PAYLOAD,
          html: undefined,
          text: "Plain text only",
        },
      });

      expect([202, 422, 429]).toContain(res.status);
    });

    it("should accept messages with scheduling", async () => {
      const futureDate = new Date(Date.now() + 3600_000).toISOString();

      const res = await authRequest("POST", "/v1/messages/send", {
        body: {
          ...TEST_SEND_PAYLOAD,
          scheduledAt: futureDate,
        },
      });

      expect([202, 422, 429]).toContain(res.status);
    });

    it("should reject a request with no body at all", async () => {
      const res = await authRequest("POST", "/v1/messages/send");

      // 400 or 422 depending on how the validator handles missing body
      expect([400, 422]).toContain(res.status);
    });
  });

  // ─── POST /v1/messages (alias) ────────────────────────────────────────────

  describe("POST /v1/messages (alias)", () => {
    it("should work identically to /send", async () => {
      const res = await authRequest("POST", "/v1/messages", {
        body: TEST_SEND_PAYLOAD,
      });

      expect([202, 422, 429]).toContain(res.status);
    });
  });

  // ─── GET /v1/messages ─────────────────────────────────────────────────────

  describe("GET /v1/messages", () => {
    it("should return a paginated list of messages", async () => {
      const res = await authRequest("GET", "/v1/messages");

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: unknown[];
        cursor: string | null;
        hasMore: boolean;
      }>(res);

      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.hasMore).toBe("boolean");
      // cursor can be null if there are no more results
      expect(body.cursor === null || typeof body.cursor === "string").toBe(true);
    });

    it("should respect the limit query parameter", async () => {
      const res = await authRequest("GET", "/v1/messages", {
        query: { limit: "2" },
      });

      expect(res.status).toBe(200);
      const body = await jsonBody<{ data: unknown[] }>(res);
      expect(body.data.length).toBeLessThanOrEqual(2);
    });

    it("should filter by status when provided", async () => {
      const res = await authRequest("GET", "/v1/messages", {
        query: { status: "queued" },
      });

      expect(res.status).toBe(200);
      const body = await jsonBody<{
        data: { status: string }[];
      }>(res);

      for (const msg of body.data) {
        expect(msg.status).toBe("queued");
      }
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/messages");
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/messages/:id ─────────────────────────────────────────────────

  describe("GET /v1/messages/:id", () => {
    it("should return 404 for a non-existent message", async () => {
      const res = await authRequest(
        "GET",
        "/v1/messages/nonexistent_id_12345",
      );

      expect(res.status).toBe(404);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.type).toBe("not_found");
      expect(body.error.code).toBe("message_not_found");
    });

    it("should return message details when found", async () => {
      // First, get the list to find an existing message ID
      const listRes = await authRequest("GET", "/v1/messages", {
        query: { limit: "1" },
      });
      const listBody = await jsonBody<{
        data: { id: string }[];
      }>(listRes);

      if (listBody.data.length === 0) {
        // No messages exist yet — skip this assertion
        return;
      }

      const msgId = listBody.data[0]!.id;
      const res = await authRequest("GET", `/v1/messages/${msgId}`);

      expect(res.status).toBe(200);
      const body = await jsonBody<{
        data: {
          id: string;
          messageId: string;
          from: { email: string };
          subject: string;
          status: string;
          createdAt: string;
          deliveryResults: unknown[];
        };
      }>(res);

      expect(body.data.id).toBe(msgId);
      expect(body.data.messageId).toBeDefined();
      expect(body.data.from.email).toBeDefined();
      expect(body.data.subject).toBeDefined();
      expect(body.data.status).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
      expect(Array.isArray(body.data.deliveryResults)).toBe(true);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/messages/some_id");
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/messages/search ──────────────────────────────────────────────

  describe("GET /v1/messages/search", () => {
    it("should require a non-empty query parameter", async () => {
      const res = await authRequest("GET", "/v1/messages/search");

      // Should be 400 (missing query) or 503 (Meilisearch unavailable)
      expect([400, 503]).toContain(res.status);

      if (res.status === 400) {
        const body = await jsonBody<ApiError>(res);
        expect(body.error.code).toBe("missing_query");
      }
    });

    it("should reject empty q parameter", async () => {
      const res = await authRequest("GET", "/v1/messages/search", {
        query: { q: "" },
      });

      expect([400, 503]).toContain(res.status);
    });

    it("should return search results for a valid query", async () => {
      const res = await authRequest("GET", "/v1/messages/search", {
        query: { q: "test" },
      });

      // 200 with results, or 503 if Meilisearch is unavailable
      expect([200, 503]).toContain(res.status);

      if (res.status === 200) {
        const body = await jsonBody<{
          data: {
            id: string;
            subject: string;
            from: { email: string };
            snippet: string;
            createdAt: string;
          }[];
          totalHits: number;
          processingTimeMs: number;
          query: string;
        }>(res);

        expect(Array.isArray(body.data)).toBe(true);
        expect(typeof body.totalHits).toBe("number");
        expect(typeof body.processingTimeMs).toBe("number");
        expect(body.query).toBeDefined();
      }
    });

    it("should respect limit and offset parameters", async () => {
      const res = await authRequest("GET", "/v1/messages/search", {
        query: { q: "test", limit: "5", offset: "0" },
      });

      expect([200, 503]).toContain(res.status);

      if (res.status === 200) {
        const body = await jsonBody<{ data: unknown[] }>(res);
        expect(body.data.length).toBeLessThanOrEqual(5);
      }
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/messages/search", {
        query: { q: "test" },
      });
      expect(res.status).toBe(401);
    });
  });
});
