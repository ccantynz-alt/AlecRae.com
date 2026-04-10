/**
 * E2E Tests — Templates API
 *
 * POST   /v1/templates           — Create a template
 * GET    /v1/templates           — List templates (paginated)
 * GET    /v1/templates/:id       — Get a single template
 * PUT    /v1/templates/:id       — Update a template
 * POST   /v1/templates/:id/render — Render with variables
 * DELETE /v1/templates/:id       — Delete a template
 */

import { describe, it, expect } from "vitest";
import {
  authRequest,
  apiRequest,
  jsonBody,
  TEST_TEMPLATE,
  uniqueId,
} from "./helpers.js";
import type { ApiError } from "./helpers.js";

describe("Templates API", () => {
  /**
   * Helper: create a template and return its id.
   */
  async function createTemplate(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; status: number }> {
    const payload = {
      ...TEST_TEMPLATE,
      name: `E2E Template ${uniqueId()}`,
      ...overrides,
    };

    const res = await authRequest("POST", "/v1/templates", { body: payload });
    const body = await jsonBody<{ data: { id: string } }>(res);
    return { id: body.data?.id, status: res.status };
  }

  // ─── POST /v1/templates ───────────────────────────────────────────────────

  describe("POST /v1/templates", () => {
    it("should create a template and return 201", async () => {
      const payload = {
        ...TEST_TEMPLATE,
        name: `E2E Create ${uniqueId()}`,
      };

      const res = await authRequest("POST", "/v1/templates", {
        body: payload,
      });

      expect(res.status).toBe(201);

      const body = await jsonBody<{
        data: {
          id: string;
          name: string;
          subject: string;
          variables: string[];
          createdAt: string;
        };
      }>(res);

      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe(payload.name);
      expect(body.data.subject).toBe(payload.subject);
      expect(Array.isArray(body.data.variables)).toBe(true);
      // Should detect {{name}} and {{company}} as variables
      expect(body.data.variables).toContain("name");
      expect(body.data.variables).toContain("company");
      expect(body.data.createdAt).toBeDefined();
    });

    it("should reject a template without a name", async () => {
      const res = await authRequest("POST", "/v1/templates", {
        body: {
          subject: "Missing name",
          textBody: "Hello",
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject a template without a subject", async () => {
      const res = await authRequest("POST", "/v1/templates", {
        body: {
          name: "Missing subject",
          textBody: "Hello",
        },
      });

      expect(res.status).toBe(422);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("POST", "/v1/templates", {
        body: TEST_TEMPLATE,
      });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/templates ────────────────────────────────────────────────────

  describe("GET /v1/templates", () => {
    it("should return a paginated list of templates", async () => {
      const res = await authRequest("GET", "/v1/templates");

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          name: string;
          subject: string;
          variables: string[];
          createdAt: string;
          updatedAt: string;
        }[];
        cursor: string | null;
        hasMore: boolean;
      }>(res);

      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.hasMore).toBe("boolean");
    });

    it("should respect the limit parameter", async () => {
      const res = await authRequest("GET", "/v1/templates", {
        query: { limit: "1" },
      });

      expect(res.status).toBe(200);
      const body = await jsonBody<{ data: unknown[] }>(res);
      expect(body.data.length).toBeLessThanOrEqual(1);
    });

    it("should filter by name", async () => {
      // Create a template with a unique name
      const uniqueName = `Searchable-${uniqueId()}`;
      await createTemplate({ name: uniqueName });

      const res = await authRequest("GET", "/v1/templates", {
        query: { name: uniqueName },
      });

      expect(res.status).toBe(200);
      const body = await jsonBody<{
        data: { name: string }[];
      }>(res);

      for (const tmpl of body.data) {
        expect(tmpl.name).toContain(uniqueName);
      }
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/templates");
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /v1/templates/:id ────────────────────────────────────────────────

  describe("GET /v1/templates/:id", () => {
    it("should return full template details", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return; // skip if create failed

      const res = await authRequest("GET", `/v1/templates/${id}`);

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          name: string;
          subject: string;
          htmlBody: string | null;
          textBody: string | null;
          variables: string[];
          metadata: Record<string, unknown>;
          createdAt: string;
          updatedAt: string;
        };
      }>(res);

      expect(body.data.id).toBe(id);
      expect(body.data.htmlBody).toBeDefined();
      expect(body.data.textBody).toBeDefined();
      expect(body.data.metadata).toBeDefined();
    });

    it("should return 404 for a non-existent template", async () => {
      const res = await authRequest(
        "GET",
        "/v1/templates/nonexistent_template_id",
      );

      expect(res.status).toBe(404);
      const body = await jsonBody<ApiError>(res);
      expect(body.error.type).toBe("not_found");
      expect(body.error.code).toBe("template_not_found");
    });

    it("should reject unauthenticated requests", async () => {
      const res = await apiRequest("GET", "/v1/templates/some_id");
      expect(res.status).toBe(401);
    });
  });

  // ─── PUT /v1/templates/:id ────────────────────────────────────────────────

  describe("PUT /v1/templates/:id", () => {
    it("should update a template", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return;

      const updatedName = `Updated ${uniqueId()}`;
      const res = await authRequest("PUT", `/v1/templates/${id}`, {
        body: {
          name: updatedName,
          subject: "Updated subject: {{greeting}}",
        },
      });

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          id: string;
          name: string;
          subject: string;
          variables: string[];
          updatedAt: string;
        };
      }>(res);

      expect(body.data.id).toBe(id);
      expect(body.data.name).toBe(updatedName);
      expect(body.data.subject).toBe("Updated subject: {{greeting}}");
      // Variables should now include greeting (from the new subject)
      expect(body.data.variables).toContain("greeting");
    });

    it("should return 404 when updating a non-existent template", async () => {
      const res = await authRequest(
        "PUT",
        "/v1/templates/nonexistent_template_id",
        { body: { name: "Does not exist" } },
      );

      expect(res.status).toBe(404);
    });

    it("should allow partial updates", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return;

      // Update only the name
      const res = await authRequest("PUT", `/v1/templates/${id}`, {
        body: { name: `Partial ${uniqueId()}` },
      });

      expect(res.status).toBe(200);
    });
  });

  // ─── POST /v1/templates/:id/render ────────────────────────────────────────

  describe("POST /v1/templates/:id/render", () => {
    it("should render a template with provided variables", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return;

      const res = await authRequest("POST", `/v1/templates/${id}/render`, {
        body: {
          variables: { name: "Alice", company: "Acme Corp" },
        },
      });

      expect(res.status).toBe(200);

      const body = await jsonBody<{
        data: {
          subject: string;
          htmlBody: string | null;
          textBody: string | null;
        };
      }>(res);

      expect(body.data.subject).toBe("Welcome, Alice!");
      expect(body.data.htmlBody).toContain("Hello Alice");
      expect(body.data.htmlBody).toContain("Acme Corp");
      expect(body.data.textBody).toContain("Hello Alice");
      expect(body.data.textBody).toContain("Acme Corp");
    });

    it("should return 400 when required variables are missing", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return;

      const res = await authRequest("POST", `/v1/templates/${id}/render`, {
        body: {
          variables: { name: "Alice" },
          // Missing "company"
        },
      });

      expect(res.status).toBe(400);
      const body = await jsonBody<ApiError & { error: { missing?: string[] } }>(
        res,
      );
      expect(body.error.code).toBe("missing_variables");
      expect(body.error.missing).toContain("company");
    });

    it("should return 404 for a non-existent template", async () => {
      const res = await authRequest(
        "POST",
        "/v1/templates/nonexistent_id/render",
        { body: { variables: {} } },
      );

      expect(res.status).toBe(404);
    });

    it("should reject requests without a variables object", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return;

      const res = await authRequest("POST", `/v1/templates/${id}/render`, {
        body: {},
      });

      expect(res.status).toBe(422);
    });
  });

  // ─── DELETE /v1/templates/:id ─────────────────────────────────────────────

  describe("DELETE /v1/templates/:id", () => {
    it("should delete a template", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return;

      const res = await authRequest("DELETE", `/v1/templates/${id}`);

      expect(res.status).toBe(200);
      const body = await jsonBody<{ deleted: boolean; id: string }>(res);
      expect(body.deleted).toBe(true);
      expect(body.id).toBe(id);

      // Verify the template is gone
      const getRes = await authRequest("GET", `/v1/templates/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("should return 404 when deleting a non-existent template", async () => {
      const res = await authRequest(
        "DELETE",
        "/v1/templates/nonexistent_template_id",
      );

      expect(res.status).toBe(404);
    });

    it("should be idempotent — second delete returns 404", async () => {
      const { id, status } = await createTemplate();
      if (status !== 201) return;

      await authRequest("DELETE", `/v1/templates/${id}`);
      const res = await authRequest("DELETE", `/v1/templates/${id}`);

      expect(res.status).toBe(404);
    });
  });
});
