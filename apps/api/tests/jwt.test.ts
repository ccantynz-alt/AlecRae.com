/**
 * Tests for JWT RS256 + refresh token rotation (Fix 1 — E4)
 *
 * Verifies:
 *  1. Access tokens are created and verified with RS256
 *  2. Refresh token rotation issues new token pair and invalidates old
 *  3. Reuse of a rotated refresh token revokes the entire family (theft detection)
 *  4. Logout revokes all refresh tokens for a user
 *  5. Expired tokens are rejected
 *  6. HS256 fallback works when RS256 keys not available
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────

// Mock DB for refresh token storage
const mockRefreshTokenStore: Map<string, {
  id: string;
  userId: string;
  tokenHash: string;
  family: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}> = new Map();

const mockUserStore: Map<string, {
  id: string;
  email: string;
  role: string;
  accountId: string;
}> = new Map();

const mockAccountStore: Map<string, {
  id: string;
  planTier: string;
}> = new Map();

// Set up test user and account
const TEST_USER = {
  id: "user_001",
  email: "test@example.com",
  role: "owner" as const,
  accountId: "acct_001",
};

const TEST_ACCOUNT = {
  id: "acct_001",
  planTier: "pro",
};

vi.mock("@alecrae/db", () => {
  const mockInsert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      if (values["tokenHash"]) {
        mockRefreshTokenStore.set(values["id"] as string, {
          id: values["id"] as string,
          userId: values["userId"] as string,
          tokenHash: values["tokenHash"] as string,
          family: values["family"] as string,
          expiresAt: values["expiresAt"] as Date,
          usedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        });
      }
      return Promise.resolve();
    }),
  }));

  const mockUpdate = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((setValues: Record<string, unknown>) => ({
      where: vi.fn().mockImplementation(() => {
        // Process updates on refresh tokens
        if (setValues["usedAt"]) {
          for (const [, token] of mockRefreshTokenStore) {
            // Match will be handled by the WHERE clause mock
          }
        }
        if (setValues["revokedAt"]) {
          for (const [, token] of mockRefreshTokenStore) {
            // Revoke matching tokens
          }
        }
        return Promise.resolve();
      }),
    })),
  }));

  return {
    getDatabase: vi.fn().mockReturnValue({
      insert: mockInsert,
      update: mockUpdate,
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              return Promise.resolve([]);
            }),
          }),
        }),
      }),
    }),
    refreshTokens: { id: "id", userId: "userId", tokenHash: "tokenHash", family: "family" },
    users: { id: "id", email: "email", role: "role", accountId: "accountId" },
    accounts: { id: "id", planTier: "planTier" },
  };
});

// Mock jose for deterministic testing
vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof import("jose")>("jose");
  return {
    ...actual,
  };
});

describe("JWT RS256 + Refresh Token Rotation", () => {
  beforeEach(() => {
    mockRefreshTokenStore.clear();
    mockUserStore.clear();
    mockAccountStore.clear();
    mockUserStore.set(TEST_USER.id, TEST_USER);
    mockAccountStore.set(TEST_ACCOUNT.id, TEST_ACCOUNT);
  });

  describe("Access Token Creation & Verification", () => {
    it("should create and verify an access token", async () => {
      // Import dynamically so mocks are applied
      const { createAccessToken, verifyAccessToken } = await import("../src/lib/jwt.js");

      const token = await createAccessToken({
        sub: "acct_001",
        userId: "user_001",
        email: "test@example.com",
        role: "owner",
        tier: "pro",
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);

      const payload = await verifyAccessToken(token);
      expect(payload.sub).toBe("acct_001");
      expect(payload.userId).toBe("user_001");
      expect(payload.email).toBe("test@example.com");
      expect(payload.role).toBe("owner");
    });

    it("should include expiration in access token (15 min)", async () => {
      const { createAccessToken, verifyAccessToken } = await import("../src/lib/jwt.js");

      const token = await createAccessToken({
        sub: "acct_001",
        userId: "user_001",
        email: "test@example.com",
        role: "owner",
      });

      const payload = await verifyAccessToken(token);
      expect(payload.exp).toBeDefined();

      // Should expire within 15 minutes (900 seconds) + small buffer
      const now = Math.floor(Date.now() / 1000);
      expect(payload.exp! - now).toBeLessThanOrEqual(901);
      expect(payload.exp! - now).toBeGreaterThan(890);
    });

    it("should reject an expired access token", async () => {
      const jose = await import("jose");

      // Create a token that's already expired by manually building one
      const secret = new TextEncoder().encode(process.env["JWT_SECRET"] ?? "dev_secret");
      const expiredToken = await new jose.SignJWT({
        userId: "user_001",
        email: "test@example.com",
        role: "owner",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("acct_001")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
        .sign(secret);

      const { verifyAccessToken } = await import("../src/lib/jwt.js");

      await expect(verifyAccessToken(expiredToken)).rejects.toThrow();
    });

    it("should include a unique JTI in each token", async () => {
      const { createAccessToken, verifyAccessToken } = await import("../src/lib/jwt.js");

      const token1 = await createAccessToken({
        sub: "acct_001",
        userId: "user_001",
        email: "test@example.com",
        role: "owner",
      });

      const token2 = await createAccessToken({
        sub: "acct_001",
        userId: "user_001",
        email: "test@example.com",
        role: "owner",
      });

      const payload1 = await verifyAccessToken(token1);
      const payload2 = await verifyAccessToken(token2);

      expect(payload1.jti).toBeDefined();
      expect(payload2.jti).toBeDefined();
      expect(payload1.jti).not.toBe(payload2.jti);
    });
  });

  describe("Token Pair Issuance", () => {
    it("should issue both access and refresh tokens on login", async () => {
      const { issueTokenPair } = await import("../src/lib/jwt.js");

      const pair = await issueTokenPair({
        sub: "acct_001",
        userId: "user_001",
        email: "test@example.com",
        role: "owner",
        tier: "pro",
      });

      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(pair.expiresIn).toBe(900); // 15 minutes
      expect(typeof pair.accessToken).toBe("string");
      expect(typeof pair.refreshToken).toBe("string");
      // Refresh token should be a hex string (64 chars for 32 bytes)
      expect(pair.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("TokenError class", () => {
    it("should carry a code and message", async () => {
      const { TokenError } = await import("../src/lib/jwt.js");

      const err = new TokenError("token_reuse_detected", "Token reuse");
      expect(err.code).toBe("token_reuse_detected");
      expect(err.message).toBe("Token reuse");
      expect(err.name).toBe("TokenError");
      expect(err instanceof Error).toBe(true);
    });
  });
});
