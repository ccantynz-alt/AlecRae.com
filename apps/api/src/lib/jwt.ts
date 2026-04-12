/**
 * JWT Token Management — RS256 with HS256 fallback
 *
 * - Signs access tokens (15 min) and refresh tokens (7 days)
 * - RS256 when JWT_PRIVATE_KEY / JWT_PUBLIC_KEY env vars are set
 * - Falls back to HS256 with JWT_SECRET (with warning)
 * - Refresh token rotation with theft detection
 */

import * as jose from "jose";
import { eq, and, isNull } from "drizzle-orm";
import { getDatabase, refreshTokens, users, accounts } from "@emailed/db";

// ─── Key management ──────────────────────────────────────────────────────────

let privateKey: jose.KeyLike | Uint8Array | null = null;
let publicKey: jose.KeyLike | Uint8Array | null = null;
let algorithm: "RS256" | "HS256" = "HS256";
let keysInitialized = false;

async function initKeys(): Promise<void> {
  if (keysInitialized) return;
  keysInitialized = true;

  const privPem = process.env["JWT_PRIVATE_KEY"];
  const pubPem = process.env["JWT_PUBLIC_KEY"];

  if (privPem && pubPem) {
    try {
      privateKey = await jose.importPKCS8(privPem, "RS256");
      publicKey = await jose.importSPKI(pubPem, "RS256");
      algorithm = "RS256";
      console.log("[jwt] Using RS256 with provided key pair");
      return;
    } catch (err) {
      console.warn("[jwt] Failed to import RS256 keys, will attempt auto-generation:", err);
    }
  }

  // Attempt to generate RSA key pair at runtime if not provided
  if (!privPem && !pubPem) {
    try {
      const { privateKey: genPriv, publicKey: genPub } = await jose.generateKeyPair("RS256", {
        modulusLength: 2048,
      });
      privateKey = genPriv;
      publicKey = genPub;
      algorithm = "RS256";
      console.log("[jwt] Generated ephemeral RS256 key pair (set JWT_PRIVATE_KEY / JWT_PUBLIC_KEY for persistence)");
      return;
    } catch {
      // WebCrypto RSA generation may not be available in all runtimes
      console.warn("[jwt] RS256 key generation unavailable, falling back to HS256");
    }
  }

  // HS256 fallback
  const secret = process.env["JWT_SECRET"] ?? "dev_secret";
  if (secret === "dev_secret") {
    console.warn("[jwt] WARNING: Using default HS256 secret. Set JWT_PRIVATE_KEY + JWT_PUBLIC_KEY for RS256 in production.");
  }
  privateKey = new TextEncoder().encode(secret);
  publicKey = new TextEncoder().encode(secret);
  algorithm = "HS256";
}

// ─── Crypto helpers ──────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateTokenValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Token creation ──────────────────────────────────────────────────────────

export interface TokenPayload {
  sub: string; // accountId
  userId: string;
  email: string;
  role: string;
  tier?: string;
  scope?: string;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function createAccessToken(payload: TokenPayload): Promise<string> {
  await initKeys();
  if (!privateKey) throw new Error("JWT keys not initialized");

  return new jose.SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    tier: payload.tier,
    scope: payload.scope,
  })
    .setProtectedHeader({ alg: algorithm })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .setJti(generateId())
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<jose.JWTPayload & TokenPayload> {
  await initKeys();
  if (!publicKey) throw new Error("JWT keys not initialized");

  const { payload } = await jose.jwtVerify(token, publicKey, {
    algorithms: [algorithm],
  });

  return payload as jose.JWTPayload & TokenPayload;
}

// ─── Refresh token management ────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

/**
 * Issue a new access + refresh token pair.
 * Stores the hashed refresh token in the DB.
 */
export async function issueTokenPair(payload: TokenPayload): Promise<TokenPair> {
  const accessToken = await createAccessToken(payload);
  const refreshTokenValue = generateTokenValue();
  const tokenHash = await hashToken(refreshTokenValue);
  const family = generateId();

  const db = getDatabase();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await db.insert(refreshTokens).values({
    id: generateId(),
    userId: payload.userId,
    tokenHash,
    family,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    expiresIn: 900, // 15 minutes
  };
}

/**
 * Rotate a refresh token: validate the old one, issue a new pair,
 * and invalidate the old refresh token.
 *
 * If a used (rotated) token is presented again, ALL tokens in the
 * family are revoked (theft detection).
 */
export async function rotateRefreshToken(oldRefreshToken: string): Promise<TokenPair> {
  const db = getDatabase();
  const tokenHash = await hashToken(oldRefreshToken);

  // Find the refresh token record
  const [record] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!record) {
    throw new TokenError("invalid_refresh_token", "Refresh token not found");
  }

  // Check if token was already used (theft detection)
  if (record.usedAt) {
    // Revoke ALL tokens in this family — potential token theft
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.family, record.family));

    console.warn(`[jwt] Refresh token reuse detected for user ${record.userId}, family ${record.family} — revoking all tokens in family`);
    throw new TokenError("token_reuse_detected", "Token reuse detected — all sessions in this family have been revoked");
  }

  // Check if token is revoked
  if (record.revokedAt) {
    throw new TokenError("token_revoked", "Refresh token has been revoked");
  }

  // Check expiration
  if (record.expiresAt < new Date()) {
    throw new TokenError("token_expired", "Refresh token has expired");
  }

  // Mark old token as used
  await db
    .update(refreshTokens)
    .set({ usedAt: new Date() })
    .where(eq(refreshTokens.id, record.id));

  // Look up user to build the payload
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      accountId: users.accountId,
    })
    .from(users)
    .where(eq(users.id, record.userId))
    .limit(1);

  if (!user) {
    throw new TokenError("user_not_found", "User associated with token not found");
  }

  // Look up account tier
  let tier = "starter";
  try {
    const [account] = await db
      .select({ planTier: accounts.planTier })
      .from(accounts)
      .where(eq(accounts.id, user.accountId))
      .limit(1);
    if (account) tier = account.planTier ?? "free";
  } catch {
    // fall through
  }

  // Issue new pair in the same family
  const accessToken = await createAccessToken({
    sub: user.accountId,
    userId: user.id,
    email: user.email,
    role: user.role,
    tier,
  });

  const newRefreshTokenValue = generateTokenValue();
  const newTokenHash = await hashToken(newRefreshTokenValue);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await db.insert(refreshTokens).values({
    id: generateId(),
    userId: record.userId,
    tokenHash: newTokenHash,
    family: record.family, // same family for theft detection chain
    expiresAt,
  });

  return {
    accessToken,
    refreshToken: newRefreshTokenValue,
    expiresIn: 900,
  };
}

/**
 * Revoke all refresh tokens for a user (logout from all sessions).
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const db = getDatabase();

  const result = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
      ),
    );

  // Drizzle doesn't always return rowCount in all adapters, return 0 as safe fallback
  return 0;
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class TokenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { hashToken, generateId };
