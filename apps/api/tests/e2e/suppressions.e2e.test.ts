/**
 * E2E Tests — Suppressions API
 *
 * POST   /v1/suppressions     — Add email to suppression list
 * GET    /v1/suppressions     — List suppressed emails
 * DELETE /v1/suppressions/:id — Remove from suppression list
 */

import { describe, it, expect } from "vitest";
import {
  authRequest,
  apiRequest,
  jsonBody,
  TEST_SUPPRESSION,
  uniqueId,
} from "./helpers.js";
import type { ApiError } from "./helpers.js";

describe("Suppressions API", () => {
  // We need a valid domain for suppressions. The domain must belong to the
  // authenticated account. In E2E tests, we first create a domain, then use
  // it for suppression operations.

  let testDomainName: string;
  let testDomainId: string;

  /**
   * Helper: ensure we have a domain to work with.
   */
  async function ensureDomain(): Promise<boolean> {
    if (testDomainId) return true;

    testDomainName = `e2e-sup-${uniqueId()}.test.example.com`;
    const res = await authRequest("POST", "/v1/domains", {
      body: { domain: testDomainName },
    });

    if (res.status === 201) {
      const body = await jsonBody<{ data: { id: string } }>(res);
      testDomainId = body.data.id;
      return true;
    }

    return false;
  }

  /**
   * Helper: create a suppression entry and return its id.
   */
  async function createSuppression(): Promise<{
    id: string;
    status: number;
  }> {
    const hasDomain = await ensureDomain();
    if (!hasDomain) return { id: "", status: 0 };

    const res = await authRequest("POST", "/v1/suppressions", {
      body: {
        email: `suppressed-${uniqueId()}@example.com`,
        domain: testDomainName,
        reason: "manual",
      },
    });

    const body = await jsonBody<{ data: { id: string } }>(res);
    return { id: body.data?.id ?? "", status: res.status };
  }

  // ─── POST /v1/suppressions ────────────────────────────────────────────────

  describe("POST /v1/suppressions", () => {
    it("should add an email to the suppression list", async () => {
      const hasDomain = await ensureDomain();
      if (!hasDomain) return;

      const email = `test-${uniqueId()}@example.com`;
      const res = await authRequest("POST", "/v1/suppressions", {
        body: {
          email,
          domain: testDomainName,
          reason: "manual",
        },
      });

      expect(res.status).toBe(201);

      const body = await jsonBody<{
        data: {
          id: string;
          email: string;
          domain: string;
          reason: string;
          createdAt: string;
        };
      }>(res);

      expect(body.data.id).toBeDefined();
      expect(body.data.email).toBe(email.toLowerCase());
      expect(body.data.domain).toBe(testDomainName);
      expect(body.data.reason).toBe("manual");
      expect(body.data.createdAt).toBeDefined();
    });

    it("should accept all valid reasons", async () => {
      const hasDomain = await ensureDomain();
      if (!hasDomain) return;

      for (const reason of ["bounce", "complaint", "unsubscribe", "manual"]) {
        const res = await authRequest("POST", "/v1/suppressions", {
          body: {
            email: `reason-${reason}-${uniqueId()}@example.com`,
            domain: testDomainName,
            reason,
          },
        });

        expect(res.status).toBe(201);
      }
    });

    it("should reject invalid email addresses", async () => {
      const hasDomain = await ensureDomain();
      if (!hasDomain) return;

      const res = await authRequest("POST", "/v1/suppressions", {
        body: {
          email: "not-an-email",
          domain: testDomainName,
          reason: "manual",
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject a domain not belonging to the account", async () => {
      const res = await authRequest("POST", "/v1/suppressions", {
        body: {
          email: "test@example.com",
          domain: "nonexistent-domain.example.com",
          reason: "manual",
        },
      });

      expect(res.status).toBe(422);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.code).toBe("domain_not_found");
    });

    it("should reject invalid reason values", async () => {
      const hasDomain = await ensureDomain();
      if (!hasDomain) return;

      const res = await authRequest("POST", "/v1/suppressions", {
        body: {
          email: "test@example.com",
          domain: testDomainName,
          reason: "invalid_reason",
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("POST", "/v1/suppressions", {
        body: TEST_SUPPRESSION,
      });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/suppressions ─────────────────────────────────────────────────

  describe("GET /v1/suppressions", () => {
    it("should return a paginated list of suppressions", async () => {
      const res = await authRequest("GET", "/v1/suppressions");

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          email: string;
          domain: string;
          reason: string;
          createdAt: string;
        }[];
        cursor: string | null;
        hasMore: boolean;
      }>(res);

      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.hasMore).toBe("boolean");
    });

    it("should respect the limit parameter", async () => {
      const res = await authRequest("GET", "/v1/suppressions", {
        query: { limit: "2" },
      });

      expect(res.status).toBe(200);
      const body = await jsonBody<{ data: unknown[] }>(res);
      expect(body.data.length).toBeLessThanOrEqual(2);
    });

    it("should filter by reason", async () => {
      // First create one with a specific reason
      await createSuppression();

      const res = await authRequest("GET", "/v1/suppressions", {
        query: { reason: "manual" },
      });

      expect(res.status).toBe(200);
      const body = await jsonBody<{
        data: { reason: string }[];
      }>(res);

      for (const entry of body.data) {
        expect(entry.reason).toBe("manual");
      }
    });

    it("should filter by domain", async () => {
      const hasDomain = await ensureDomain();
      if (!hasDomain) return;

      const res = await authRequest("GET", "/v1/suppressions", {
        query: { domain: testDomainName },
      });

      expect(res.status).toBe(200);
      const body = await jsonBody<{
        data: { domain: string }[];
      }>(res);

      for (const entry of body.data) {
        expect(entry.domain).toBe(testDomainName);
      }
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/suppressions");
      expect(res.status).toBe(401);
    });
  });

  // ─── DELETE /v1/suppressions/:id ──────────────────────────────────────────

  describe("DELETE /v1/suppressions/:id", () => {
    it("should remove a suppression entry", async () => {
      const { id, status } = await createSuppression();
      if (status !== 201) return;

      const res = await authRequest("DELETE", `/v1/suppressions/${id}`);

      expect(res.status).toBe(200);
      const body = await jsonBody<{ deleted: boolean; id: string }>(res);
      expect(body.deleted).toBe(true);
      expect(body.id).toBe(id);
    });

    it("should return 404 for a non-existent suppression", async () => {
      const res = await authRequest(
        "DELETE",
        "/v1/suppressions/nonexistent_suppression_id",
      );

      expect(res.status).toBe(404);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.code).toBe("suppression_not_found");
    });

    it("should be idempotent — second delete returns 404", async () => {
      const { id, status } = await createSuppression();
      if (status !== 201) return;

      await authRequest("DELETE", `/v1/suppressions/${id}`);
      const res = await authRequest("DELETE", `/v1/suppressions/${id}`);

      expect(res.status).toBe(404);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("DELETE", "/v1/suppressions/some_id");
      expect(res.status).toBe(401);
    });
  });
});
