/**
 * E2E Tests — Domains API
 *
 * POST   /v1/domains              — Register a new domain
 * GET    /v1/domains              — List domains
 * GET    /v1/domains/:id          — Get domain details
 * POST   /v1/domains/:id/verify   — Trigger DNS verification
 * GET    /v1/domains/:id/dns      — Get DNS records
 * GET    /v1/domains/:id/health   — Get domain health report
 * POST   /v1/domains/:id/rotate-dkim — Rotate DKIM keys
 * DELETE /v1/domains/:id          — Remove a domain
 */

import { describe, it, expect } from "vitest";
import {
  authRequest,
  apiRequest,
  jsonBody,
  uniqueId,
} from "./helpers.js";
import type { ApiError } from "./helpers.js";

describe("Domains API", () => {
  /**
   * Helper: create a domain and return its id.
   */
  async function createDomain(): Promise<{
    id: string;
    domain: string;
    status: number;
  }> {
    const domain = `e2e-${uniqueId()}.test.example.com`;
    const res = await authRequest("POST", "/v1/domains", {
      body: { domain },
    });
    const body = await jsonBody<{ data: { id: string } }>(res);
    return { id: body.data?.id, domain, status: res.status };
  }

  // ─── POST /v1/domains ────────────────────────────────────────────────────

  describe("POST /v1/domains", () => {
    it("should register a new domain and return 201", async () => {
      const domain = `e2e-${uniqueId()}.test.example.com`;
      const res = await authRequest("POST", "/v1/domains", {
        body: { domain },
      });

      expect(res.status).toBe(201);

      const body = await jsonBody<{
        data: {
          id: string;
          domain: string;
          status: string;
          dkimSelector: string;
          spfVerified: boolean;
          dkimVerified: boolean;
          dmarcVerified: boolean;
          returnPathVerified: boolean;
          isActive: boolean;
          createdAt: string;
          dnsRecords: {
            type: string;
            name: string;
            value: string;
            ttl: number;
          }[];
        };
        message: string;
      }>(res);

      expect(body.data.id).toBeDefined();
      expect(body.data.domain).toBe(domain);
      expect(body.data.status).toBe("pending");
      expect(body.data.dkimSelector).toBeDefined();
      expect(body.data.spfVerified).toBe(false);
      expect(body.data.dkimVerified).toBe(false);
      expect(body.data.isActive).toBe(false);
      expect(Array.isArray(body.data.dnsRecords)).toBe(true);
      expect(body.data.dnsRecords.length).toBeGreaterThan(0);
      expect(body.message).toContain("DNS records");
    });

    it("should reject a duplicate domain with 409", async () => {
      const { domain, status } = await createDomain();
      if (status !== 201) return;

      const res = await authRequest("POST", "/v1/domains", {
        body: { domain },
      });

      expect(res.status).toBe(409);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.code).toBe("domain_exists");
    });

    it("should reject invalid domain formats", async () => {
      const res = await authRequest("POST", "/v1/domains", {
        body: { domain: "not a domain" },
      });

      expect(res.status).toBe(422);
    });

    it("should reject empty domain", async () => {
      const res = await authRequest("POST", "/v1/domains", {
        body: { domain: "" },
      });

      expect(res.status).toBe(422);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("POST", "/v1/domains", {
        body: { domain: "test.example.com" },
      });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/domains ─────────────────────────────────────────────────────

  describe("GET /v1/domains", () => {
    it("should return a list of domains", async () => {
      const res = await authRequest("GET", "/v1/domains");

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          domain: string;
          status: string;
          isActive: boolean;
          createdAt: string;
        }[];
      }>(res);

      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/domains");
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/domains/:id ─────────────────────────────────────────────────

  describe("GET /v1/domains/:id", () => {
    it("should return domain details with DNS records", async () => {
      const { id, domain, status } = await createDomain();
      if (status !== 201) return;

      const res = await authRequest("GET", `/v1/domains/${id}`);

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          domain: string;
          status: string;
          dkimSelector: string;
          spfVerified: boolean;
          dkimVerified: boolean;
          dmarcVerified: boolean;
          isActive: boolean;
          createdAt: string;
          updatedAt: string;
          dnsRecords: unknown[];
        };
      }>(res);

      expect(body.data.id).toBe(id);
      expect(body.data.domain).toBe(domain);
      expect(Array.isArray(body.data.dnsRecords)).toBe(true);
    });

    it("should return 404 for a non-existent domain", async () => {
      const res = await authRequest(
        "GET",
        "/v1/domains/nonexistent_domain_id",
      );

      expect(res.status).toBe(404);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.code).toBe("domain_not_found");
    });
  });

  // ─── POST /v1/domains/:id/verify ─────────────────────────────────────────

  describe("POST /v1/domains/:id/verify", () => {
    it("should trigger verification and return results", async () => {
      const { id, status } = await createDomain();
      if (status !== 201) return;

      const res = await authRequest("POST", `/v1/domains/${id}/verify`);

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          domain: string;
          status: string;
          verification: {
            overall: string;
            spf: unknown;
            dkim: unknown;
            dmarc: unknown;
          };
          dnsRecords: unknown[];
        };
        message: string;
      }>(res);

      expect(body.data.id).toBe(id);
      expect(body.data.verification).toBeDefined();
      expect(body.message).toBeDefined();
    });

    it("should return 404 for a non-existent domain", async () => {
      const res = await authRequest(
        "POST",
        "/v1/domains/nonexistent_id/verify",
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /v1/domains/:id/dns ──────────────────────────────────────────────

  describe("GET /v1/domains/:id/dns", () => {
    it("should return DNS records for the domain", async () => {
      const { id, domain, status } = await createDomain();
      if (status !== 201) return;

      const res = await authRequest("GET", `/v1/domains/${id}/dns`);

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          domain: string;
          records: {
            type: string;
            name: string;
            value: string;
            ttl: number;
          }[];
        };
      }>(res);

      expect(body.data.domain).toBe(domain);
      expect(Array.isArray(body.data.records)).toBe(true);
    });

    it("should return 404 for a non-existent domain", async () => {
      const res = await authRequest(
        "GET",
        "/v1/domains/nonexistent_id/dns",
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /v1/domains/:id/health ───────────────────────────────────────────

  describe("GET /v1/domains/:id/health", () => {
    it("should return a health report for the domain", async () => {
      const { id, status } = await createDomain();
      if (status !== 201) return;

      const res = await authRequest("GET", `/v1/domains/${id}/health`);

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          domain: string;
          score: number;
          recommendations: string[];
          verification: {
            overall: string;
          };
        };
      }>(res);

      expect(body.data.domain).toBeDefined();
      expect(typeof body.data.score).toBe("number");
      expect(Array.isArray(body.data.recommendations)).toBe(true);
    });

    it("should return 404 for a non-existent domain", async () => {
      const res = await authRequest(
        "GET",
        "/v1/domains/nonexistent_id/health",
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /v1/domains/:id/rotate-dkim ────────────────────────────────────

  describe("POST /v1/domains/:id/rotate-dkim", () => {
    it("should rotate DKIM keys and return new selector", async () => {
      const { id, domain, status } = await createDomain();
      if (status !== 201) return;

      const res = await authRequest(
        "POST",
        `/v1/domains/${id}/rotate-dkim`,
      );

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          domain: string;
          oldSelector: string;
          newSelector: string;
          dnsRecord: {
            type: string;
            name: string;
            value: string;
            ttl: number;
          };
        };
        message: string;
      }>(res);

      expect(body.data.domain).toBe(domain);
      expect(body.data.oldSelector).toBeDefined();
      expect(body.data.newSelector).toBeDefined();
      expect(body.data.dnsRecord).toBeDefined();
      expect(body.message).toContain("DKIM key rotated");
    });

    it("should return 404 for a non-existent domain", async () => {
      const res = await authRequest(
        "POST",
        "/v1/domains/nonexistent_id/rotate-dkim",
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /v1/domains/:id ───────────────────────────────────────────────

  describe("DELETE /v1/domains/:id", () => {
    it("should delete a domain", async () => {
      const { id, status } = await createDomain();
      if (status !== 201) return;

      const res = await authRequest("DELETE", `/v1/domains/${id}`);

      expect(res.status).toBe(200);
      const body = await jsonBody<{ deleted: boolean; id: string }>(res);
      expect(body.deleted).toBe(true);
      expect(body.id).toBe(id);

      // Verify the domain is gone
      const getRes = await authRequest("GET", `/v1/domains/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("should return 404 when deleting a non-existent domain", async () => {
      const res = await authRequest(
        "DELETE",
        "/v1/domains/nonexistent_domain_id",
      );

      expect(res.status).toBe(404);
    });
  });
});
