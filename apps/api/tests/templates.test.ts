/**
 * End-to-end integration tests for the Templates API routes.
 *
 * Tests cover:
 *   POST   /v1/templates              — create template
 *   GET    /v1/templates              — list templates
 *   GET    /v1/templates/:id          — get single template
 *   PATCH  /v1/templates/:id          — update template
 *   DELETE /v1/templates/:id          — soft-delete template
 *   POST   /v1/templates/:id/preview  — render with variables
 *   Variable auto-detection from {{mustache}} syntax
 */

import { describe, it, expect, vi } from "vitest";
import {
  createTestApp,
  jsonRequest,
  mockDb,
  DEFAULT_AUTH,
} from "./setup.js";
import { templatesRouter } from "../src/routes/templates.js";

function buildApp(auth = DEFAULT_AUTH) {
  const app = createTestApp(auth);
  app.route("/v1/templates", templatesRouter);
  return app;
}

function fakeTemplateRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: "tmpl_1",
    accountId: DEFAULT_AUTH.accountId,
    name: "Welcome Email",
    description: "Onboarding template",
    category: "onboarding",
    subject: "Welcome {{name}}!",
    htmlBody: "<h1>Hello {{name}}</h1><p>Welcome to {{company|Emailed}}</p>",
    textBody: "Hello {{name}}, welcome to {{company|Emailed}}",
    variables: [
      { name: "name", required: true },
      { name: "company", defaultValue: "Emailed", required: false },
    ],
    version: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── POST /v1/templates ─────────────────────────────────────────────────────

describe("POST /v1/templates", () => {
  it("should create a template and return 201", async () => {
    const row = fakeTemplateRow();
    mockDb.limit.mockResolvedValueOnce([row]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      method: "POST",
      body: {
        name: "Welcome Email",
        description: "Onboarding template",
        category: "onboarding",
        subject: "Welcome {{name}}!",
        htmlBody: "<h1>Hello {{name}}</h1><p>Welcome to {{company|Emailed}}</p>",
        textBody: "Hello {{name}}, welcome to {{company|Emailed}}",
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Welcome Email");
    expect(body.data.subject).toBe("Welcome {{name}}!");
    expect(body.data).toHaveProperty("variables");
    expect(body.data).toHaveProperty("version");
    expect(body.data.isActive).toBe(true);
  });

  it("should reject when both htmlBody and textBody are missing", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      method: "POST",
      body: {
        name: "Empty Template",
        subject: "Test",
      },
    });

    expect(res.status).toBe(422);
  });

  it("should accept text-only template", async () => {
    const row = fakeTemplateRow({ htmlBody: null });
    mockDb.limit.mockResolvedValueOnce([row]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      method: "POST",
      body: {
        name: "Plain Text",
        subject: "Hello",
        textBody: "Hello {{name}}",
      },
    });

    expect(res.status).toBe(201);
  });

  it("should reject missing name", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      method: "POST",
      body: {
        subject: "Test",
        textBody: "Hello",
      },
    });

    expect(res.status).toBe(422);
  });

  it("should reject missing subject", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      method: "POST",
      body: {
        name: "Test",
        textBody: "Hello",
      },
    });

    expect(res.status).toBe(422);
  });
});

// ─── GET /v1/templates ──────────────────────────────────────────────────────

describe("GET /v1/templates", () => {
  it("should return empty list when no templates exist", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it("should return paginated template list", async () => {
    const rows = [fakeTemplateRow(), fakeTemplateRow({ id: "tmpl_2", name: "Second" })];
    mockDb.limit.mockResolvedValueOnce(rows);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      query: { limit: "10" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it("should support category filter", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      query: { category: "onboarding" },
    });

    expect(res.status).toBe(200);
    expect(mockDb.where).toHaveBeenCalled();
  });
});

// ─── GET /v1/templates/:id ──────────────────────────────────────────────────

describe("GET /v1/templates/:id", () => {
  it("should return a single template with variables", async () => {
    mockDb.limit.mockResolvedValueOnce([fakeTemplateRow()]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("tmpl_1");
    expect(body.data.name).toBe("Welcome Email");
    expect(body.data.variables).toHaveLength(2);
    expect(body.data.variables[0].name).toBe("name");
    expect(body.data.variables[0].required).toBe(true);
    expect(body.data.variables[1].name).toBe("company");
    expect(body.data.variables[1].required).toBe(false);
  });

  it("should return 404 for non-existent template", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("template_not_found");
  });
});

// ─── PATCH /v1/templates/:id ────────────────────────────────────────────────

describe("PATCH /v1/templates/:id", () => {
  it("should update template name", async () => {
    const existing = fakeTemplateRow();
    mockDb.limit
      .mockResolvedValueOnce([existing]) // existing check
      .mockResolvedValueOnce([
        fakeTemplateRow({ name: "Updated Name", version: 2 }),
      ]); // updated record

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1", {
      method: "PATCH",
      body: { name: "Updated Name" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated Name");
    expect(body.data.version).toBe(2);
  });

  it("should update template body and re-extract variables", async () => {
    const existing = fakeTemplateRow();
    const updated = fakeTemplateRow({
      htmlBody: "<p>Hi {{firstName}} {{lastName}}</p>",
      variables: [
        { name: "name", required: true },
        { name: "firstName", required: true },
        { name: "lastName", required: true },
        { name: "company", defaultValue: "Emailed", required: false },
      ],
      version: 2,
    });
    mockDb.limit
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([updated]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1", {
      method: "PATCH",
      body: { htmlBody: "<p>Hi {{firstName}} {{lastName}}</p>" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.version).toBe(2);
  });

  it("should return 404 when updating non-existent template", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/nonexistent", {
      method: "PATCH",
      body: { name: "New Name" },
    });

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /v1/templates/:id ───────────────────────────────────────────────

describe("DELETE /v1/templates/:id", () => {
  it("should soft-delete a template", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: "tmpl_1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe("tmpl_1");
    // Verify update was called (soft delete = set isActive=false)
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalled();
  });

  it("should return 404 for non-existent template", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/nonexistent", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });
});

// ─── POST /v1/templates/:id/preview ─────────────────────────────────────────

describe("POST /v1/templates/:id/preview", () => {
  it("should render template with provided variables", async () => {
    mockDb.limit.mockResolvedValueOnce([fakeTemplateRow()]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1/preview", {
      method: "POST",
      body: {
        variables: { name: "Alice", company: "Acme Corp" },
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subject).toBe("Welcome Alice!");
    expect(body.data.html).toContain("Hello Alice");
    expect(body.data.html).toContain("Acme Corp");
    expect(body.data.text).toContain("Hello Alice");
    expect(body.data.text).toContain("Acme Corp");
  });

  it("should use default values for missing variables", async () => {
    mockDb.limit.mockResolvedValueOnce([fakeTemplateRow()]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1/preview", {
      method: "POST",
      body: {
        variables: { name: "Bob" },
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subject).toBe("Welcome Bob!");
    // Should use default "Emailed" for company
    expect(body.data.text).toContain("Emailed");
    expect(body.data.warnings).toBeDefined();
  });

  it("should warn about missing required variables", async () => {
    mockDb.limit.mockResolvedValueOnce([fakeTemplateRow()]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1/preview", {
      method: "POST",
      body: {
        variables: {},
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // "name" is required and not provided
    expect(body.data.warnings.length).toBeGreaterThan(0);
    expect(body.data.warnings.some((w: string) => w.includes("name"))).toBe(true);
  });

  it("should return 404 for non-existent template", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/nonexistent/preview", {
      method: "POST",
      body: { variables: {} },
    });

    expect(res.status).toBe(404);
  });

  it("should accept empty variables object", async () => {
    mockDb.limit.mockResolvedValueOnce([fakeTemplateRow()]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates/tmpl_1/preview", {
      method: "POST",
      body: {},
    });

    expect(res.status).toBe(200);
  });
});

// ─── Variable auto-detection ────────────────────────────────────────────────

describe("Template variable auto-detection", () => {
  it("should detect simple variables from {{mustache}} syntax", async () => {
    const row = fakeTemplateRow({
      subject: "Order {{orderNumber}} confirmed",
      htmlBody: "<p>Dear {{customerName}}, total: {{total|$0.00}}</p>",
      textBody: null,
      variables: [
        { name: "name", required: true },
        { name: "orderNumber", required: true },
        { name: "customerName", required: true },
        { name: "total", defaultValue: "$0.00", required: false },
        { name: "company", defaultValue: "Emailed", required: false },
      ],
    });
    mockDb.limit.mockResolvedValueOnce([row]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/templates", {
      method: "POST",
      body: {
        name: "Order Confirmation",
        subject: "Order {{orderNumber}} confirmed",
        htmlBody: "<p>Dear {{customerName}}, total: {{total|$0.00}}</p>",
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    // Variables should be auto-extracted
    expect(body.data.variables).toBeDefined();
    expect(Array.isArray(body.data.variables)).toBe(true);
  });
});

// ─── Scope enforcement ──────────────────────────────────────────────────────

describe("Templates scope enforcement", () => {
  it("should reject when missing templates:manage scope", async () => {
    const app = buildApp({
      ...DEFAULT_AUTH,
      scopes: ["messages:send"],
    });

    const res = await jsonRequest(app, "/v1/templates");
    expect(res.status).toBe(403);
  });
});
