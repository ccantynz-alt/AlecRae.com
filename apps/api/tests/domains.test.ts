/**
 * End-to-end integration tests for the Domains API routes.
 *
 * Tests cover:
 *   POST   /v1/domains             — create domain
 *   GET    /v1/domains             — list domains
 *   GET    /v1/domains/:id         — get single domain
 *   POST   /v1/domains/:id/verify  — verify domain
 *   GET    /v1/domains/:id/dns     — get DNS records
 *   DELETE /v1/domains/:id         — delete domain
 */

import { describe, it, expect } from "vitest";
import {
  createTestApp,
  jsonRequest,
  mockQuery,
  DEFAULT_AUTH,
} from "./setup.js";
import { domains } from "../src/routes/domains.js";

function buildApp(auth = DEFAULT_AUTH) {
  const app = createTestApp(auth);
  app.route("/v1/domains", domains);
  return app;
}

// ─── POST /v1/domains ────────────────────────────────────────────────────────

describe("POST /v1/domains", () => {
  it("should create a new domain and return 201 with DNS records", async () => {
    // Query: no existing domain
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains", {
      method: "POST",
      body: { domain: "example.com" },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.domain).toBe("example.com");
    expect(body.data.status).toBe("pending");
    expect(body.data.dnsRecords).toBeDefined();
    expect(Array.isArray(body.data.dnsRecords)).toBe(true);
    expect(body.message).toContain("DNS records");
  });

  it("should return 409 when domain already exists", async () => {
    mockQuery([{ id: "dom_existing" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains", {
      method: "POST",
      body: { domain: "example.com" },
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("domain_exists");
  });

  it("should reject invalid domain format", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains", {
      method: "POST",
      body: { domain: "not a domain!!" },
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.type).toBe("validation_error");
  });

  it("should reject empty domain", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains", {
      method: "POST",
      body: { domain: "" },
    });

    expect(res.status).toBe(422);
  });

  it("should reject missing domain field", async () => {
    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains", {
      method: "POST",
      body: {},
    });

    expect(res.status).toBe(422);
  });
});

// ─── GET /v1/domains ─────────────────────────────────────────────────────────

describe("GET /v1/domains", () => {
  it("should return empty list when no domains exist", async () => {
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("should return list of domains", async () => {
    const now = new Date();
    mockQuery([
      {
        id: "dom_1",
        domain: "example.com",
        verificationStatus: "verified",
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        returnPathVerified: false,
        isActive: true,
        isDefault: true,
        createdAt: now,
        verifiedAt: now,
      },
      {
        id: "dom_2",
        domain: "test.org",
        verificationStatus: "pending",
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        isActive: false,
        isDefault: false,
        createdAt: now,
        verifiedAt: null,
      },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].domain).toBe("example.com");
    expect(body.data[0].status).toBe("verified");
    expect(body.data[1].domain).toBe("test.org");
  });
});

// ─── GET /v1/domains/:id ────────────────────────────────────────────────────

describe("GET /v1/domains/:id", () => {
  it("should return domain with DNS records", async () => {
    const now = new Date();
    // Query 1: domain record
    mockQuery([
      {
        id: "dom_1",
        domain: "example.com",
        verificationStatus: "verified",
        dkimSelector: "emailed1",
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        returnPathVerified: false,
        isActive: true,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
        verifiedAt: now,
      },
    ]);
    // Query 2: DNS records
    mockQuery([
      {
        type: "TXT",
        name: "example.com",
        value: "v=spf1 include:_spf.emailed.dev ~all",
        ttl: 3600,
        priority: null,
        verified: true,
        lastCheckedAt: now,
      },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/dom_1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("dom_1");
    expect(body.data.domain).toBe("example.com");
    expect(body.data.dnsRecords).toHaveLength(1);
    expect(body.data.dnsRecords[0].type).toBe("TXT");
  });

  it("should return 404 for non-existent domain", async () => {
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("domain_not_found");
  });
});

// ─── POST /v1/domains/:id/verify ────────────────────────────────────────────

describe("POST /v1/domains/:id/verify", () => {
  it("should trigger verification and return updated status", async () => {
    // Query 1: ownership check
    mockQuery([{ id: "dom_1" }]);
    // Query 2: updated domain record
    mockQuery([
      {
        id: "dom_1",
        domain: "example.com",
        verificationStatus: "pending",
        spfVerified: false,
        dkimVerified: false,
        dmarcVerified: false,
        returnPathVerified: false,
        isActive: false,
        verifiedAt: null,
        verificationAttempts: 1,
      },
    ]);
    // Query 3: DNS records
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/dom_1/verify", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("verification");
    expect(body.data.verification).toHaveProperty("overall");
    expect(body).toHaveProperty("message");
  });

  it("should return 404 when domain does not exist", async () => {
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/nonexistent/verify", {
      method: "POST",
    });

    expect(res.status).toBe(404);
  });
});

// ─── GET /v1/domains/:id/dns ────────────────────────────────────────────────

describe("GET /v1/domains/:id/dns", () => {
  it("should return DNS records for the domain", async () => {
    // Query 1: ownership check
    mockQuery([{ id: "dom_1", domain: "example.com" }]);
    // Query 2: DNS records
    mockQuery([
      {
        type: "TXT",
        name: "example.com",
        value: "v=spf1 ...",
        ttl: 3600,
        priority: null,
        verified: false,
        lastCheckedAt: null,
      },
      {
        type: "CNAME",
        name: "emailed1._domainkey.example.com",
        value: "emailed1.dkim.emailed.dev",
        ttl: 3600,
        priority: null,
        verified: false,
        lastCheckedAt: null,
      },
    ]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/dom_1/dns");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.domain).toBe("example.com");
    expect(body.data.records).toHaveLength(2);
  });

  it("should return 404 when domain does not belong to account", async () => {
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/other_dom/dns");

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /v1/domains/:id ─────────────────────────────────────────────────

describe("DELETE /v1/domains/:id", () => {
  it("should delete domain and return success", async () => {
    mockQuery([{ id: "dom_1" }]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/dom_1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.id).toBe("dom_1");
  });

  it("should return 404 when deleting non-existent domain", async () => {
    mockQuery([]);

    const app = buildApp();
    const res = await jsonRequest(app, "/v1/domains/nonexistent", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });
});

// ─── Scope enforcement ──────────────────────────────────────────────────────

describe("Domains scope enforcement", () => {
  it("should reject when missing domains:manage scope", async () => {
    const app = buildApp({
      ...DEFAULT_AUTH,
      scopes: ["messages:send"],
    });

    const res = await jsonRequest(app, "/v1/domains");

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("insufficient_scope");
  });
});
