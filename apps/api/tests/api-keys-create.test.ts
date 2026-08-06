/**
 * Regression test: "Generate New Key" failed every time.
 *
 * CreateApiKeySchema required a `permissions` object, while the only caller —
 * the Integrations page — sent just `{ name }`. Every attempt 422'd, so the
 * account could never mint an API key from the product at all.
 *
 * Every field inside `permissions` already carried a default, so the object
 * being required bought nothing; it is now optional and yields a
 * least-privilege key. These tests pin BOTH halves: that omitting it works,
 * and that the defaults it lands on are actually least-privilege — a default
 * that silently granted account management would be a worse bug than the 422.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

let inserted: Record<string, unknown>[] = [];

const mockDb = {
  insert: vi.fn(() => ({
    values: vi.fn((row: Record<string, unknown>) => {
      inserted.push(row);
      return Promise.resolve();
    }),
  })),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

interface Permissions {
  sendEmail: boolean;
  readEmail: boolean;
  manageDomains: boolean;
  manageApiKeys: boolean;
  manageWebhooks: boolean;
  viewAnalytics: boolean;
  manageAccount: boolean;
  manageTeamMembers: boolean;
}

describe("POST /v1/api-keys", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    inserted = [];
    const { apiKeysRouter } = await import("../src/routes/api-keys.js");
    app = new Hono();
    app.route("/v1/api-keys", apiKeysRouter);
  });

  async function create(body: unknown): Promise<Response> {
    return app.request("/v1/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates a key from just a name — what the UI actually sends", async () => {
    const res = await create({ name: "Default" });
    expect(res.status).toBe(201);
    expect(inserted).toHaveLength(1);
  });

  it("defaults to least privilege when permissions are omitted", async () => {
    await create({ name: "Default" });
    const perms = inserted[0]!["permissions"] as Permissions;

    // Useful by default...
    expect(perms.sendEmail).toBe(true);
    expect(perms.readEmail).toBe(true);
    expect(perms.viewAnalytics).toBe(true);

    // ...but nothing that can change the account or mint more access.
    expect(perms.manageAccount).toBe(false);
    expect(perms.manageApiKeys).toBe(false);
    expect(perms.manageDomains).toBe(false);
    expect(perms.manageWebhooks).toBe(false);
    expect(perms.manageTeamMembers).toBe(false);
  });

  it("still honours explicitly supplied permissions", async () => {
    await create({ name: "CI", permissions: { sendEmail: false, manageDomains: true } });
    const perms = inserted[0]!["permissions"] as Permissions;

    expect(perms.sendEmail).toBe(false);
    expect(perms.manageDomains).toBe(true);
    // Unspecified fields still fall back to their defaults.
    expect(perms.readEmail).toBe(true);
    expect(perms.manageAccount).toBe(false);
  });

  it("returns the full key exactly once, alongside its prefix", async () => {
    const res = await create({ name: "Default" });
    const body = (await res.json()) as { data: { key: string; keyPrefix: string } };

    expect(body.data.key).toMatch(/^em_live_/);
    expect(body.data.key.startsWith(body.data.keyPrefix)).toBe(true);
    // The stored row must hold a hash, never the raw key.
    expect(JSON.stringify(inserted[0])).not.toContain(body.data.key);
  });

  it("honours the test environment prefix", async () => {
    const res = await create({ name: "Sandbox", environment: "test" });
    const body = (await res.json()) as { data: { key: string } };
    expect(body.data.key).toMatch(/^em_test_/);
  });

  it("still rejects a request with no name", async () => {
    const res = await create({});
    expect(res.status).toBe(422);
    expect(inserted).toHaveLength(0);
  });
});
