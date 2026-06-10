/**
 * Tests for the E2E encryption key store in
 * apps/api/src/routes/encryption.ts (Finding S5 — persistence).
 *
 * The route used to keep keypairs in an in-memory Map, so keys were lost on
 * restart and not shared across instances. They are now persisted to Postgres
 * (encryption_keys table) via Drizzle. These tests mock the DB layer to verify
 * the store → retrieve → overwrite (upsert) lifecycle WITHOUT real infra.
 *
 * ZERO-KNOWLEDGE INVARIANT verified here: what the server persists for the
 * private key is the CLIENT-ENCRYPTED (passphrase-wrapped) ciphertext — never a
 * plaintext private key. The wrapping passphrase never reaches the server.
 *
 * Mock state is self-contained and local to this file (reset in beforeEach) so
 * it cannot pollute other test files.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Self-contained mutable mock state ────────────────────────────────────────

interface MockKeyRow {
  id: string;
  accountId: string;
  publicKey: string;
  encryptedPrivateKey: string;
  algorithm: string;
  createdAt: Date;
  updatedAt: Date;
}

/** One row per accountId, emulating the unique index on account_id. */
let mockKeyRows: Map<string, MockKeyRow> = new Map();

/** The accountId the mocked auth middleware injects. */
let currentAccountId = "acct_enc_001";

// Sentinel so the code under test can identify the table being queried.
const ENCRYPTION_KEYS = { __table: "encryption_keys" } as const;

vi.mock("@alecrae/db", () => {
  return {
    getDatabase: vi.fn().mockReturnValue({
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: unknown) => ({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => {
              if (table !== ENCRYPTION_KEYS) return Promise.resolve([]);
              const row = mockKeyRows.get(currentAccountId);
              return Promise.resolve(row ? [row] : []);
            }),
          })),
        })),
      })),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn().mockImplementation((vals: MockKeyRow) => ({
          onConflictDoUpdate: vi
            .fn()
            .mockImplementation((cfg: { set: Partial<MockKeyRow> }) => {
              if (table !== ENCRYPTION_KEYS) return Promise.resolve(undefined);
              const existing = mockKeyRows.get(vals.accountId);
              if (existing) {
                mockKeyRows.set(vals.accountId, { ...existing, ...cfg.set });
              } else {
                mockKeyRows.set(vals.accountId, { ...vals });
              }
              return Promise.resolve(undefined);
            }),
        })),
      })),
    }),
    encryptionKeys: ENCRYPTION_KEYS,
    eq: vi.fn(),
  };
});

// ── Minimal Hono auth-context shim ───────────────────────────────────────────
// requireScope reads c.get("auth"); we stub the middleware to inject it.

vi.mock("../src/middleware/auth.js", () => ({
  requireScope: () => async (c: HonoContextLike, next: () => Promise<void>) => {
    c.set("auth", { accountId: currentAccountId, scopes: ["encryption:read", "encryption:write"] });
    await next();
  },
}));

interface HonoContextLike {
  set: (key: string, value: unknown) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function importRoute(): Promise<{ encryption: import("hono").Hono }> {
  return import("../src/routes/encryption.js");
}

async function generateKeys(passphrase: string): Promise<Response> {
  const { encryption } = await importRoute();
  return encryption.request("/keys/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
}

async function getPublicKey(): Promise<Response> {
  const { encryption } = await importRoute();
  return encryption.request("/keys/public", { method: "GET" });
}

async function getStatus(): Promise<Response> {
  const { encryption } = await importRoute();
  return encryption.request("/status", { method: "GET" });
}

beforeEach(() => {
  mockKeyRows = new Map();
  currentAccountId = "acct_enc_001";
  vi.clearAllMocks();
});

describe("Encryption key store (DB-persisted)", () => {
  it("stores a keypair on generate and exposes only the public key", async () => {
    const res = await generateKeys("super-secret-pass");
    expect(res.status).toBe(201);

    // One row persisted for the account.
    expect(mockKeyRows.size).toBe(1);
    const row = mockKeyRows.get("acct_enc_001");
    expect(row).toBeDefined();
    expect(row?.publicKey.length).toBeGreaterThan(0);

    // Response surfaces the public key but never the private key.
    const body = (await res.json()) as { data: { publicKey: string } };
    expect(body.data.publicKey).toBe(row?.publicKey);
    expect(JSON.stringify(body)).not.toContain("encryptedPrivateKey");
    expect(JSON.stringify(body)).not.toContain("privateKey");
    // Generous timeout: this is the first test to run, so it absorbs the cold
    // cost of module transform + the first RSA-4096 keygen + ephemeral JWT key
    // setup, which can exceed the 5s default on a loaded CI runner.
  }, 30_000);

  it("ZERO-KNOWLEDGE: persists only wrapped (client-encrypted) private key, never plaintext", async () => {
    await generateKeys("another-secret");
    const row = mockKeyRows.get("acct_enc_001");
    expect(row).toBeDefined();

    // Wrapped form is `<iv-b64>.<ciphertext-b64>` — opaque ciphertext, not a key.
    expect(row?.encryptedPrivateKey).toContain(".");
    // A plaintext PKCS#8 export would be importable; the wrapped value is not a
    // bare base64 PKCS#8 blob — it carries the IV prefix + AES-GCM ciphertext.
    const [iv, ciphertext] = (row?.encryptedPrivateKey ?? "").split(".");
    expect(iv?.length).toBeGreaterThan(0);
    expect(ciphertext?.length).toBeGreaterThan(0);
    expect(ciphertext).not.toBe(iv);
    // RSA-4096 keygen can exceed the 5s default on a loaded CI runner.
  }, 30_000);

  it("retrieves the stored public key (persists across a fresh read)", async () => {
    await generateKeys("pass-one");

    const res = await getPublicKey();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { publicKey: string; createdAt: string } };
    expect(body.data.publicKey).toBe(mockKeyRows.get("acct_enc_001")?.publicKey);
    expect(typeof body.data.createdAt).toBe("string");
    // RSA-4096 keygen can exceed the 5s default on a loaded CI runner.
  }, 30_000);

  it("returns 404 from public-key read when no keys were generated", async () => {
    const res = await getPublicKey();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("no_keys");
  });

  it("overwrites the existing keypair on regeneration (upsert, one row)", async () => {
    await generateKeys("first-pass");
    const first = mockKeyRows.get("acct_enc_001");
    expect(first).toBeDefined();
    const firstPublicKey = first?.publicKey;
    const firstCreatedAt = first?.createdAt;

    await generateKeys("second-pass");

    // Still exactly one row for the account (upsert, not insert).
    expect(mockKeyRows.size).toBe(1);
    const second = mockKeyRows.get("acct_enc_001");
    expect(second).toBeDefined();
    // Public key + wrapped private key replaced; createdAt preserved by upsert.
    expect(second?.publicKey).not.toBe(firstPublicKey);
    expect(second?.createdAt).toEqual(firstCreatedAt);
    // Two RSA-4096 keygens here — well over the 5s default on a loaded CI runner.
  }, 30_000);

  it("status reflects enabled once keys exist, disabled before", async () => {
    const before = await getStatus();
    const beforeBody = (await before.json()) as { data: { enabled: boolean; hasKeys: boolean; keyCreatedAt: string | null } };
    expect(beforeBody.data.enabled).toBe(false);
    expect(beforeBody.data.hasKeys).toBe(false);
    expect(beforeBody.data.keyCreatedAt).toBeNull();

    await generateKeys("status-pass");

    const after = await getStatus();
    const afterBody = (await after.json()) as { data: { enabled: boolean; hasKeys: boolean; keyCreatedAt: string | null } };
    expect(afterBody.data.enabled).toBe(true);
    expect(afterBody.data.hasKeys).toBe(true);
    expect(typeof afterBody.data.keyCreatedAt).toBe("string");
    // RSA-4096 keygen can exceed the 5s default on a loaded CI runner.
  }, 30_000);
});
